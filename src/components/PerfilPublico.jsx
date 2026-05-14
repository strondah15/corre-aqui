'use client'

import { useState } from 'react'
import { ref, push, set, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'

function addDaysInput(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatOcupadoAte(v) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
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
  const nome = user.nome || profile.nome || 'Usuário'
  const cidade = user.cidade || profile.cidade || 'Local não informado'
  const fotoURL = user.fotoURL || profile.fotoURL || ''
  const avatarEmoji = user.avatarEmoji || profile.avatarEmoji || '🙂'
  const bio = user.bio || profile.bio || ''

  const isCorre = !!(user.isCorre || profile.isCorre || corre?.ativo)
  const isProfissional = !!(user.isProfissional || profile.isProfissional || prof?.ativo || user.profissional)

  const agendaAberta = user.agendaAberta ?? profile.agendaAberta ?? prof.agendaAberta ?? true
  const statusProfissional = user.statusProfissional || profile.statusProfissional || prof.statusProfissional || 'disponivel'
  const ocupadoAte = user.ocupadoAte || profile.ocupadoAte || prof.ocupadoAte || null
  const emServico = statusProfissional === 'em_servico' || (!!ocupadoAte && Date.now() < Number(ocupadoAte))

  const whatsapp = prof?.whatsapp || user.profWhats || profile.whatsapp || ''
  const whatsappLimpo = String(whatsapp || '').replace(/\D/g, '')

  const criarAgendamento = async () => {
    if (!profissionalId || salvando) return

    setSalvando(true)
    setEnviado(false)
    try {
      const clienteId = localStorage.getItem('meuId') || ''
      const clienteNome = localStorage.getItem('meuNome') || 'Cliente'

      const novo = push(ref(database, 'agendamentos'))
      await set(novo, {
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
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-2xl max-h-[92vh] overflow-y-auto bg-[#07111f] text-white rounded-t-[32px] border border-white/10 shadow-[0_-28px_90px_rgba(0,0,0,0.45)] p-5 animate-slideUp">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-4 min-w-0">
            {fotoURL ? (
              <img src={fotoURL} className="w-20 h-20 rounded-3xl object-cover border-2 border-blue-500/40" alt={nome} />
            ) : (
              <div className="w-20 h-20 rounded-3xl bg-white/10 border border-white/10 flex items-center justify-center text-4xl">
                {avatarEmoji}
              </div>
            )}

            <div className="min-w-0">
              <h2 className="text-2xl font-black truncate">{nome}</h2>
              <p className="text-sm text-slate-400 truncate">📍 {cidade}</p>

              <div className="mt-2 flex flex-wrap gap-2">
                {emServico ? (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/20 text-amber-200 font-black">
                    🟡 Em serviço {ocupadoAte ? `até ${formatOcupadoAte(ocupadoAte)}` : ''}
                  </span>
                ) : (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/20 text-emerald-200 font-black">
                    🟢 Disponível
                  </span>
                )}

                {agendaAberta ? (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-400/20 text-blue-200 font-black">
                    📅 Agenda aberta
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <button onClick={onClose} className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-black" type="button">
            ✕
          </button>
        </div>

        {bio ? (
          <div className="rounded-3xl bg-white/[0.04] border border-white/10 p-4 text-sm leading-relaxed text-slate-200 mb-4">
            {bio}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 mb-4">
          {isCorre ? (
            <div className="rounded-3xl bg-amber-500/10 border border-amber-400/20 p-4">
              <div className="font-black text-amber-200">⚡ Corre</div>
              <div className="mt-1 text-xs text-slate-300">{corre?.titulo || 'Serviços rápidos'}</div>
            </div>
          ) : null}

          {isProfissional ? (
            <div className="rounded-3xl bg-blue-500/10 border border-blue-400/20 p-4">
              <div className="font-black text-blue-200">🧑‍🔧 Profissional</div>
              <div className="mt-1 text-xs text-slate-300">{prof?.titulo || user.profTitulo || 'Profissional local'}</div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {agendaAberta ? (
            <button
              type="button"
              onClick={() => setOpenAgenda(true)}
              className="w-full rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-4 font-black text-white shadow-[0_18px_60px_rgba(37,99,235,0.25)]"
            >
              📅 Agendar serviço
            </button>
          ) : null}

          {whatsappLimpo ? (
            <a
              href={`https://wa.me/55${whatsappLimpo}`}
              target="_blank"
              rel="noreferrer"
              className="w-full text-center rounded-3xl bg-emerald-600 px-4 py-4 font-black text-white"
            >
              💬 Chamar no WhatsApp
            </a>
          ) : null}
        </div>

        {openAgenda ? (
          <div className="fixed inset-0 z-[100000] bg-black/75 backdrop-blur-md p-4 flex items-center justify-center">
            <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-[28px] border border-white/10 bg-[#07111f] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
            <div className="flex items-center justify-between gap-3"><div className="font-black text-white">Solicitar agendamento</div><button type="button" onClick={() => setOpenAgenda(false)} className="h-10 w-10 rounded-2xl bg-white/10 text-white font-black">✕</button></div>
            <div className="mt-1 text-xs text-slate-400">
              O profissional recebe e pode aceitar, recusar ou combinar outro horário.
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-300">
                Data
                <input value={data} onChange={(e) => setData(e.target.value)} type="date" className="mt-1 w-full rounded-2xl bg-slate-950 border border-white/10 px-3 py-3 text-white" />
              </label>
              <label className="text-xs font-bold text-slate-300">
                Hora
                <input value={hora} onChange={(e) => setHora(e.target.value)} type="time" className="mt-1 w-full rounded-2xl bg-slate-950 border border-white/10 px-3 py-3 text-white" />
              </label>
            </div>

            <label className="mt-3 block text-xs font-bold text-slate-300">
              Descrição
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex: preciso instalar uma torneira..." className="mt-1 min-h-[90px] w-full rounded-2xl bg-slate-950 border border-white/10 px-3 py-3 text-white outline-none" />
            </label>

            <label className="mt-3 block text-xs font-bold text-slate-300">
              Valor opcional
              <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex: 120" className="mt-1 w-full rounded-2xl bg-slate-950 border border-white/10 px-3 py-3 text-white outline-none" />
            </label>

            <button
              type="button"
              disabled={salvando}
              onClick={criarAgendamento}
              className="mt-4 w-full rounded-3xl bg-emerald-600 px-4 py-4 font-black text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {salvando ? 'Enviando...' : enviado ? 'Solicitação enviada ✅' : 'Enviar solicitação'}
            </button>
            </div>
          </div>
        ) : null}

        <div className="h-4" />
      </div>
    </div>
  )
}
