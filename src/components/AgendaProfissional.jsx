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
    chip: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    dot: 'bg-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.55)]',
  },
  aceito: {
    label: 'Confirmado',
    chip: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    dot: 'bg-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.55)]',
  },
  recusado: {
    label: 'Recusado',
    chip: 'bg-rose-50 border-rose-200 text-rose-700',
    dot: 'bg-rose-400 shadow-[0_0_16px_rgba(244,63,94,0.45)]',
  },
  concluido: {
    label: 'Concluído',
    chip: 'bg-blue-50 border-blue-200 text-blue-700',
    dot: 'bg-blue-500 shadow-[0_0_16px_rgba(59,130,246,0.55)]',
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
      className="relative overflow-hidden rounded-[24px] border border-blue-100 bg-white p-2.5 text-slate-950 shadow-[0_18px_55px_rgba(37,99,235,0.12)] md:rounded-[32px] md:p-5"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,#eef8ff_0%,#ffffff_58%,#fff6bf_100%)]" />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700 shadow-sm md:px-3 md:py-1 md:text-[11px]">
              📅 Agenda
            </div>
            <h2 className="mt-2 text-lg font-black tracking-tight text-blue-950 md:mt-3 md:text-2xl">
              Minha agenda
            </h2>
            <p className="mt-1 line-clamp-1 max-w-lg text-[11px] font-semibold leading-snug text-slate-600 md:line-clamp-none md:text-sm md:leading-relaxed">
              {modo === 'cliente'
                ? 'Acompanhe seus agendamentos com profissionais.'
                : 'Aceite serviços futuros e organize sua fila sem sair do fluxo.'}
            </p>
          </div>

          <div className="shrink-0 rounded-xl border border-yellow-200 bg-yellow-50 px-2.5 py-1.5 text-center shadow-sm md:rounded-2xl md:px-3 md:py-2">
            <div className="text-base font-black leading-none text-yellow-700 md:text-lg">{resumo.pendente}</div>
            <div className="mt-0.5 text-[10px] font-bold text-yellow-700/70">pend.</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5 md:mt-4 md:gap-2">
          <div className="rounded-xl border border-blue-100 bg-white p-2 shadow-sm md:rounded-2xl md:p-2.5">
            <div className="text-[10px] font-bold text-slate-500">Pendentes</div>
            <div className="mt-0.5 text-base font-black text-yellow-700 md:mt-1 md:text-lg">{resumo.pendente}</div>
          </div>
          <div className="rounded-xl border border-blue-100 bg-white p-2 shadow-sm md:rounded-2xl md:p-2.5">
            <div className="text-[10px] font-bold text-slate-500">Confirmados</div>
            <div className="mt-0.5 text-base font-black text-emerald-700 md:mt-1 md:text-lg">{resumo.aceito}</div>
          </div>
          <div className="rounded-xl border border-blue-100 bg-white p-2 shadow-sm md:rounded-2xl md:p-2.5">
            <div className="text-[10px] font-bold text-slate-500">Recusados</div>
            <div className="mt-0.5 text-base font-black text-rose-700 md:mt-1 md:text-lg">{resumo.recusado}</div>
          </div>
        </div>

        {loading ? (
          <div className="mt-3 space-y-2 md:mt-4 md:space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-[24px] border border-blue-100 bg-white/80" />
            ))}
          </div>
        ) : agendamentos.length === 0 ? (
          <div className="mt-4 rounded-[24px] border border-dashed border-blue-200 bg-white p-5 text-center">
            <div className="text-2xl">📭</div>
            <div className="mt-2 text-sm font-black text-blue-950">Nenhum agendamento ainda</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-600">
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
                  className="rounded-[18px] border border-blue-100 bg-white p-2.5 shadow-[0_12px_34px_rgba(37,99,235,0.10)] transition hover:bg-blue-50 md:rounded-[24px] md:p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-blue-950 md:text-base">
                        {a.titulo || 'Serviço agendado'}
                      </div>
                      <div className="mt-1 inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">
                        {formatDataHora(a.data, a.hora)}
                      </div>
                    </div>

                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${meta.chip}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>

                  <p className="mt-2 line-clamp-1 text-xs font-semibold leading-snug text-slate-600 md:mt-3 md:line-clamp-2 md:text-sm md:leading-relaxed">
                    {a.descricao || 'Sem descrição informada.'}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-600 md:mt-3 md:gap-2 md:text-xs">
                    {souProf ? (
                      <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1">
                        👤 Cliente: <b className="text-blue-950">{a.clienteNome || 'Cliente'}</b>
                      </span>
                    ) : (
                      <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1">
                        🧑‍🔧 Profissional: <b className="text-blue-950">{a.profissionalNome || 'Profissional'}</b>
                      </span>
                    )}
                    {a.valor ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                        💰 R$ {a.valor}
                      </span>
                    ) : null}
                  </div>

                  {souProf && status === 'pendente' ? (
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5 md:mt-3 md:gap-2">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        disabled={salvandoId === a.id}
                        onClick={() => responder(a.id, 'aceito')}
                        className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2 text-xs font-black text-white shadow-[0_12px_30px_rgba(16,185,129,0.22)] disabled:opacity-60 md:rounded-2xl md:py-2.5 md:text-sm"
                      >
                        Aceitar
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        disabled={salvandoId === a.id}
                        onClick={() => responder(a.id, 'recusado')}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 disabled:opacity-60 md:rounded-2xl md:py-2.5 md:text-sm"
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
