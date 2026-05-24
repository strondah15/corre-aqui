'use client'

import { useMemo, useState } from 'react'
import { ref, push, set, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'
import { CATEGORIES } from '@/constants/categories'

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

function normalizeList(...values) {
  return values
    .flatMap((value) => {
      if (!value) return []
      if (Array.isArray(value)) return value
      if (typeof value === 'object') return Object.values(value)
      return []
    })
    .filter(Boolean)
}

function normalizeCategoryIds(...values) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => {
          if (!value) return []
          if (Array.isArray(value)) return value
          if (typeof value === 'string') return value.split(',')
          return []
        })
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  )
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

function StatCard({ value, label, tone = 'slate' }) {
  const tones = {
    slate: 'border-white/10 bg-white/[0.04] text-white',
    emerald: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
    amber: 'border-amber-300/20 bg-amber-400/10 text-amber-100',
    cyan: 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100',
  }

  return (
    <div className={`rounded-2xl border px-3 py-3 text-center ${tones[tone] || tones.slate}`}>
      <div className="truncate text-xl font-black">{value}</div>
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
    </div>
  )
}

function ServicePanel({ title, label, accent, children }) {
  const dot =
    accent === 'amber'
      ? 'bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.8)]'
      : 'bg-blue-400 shadow-[0_0_18px_rgba(96,165,250,0.8)]'

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
          <h3 className="mt-1 truncate text-base font-black text-white">{title}</h3>
        </div>
        <span className={`h-3 w-3 rounded-full ${dot}`} />
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function RatingStars({ nota }) {
  const n = Number(nota || 0)
  return (
    <div className="flex items-center gap-0.5 text-amber-300" aria-label={`Nota ${n || 0}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= Math.round(n) ? 'text-amber-300' : 'text-slate-700'}>
          ★
        </span>
      ))}
    </div>
  )
}

export default function PerfilPublico({ user, onClose, onPedirServico, onAgendar }) {
  const [openAgenda, setOpenAgenda] = useState(false)
  const [data, setData] = useState(addDaysInput(1))
  const [hora, setHora] = useState('09:00')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const dados = useMemo(() => {
    if (!user) return null

    const profile = user.profile || {}
    const prof = user.profissional || profile.profissional || {}
    const corre = user.corre || profile.corre || {}
    const trustStats = user.trustStats || profile.trustStats || {}

    const profissionalId = user.uid || user.id
    const nome = pickText(user.nome, profile.nome, 'Usuário')
    const cidade = pickText(user.profCidadeAtende, user.cidade, profile.cidade, prof.regiao, corre.regiao, 'Local não informado')
    const fotoPersonalizada = safeUrl(user.fotoURL || profile.fotoURL || user.avatarURL || profile.avatarURL || '')
    const avatarEmojiSalvo = pickText(user.avatarEmoji, profile.avatarEmoji)
    const fotoGoogle = safeUrl(user.photoURL || profile.photoURL || '')
    const fotoURL = fotoPersonalizada || (!avatarEmojiSalvo ? fotoGoogle : '')
    const avatarEmoji = avatarEmojiSalvo || '🙂'
    const bio = pickText(user.bio, profile.bio, user.profResumo, prof.descricao, corre.bio)

    const isCorre = !!(user.isCorre || profile.isCorre || corre?.ativo || user.corre)
    const isProfissional = !!(user.isProfissional || profile.isProfissional || prof?.ativo || user.profissional)
    const servicosFeitos = Number(
      user.servicosCorre ||
        user['serviçosCorre'] ||
        user.servicosProf ||
        user['serviçosProf'] ||
        profile.servicosCorre ||
        profile['serviçosCorre'] ||
        trustStats.servicos ||
        0
    )
    const notaMedia = Number(user.avaliacaoMedia || user.notaMedia || profile.avaliacaoMedia || profile.notaMedia || trustStats.notaMedia || 0)
    const avaliacoes = normalizeList(user.avaliacoes, profile.avaliacoes, user.reviews, profile.reviews, trustStats.avaliacoes)
      .map((a) => ({
        nota: Number(a?.nota || a?.rating || a?.stars || 0),
        comentario: pickText(a?.comentario, a?.comentarioCliente, a?.texto, a?.message),
        autor: pickText(a?.autor?.nome, a?.clienteNome, a?.nome, 'Cliente'),
      }))
      .filter((a) => a.nota || a.comentario)
      .slice(0, 3)
    const totalAvaliacoes = Number(user.totalAvaliacoes || profile.totalAvaliacoes || trustStats.totalAvaliacoes || avaliacoes.length || 0)
    const perfilVerificado = !!(
      user.verificado ||
      user.verified ||
      profile.verificado ||
      profile.verified ||
      user.perfilVerificado ||
      profile.perfilVerificado ||
      trustStats.verificado ||
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

    const categorias = normalizeCategoryIds(
      user.profCategorias,
      profile.profCategorias,
      prof.categorias,
      user.correCategorias,
      profile.correCategorias,
      corre.categorias,
      user.servicos,
      profile.servicos
    )
      .map((id) => CATEGORIES.find((cat) => cat.id === id) || { id, label: id.replace(/_/g, ' '), emoji: '' })
      .slice(0, 6)

    const historico = normalizeList(user.historicoServicos, profile.historicoServicos, user.servicosRecentes, trustStats.historico)
      .map((item) => ({
        titulo: pickText(item?.titulo, item?.servico, item?.categoria, 'Serviço realizado'),
        status: pickText(item?.status, item?.resultado, 'Concluído'),
      }))
      .slice(0, 3)

    return {
      profile,
      prof,
      corre,
      profissionalId,
      nome,
      cidade,
      fotoURL,
      avatarEmoji,
      bio,
      isCorre,
      isProfissional,
      servicosFeitos,
      notaMedia,
      avaliacoes,
      totalAvaliacoes,
      perfilVerificado,
      agendaAberta,
      ocupadoAte,
      emServico,
      whatsappLimpo,
      profTitulo,
      profPreco,
      profExperiencia,
      profCategorias,
      correTitulo,
      correTransporte,
      correDisponibilidade,
      correExperiencia,
      categorias,
      historico,
    }
  }, [user])

  if (!user || !dados) return null

  const criarAgendamento = async () => {
    if (!dados.profissionalId || salvando) return

    setSalvando(true)
    setEnviado(false)
    try {
      const clienteId = localStorage.getItem('meuId') || ''
      const clienteNome = localStorage.getItem('meuNome') || 'Cliente'

      const novo = push(ref(database, 'agendamentos'))
      await set(novo, {
        id: novo.key,
        profissionalId: dados.profissionalId,
        profissionalNome: dados.nome,
        clienteId,
        clienteNome,
        data,
        hora,
        descricao: descricao || `Agendamento solicitado para ${dados.nome}`,
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

  const abrirAgenda = () => {
    if (onAgendar) {
      onAgendar(user)
      return
    }
    setOpenAgenda(true)
  }

  const notaLabel = Number.isFinite(dados.notaMedia) && dados.notaMedia > 0 ? dados.notaMedia.toFixed(1) : '--'

  return (
    <div className="fixed inset-0 z-[99999]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute inset-x-2 bottom-2 mx-auto max-h-[96vh] max-w-5xl overflow-y-auto rounded-[30px] border border-white/10 bg-[#07111f] text-white shadow-[0_30px_120px_rgba(0,0,0,0.6)] sm:inset-x-3 md:bottom-auto md:top-1/2 md:-translate-y-1/2">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_34%),linear-gradient(135deg,#020617,#0f172a_58%,#07111f)] p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div
                className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[26px] border border-white/10 bg-white/8 bg-cover bg-center text-4xl shadow-[0_18px_45px_rgba(0,0,0,0.35)]"
                style={dados.fotoURL ? { backgroundImage: `url(${JSON.stringify(dados.fotoURL)})` } : undefined}
                aria-label={dados.nome}
              >
                {dados.fotoURL ? <span className="sr-only">{dados.nome}</span> : dados.avatarEmoji}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="max-w-full truncate text-2xl font-black leading-tight md:text-3xl">{dados.nome}</h2>
                  {dados.perfilVerificado ? (
                    <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-black text-cyan-100">
                      ✓ Verificado
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-400">{dados.cidade}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={dados.emServico ? 'rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-black text-amber-100' : 'rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-100'}>
                    {dados.emServico ? `Em serviço ${dados.ocupadoAte ? `até ${formatOcupadoAte(dados.ocupadoAte)}` : ''}` : 'Disponível agora'}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-black text-slate-200">
                    {dados.agendaAberta ? 'Agenda aberta' : 'Agenda fechada'}
                  </span>
                  {dados.isCorre ? <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">Corre rápido</span> : null}
                  {dados.isProfissional ? <span className="rounded-full border border-blue-300/20 bg-blue-300/10 px-3 py-1 text-xs font-black text-blue-100">Profissional</span> : null}
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
              <StatCard value={notaLabel} label="Nota" tone="amber" />
              <StatCard value={dados.servicosFeitos || 0} label="Serviços" tone="emerald" />
              <StatCard value={dados.totalAvaliacoes || 0} label="Avaliações" tone="cyan" />
            </div>

            <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Confiança</div>
                  <div className="mt-1 flex items-center gap-2">
                    <RatingStars nota={dados.notaMedia} />
                    <span className="text-sm font-black text-slate-100">
                      {notaLabel === '--' ? 'Sem nota ainda' : `${notaLabel} de 5`}
                    </span>
                  </div>
                </div>
                <span className={dados.perfilVerificado ? 'rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-100' : 'rounded-full border border-slate-300/20 bg-white/[0.04] px-3 py-1 text-xs font-black text-slate-300'}>
                  {dados.perfilVerificado ? 'Perfil verificado' : 'Em validação'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-black">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-3 text-slate-200">Chat</div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-3 text-slate-200">Histórico</div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-2 py-3 text-slate-200">Denúncia</div>
              </div>
            </section>

            {dados.bio ? (
              <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Resumo</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">{dados.bio}</p>
              </section>
            ) : null}

            {dados.categorias.length ? (
              <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Atua com</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dados.categorias.map((cat) => (
                    <span key={cat.id} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-slate-100">
                      {cat.emoji ? `${cat.emoji} ` : ''}{cat.label}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Ficha técnica</div>
              <div className="mt-3">
                <InfoLine label="Região" value={dados.cidade} />
                <InfoLine label="Status" value={dados.emServico ? 'Em serviço' : 'Disponível'} />
                <InfoLine label="Agenda" value={dados.agendaAberta ? 'Aberta para pedidos' : 'Fechada no momento'} />
                <InfoLine label="Verificação" value={dados.perfilVerificado ? 'Perfil verificado' : 'Em validação'} />
              </div>
            </section>

            <div className="grid gap-3 md:grid-cols-2">
              {dados.isCorre ? (
                <ServicePanel label="Modalidade" title={dados.correTitulo} accent="amber">
                  <InfoLine label="Transporte" value={dados.correTransporte || 'Não informado'} />
                  <InfoLine label="Disponibilidade" value={dados.correDisponibilidade || 'A combinar'} />
                  <InfoLine label="Experiência" value={dados.correExperiencia} />
                </ServicePanel>
              ) : null}

              {dados.isProfissional ? (
                <ServicePanel label="Especialidade" title={dados.profTitulo} accent="blue">
                  <InfoLine label="Categorias" value={dados.profCategorias || 'Serviços gerais'} />
                  <InfoLine label="Preço base" value={dados.profPreco ? formatMoney(dados.profPreco) : 'A combinar'} />
                  <InfoLine label="Experiência" value={dados.profExperiencia} />
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
                  onClick={() => onPedirServico?.(user)}
                  className="h-12 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-[0_16px_45px_rgba(37,99,235,0.28)] transition hover:bg-blue-500 active:scale-[0.98]"
                >
                  Criar pedido para este perfil
                </button>

                <button
                  type="button"
                  onClick={abrirAgenda}
                  disabled={!dados.agendaAberta}
                  className="h-12 rounded-2xl border border-violet-300/25 bg-violet-400/12 px-4 text-sm font-black text-violet-100 transition hover:bg-violet-400/18 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Solicitar agendamento
                </button>

                {dados.whatsappLimpo ? (
                  <a
                    href={`https://wa.me/${dados.whatsappLimpo}`}
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
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Avaliações recentes</div>
              <div className="mt-3 space-y-2">
                {dados.avaliacoes.length ? (
                  dados.avaliacoes.map((a, index) => (
                    <div key={`${a.autor}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-black text-slate-300">{a.autor}</span>
                        <RatingStars nota={a.nota} />
                      </div>
                      {a.comentario ? <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-400">{a.comentario}</p> : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-slate-400">
                    Sem avaliações publicadas ainda.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Histórico</div>
              <div className="mt-3 space-y-2">
                {dados.historico.length ? (
                  dados.historico.map((item, index) => (
                    <div key={`${item.titulo}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2">
                      <span className="truncate text-sm font-black text-slate-200">{item.titulo}</span>
                      <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-black text-emerald-100">
                        {item.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-slate-400">
                    Histórico em formação.
                  </div>
                )}
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
