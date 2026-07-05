'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { onValue, ref, serverTimestamp, update } from 'firebase/database'
import { database } from '@/lib/firebase'
import { respondPrivateRequest } from '@/lib/privateRequests'

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
    <div className="flex min-h-[88px] items-center gap-3 rounded-[16px] border border-slate-200/80 bg-white px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.04)] md:min-h-[104px] md:rounded-[18px] md:px-5">
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${toneClasses}`}>
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-bold text-slate-500">{label}</div>
        <div className="mt-1 truncate text-2xl font-black leading-none text-blue-700 md:text-3xl">{value}</div>
        {suffix ? <div className="mt-1 text-xs font-semibold text-slate-500">{suffix}</div> : null}
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

function AgendaItem({ item, uid, salvandoId, onResponder }) {
  const status = String(item.status || 'pendente').toLowerCase()
  const meta = statusInfo[status] || statusInfo.pendente
  const souProf = item.profissionalId === uid
  const valor = formatMoney(item.valor, 'R$ 90,00')
  const titulo = item.titulo || item.servico || item.categoriaNome || 'Serviço agendado'

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)] md:rounded-[20px] md:p-5"
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
  notificacoesCount = 0,
  onAbrirPerfil,
  onAbrirNotificacoes,
  onAbrirPedido,
  onAbrirChat,
  onToast,
  showHeader = false,
} = {}) {
  const [agendamentos, setAgendamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [salvandoId, setSalvandoId] = useState(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState('hoje')
  const [selectedKey, setSelectedKey] = useState(() => dateKey(Date.now()))

  useEffect(() => {
    if (!uid) {
      setAgendamentos([])
      setLoading(false)
      return undefined
    }

    setLoading(true)
    const off = onValue(ref(database, 'agendamentos'), (snap) => {
      const raw = snap.val() || {}
      const lista = Object.entries(raw)
        .map(([id, value]) => ({ id, ...(value || {}) }))
        .filter((item) => item.profissionalId === uid || item.clienteId === uid)
        .sort((a, b) => getAgendaMs(a) - getAgendaMs(b))

      setAgendamentos(lista)
      setLoading(false)
    }, () => {
      setAgendamentos([])
      setLoading(false)
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

    return Array.from(byId.values()).sort((a, b) => getAgendaMs(a) - getAgendaMs(b))
  }, [agendamentos, privateRequests, uid])

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

  const responder = async (id, status) => {
    if (!id || salvandoId) return
    setSalvandoId(id)
    setErro('')
    try {
      const item = agendaItems.find((entry) => String(entry?.id || entry?.privateRequestId || '') === String(id))
      if (item?.privateRequest || item?.privateRequestId) {
        const result = await respondPrivateRequest({
          database,
          request: item,
          profissional: { uid, nome, fotoURL },
          status,
        })
        if (status === 'aceito') {
          const destino = { ...item, ...result, id: result?.id || item?.id || item?.privateRequestId }
          if (typeof onAbrirPedido === 'function') onAbrirPedido(destino)
          else if (typeof onAbrirChat === 'function') onAbrirChat(destino)
        }
        return
      }

      await update(ref(database, `agendamentos/${id}`), {
        status,
        respondidoEm: Date.now(),
        atualizadoEm: serverTimestamp(),
      })
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
      className="mx-auto w-full max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white p-3 text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.10)] md:rounded-[34px] md:p-5"
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

      <div className={['px-1 md:px-2', showHeader ? 'pt-5' : 'pt-2'].join(' ')}>
        <div>
          <h2 className="text-2xl font-black tracking-tight text-blue-950 md:text-3xl">Minha agenda</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Veja e gerencie seus serviços agendados.</p>
        </div>

        {erro ? (
          <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">
            {erro}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard icon="calendar" label="Hoje" value={resumo.hoje} suffix={resumo.hoje === 1 ? 'serviço' : 'serviços'} />
          <SummaryCard icon="clock" label="Pendentes" value={resumo.pendentes} suffix={resumo.pendentes === 1 ? 'serviço' : 'serviços'} tone="blue" />
          <SummaryCard icon="check" label="Confirmados" value={resumo.confirmados} suffix={resumo.confirmados === 1 ? 'serviço' : 'serviços'} tone="emerald" />
          <SummaryCard icon="money" label="Valor previsto" value={formatMoney(resumo.valorPrevisto, 'R$ 0,00')} />
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-[16px] border border-slate-200 bg-white p-2 shadow-[0_10px_28px_rgba(15,23,42,0.04)] md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filtros.map((item) => {
              const active = filtro === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFiltro(item.id)}
                  className={[
                    'inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-xs font-black transition',
                    active ? 'bg-blue-700 text-white shadow-[0_10px_24px_rgba(37,99,235,0.20)]' : 'text-slate-600 hover:bg-slate-50 hover:text-blue-700',
                  ].join(' ')}
                >
                  <Icon name={item.icon} className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-2 md:justify-end">
            <button
              type="button"
              onClick={() => setSelectedKey((key) => addDays(key, -1))}
              className="grid h-10 w-10 place-items-center rounded-xl text-blue-950 transition hover:bg-blue-50 active:scale-[0.97]"
              aria-label="Dia anterior"
            >
              <Icon name="chevron" className="h-5 w-5 rotate-180" />
            </button>
            <button
              type="button"
              className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-blue-950 md:min-w-[260px] md:flex-none"
            >
              <Icon name="calendar" className="h-4 w-4 text-blue-700" />
              <span className="truncate">{formatDataExtenso(selectedKey)}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedKey((key) => addDays(key, 1))}
              className="grid h-10 w-10 place-items-center rounded-xl text-blue-950 transition hover:bg-blue-50 active:scale-[0.97]"
              aria-label="Próximo dia"
            >
              <Icon name="chevron" className="h-5 w-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-[18px] bg-slate-100" />
            ))}
          </div>
        ) : listaRender.length === 0 ? (
          <div className="mt-3 rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-700">
              <Icon name="calendar" className="h-6 w-6" />
            </div>
            <div className="mt-3 text-base font-black text-blue-950">Nenhum serviço nesta data.</div>
            <p className="mt-1 text-sm font-semibold text-slate-500">Novos agendamentos aparecem aqui em tempo real.</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2.5">
            {listaRender.map((item) => (
              <AgendaItem key={item.id} item={item} uid={uid} salvandoId={salvandoId} onResponder={responder} />
            ))}
          </div>
        )}

        <div className="mt-3 rounded-[14px] border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700">
          <span className="font-black">Dica:</span> Mantenha sua agenda atualizada para não perder oportunidades de serviço.
        </div>
      </div>
    </motion.section>
  )
}
