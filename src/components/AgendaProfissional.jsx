'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { auth, database } from '@/lib/firebase'
import { respondPrivateRequest } from '@/lib/privateRequests'
import { respondLegacyAgendamento, subscribeParticipantAgendamentos } from '@/lib/agendamentos'
import { ListPanelSkeleton } from '@/components/LoadingSkeletons'

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

function formatHora(item) {
  if (item?.hora) return item.hora
  const ms = getAgendaMs(item)
  if (!ms) return '--:--'
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDataCurta(item) {
  const ms = getAgendaMs(item)
  if (!ms) return 'Data a combinar'
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
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
  { id: 'pendentes', label: 'Pendentes' },
  { id: 'agendados', label: 'Agendados' },
  { id: 'historico', label: 'Histórico' },
]

const statusEmAtendimento = new Set(['em_andamento', 'a_caminho', 'chegou', 'aguardando_confirmacao', 'em_atendimento'])
const statusAgendados = new Set(['aceito', 'agendado', ...statusEmAtendimento])
const statusHistorico = new Set(['finalizado', 'concluido', 'recusado', 'cancelado'])

function agendaFilterForStatus(status) {
  const key = String(status || 'pendente').toLowerCase()
  if (key === 'pendente') return 'pendentes'
  if (statusHistorico.has(key)) return 'historico'
  return 'agendados'
}

const statusInfo = {
  pendente: {
    label: 'Pendente',
    actionLabel: 'Pendente',
    chip: 'border-amber-300/25 bg-amber-400/10 text-amber-200',
    bar: 'bg-amber-400',
  },
  aceito: {
    label: 'Combinando',
    actionLabel: 'Abrir atendimento',
    chip: 'border-blue-300/25 bg-blue-400/10 text-blue-200',
    bar: 'bg-blue-500',
  },
  agendado: {
    label: 'Combinando',
    actionLabel: 'Abrir atendimento',
    chip: 'border-blue-300/25 bg-blue-400/10 text-blue-200',
    bar: 'bg-blue-500',
  },
  em_atendimento: {
    label: 'A caminho',
    actionLabel: 'Abrir atendimento',
    chip: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200',
    bar: 'bg-emerald-400',
  },
  recusado: {
    label: 'Recusado',
    actionLabel: 'Recusado',
    chip: 'border-rose-300/25 bg-rose-400/10 text-rose-200',
    bar: 'bg-rose-500',
  },
  cancelado: {
    label: 'Cancelado',
    actionLabel: 'Cancelado',
    chip: 'border-slate-300/20 bg-slate-400/10 text-slate-300',
    bar: 'bg-slate-400',
  },
  concluido: {
    label: 'Concluído',
    actionLabel: 'Concluído',
    chip: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-200',
    bar: 'bg-emerald-500',
  },
}

statusInfo.finalizado = statusInfo.concluido
statusEmAtendimento.forEach((status) => {
  statusInfo[status] = statusInfo.em_atendimento
})
statusInfo.em_andamento = {
  ...statusInfo.em_atendimento,
  label: 'Combinando',
}
statusInfo.a_caminho = {
  ...statusInfo.em_atendimento,
  label: 'A caminho',
}
statusInfo.chegou = {
  ...statusInfo.em_atendimento,
  label: 'Chegou',
}
statusInfo.aguardando_confirmacao = {
  ...statusInfo.em_atendimento,
  label: 'Aguardando cliente',
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

  if (name === 'chat') {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
        <path d="M5 5.8h14v9.4H9.2L5 19v-3.8H5V5.8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M8.2 9.2h7.6M8.2 12h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
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
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] md:px-3 md:py-1 md:text-[10px] ${meta.chip} ${compact ? 'max-w-full' : ''}`}>
      {statusAgendados.has(key) || key === 'concluido' || key === 'finalizado' ? <Icon name="check" className="h-3 w-3" /> : null}
      {key === 'recusado' ? <Icon name="x" className="h-3.5 w-3.5" /> : null}
      {meta.actionLabel}
    </span>
  )
}

function agendaDomId(id) {
  return `agenda-request-${String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function AgendaItem({ item, uid, pendingAction, onResponder, onAbrirChat, onPreloadChat, focused = false }) {
  const [expanded, setExpanded] = useState(false)
  const status = String(item.status || 'pendente').toLowerCase()
  const meta = statusInfo[status] || statusInfo.pendente
  const souProf = item.profissionalId === uid
  const isSaving = pendingAction?.id === item.id
  const anySaving = Boolean(pendingAction?.id)
  const isAccepting = isSaving && pendingAction?.status === 'aceito'
  const isRejecting = isSaving && pendingAction?.status === 'recusado'
  const valor = formatMoney(item.valor, 'A combinar')
  const titulo = item.titulo || item.servico || item.categoriaNome || 'Serviço agendado'
  const nomePessoa = souProf
    ? item.clienteNome || item.criador?.nome || 'Cliente'
    : item.profissionalNome || item.aceite?.nome || 'Profissional'
  const descricao = String(item.descricao || item.observacao || item.servicoSnapshot?.descricao || '').trim()
  const duracao = String(item.duracao || item.tempoEstimado || '').trim()
  const categoria = item.categoria || item.categoriaNome || item.servico || 'Serviço'
  const endereco = formatEndereco(item)
  const detailsId = `${agendaDomId(item.id)}-details`
  const conversationId = String(item.privateRequestId || item.pedidoId || '').trim()
  const canOpenAttendance = souProf && statusAgendados.has(status) && Boolean(conversationId)

  return (
    <article
      id={agendaDomId(item.id)}
      aria-busy={isSaving}
      className={`relative overflow-hidden rounded-2xl border bg-[#07111f] p-3 text-white shadow-sm md:rounded-[20px] md:p-4 ${focused ? 'border-blue-400 ring-4 ring-blue-100 shadow-[0_18px_46px_rgba(37,99,235,0.18)]' : 'border-white/10'}`}
    >
      <div className={`absolute inset-y-0 left-0 w-1.5 ${meta.bar}`} />
      <div className="min-w-0 pl-1.5">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="line-clamp-1 text-sm font-black text-white md:text-base">{nomePessoa}</div>
            <div className="mt-0.5 line-clamp-1 text-xs font-bold text-slate-300 md:text-sm">{titulo}</div>
          </div>
          <StatusPill status={status} />
        </div>

        <div className="mt-2 flex min-w-0 items-center justify-between gap-2 text-xs font-bold text-slate-400">
          <div className="flex min-w-0 items-center gap-1.5">
            <Icon name="calendar" className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
            <span className="truncate tabular-nums">{formatDataCurta(item)} • {formatHora(item)}</span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${expanded ? 'Ocultar detalhes' : 'Ver detalhes'} de ${nomePessoa}: ${titulo}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-black text-cyan-300 transition hover:bg-white/[0.06] active:scale-[0.98]"
          >
            {expanded ? 'Ocultar' : 'Ver detalhes'}
            <Icon name="chevron" className={`h-3.5 w-3.5 transition ${expanded ? '-rotate-90' : 'rotate-90'}`} />
          </button>
        </div>

        {descricao && !expanded ? (
          <p className="line-clamp-1 text-xs font-semibold leading-relaxed text-slate-400 min-[390px]:line-clamp-2">{descricao}</p>
        ) : null}

        {expanded ? (
          <div id={detailsId} className="mt-2 rounded-xl border border-white/10 bg-white/[0.045] p-2.5 text-xs text-slate-300">
            {descricao ? <p className="whitespace-pre-wrap break-words leading-relaxed">{descricao}</p> : null}
            <dl className={`grid grid-cols-2 gap-x-3 gap-y-2 ${descricao ? 'mt-2 border-t border-white/10 pt-2' : ''}`}>
              <div className="min-w-0">
                <dt className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Duração</dt>
                <dd className="mt-0.5 truncate font-bold text-white">{duracao || 'A combinar'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Valor</dt>
                <dd className="mt-0.5 truncate font-bold text-white">{valor}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Serviço</dt>
                <dd className="mt-0.5 break-words font-bold text-white">{categoria}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Local</dt>
                <dd className="mt-0.5 break-words font-bold text-white">{endereco}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="mt-2">
          {souProf && status === 'pendente' ? (
            <div className="grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                disabled={anySaving}
                onClick={() => onResponder(item.id, 'recusado')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-3 text-sm font-black text-slate-200 transition active:scale-[0.98] disabled:opacity-50"
              >
                <Icon name="x" className="h-4 w-4" />
                {isRejecting ? 'Recusando...' : 'Recusar'}
              </button>
              <button
                type="button"
                disabled={anySaving}
                onClick={() => onResponder(item.id, 'aceito')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-black text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)] transition active:scale-[0.98] disabled:opacity-50"
              >
                <Icon name="check" className="h-4 w-4" />
                {isAccepting ? 'Aceitando...' : 'Aceitar'}
              </button>
            </div>
          ) : canOpenAttendance ? (
            <button
              type="button"
              onClick={() => onAbrirChat?.({ ...item, id: conversationId })}
              onPointerEnter={() => onPreloadChat?.({ ...item, id: conversationId })}
              onPointerDown={() => onPreloadChat?.({ ...item, id: conversationId })}
              onFocus={() => onPreloadChat?.({ ...item, id: conversationId })}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)] transition active:scale-[0.98]"
            >
              <Icon name="chat" className="h-4 w-4" />
              Abrir atendimento
            </button>
          ) : null}
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {isAccepting ? 'Aceitando agendamento' : isRejecting ? 'Recusando agendamento' : ''}
      </span>
    </article>
  )
}

export default function AgendaProfissional({
  uid,
  compacto = false,
  nome = '',
  fotoURL = '',
  privateRequests = [],
  privateRequestsLoading = false,
  privateRequestsError = '',
  focusRequestId = '',
  notificacoesCount = 0,
  onAbrirPerfil,
  onAbrirNotificacoes,
  onAbrirChat,
  onPreloadChat,
  onToast,
  showHeader = false,
  reserveFloatingControls = false,
} = {}) {
  const [agendamentos, setAgendamentos] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState('pendentes')
  const [hiddenPrivateRequestIds, setHiddenPrivateRequestIds] = useState(() => new Set())
  const lastFocusedRequestRef = useRef('')
  const currentUidRef = useRef('')
  const actionSequenceRef = useRef(0)
  const authoritativeActionLockRef = useRef('')
  const openAttendanceLockRef = useRef('')
  currentUidRef.current = String(uid || '')

  useEffect(() => () => {
    currentUidRef.current = ''
    actionSequenceRef.current += 1
    authoritativeActionLockRef.current = ''
    openAttendanceLockRef.current = ''
  }, [])

  useEffect(() => {
    const effectUid = String(uid || '')
    let active = true
    const isCurrentSession = () => active
      && currentUidRef.current === effectUid
      && auth.currentUser?.uid === effectUid
    actionSequenceRef.current += 1
    authoritativeActionLockRef.current = ''
    openAttendanceLockRef.current = ''
    setAgendamentos([])
    setHiddenPrivateRequestIds(new Set())
    setPendingAction(null)
    setErro('')

    if (!effectUid) {
      setLoading(false)
      return undefined
    }

    setLoading(true)
    const off = subscribeParticipantAgendamentos({
      database,
      uid: effectUid,
      onChange: (items) => {
        if (!isCurrentSession()) return
        const lista = [...items].sort((a, b) => getAgendaMs(a) - getAgendaMs(b))
        setAgendamentos(lista)
        setLoading(false)
      },
      onError: () => {
        if (!isCurrentSession()) return
        setAgendamentos([])
        setLoading(false)
      },
    })

    return () => {
      active = false
      off()
    }
  }, [uid])

  const agendaItems = useMemo(() => {
    const byId = new Map()
    agendamentos.forEach((item) => {
      const privateRequestId = String(item?.privateRequestId || '').trim()
      const id = privateRequestId || item?.id
      if (!id) return
      byId.set(id, {
        ...item,
        id,
        ...(privateRequestId ? { privateRequestId } : {}),
      })
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
        status,
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
    const confirmados = agendaItems.filter((item) => statusAgendados.has(String(item.status || '').toLowerCase()))
    const hojeLista = agendaItems.filter((item) => dateKey(getAgendaMs(item)) === hoje)
    const historico = agendaItems.filter((item) => statusHistorico.has(String(item.status || '').toLowerCase()))
    const valorPrevisto = agendaItems
      .filter((item) => !['recusado', 'cancelado'].includes(String(item.status || 'pendente').toLowerCase()))
      .reduce((acc, item) => acc + moneyNumber(item.valor || item.preco || item.faixaPreco), 0)

    return {
      hoje: hojeLista.length,
      pendentes: pendentes.length,
      confirmados: confirmados.length,
      historico: historico.length,
      valorPrevisto,
    }
  }, [agendaItems])

  const listaFiltrada = useMemo(() => {
    return agendaItems.filter((item) => agendaFilterForStatus(item?.status) === filtro)
  }, [agendaItems, filtro])

  const listaRender = listaFiltrada
  const listaTitulo = filtro === 'pendentes'
    ? 'Solicitações pendentes'
    : filtro === 'agendados'
      ? 'Próximos atendimentos'
      : 'Histórico'

  useEffect(() => {
    const targetId = String(focusRequestId || '').trim()
    if (!targetId) {
      lastFocusedRequestRef.current = ''
      return undefined
    }
    if (loading) return undefined
    const targetExists = agendaItems.some((item) => String(item?.id || item?.privateRequestId || '') === targetId)
    if (!targetExists) return undefined

    const target = agendaItems.find((item) => String(item?.id || item?.privateRequestId || '') === targetId)
    const targetFilter = agendaFilterForStatus(target?.status)
    if (filtro !== targetFilter) {
      setFiltro(targetFilter)
      return undefined
    }

    if (lastFocusedRequestRef.current === targetId) return undefined
    const targetElement = document.getElementById(agendaDomId(targetId))
    if (!targetElement) return undefined
    lastFocusedRequestRef.current = targetId
    const frame = window.requestAnimationFrame(() => {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [agendaItems, filtro, focusRequestId, loading])

  const abrirAtendimento = (item) => {
    const conversationId = String(item?.id || item?.pedidoId || item?.privateRequestId || '').trim()
    if (!conversationId || openAttendanceLockRef.current || typeof onAbrirChat !== 'function') return false
    openAttendanceLockRef.current = conversationId
    const navigationStarted = onAbrirChat({ ...item, id: conversationId })
    if (navigationStarted === false) {
      openAttendanceLockRef.current = ''
      return false
    }
    window.setTimeout(() => {
      if (openAttendanceLockRef.current === conversationId) openAttendanceLockRef.current = ''
    }, 1200)
    return true
  }

  const responder = async (id, status) => {
    const actionUid = String(uid || '')
    const actionKey = `${String(id || '')}:${String(status || '')}`
    if (!id || pendingAction || authoritativeActionLockRef.current || !actionUid || auth.currentUser?.uid !== actionUid) return
    authoritativeActionLockRef.current = actionKey
    const actionToken = ++actionSequenceRef.current
    const isActionCurrent = () => (
      currentUidRef.current === actionUid
      && actionSequenceRef.current === actionToken
      && auth.currentUser?.uid === actionUid
    )
    let navigatingToChat = false
    setPendingAction({ id, status })
    if (erro) setErro('')
    try {
      const item = agendaItems.find((entry) => String(entry?.id || entry?.privateRequestId || '') === String(id))
      if (item?.privateRequest || item?.privateRequestId) {
        const result = await respondPrivateRequest({
          database,
          request: item,
          profissional: { uid, nome, fotoURL },
          status,
        })
        if (!isActionCurrent()) return
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
          const requestId = String(item?.id || item?.privateRequestId || id)
          if (result?.conversationReady !== true || String(result?.conversationId || '') !== requestId) {
            throw new Error('A solicitação foi aceita, mas a conversa ainda não ficou disponível.')
          }
          const destino = { ...item, ...result, id: result.conversationId }
          navigatingToChat = abrirAtendimento(destino)
        }
        return
      }

      await respondLegacyAgendamento({ database, agendamento: item, actorUid: uid, status })
      if (!isActionCurrent()) return
      if (status === 'aceito') {
        const conversationId = String(item?.pedidoId || '').trim()
        const destino = { ...item, id: conversationId }
        if (conversationId) navigatingToChat = abrirAtendimento(destino)
      }
    } catch (error) {
      if (!isActionCurrent()) return
      const message = error?.message || 'Nao foi possivel responder esse agendamento agora.'
      console.error('[AGENDA] erro ao responder agendamento:', error)
      setErro(message)
      if (typeof onToast === 'function') {
        onToast({ type: 'error', title: 'Agenda', message })
      }
    } finally {
      if (!navigatingToChat && authoritativeActionLockRef.current === actionKey) authoritativeActionLockRef.current = ''
      if (isActionCurrent() && !navigatingToChat) setPendingAction(null)
    }
  }

  return (
    <section
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
          <h2 className="text-xl font-black tracking-tight text-blue-950 md:text-3xl">Minha agenda</h2>
          <p className="text-[11px] font-semibold leading-snug text-slate-500 md:mt-1 md:text-sm">Solicitações, atendimentos e histórico.</p>
        </div>

        {erro ? (
          <div role="alert" className="mt-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 md:mt-4 md:rounded-2xl md:px-4 md:py-3 md:text-sm">
            {erro}
          </div>
        ) : null}

        {privateRequestsError ? (
          <div role="alert" className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 md:mt-4 md:rounded-2xl md:px-4 md:py-3 md:text-sm">
            {privateRequestsError}
          </div>
        ) : null}

        <div className="mt-5 hidden shrink-0 grid-cols-2 gap-3 md:grid lg:grid-cols-4">
          <SummaryCard icon="calendar" label="Hoje" value={resumo.hoje} suffix={resumo.hoje === 1 ? 'serviço' : 'serviços'} />
          <SummaryCard icon="clock" label="Pendentes" value={resumo.pendentes} suffix={resumo.pendentes === 1 ? 'serviço' : 'serviços'} tone="blue" />
          <SummaryCard icon="check" label="Confirmados" value={resumo.confirmados} suffix={resumo.confirmados === 1 ? 'serviço' : 'serviços'} tone="emerald" />
          <SummaryCard icon="money" label="Valor previsto" value={formatMoney(resumo.valorPrevisto, 'R$ 0,00')} />
        </div>

        <div className="mt-2 grid h-12 shrink-0 grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 md:mt-5 md:rounded-2xl">
          {filtros.map((item) => {
            const active = filtro === item.id
            const count = item.id === 'pendentes'
              ? resumo.pendentes
              : item.id === 'agendados'
                ? resumo.confirmados
                : resumo.historico
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFiltro(item.id)}
                aria-pressed={active}
                className={[
                  'inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-black transition active:scale-[0.98] min-[390px]:text-[11px] md:rounded-xl md:px-3 md:text-xs',
                  active ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-blue-700',
                ].join(' ')}
              >
                <span className="truncate">{item.label}</span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] ${active ? 'bg-white/15 text-white' : 'bg-white text-slate-500'}`}>{count}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-2 flex min-h-0 flex-1 flex-col md:mt-3 md:block">
          <div className="flex shrink-0 items-center justify-between gap-3 px-1 pb-1.5 md:pb-2">
            <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700 md:text-xs">{listaTitulo}</h3>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">{listaFiltrada.length}</span>
          </div>

          <div
            className={[
              'min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-gutter:stable] md:overflow-visible md:pr-0',
              reserveFloatingControls ? 'pb-[calc(9.25rem+env(safe-area-inset-bottom))] md:pb-0' : 'pb-1 md:pb-0',
            ].join(' ')}
          >
            {(loading && listaRender.length === 0) || (privateRequestsLoading && listaRender.length === 0) ? (
              <ListPanelSkeleton
                label="Carregando agenda"
                rows={3}
                showHeader={false}
                className="border-0 shadow-none"
              />
            ) : listaRender.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center md:py-10">
                <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-blue-700 md:h-12 md:w-12">
                  <Icon name="calendar" className="h-5 w-5 md:h-6 md:w-6" />
                </div>
                <div className="mt-2 text-sm font-black text-blue-950 md:mt-3 md:text-base">Nenhum item nesta seção.</div>
                <p className="mt-0.5 text-xs font-semibold text-slate-500 md:mt-1 md:text-sm">As atualizações aparecem aqui em tempo real.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {listaRender.map((item) => (
                  <AgendaItem
                    key={`${uid}:${item.id}`}
                    item={item}
                    uid={uid}
                    pendingAction={pendingAction}
                    onResponder={responder}
                    onAbrirChat={abrirAtendimento}
                    onPreloadChat={onPreloadChat}
                    focused={String(item?.id || item?.privateRequestId || '') === String(focusRequestId || '')}
                  />
                ))}
              </div>
            )}

            <div className="mt-3 hidden rounded-[14px] border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-700 md:block">
              <span className="font-black">Dica:</span> Mantenha sua agenda atualizada para não perder oportunidades de serviço.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
