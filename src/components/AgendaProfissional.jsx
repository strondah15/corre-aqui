'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { auth, database } from '@/lib/firebase'
import { respondPrivateRequest } from '@/lib/privateRequests'
import { respondLegacyAgendamento, subscribeParticipantAgendamentos } from '@/lib/agendamentos'

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
  return getMs(item?.criadoEm || item?.createdAt || item?.atualizadoEm)
}

function dateKey(ms) {
  const d = ms ? new Date(ms) : new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateFromKey(key) {
  const [year, month, day] = String(key || '').split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day)
}

function addDays(key, amount) {
  const d = dateFromKey(key)
  d.setDate(d.getDate() + amount)
  return dateKey(d.getTime())
}

function isSameWeek(ms, selectedKey) {
  if (!ms) return false
  const selected = dateFromKey(selectedKey)
  const start = new Date(selected)
  const day = start.getDay()
  start.setDate(start.getDate() - day)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 7)

  return ms >= start.getTime() && ms < end.getTime()
}

function formatHora(item) {
  if (item?.hora) return item.hora
  const ms = getAgendaMs(item)
  if (!ms) return '--:--'
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDataExtenso(key) {
  return dateFromKey(key).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatEndereco(item) {
  return (
    item?.endereco ||
    item?.local?.endereco ||
    item?.bairro ||
    item?.cidade ||
    item?.clienteCidade ||
    'Endereço a combinar'
  )
}

function formatMoney(value, fallback = '') {
  const n = Number(String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return fallback
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function moneyNumber(value) {
  const n = Number(String(value || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function initials(name) {
  return String(name || 'Corre Aqui')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CA'
}

function safePhoto(url) {
  const value = String(url || '').trim()
  return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(value) ? value : ''
}

const filtros = [
  { id: 'hoje', label: 'Hoje', icon: 'calendar' },
  { id: 'semana', label: 'Semana', icon: 'brief' },
  { id: 'todos', label: 'Todos', icon: 'list' },
]

const statusInfo = {
  pendente: {
    label: 'Pendente',
    actionLabel: 'Pendente',
    chip: 'bg-amber-50 text-amber-600 ring-amber-100',
    action: 'bg-amber-50 text-amber-600 ring-amber-100',
    bar: 'bg-blue-600',
  },
  aceito: {
    label: 'Confirmado',
    actionLabel: 'Confirmado',
    chip: 'bg-blue-50 text-blue-700 ring-blue-100',
    action: 'bg-blue-50 text-blue-700 ring-blue-100',
    bar: 'bg-blue-600',
  },
  recusado: {
    label: 'Recusado',
    actionLabel: 'Recusado',
    chip: 'bg-rose-50 text-rose-600 ring-rose-100',
    action: 'bg-rose-50 text-rose-600 ring-rose-100',
    bar: 'bg-rose-500',
  },
  concluido: {
    label: 'Concluído',
    actionLabel: 'Concluído',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    action: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    bar: 'bg-emerald-500',
  },
}

function Icon({ name, className = 'h-5 w-5' }) {
  if (name === 'bell') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path d="M18 10.7c0-3.4-2.2-6.1-6-6.1s-6 2.7-6 6.1v2.9l-1.6 2.5h15.2L18 13.6v-2.9Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M9.6 18.4a2.5 2.5 0 0 0 4.8 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    )
  }

  if (name === 'user') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <circle cx="12" cy="8.2" r="3.4" stroke="currentColor" strokeWidth="1.9" />
        <path d="M5.4 19.2c1.2-3.3 3.5-5 6.6-5s5.4 1.7 6.6 5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    )
  }

  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <rect x="4.2" y="5.8" width="15.6" height="14" rx="3" stroke="currentColor" strokeWidth="1.9" />
        <path d="M8 4v4M16 4v4M4.8 10h14.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    )
  }

  if (name === 'clock') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.9" />
        <path d="M12 7.6V12l3.2 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    )
  }

  if (name === 'check') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.9" />
        <path d="m8.2 12.2 2.5 2.5 5.2-5.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
    )
  }

  if (name === 'money') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.9" />
        <path d="M12 7.4v9.2M14.7 9.2c-.7-.7-1.6-1-2.8-1-1.5 0-2.5.7-2.5 1.8 0 1.2 1.1 1.6 2.7 2 1.7.4 2.8.9 2.8 2.1 0 1.2-1.1 1.9-2.8 1.9-1.3 0-2.4-.4-3.2-1.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    )
  }

  if (name === 'pin') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path d="M12 21s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10Z" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="12" cy="11" r="2" fill="currentColor" />
      </svg>
    )
  }

  if (name === 'brief') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path d="M8.5 7.2V5.8c0-1 .8-1.8 1.8-1.8h3.4c1 0 1.8.8 1.8 1.8v1.4" stroke="currentColor" strokeWidth="1.9" />
        <rect x="4.5" y="7.2" width="15" height="12.5" rx="3" stroke="currentColor" strokeWidth="1.9" />
        <path d="M9 12h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    )
  }

  if (name === 'list') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path d="M8 7h11M8 12h11M8 17h11" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <path d="M4.8 7h.1M4.8 12h.1M4.8 17h.1" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      </svg>
    )
  }

  if (name === 'x') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    )
  }

  if (name === 'chevron') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
    )
  }

  return null
}

