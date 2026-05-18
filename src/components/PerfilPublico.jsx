'use client'

import { useState } from 'react'
import { ref, push, set, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'

function addDaysInput(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function pickText(...values) {
  return values.map((v) => String(v || '').trim()).find(Boolean) || ''
}

function safeUrl(u) {
  const s = String(u || '').trim()
  if (!s) return ''
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(s)) return s
  return ''
}

function formatOcupadoAte(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

function formatMoney(v) {
  const s = String(v || '').trim()
  if (!s) return ''
  if (/r\$/i.test(s)) return s
  const n = Number(s.replace(/[^\d,.]/g, '').replace(',', '.'))
  if (Number.isFinite(n) && n > 0) {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  return `R$ ${s}`
}

function normalizeWhatsapp(v) {
  const digits = String(v || '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.startsWith('55') ? digits : `55${digits}`
}

function InfoLine({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/8 py-2.5 last:border-0">
      <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="max-w-[65%] text-right text-sm font-bold text-slate-100">{value}</span>
    </div>
  )
}

function ServicePanel({ title, label, accent, children }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
          <h3 className="mt-1 text-base font-black text-white">{title}</h3>
        </div>
        <span className={accent === 'amber' ? 'h-3 w-3 rounded-full bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.8)]' : 'h-3 w-3 rounded-full bg-blue-400 shadow-[0_0_18px_rgba(96,165,250,0.8)]'} />
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export default function PerfilPublico({ user, onClose }) {
  const [openAgenda, setOpenAgenda] = useState(false)
  const [data, setData] = useState(addDaysInput(1))
  const [hora, setHora] = useState('09:00')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  if (!user) return null

  const profile = user.profile || {}
  const prof = user.profissional || profile.profissional || {}
  const corre = user.corre || profile.corre || {}

  const profissionalId = user.uid || user.id
  const nome = pickText(user.nome, profile.nome, 'Usuário')
  const cidade = pickText(user.cidade, profile.cidade, prof.regiao, corre.regiao, 'Local não informado')
  const fotoURL = safeUrl(user.fotoURL || user.photoURL || profile.fotoURL || profile.photoURL || '')
  const avatarEmoji = pickText(user.avatarEmoji, profile.avatarEmoji, '🙂')
  const bio = pickText(user.bio, profile.bio, prof.descricao, corre.bio)

  const isCorre = !!(user.isCorre || profile.isCorre || corre?.ativo || user.corre)
  const isProfissional = !!(user.isProfissional || profile.isProfissional || prof?.ativo || user.profissional)
  const servicosFeitos = Number(
    user.servicosCorre ||
      user['serviçosCorre'] ||
      user.servicosProf ||
      user['serviçosProf'] ||
      profile.servicosCorre ||
      profile['serviçosCorre'] ||
      0
  )
  const notaMedia = Number(user.avaliacaoMedia || user.notaMedia || profile.avaliacaoMedia || profile.notaMedia || 0)
  const perfilVerificado = !!(
    user.verificado ||
    user.verified ||
    profile.verificado ||
    profile.verified ||
    user.perfilVerificado ||
    profile.perfilVerificado ||
    (nome && cidade && (fotoURL || avatarEmoji) && (servicosFeitos > 0 || isCorre || isProfissional))
  )

  const agendaAberta = user.agendaAberta ?? profile.agendaAberta ?? prof.agendaAberta ?? true
  const statusProfissional = user.statusProfissional || profile.statusProfissional || prof.statusProfissional || 'disponivel'
  const ocupadoAte = user.ocupadoAte || profile.ocupadoAte || prof.ocupadoAte || null
  const emServico = statusProfissional === 'em_servico' || (!!ocupadoAte && Date.now() < Number(ocupadoAte))

  const whatsapp = pickText(prof?.whatsapp, user.profWhats, profile.whatsapp, user.whatsapp)
  const whatsappLimpo = normalizeWhatsapp(whatsapp)

  const profTitulo = pickText(prof?.titulo, user.profTitulo, profile.titulo, 'Profissional local')
  const profPreco = pickText(user.profPrecoBase, prof?.preco, profile.preco)
  const profExperiencia = pickText(user.profExperiencia, prof?.experiencia)
  const profCategoriasRaw = user.profCategorias || prof.categorias || profile.profCategorias || []
  const profCategorias = Array.isArray(profCategoriasRaw)
    ? profCategoriasRaw.filter(Boolean).join(', ')
    : String(profCategoriasRaw || '').trim()

  const correTitulo = pickText(user.correTitulo, corre?.titulo, 'Corre rápido')
  const correTransporte = pickText(user.correTransporte, corre?.transporte)
  const correDisponibilidade = pickText(user.correDisponibilidade, corre?.disponibilidade)
  const correExperiencia = pickText(user.correExperiencia, corre?.experiencia)

  const criarAgendamento = async () => {
    if (!profissionalId || salvando) return

    setSalvando(true)
    setEnviado(false)
    try {
      const clienteId = localStorage.getItem('meuId') || ''
      const clienteNome = localStorage.getItem('meuNome') || 'Cliente'

      const novo = push(ref(database, 'agendamentos'))
      await set(novo, {
        id: novo.key,
        profissionalId,
        profissionalNome: nome,
        clienteId,
        clienteNome,
        data,
        hora,
        descricao: descricao || `Agendamento solicitado para ${nome}`,
        valor: valor || '',
        status: 'pendente',
        origem: 'perfil_publico',
        criadoEm: Date.now(),
        atualizadoEm: serverTimestamp(),
      })

      setEnviado(true)
      setDescricao('')
      setValor('')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[99999]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute inset-x-3 bottom-3 mx-auto max-h-[94vh] max-w-5xl overflow-y-auto rounded-[30px] border border-white/10 bg-[#07111f] text-white shadow-[0_30px_120px_rgba(0,0,0,0.6)] md:bottom-auto md:top-1/2 md:-translate-y-1/2">
        <div className="border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[26px] border border-white/10 bg-white/8 text-4xl shadow-[0_18px_45px_rgba(0,0,0,0.35)]">
                {fotoURL ? <img src={fotoURL} className="h-full w-full object-cover" alt={nome} /> : avatarEmoji}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="max-w-full truncate text-2xl font-black leading-tight md:text-3xl">{nome}</h2>
                  {perfilVerificado ? (
                    <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-black text-cyan-100">
                      ✓ Verificado
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-400">{cidade}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={emServico ? 'rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-100' : 'rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-100'}>
                    {emServico ? `Em serviço ${ocupadoAte ? `até ${formatOcupadoAte(ocupadoAte)}` : ''}` : 'Disponível agora'}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-black text-slate-200">
                    {agendaAberta ? 'Agenda aberta' : 'Agenda fechada'}
                  </span>
                  {isCorre ? <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">Corre rápido</span> : null}
                  {isProfissional ? <span className="rounded-full border border-blue-300/20 bg-blue-300/10 px-3 py-1 text-xs font-black text-blue-100">Profissional</span> : null}
                </div>
              </div>
            </div>

            <button onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/8 text-xl font-black text-white hover:bg-white/15" type="button" title="Fechar">
              ×
            </button>
          </div>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[1.15fr_0.85fr] md:p-6">
          <main className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center">
                <div className="text-xl font-black">{Number.isFinite(notaMedia) && notaMedia > 0 ? notaMedia.toFixed(1) : '--'}</div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Nota</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center">
                <div className="text-xl font-black">{servicosFeitos || 0}</div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Serviços</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center">
                <div className="truncate text-xl font-black">{perfilVerificado ? 'OK' : 'Novo'}</div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Perfil</div>
              </div>
            </div>

            {bio ? (
              <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Resumo</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">{bio}</p>
              </section>
            ) : null}

            <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Ficha técnica</div>
              <div className="mt-3">
                <InfoLine label="Região" value={cidade} />
                <InfoLine label="Status" value={emServico ? 'Em serviço' : 'Disponível'} />
                <InfoLine label="Agenda" value={agendaAberta ? 'Aberta para pedidos' : 'Fechada no momento'} />
                <InfoLine label="Verificação" value={perfilVerificado ? 'Perfil verificado' : 'Em validação'} />
              </div>
            </section>

            <div className="grid gap-3 md:grid-cols-2">
              {isCorre ? (
                <ServicePanel label="Modalidade" title={correTitulo} accent="amber">
                  <InfoLine label="Transporte" value={correTransporte || 'Não informado'} />
                  <InfoLine label="Disponibilidade" value={correDisponibilidade || 'A combinar'} />
                  <InfoLine label="Experiência" value={correExperiencia} />
                </ServicePanel>
              ) : null}

              {isProfissional ? (
                <ServicePanel label="Especialidade" title={profTitulo} accent="blue">
                  <InfoLine label="Categorias" value={profCategorias || 'Serviços gerais'} />
                  <InfoLine label="Preço base" value={profPreco ? formatMoney(profPreco) : 'A combinar'} />
                  <InfoLine label="Experiência" value={profExperiencia} />
                </ServicePanel>
              ) : null}
            </div>
          </main>

          <aside className="space-y-3">
            <section className="rounded-[26px] border border-white/10 bg-white/[0.05] p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Ações</div>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => setOpenAgenda(true)}
                  disabled={!agendaAberta}
                  className="h-12 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-[0_16px_45px_rgba(37,99,235,0.28)] transition hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Solicitar agendamento
                </button>

                {whatsappLimpo ? (
                  <a
                    href={`https://wa.me/${whatsappLimpo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="grid h-12 place-items-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10 px-4 text-sm font-black text-emerald-100 transition hover:bg-emerald-400/15 active:scale-[0.98]"
                  >
                    Chamar no WhatsApp
                  </a>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-slate-400">
                    WhatsApp não informado
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Como contratar</div>
              <div className="mt-3 space-y-3 text-sm text-slate-300">
                <p>1. Envie uma solicitação com data, hora e serviço.</p>
                <p>2. Combine detalhes antes de confirmar.</p>
                <p>3. Após o serviço, avalie e sinalize qualquer problema.</p>
              </div>
            </section>
          </aside>
        </div>

        {openAgenda ? (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
            <div className="w-full max-w-lg overflow-hidden rounded-[28px] border border-white/10 bg-[#07111f] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-black text-white">Solicitar agendamento</div>
                  <div className="mt-1 text-xs text-slate-400">O profissional recebe e pode aceitar, recusar ou combinar outro horário.</div>
                </div>
                <button type="button" onClick={() => setOpenAgenda(false)} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-xl font-black text-white">
                  ×
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-slate-300">
                  Data
                  <input value={data} onChange={(e) => setData(e.target.value)} type="date" className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-white outline-none focus:ring-2 focus:ring-blue-500/40" />
                </label>
                <label className="text-xs font-bold text-slate-300">
                  Hora
                  <input value={hora} onChange={(e) => setHora(e.target.value)} type="time" className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-white outline-none focus:ring-2 focus:ring-blue-500/40" />
                </label>
              </div>

              <label className="mt-3 block text-xs font-bold text-slate-300">
                Descrição
                <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: preciso instalar uma torneira..." className="mt-1 min-h-[96px] w-full resize-none rounded-2xl border border-white/10 bg-slate-950 px-3 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500/40" />
              </label>

              <label className="mt-3 block text-xs font-bold text-slate-300">
                Valor opcional
                <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex: 120" className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-white outline-none focus:ring-2 focus:ring-blue-500/40" inputMode="decimal" />
              </label>

              <button
                type="button"
                disabled={salvando}
                onClick={criarAgendamento}
                className="mt-4 h-12 w-full rounded-2xl bg-emerald-600 px-4 font-black text-white transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-60"
              >
                {salvando ? 'Enviando...' : enviado ? 'Solicitação enviada ✓' : 'Enviar solicitação'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
