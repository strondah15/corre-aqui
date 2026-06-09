'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { onValue, ref, serverTimestamp, update } from 'firebase/database'
import { database } from '@/lib/firebase'

function getMs(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000
  return 0
}

function getAgendaMs(item) {
  if (item?.data) return getMs(`${item.data}T${item.hora || '00:00'}`)
  return getMs(item?.criadoEm || item?.atualizadoEm)
}

function dateKey(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatHora(item) {
  if (item?.hora) return item.hora
  const ms = getAgendaMs(item)
  if (!ms) return '--:--'
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatEndereco(item) {
  return (
    item?.endereco ||
    item?.local?.endereco ||
    item?.bairro ||
    item?.cidade ||
    item?.clienteCidade ||
    'Endereco a combinar'
  )
}

function formatMoney(value) {
  const n = Number(String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return ''
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const statusInfo = {
  pendente: {
    label: 'Pendente',
    chip: 'bg-blue-600/22 text-blue-100 ring-blue-400/30',
  },
  aceito: {
    label: 'Confirmado',
    chip: 'bg-slate-500/18 text-slate-100 ring-white/10',
  },
  recusado: {
    label: 'Recusado',
    chip: 'bg-rose-500/16 text-rose-100 ring-rose-400/25',
  },
  concluido: {
    label: 'Concluido',
    chip: 'bg-emerald-500/16 text-emerald-200 ring-emerald-400/25',
  },
}

const filtros = [
  { id: 'todos', label: 'Todos' },
  { id: 'hoje', label: 'Hoje' },
  { id: 'agendados', label: 'Agendados' },
  { id: 'concluidos', label: 'Concluidos' },
]

function groupLabel(item) {
  const ms = getAgendaMs(item)
  const hoje = dateKey(Date.now())
  const amanhaDate = new Date()
  amanhaDate.setDate(amanhaDate.getDate() + 1)
  const amanha = dateKey(amanhaDate.getTime())
  const key = dateKey(ms)

  if (String(item?.status || '').toLowerCase() === 'concluido') return 'CONCLUIDOS'
  if (key === hoje) return 'HOJE'
  if (key === amanha) return 'AMANHA'
  return 'PROXIMOS'
}

function AgendaItem({ item, uid, salvandoId, onResponder }) {
  const status = String(item.status || 'pendente').toLowerCase()
  const meta = statusInfo[status] || statusInfo.pendente
  const souProf = item.profissionalId === uid
  const valor = formatMoney(item.valor)

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3 shadow-[0_12px_34px_rgba(0,0,0,0.18)]"
    >
      <div className="text-base font-black tabular-nums text-white">
        {formatHora(item)}
      </div>

      <div className="min-w-0">
        <div className="line-clamp-1 text-sm font-black text-white md:text-base">
          {item.titulo || 'Servico agendado'}
        </div>
        <div className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-slate-400 md:text-xs">
          {item.categoria || item.categoriaNome || item.servico || 'Servico'}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-slate-400 md:text-xs">
          <span className="text-slate-500">⌖</span>
          <span className="line-clamp-1">{formatEndereco(item)}</span>
        </div>
      </div>

      <div className="flex min-w-[6.4rem] flex-col items-end gap-1.5">
        <span className={`rounded-md px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ring-1 ${meta.chip}`}>
          {meta.label}
        </span>
        {valor ? <span className="text-xs font-black text-emerald-400 md:text-sm">{valor}</span> : null}
        {souProf && status === 'pendente' ? (
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              disabled={salvandoId === item.id}
              onClick={() => onResponder(item.id, 'aceito')}
              className="h-7 rounded-lg bg-[#ffd91a] px-2 text-[10px] font-black text-blue-950 disabled:opacity-60"
            >
              OK
            </button>
            <button
              type="button"
              disabled={salvandoId === item.id}
              onClick={() => onResponder(item.id, 'recusado')}
              className="h-7 rounded-lg bg-white/10 px-2 text-[10px] font-black text-white disabled:opacity-60"
            >
              Nao
            </button>
          </div>
        ) : null}
      </div>
    </motion.article>
  )
}

export default function AgendaProfissional({ uid, compacto = false }) {
  const [agendamentos, setAgendamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState(null)
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => {
    if (!uid) return undefined

    setLoading(true)
    const off = onValue(ref(database, 'agendamentos'), (snap) => {
      const raw = snap.val() || {}
      const lista = Object.entries(raw)
        .map(([id, value]) => ({ id, ...(value || {}) }))
        .filter((item) => item.profissionalId === uid || item.clienteId === uid)
        .sort((a, b) => getAgendaMs(a) - getAgendaMs(b))

      setAgendamentos(lista)
      setLoading(false)
    })

    return () => off()
  }, [uid])

  const resumo = useMemo(() => {
    return {
      todos: agendamentos.length,
      hoje: agendamentos.filter((item) => dateKey(getAgendaMs(item)) === dateKey(Date.now())).length,
      agendados: agendamentos.filter((item) => ['pendente', 'aceito'].includes(String(item.status || 'pendente').toLowerCase())).length,
      concluidos: agendamentos.filter((item) => String(item.status || '').toLowerCase() === 'concluido').length,
    }
  }, [agendamentos])

  const listaFiltrada = useMemo(() => {
    const hoje = dateKey(Date.now())
    return agendamentos.filter((item) => {
      const status = String(item.status || 'pendente').toLowerCase()
      if (filtro === 'hoje') return dateKey(getAgendaMs(item)) === hoje
      if (filtro === 'agendados') return ['pendente', 'aceito'].includes(status)
      if (filtro === 'concluidos') return status === 'concluido'
      return true
    })
  }, [agendamentos, filtro])

  const grupos = useMemo(() => {
    const base = compacto ? listaFiltrada.slice(0, 4) : listaFiltrada
    return base.reduce((acc, item) => {
      const label = groupLabel(item)
      if (!acc[label]) acc[label] = []
      acc[label].push(item)
      return acc
    }, {})
  }, [compacto, listaFiltrada])

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
      className="overflow-hidden rounded-[28px] border border-white/10 bg-[#050b12] p-3 text-white shadow-[0_24px_80px_rgba(0,0,0,0.34)] md:rounded-[34px] md:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Agenda</div>
          <h2 className="mt-1 text-xl font-black md:text-2xl">Meus servicos</h2>
        </div>
        <div className="rounded-2xl bg-[#ffd91a] px-3 py-2 text-sm font-black text-blue-950">
          {resumo.agendados}
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto border-b border-white/10 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filtros.map((item) => {
          const active = filtro === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFiltro(item.id)}
              className={[
                'h-9 shrink-0 rounded-xl px-4 text-xs font-black transition',
                active ? 'bg-[#ffd91a] text-blue-950' : 'bg-white/[0.045] text-slate-400 hover:bg-white/[0.08] hover:text-white',
              ].join(' ')}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-20 animate-pulse rounded-2xl bg-white/[0.055]" />
          ))}
        </div>
      ) : listaFiltrada.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-5 text-center text-sm font-bold text-slate-400">
          Nenhum servico nesta lista.
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {['HOJE', 'AMANHA', 'PROXIMOS', 'CONCLUIDOS'].map((label) => {
            const items = grupos[label] || []
            if (!items.length) return null
            return (
              <div key={label}>
                <div className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <AgendaItem key={item.id} item={item} uid={uid} salvandoId={salvandoId} onResponder={responder} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </motion.section>
  )
}