function Header({ nome, fotoURL, notificacoesCount, onAbrirPerfil, onAbrirNotificacoes }) {
  const foto = safePhoto(fotoURL)
  return (
    <div className="flex items-center justify-between gap-3 rounded-[24px] border border-slate-100 bg-white p-3 shadow-[0_14px_40px_rgba(15,23,42,0.07)] md:rounded-[28px] md:p-4">
      <button type="button" onClick={onAbrirPerfil} className="flex min-w-0 items-center gap-3 text-left">
        <div
          className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-blue-50 bg-cover bg-center text-sm font-black text-blue-700 ring-4 ring-white shadow-[0_10px_22px_rgba(37,99,235,0.14)] md:h-16 md:w-16 md:text-base"
          style={foto ? { backgroundImage: `url(${JSON.stringify(foto)})` } : undefined}
        >
          {foto ? <span className="sr-only">{nome}</span> : initials(nome)}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">Perto de você</div>
          <div className="mt-0.5 flex items-center gap-1 truncate text-xl font-black text-blue-950 md:text-2xl">
            <span className="truncate">{nome || 'Corre Aqui'}</span>
            <span className="text-blue-700">›</span>
          </div>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onAbrirNotificacoes}
          className="relative grid h-11 w-11 place-items-center rounded-full border border-slate-100 bg-white text-blue-700 shadow-sm transition active:scale-[0.97] md:h-12 md:w-12"
          aria-label="Notificações"
        >
          <Icon name="bell" className="h-5 w-5" />
          {Number(notificacoesCount || 0) > 0 ? (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-black text-white">
              {Math.min(Number(notificacoesCount || 0), 9)}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onAbrirPerfil}
          className="grid h-11 w-11 place-items-center rounded-full border border-slate-100 bg-white text-blue-700 shadow-sm transition active:scale-[0.97] md:h-12 md:w-12"
          aria-label="Perfil"
        >
          <Icon name="user" className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, suffix, tone = 'blue' }) {
  const toneClasses = tone === 'amber'
    ? 'bg-amber-50 text-amber-600'
    : tone === 'emerald'
      ? 'bg-emerald-50 text-emerald-600'
      : 'bg-blue-50 text-blue-700'

  return (
    <div className="flex min-h-[70px] min-w-0 items-center gap-2 rounded-[15px] border border-slate-200/80 bg-white px-2.5 py-2 shadow-[0_8px_22px_rgba(15,23,42,0.04)] md:min-h-[104px] md:gap-3 md:rounded-[18px] md:px-5 md:py-3">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full md:h-12 md:w-12 ${toneClasses}`}>
        <Icon name={icon} className="h-[18px] w-[18px] md:h-6 md:w-6" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-black uppercase tracking-[0.05em] text-slate-500 md:text-xs md:normal-case md:tracking-normal">{label}</div>
        <div className="mt-0.5 truncate text-lg font-black leading-none text-blue-700 min-[390px]:text-xl md:mt-1 md:text-3xl">{value}</div>
        {suffix ? <div className="mt-0.5 truncate text-[9px] font-semibold leading-none text-slate-500 md:mt-1 md:text-xs md:leading-normal">{suffix}</div> : null}
      </div>
    </div>
  )
}

function StatusPill({ status, compact = false }) {
  const key = String(status || 'pendente').toLowerCase()
  const meta = statusInfo[key] || statusInfo.pendente
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] ring-1 ${compact ? meta.action : meta.chip}`}>
      {key === 'aceito' || key === 'concluido' ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
      {key === 'recusado' ? <Icon name="x" className="h-3.5 w-3.5" /> : null}
      {meta.actionLabel}
    </span>
  )
}

