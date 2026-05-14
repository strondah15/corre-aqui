'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, update, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'

function getMs(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const parsed = Date.parse(v)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000
  return 0
}

function formatDataHora(data, hora) {
  if (!data && !hora) return 'Sem data'
  const base = data ? new Date(`${data}T${hora || '00:00'}`) : null
  if (!base || Number.isNaN(base.getTime())) return `${data || ''} ${hora || ''}`.trim()
  return `${base.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} às ${hora || 'horário a combinar'}`
}

const statusStyle = {
  pendente: 'bg-amber-500/15 border-amber-400/20 text-amber-200',
  aceito: 'bg-emerald-500/15 border-emerald-400/20 text-emerald-200',
  recusado: 'bg-red-500/15 border-red-400/20 text-red-200',
  concluido: 'bg-blue-500/15 border-blue-400/20 text-blue-200',
}

export default function AgendaProfissional({ uid, modo = 'profissional', compacto = false }) {
  const [agendamentos, setAgendamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState(null)

  useEffect(() => {
    if (!uid) return

    setLoading(true)
    const off = onValue(ref(database, 'agendamentos'), (snap) => {
      const raw = snap.val() || {}
      const lista = Object.entries(raw)
        .map(([id, v]) => ({ id, ...(v || {}) }))
        .filter((a) => a.profissionalId === uid || a.clienteId === uid)
        .sort((a, b) => {
          const da = getMs(`${a.data || ''}T${a.hora || '00:00'}`) || getMs(a.criadoEm)
          const db = getMs(`${b.data || ''}T${b.hora || '00:00'}`) || getMs(b.criadoEm)
          return da - db
        })

      setAgendamentos(lista)
      setLoading(false)
    })

    return () => off()
  }, [uid])

  const pendentes = useMemo(
    () => agendamentos.filter((a) => String(a.status || 'pendente') === 'pendente'),
    [agendamentos]
  )

  const responder = async (id, status) => {
    if (!id || salvandoId) return
    setSalvandoId(id)
    try {
      await update(ref(database, `agendamentos/${id}`), {
        status,
        respondidoEm: Date.now(),
        atualizadoEm: serverTimestamp(),
      })
    } finally {
      setSalvandoId(null)
    }
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-[#07111f] p-4 text-white shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-black">📅 Agenda</div>
          <div className="mt-1 text-xs text-slate-400">
            {modo === 'cliente'
              ? 'Acompanhe seus agendamentos com profissionais.'
              : 'Aceite serviços futuros mesmo quando estiver em trabalho.'}
          </div>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-slate-200">
          {pendentes.length} pendente{pendentes.length === 1 ? '' : 's'}
        </span>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl bg-white/[0.04] p-4 text-sm text-slate-300">Carregando agenda...</div>
      ) : agendamentos.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
          Nenhum agendamento ainda.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {agendamentos.slice(0, compacto ? 3 : 20).map((a) => {
            const status = String(a.status || 'pendente')
            const souProf = a.profissionalId === uid

            return (
              <div key={a.id} className="rounded-3xl border border-white/10 bg-white/[0.045] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-black text-white truncate">{a.titulo || 'Serviço agendado'}</div>
                    <div className="mt-1 text-sm text-slate-300">
                      {formatDataHora(a.data, a.hora)}
                    </div>
                    <div className="mt-1 text-xs text-slate-400 line-clamp-2">
                      {a.descricao || 'Sem descrição'}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black ${statusStyle[status] || statusStyle.pendente}`}>
                    {status.toUpperCase()}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                  {souProf ? (
                    <span>👤 Cliente: <b className="text-white">{a.clienteNome || 'Cliente'}</b></span>
                  ) : (
                    <span>🧑‍🔧 Profissional: <b className="text-white">{a.profissionalNome || 'Profissional'}</b></span>
                  )}
                  {a.valor ? <span>💰 Valor: <b className="text-white">R$ {a.valor}</b></span> : null}
                </div>

                {souProf && status === 'pendente' ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={salvandoId === a.id}
                      onClick={() => responder(a.id, 'aceito')}
                      className="rounded-2xl bg-emerald-600 px-3 py-2 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-60"
                    >
                      Aceitar
                    </button>
                    <button
                      type="button"
                      disabled={salvandoId === a.id}
                      onClick={() => responder(a.id, 'recusado')}
                      className="rounded-2xl bg-red-500/15 border border-red-400/20 px-3 py-2 text-sm font-black text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                    >
                      Recusar
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
