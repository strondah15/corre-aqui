'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
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
  if (!data && !hora) return 'Sem data definida'

  const base = data ? new Date(`${data}T${hora || '00:00'}`) : null
  if (!base || Number.isNaN(base.getTime())) return `${data || ''} ${hora || ''}`.trim()

  const dia = base.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })

  return `${dia} às ${hora || 'horário a combinar'}`
}

const statusMeta = {
  pendente: {
    label: 'Pendente',
    chip: 'bg-amber-400/12 border-amber-300/20 text-amber-100',
    dot: 'bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.65)]',
  },
  aceito: {
    label: 'Confirmado',
    chip: 'bg-emerald-400/12 border-emerald-300/20 text-emerald-100',
    dot: 'bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.65)]',
  },
  recusado: {
    label: 'Recusado',
    chip: 'bg-rose-400/12 border-rose-300/20 text-rose-100',
    dot: 'bg-rose-300 shadow-[0_0_16px_rgba(253,164,175,0.60)]',
  },
  concluido: {
    label: 'Concluído',
    chip: 'bg-blue-400/12 border-blue-300/20 text-blue-100',
    dot: 'bg-blue-300 shadow-[0_0_16px_rgba(147,197,253,0.65)]',
  },
}

const cardMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
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

  const resumo = useMemo(() => {
    const counts = { pendente: 0, aceito: 0, recusado: 0 }
    agendamentos.forEach((a) => {
      const status = String(a.status || 'pendente')
      if (counts[status] != null) counts[status] += 1
    })
    return counts
  }, [agendamentos])

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
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#07111f]/88 p-3 text-white shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-2xl md:p-5"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(59,130,246,0.16),transparent_34%),radial-gradient(circle_at_88%_18%,rgba(168,85,247,0.12),transparent_32%)]" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-blue-100">
              📅 Agenda
            </div>
            <h2 className="mt-3 text-xl font-black tracking-tight text-white md:text-2xl">
              Minha agenda
            </h2>
            <p className="mt-1 max-w-lg text-xs leading-relaxed text-slate-400 md:text-sm">
              {modo === 'cliente'
                ? 'Acompanhe seus agendamentos com profissionais.'
                : 'Aceite serviços futuros e organize sua fila sem sair do fluxo.'}
            </p>
          </div>

          <div className="shrink-0 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-center">
            <div className="text-lg font-black leading-none text-amber-100">{resumo.pendente}</div>
            <div className="mt-0.5 text-[10px] font-bold text-amber-100/70">pend.</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-2.5">
            <div className="text-[10px] font-bold text-slate-400">Pendentes</div>
            <div className="mt-1 text-lg font-black text-amber-100">{resumo.pendente}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-2.5">
            <div className="text-[10px] font-bold text-slate-400">Confirmados</div>
            <div className="mt-1 text-lg font-black text-emerald-100">{resumo.aceito}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-2.5">
            <div className="text-[10px] font-bold text-slate-400">Recusados</div>
            <div className="mt-1 text-lg font-black text-rose-100">{resumo.recusado}</div>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-[24px] border border-white/10 bg-white/[0.045]" />
            ))}
          </div>
        ) : agendamentos.length === 0 ? (
          <div className="mt-4 rounded-[24px] border border-dashed border-white/12 bg-white/[0.04] p-5 text-center">
            <div className="text-2xl">📭</div>
            <div className="mt-2 text-sm font-black text-white">Nenhum agendamento ainda</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-400">
              Quando clientes solicitarem horários, eles aparecem aqui.
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {agendamentos.slice(0, compacto ? 3 : 20).map((a, index) => {
              const status = String(a.status || 'pendente')
              const meta = statusMeta[status] || statusMeta.pendente
              const souProf = a.profissionalId === uid

              return (
                <motion.article
                  key={a.id}
                  variants={cardMotion}
                  initial="initial"
                  animate="animate"
                  transition={{ duration: 0.22, delay: Math.min(index * 0.035, 0.18) }}
                  className="rounded-[24px] border border-white/10 bg-white/[0.055] p-3.5 shadow-[0_12px_34px_rgba(0,0,0,0.18)] transition hover:bg-white/[0.075] md:p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-white md:text-base">
                        {a.titulo || 'Serviço agendado'}
                      </div>
                      <div className="mt-1 inline-flex rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-bold text-slate-200">
                        {formatDataHora(a.data, a.hora)}
                      </div>
                    </div>

                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${meta.chip}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>

                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-400 md:text-sm">
                    {a.descricao || 'Sem descrição informada.'}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                    {souProf ? (
                      <span className="rounded-full bg-white/[0.055] px-2.5 py-1">
                        👤 Cliente: <b className="text-white">{a.clienteNome || 'Cliente'}</b>
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/[0.055] px-2.5 py-1">
                        🧑‍🔧 Profissional: <b className="text-white">{a.profissionalNome || 'Profissional'}</b>
                      </span>
                    )}
                    {a.valor ? (
                      <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-emerald-100">
                        💰 R$ {a.valor}
                      </span>
                    ) : null}
                  </div>

                  {souProf && status === 'pendente' ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        disabled={salvandoId === a.id}
                        onClick={() => responder(a.id, 'aceito')}
                        className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2.5 text-sm font-black text-white shadow-[0_12px_30px_rgba(16,185,129,0.22)] disabled:opacity-60"
                      >
                        Aceitar
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        disabled={salvandoId === a.id}
                        onClick={() => responder(a.id, 'recusado')}
                        className="rounded-2xl border border-rose-300/20 bg-rose-500/12 px-3 py-2.5 text-sm font-black text-rose-100 disabled:opacity-60"
                      >
                        Recusar
                      </motion.button>
                    </div>
                  ) : null}
                </motion.article>
              )
            })}
          </div>
        )}
      </div>
    </motion.section>
  )
}