function agendaDomId(id) {
  return `agenda-request-${String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function AgendaItem({ item, uid, salvandoId, onResponder, focused = false }) {
  const status = String(item.status || 'pendente').toLowerCase()
  const meta = statusInfo[status] || statusInfo.pendente
  const souProf = item.profissionalId === uid
  const valor = formatMoney(item.valor, 'R$ 90,00')
  const titulo = item.titulo || item.servico || item.categoriaNome || 'Serviço agendado'

  return (
    <motion.article
      id={agendaDomId(item.id)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`relative overflow-hidden rounded-[18px] border bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] transition md:rounded-[20px] md:p-5 ${focused ? 'border-blue-500 ring-4 ring-blue-100 shadow-[0_18px_46px_rgba(37,99,235,0.18)]' : 'border-slate-200'}`}
    >
      <div className={`absolute inset-y-0 left-0 w-1.5 ${meta.bar}`} />
      <div className="grid gap-4 md:grid-cols-[90px_minmax(0,1fr)_220px_24px] md:items-center">
        <div className="flex items-center justify-between gap-3 md:block">
          <div className="text-2xl font-black tabular-nums text-blue-700 md:text-2xl">{formatHora(item)}</div>
          <StatusPill status={status} />
        </div>

        <div className="min-w-0">
          <div className="line-clamp-1 text-lg font-black text-blue-950">{titulo}</div>
          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Icon name="pin" className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="line-clamp-1">{formatEndereco(item)}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Icon name="brief" className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="line-clamp-1">{item.categoria || item.categoriaNome || item.servico || 'Serviço'}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <div className="md:text-right">
            <div className="text-lg font-black text-blue-700 md:text-xl">{valor}</div>
            <div className="text-xs font-semibold text-slate-500">Valor do serviço</div>
          </div>

          {souProf && status === 'pendente' ? (
            <div className="grid w-full grid-cols-2 gap-2 md:w-[210px]">
              <button
                type="button"
                disabled={salvandoId === item.id}
                onClick={() => onResponder(item.id, 'recusado')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-600 shadow-sm transition active:scale-[0.98] disabled:opacity-60"
              >
                <Icon name="x" className="h-4 w-4" />
                Recusar
              </button>
              <button
                type="button"
                disabled={salvandoId === item.id}
                onClick={() => onResponder(item.id, 'aceito')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(37,99,235,0.22)] transition active:scale-[0.98] disabled:opacity-60"
              >
                <Icon name="check" className="h-4 w-4" />
                Aceitar
              </button>
            </div>
          ) : (
            <StatusPill status={status} compact />
          )}
        </div>

        <button
          type="button"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-slate-500 transition hover:bg-slate-50 md:static md:h-9 md:w-9"
          aria-label="Mais opções"
        >
          <span className="text-xl leading-none">⋮</span>
        </button>
      </div>
    </motion.article>
  )
}

export default function AgendaProfissional({
  uid,
  compacto = false,
  nome = '',
  fotoURL = '',
  privateRequests = [],
  focusRequestId = '',
  notificacoesCount = 0,
  onAbrirPerfil,
  onAbrirNotificacoes,
  onAbrirPedido,
  onAbrirChat,
  onToast,
  showHeader = false,
  reserveFloatingControls = false,
} = {}) {
  const [agendamentos, setAgendamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState('hoje')
  const [selectedKey, setSelectedKey] = useState(() => dateKey(Date.now()))
  const [hiddenPrivateRequestIds, setHiddenPrivateRequestIds] = useState(() => new Set())
  const lastFocusedRequestRef = useRef('')

  useEffect(() => {
    if (!uid) {
      setAgendamentos([])
      setLoading(false)
      return undefined
    }

    setLoading(true)
    const off = subscribeParticipantAgendamentos({
      database,
      uid,
      onChange: (items) => {
        const lista = items
        .sort((a, b) => getAgendaMs(a) - getAgendaMs(b))

      setAgendamentos(lista)
      setLoading(false)
      },
      onError: () => {
        setAgendamentos([])
        setLoading(false)
      },
    })

    return () => off()
  }, [uid])

  const agendaItems = useMemo(() => {
    const byId = new Map()
    agendamentos.forEach((item) => {
      const id = item?.privateRequestId || item?.id
      if (!id) return
      byId.set(id, { ...item, id, privateRequestId: item?.privateRequestId || id })
    })

    ;(Array.isArray(privateRequests) ? privateRequests : []).forEach((item) => {
      const id = item?.privateRequestId || item?.id
      if (!id) return
      if (item?.profissionalId !== uid && item?.clienteId !== uid) return
      const current = byId.get(id) || {}
      const status = String(item?.status || current?.status || 'pendente').toLowerCase()
      byId.set(id, {
        ...current,
        ...item,
        id,
        privateRequestId: id,
        privateRequest: true,
        status: status === 'agendado' ? 'aceito' : status,
        titulo: item?.servicoTitulo || item?.titulo || current?.titulo || 'Serviço solicitado',
        servico: item?.servicoTitulo || current?.servico || 'Serviço',
      })
    })

    return Array.from(byId.values())
      .filter((item) => !hiddenPrivateRequestIds.has(String(item?.id || item?.privateRequestId || '')))
      .sort((a, b) => getAgendaMs(a) - getAgendaMs(b))
  }, [agendamentos, hiddenPrivateRequestIds, privateRequests, uid])

  const resumo = useMemo(() => {
    const hoje = dateKey(Date.now())
    const pendentes = agendaItems.filter((item) => String(item.status || 'pendente').toLowerCase() === 'pendente')
    const confirmados = agendaItems.filter((item) => String(item.status || '').toLowerCase() === 'aceito')
    const hojeLista = agendaItems.filter((item) => dateKey(getAgendaMs(item)) === hoje)
    const valorPrevisto = agendaItems
      .filter((item) => !['recusado', 'cancelado'].includes(String(item.status || 'pendente').toLowerCase()))
      .reduce((acc, item) => acc + moneyNumber(item.valor || item.preco || item.faixaPreco), 0)

    return {
      hoje: hojeLista.length,
      pendentes: pendentes.length,
      confirmados: confirmados.length,
      valorPrevisto,
    }
  }, [agendaItems])

  const listaFiltrada = useMemo(() => {
    return agendaItems.filter((item) => {
      const ms = getAgendaMs(item)
      if (filtro === 'hoje') return dateKey(ms) === selectedKey
      if (filtro === 'semana') return isSameWeek(ms, selectedKey)
      return true
    })
  }, [agendaItems, filtro, selectedKey])

  const listaRender = compacto ? listaFiltrada.slice(0, 4) : listaFiltrada
  const listaTitulo = filtro === 'hoje'
    ? 'Serviços do dia'
    : filtro === 'semana'
      ? 'Serviços da semana'
      : 'Todos os serviços'

  useEffect(() => {
    const targetId = String(focusRequestId || '').trim()
    if (!targetId) {
      lastFocusedRequestRef.current = ''
      return undefined
    }
    if (loading) return undefined
    const targetExists = agendaItems.some((item) => String(item?.id || item?.privateRequestId || '') === targetId)
    if (!targetExists) return undefined

    if (filtro !== 'todos') {
      setFiltro('todos')
      return undefined
    }

    if (lastFocusedRequestRef.current === targetId) return undefined
    lastFocusedRequestRef.current = targetId
    const timer = window.setTimeout(() => {
      document.getElementById(agendaDomId(targetId))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    return () => window.clearTimeout(timer)
  }, [agendaItems, filtro, focusRequestId, loading])

  const responder = async (id, status) => {
    if (!id || salvandoId) return
    setSalvandoId(id)
    setErro('')
    try {
      const item = agendaItems.find((entry) => String(entry?.id || entry?.privateRequestId || '') === String(id))
      if (item?.privateRequest || item?.privateRequestId) {
        console.info('[AGENDA] responder solicitacao privada', {
          authUid: auth.currentUser?.uid || uid || null,
          id: String(item?.id || item?.privateRequestId || id),
          criadorUid: item?.clienteId || null,
          destinatarioUid: item?.profissionalId || uid || null,
          caminho: `privateRequests/${String(item?.id || item?.privateRequestId || id)}`,
          inboxCliente: `privateRequestInbox/${item?.clienteId || '<clienteUid>'}/${String(item?.id || item?.privateRequestId || id)}`,
          inboxProfissional: `privateRequestInbox/${item?.profissionalId || uid || '<profissionalUid>'}/${String(item?.id || item?.privateRequestId || id)}`,
          statusAtual: item?.status || 'pendente',
          proximoStatus: status,
          payload: item,
        })
        const result = await respondPrivateRequest({
          database,
          request: item,
          profissional: { uid, nome, fotoURL },
          status,
        })
        if (result?.stale) {
          const hasConfirmedAgenda = agendamentos.some((agenda) => {
            const agendaId = String(agenda?.privateRequestId || agenda?.id || '')
            const agendaStatus = String(agenda?.status || '').toLowerCase()
            return agendaId === String(item?.id || item?.privateRequestId || id)
              && !['pendente', 'recusado', 'cancelado'].includes(agendaStatus)
          })
          if (!hasConfirmedAgenda) {
            setHiddenPrivateRequestIds((current) => {
              const next = new Set(current)
              next.add(String(item?.id || item?.privateRequestId || id))
              return next
            })
          }
          return
        }
        if (status === 'aceito') {
          const destino = { ...item, ...result, id: result?.id || item?.id || item?.privateRequestId }
          if (typeof onAbrirPedido === 'function') onAbrirPedido(destino)
          else if (typeof onAbrirChat === 'function') onAbrirChat(destino)
        }
        return
      }

      const agendamentoPath = `agendamentos/${id}`
      console.info('[AGENDA] responder agendamento', {
        authUid: auth.currentUser?.uid || uid || null,
        id,
        criadorUid: item?.clienteId || null,
        destinatarioUid: item?.profissionalId || uid || null,
        caminho: agendamentoPath,
        statusAtual: item?.status || 'pendente',
        proximoStatus: status,
        payload: { status },
      })
      await respondLegacyAgendamento({ database, agendamento: item, actorUid: uid, status })
      if (status === 'aceito') {
        const destino = { ...item, id }
        if (typeof onAbrirPedido === 'function') onAbrirPedido(destino)
        else if (typeof onAbrirChat === 'function') onAbrirChat(destino)
      }
    } catch (error) {
      const message = error?.message || 'Nao foi possivel responder esse agendamento agora.'
      console.error('[AGENDA] erro ao responder agendamento:', error)
      setErro(message)
      if (typeof onToast === 'function') {
        onToast({ type: 'error', title: 'Agenda', message })
      }
    } finally {
      setSalvandoId(null)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: 'easeOut' }}
      className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white p-2.5 text-slate-950 shadow-[0_20px_64px_rgba(15,23,42,0.09)] md:h-auto md:rounded-[34px] md:p-5 md:shadow-[0_24px_80px_rgba(15,23,42,0.10)]"
    >
      {showHeader ? (
        <Header
          nome={nome}
          fotoURL={fotoURL}
          notificacoesCount={notificacoesCount}
          onAbrirPerfil={onAbrirPerfil}
          onAbrirNotificacoes={onAbrirNotificacoes}
        />
      ) : null}

      <div className={['flex min-h-0 flex-1 flex-col px-0.5 md:block md:px-2', showHeader ? 'pt-3 md:pt-5' : 'pt-0.5 md:pt-2'].join(' ')}>
        <div className="shrink-0">
          <h2 className="text-[22px] font-black tracking-tight text-blue-950 md:text-3xl">Minha agenda</h2>
          <p className="mt-0.5 text-xs font-semibold leading-snug text-slate-500 md:mt-1 md:text-sm">Veja e gerencie seus serviços agendados.</p>
        </div>

        {erro ? (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">
            {erro}
          </div>
        ) : null}

        <div className="mt-3 grid shrink-0 grid-cols-2 gap-2 md:mt-5 md:gap-3 lg:grid-cols-4">
          <SummaryCard icon="calendar" label="Hoje" value={resumo.hoje} suffix={resumo.hoje === 1 ? 'serviço' : 'serviços'} />
          <SummaryCard icon="clock" label="Pendentes" value={resumo.pendentes} suffix={resumo.pendentes === 1 ? 'serviço' : 'serviços'} tone="blue" />
          <SummaryCard icon="check" label="Confirmados" value={resumo.confirmados} suffix={resumo.confirmados === 1 ? 'serviço' : 'serviços'} tone="emerald" />
          <SummaryCard icon="money" label="Valor previsto" value={formatMoney(resumo.valorPrevisto, 'R$ 0,00')} />
        </div>

        <div className="mt-2.5 flex shrink-0 flex-col gap-1.5 rounded-[15px] border border-slate-200 bg-white p-1.5 shadow-[0_8px_22px_rgba(15,23,42,0.04)] md:mt-5 md:flex-row md:items-center md:justify-between md:gap-3 md:rounded-[16px] md:p-2">
          <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filtros.map((item) => {
              const active = filtro === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFiltro(item.id)}
                  className={[
                    'inline-flex h-8 min-w-0 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-[11px] font-black transition md:h-10 md:flex-none md:gap-2 md:rounded-xl md:px-4 md:text-xs',
                    active ? 'bg-blue-700 text-white shadow-[0_10px_24px_rgba(37,99,235,0.20)]' : 'text-slate-600 hover:bg-slate-50 hover:text-blue-700',
                  ].join(' ')}
                >
                  <Icon name={item.icon} className="h-3.5 w-3.5 md:h-4 md:w-4" />
                  {item.label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-1 border-t border-slate-100 pt-1.5 md:justify-end md:gap-2 md:border-t-0 md:pt-0">
            <button
              type="button"
              onClick={() => setSelectedKey((key) => addDays(key, -1))}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-blue-950 transition hover:bg-blue-50 active:scale-[0.97] md:h-10 md:w-10 md:rounded-xl"
              aria-label="Dia anterior"
            >
              <Icon name="chevron" className="h-4 w-4 rotate-180 md:h-5 md:w-5" />
            </button>
            <button
              type="button"
              className="inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-2 text-[11px] font-black text-blue-950 md:h-10 md:min-w-[260px] md:flex-none md:gap-2 md:rounded-xl md:px-3 md:text-xs"
            >
              <Icon name="calendar" className="h-3.5 w-3.5 text-blue-700 md:h-4 md:w-4" />
              <span className="truncate">{formatDataExtenso(selectedKey)}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedKey((key) => addDays(key, 1))}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-blue-950 transition hover:bg-blue-50 active:scale-[0.97] md:h-10 md:w-10 md:rounded-xl"
              aria-label="Próximo dia"
            >
              <Icon name="chevron" className="h-4 w-4 md:h-5 md:w-5" />
            </button>
          </div>
        </div>

        <div className="mt-2 flex min-h-0 flex-1 flex-col md:mt-3 md:block">
          <div className="flex shrink-0 items-center justify-between gap-3 px-1 pb-1.5 md:pb-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 md:text-xs">{listaTitulo}</h3>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">{listaRender.length}</span>
          </div>

          <div
            className={[
              'min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable] md:overflow-visible md:pr-0',
              reserveFloatingControls ? 'pb-[calc(9.25rem+env(safe-area-inset-bottom))] md:pb-0' : 'pb-1 md:pb-0',
            ].join(' ')}
          >
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="h-24 animate-pulse rounded-[18px] bg-slate-100 md:h-28" />
                ))}
              </div>
            ) : listaRender.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center md:py-10">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-blue-700 md:h-12 md:w-12">
                  <Icon name="calendar" className="h-5 w-5 md:h-6 md:w-6" />
                </div>
                <div className="mt-2 text-sm font-black text-blue-950 md:mt-3 md:text-base">Nenhum serviço nesta data.</div>
                <p className="mt-0.5 text-xs font-semibold text-slate-500 md:mt-1 md:text-sm">Novos agendamentos aparecem aqui em tempo real.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {listaRender.map((item) => (
                  <AgendaItem
                    key={item.id}
                    item={item}
                    uid={uid}
                    salvandoId={salvandoId}
                    onResponder={responder}
                    focused={String(item?.id || item?.privateRequestId || '') === String(focusRequestId || '')}
                  />
                ))}
              </div>
            )}

            <div className="mt-2 rounded-[12px] border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-700 md:mt-3 md:rounded-[14px] md:px-4 md:py-3 md:text-xs">
              <span className="font-black">Dica:</span> Mantenha sua agenda atualizada para não perder oportunidades de serviço.
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  )
}
