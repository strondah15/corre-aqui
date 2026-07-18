'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { get, limitToLast, onValue, query, ref, update } from '@/lib/firebaseDebug'
import { auth, database } from '@/lib/firebase'
import {
  EVENT_NOTIFICATION_TYPES,
  formatEventSchedule,
  getEventPrimaryHref,
  getEventSecondaryHref,
  getEventSourceId,
  isEssentialEventNotification,
} from '@/lib/eventNotifications'

function text(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
}

function safeAvatar(value) {
  const url = text(value)
  return /^(https?:\/\/|data:image\/|blob:)/i.test(url) ? url : ''
}

function initials(name) {
  return text(name, 'CA')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function getTimestamp(notification = {}) {
  return Number(notification.criadoEm || notification.createdAt || notification.aceitoEm || 0)
}

function formatEventTime(value) {
  const ms = Number(value || 0)
  if (!ms) return 'Agora'
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return 'Agora'

  const today = new Date()
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === today.toDateString()) return `Hoje, ${time}`
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${time}`
}

function EventIcon({ schedule }) {
  return schedule ? (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m9 15 2 2 4-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EventAvatar({ name, url }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [url])

  return (
    <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-100 text-sm font-black text-blue-800 ring-2 ring-white shadow-md dark:ring-slate-900 sm:h-14 sm:w-14">
      <span>{initials(name)}</span>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : null}
      <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
    </div>
  )
}

function mergeNotificationRoots(modern = {}, legacy = {}) {
  const merged = new Map()

  const collect = (rootName, values) => {
    Object.entries(values || {}).forEach(([firebaseId, value]) => {
      if (!value || typeof value !== 'object' || !isEssentialEventNotification(value)) return
      const id = text(value.eventId, value.id, firebaseId)
      if (!id) return
      const previous = merged.get(id) || { _paths: [] }
      const read = previous.lida === true || previous.read === true || value.lida === true || value.read === true
      merged.set(id, {
        ...previous,
        ...value,
        id,
        eventId: text(value.eventId, id),
        lida: read,
        read,
        _paths: Array.from(new Set([...(previous._paths || []), `${rootName}/${firebaseId}`])),
      })
    })
  }

  collect('notificacoes', legacy)
  collect('notifications', modern)
  return Array.from(merged.values())
}

function buildCardData(notification = {}, source = {}) {
  const type = text(notification.tipoEvento).toUpperCase()
  const scheduleRequest = type === EVENT_NOTIFICATION_TYPES.AGENDAMENTO_SOLICITADO
  const scheduleAccepted = type === EVENT_NOTIFICATION_TYPES.AGENDAMENTO_ACEITO
  const accepted = !scheduleRequest

  const actorName = scheduleRequest
    ? text(notification.atorNome, notification.clienteNome, source.clienteNome, notification.autor?.nome, 'Cliente')
    : text(notification.atorNome, notification.profissionalNome, source.profissionalNome, source.aceite?.nome, notification.autor?.nome, 'Corre/Profissional')
  const actorAvatar = safeAvatar(
    scheduleRequest
      ? text(notification.atorFotoURL, notification.clienteFotoURL, source.clienteFotoURL)
      : text(notification.atorFotoURL, notification.profissionalFotoURL, source.profissionalFotoURL, source.aceite?.fotoURL),
  )
  const serviceTitle = text(
    notification.servicoTitulo,
    source.servicoTitulo,
    source.servicoSnapshot?.titulo,
    source.titulo,
    'Serviço solicitado',
  )
  const schedule = formatEventSchedule(
    text(notification.dataAgendamento, notification.data, source.data),
    text(notification.horaAgendamento, notification.hora, source.hora),
  )
  const location = text(
    notification.localResumo,
    source.regiao,
    source.servicoSnapshot?.regiao,
    source.local?.cidade,
    source.cidade,
  )
  const note = text(notification.observacao, notification.descricao, source.descricao)
  const role = text(notification.tipoAtuacao, notification.patenteNome)
  const rating = Number(notification.avaliacao || 0)

  return {
    scheduleRequest,
    accepted,
    actorName,
    actorAvatar,
    serviceTitle,
    schedule,
    location,
    note,
    role,
    rating: Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : '',
    title: scheduleRequest
      ? 'Nova solicitação de agendamento'
      : scheduleAccepted
        ? 'Agendamento confirmado'
        : 'Seu pedido foi aceito',
    headline: scheduleRequest
      ? `${actorName} solicitou um agendamento`
      : scheduleAccepted
        ? `${actorName} confirmou seu agendamento`
        : `${actorName} aceitou seu pedido`,
    status: scheduleRequest ? 'Aguardando confirmação' : scheduleAccepted ? 'Agendamento confirmado' : 'Pedido aceito',
    nextStep: accepted
      ? text(notification.proximoPasso, `Converse com ${actorName} para confirmar endereço, valor e detalhes do atendimento.`)
      : '',
    eventTime: formatEventTime(notification.aceitoEm || notification.criadoEm || notification.createdAt),
  }
}

export default function EventNotificationHost() {
  const router = useRouter()
  const [uid, setUid] = useState('')
  const [roots, setRoots] = useState({ modern: {}, legacy: {} })
  const [dismissed, setDismissed] = useState(() => new Set())
  const [source, setSource] = useState(null)

  useEffect(() => onAuthStateChanged(auth, (user) => setUid(user?.uid || '')), [])

  useEffect(() => {
    setRoots({ modern: {}, legacy: {} })
    setDismissed(new Set())
    if (!uid) return undefined

    const onError = (error) => console.error('[EVENT NOTIFICATION] falha ao ouvir notificações:', error)
    const modernRef = query(ref(database, `notifications/${uid}`), limitToLast(40))
    const legacyRef = query(ref(database, `notificacoes/${uid}`), limitToLast(40))
    const offModern = onValue(modernRef, (snapshot) => {
      setRoots((current) => ({ ...current, modern: snapshot.val() || {} }))
    }, onError)
    const offLegacy = onValue(legacyRef, (snapshot) => {
      setRoots((current) => ({ ...current, legacy: snapshot.val() || {} }))
    }, onError)

    return () => {
      offModern()
      offLegacy()
    }
  }, [uid])

  const notification = useMemo(() => {
    return mergeNotificationRoots(roots.modern, roots.legacy)
      .filter((item) => Boolean(getEventSourceId(item)))
      .filter((item) => !item.lida && !item.read && !dismissed.has(item.eventId || item.id))
      .filter((item) => {
        if (text(item.tipoEvento).toUpperCase() !== EVENT_NOTIFICATION_TYPES.AGENDAMENTO_SOLICITADO) return true
        return !item.eventoStatus || ['pendente', 'aguardando'].includes(text(item.eventoStatus).toLowerCase())
      })
      .sort((a, b) => getTimestamp(b) - getTimestamp(a))[0] || null
  }, [dismissed, roots.legacy, roots.modern])

  useEffect(() => {
    let active = true
    setSource(null)
    const sourceId = getEventSourceId(notification || {})
    if (!sourceId) return () => { active = false }

    void (async () => {
      try {
        const privateSnapshot = await get(ref(database, `privateRequests/${sourceId}`))
        if (privateSnapshot.exists()) {
          if (active) setSource({ id: sourceId, ...(privateSnapshot.val() || {}), privateRequest: true })
          return
        }

        const pedidoSnapshot = await get(ref(database, `pedidos/${sourceId}`))
        if (active && pedidoSnapshot.exists()) {
          setSource({ id: sourceId, ...(pedidoSnapshot.val() || {}) })
        }
      } catch (error) {
        console.warn('[EVENT NOTIFICATION] detalhes indisponíveis; usando payload persistido:', error)
      }
    })()

    return () => { active = false }
  }, [notification])

  const markAsRead = useCallback(async (item) => {
    if (!item) return
    const eventId = item.eventId || item.id
    setDismissed((current) => new Set([...current, eventId]))
    const vistoEm = Date.now()
    const results = await Promise.allSettled(
      (item._paths || []).map((path) => update(ref(database, path), { lida: true, read: true, vistoEm })),
    )
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error('[EVENT NOTIFICATION] falha ao marcar como lida:', item._paths?.[index], result.reason)
      }
    })
  }, [])

  useEffect(() => {
    if (!notification || !source) return
    if (text(notification.tipoEvento).toUpperCase() !== EVENT_NOTIFICATION_TYPES.AGENDAMENTO_SOLICITADO) return
    const status = text(source.status).toLowerCase()
    if (status && status !== 'pendente') void markAsRead(notification)
  }, [markAsRead, notification, source])

  const open = useCallback((href) => {
    if (!notification || !href) return
    void markAsRead(notification)
    router.replace(href)
  }, [markAsRead, notification, router])

  const card = notification ? buildCardData(notification, source || {}) : null
  const primaryHref = notification ? getEventPrimaryHref(notification) : ''
  const secondaryHref = notification ? getEventSecondaryHref(notification) : ''

  return (
    <AnimatePresence>
      {notification && card ? (
        <motion.aside
          key={notification.eventId || notification.id}
          initial={{ opacity: 0, y: -18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 260, damping: 25 }}
          className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[9997] mx-auto w-[calc(100vw-1.5rem)] max-w-[430px] sm:top-4 md:inset-x-auto md:right-6 md:mx-0 md:w-[420px]"
          aria-live="polite"
        >
          <div className="pointer-events-auto max-h-[calc(100dvh-env(safe-area-inset-top)-8rem)] overflow-y-auto rounded-[22px] border border-blue-100 bg-white/98 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,0.22)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/98 dark:text-white sm:rounded-[26px]">
            <div className={`h-1.5 w-full ${card.scheduleRequest ? 'bg-gradient-to-r from-amber-400 via-orange-400 to-blue-600' : 'bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-600'}`} />
            <div className="p-3.5 sm:p-4">
              <div className="flex items-start gap-3">
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-[15px] text-white shadow-lg ${card.scheduleRequest ? 'bg-amber-500 shadow-amber-500/20' : 'bg-emerald-500 shadow-emerald-500/20'}`}>
                  <EventIcon schedule={card.scheduleRequest} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-[10px] font-black uppercase tracking-[0.14em] ${card.scheduleRequest ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                    {card.title}
                  </div>
                  <h2 className="mt-0.5 text-[17px] font-black leading-tight sm:text-lg">{card.headline}</h2>
                  <div className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">{card.eventTime}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void markAsRead(notification)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  aria-label="Fechar aviso"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-[16px] border border-slate-200 bg-slate-50 p-2.5 dark:border-white/10 dark:bg-white/5">
                <EventAvatar name={card.actorName} url={card.actorAvatar} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black">{card.actorName}</div>
                  {card.role || card.rating ? (
                    <div className="mt-0.5 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {[card.role, card.rating ? `★ ${card.rating}` : ''].filter(Boolean).join(' · ')}
                    </div>
                  ) : (
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {card.scheduleRequest ? 'Cliente Corre Aqui' : 'Corre/Profissional'}
                    </div>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${card.scheduleRequest ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200'}`}>
                  {card.status}
                </span>
              </div>

              <div className="mt-3 rounded-[16px] border border-blue-100 bg-blue-50/70 p-3 dark:border-blue-400/15 dark:bg-blue-400/8">
                <div className="text-sm font-black text-blue-950 dark:text-blue-100">{card.serviceTitle}</div>
                <div className="mt-2 grid gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {card.schedule ? <div><span className="mr-2 text-blue-600">●</span>{card.schedule}</div> : null}
                  {card.location ? <div><span className="mr-2 text-emerald-600">●</span>{card.location}</div> : null}
                  {card.note ? <p className="line-clamp-2 border-t border-blue-100 pt-2 leading-relaxed dark:border-white/10">“{card.note}”</p> : null}
                </div>
              </div>

              {card.nextStep ? (
                <p className="mt-3 rounded-[14px] bg-emerald-50 px-3 py-2.5 text-[11px] font-bold leading-relaxed text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-100">
                  {card.nextStep}
                </p>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => open(primaryHref)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-blue-600 px-3 text-xs font-black text-white shadow-[0_12px_26px_rgba(37,99,235,0.24)] transition hover:bg-blue-500 active:scale-[0.98] sm:text-sm"
                >
                  {card.scheduleRequest ? 'Ver solicitação' : 'Conversar agora'}
                  <ArrowIcon />
                </button>
                <button
                  type="button"
                  onClick={() => card.scheduleRequest ? void markAsRead(notification) : open(secondaryHref)}
                  className="h-11 rounded-[14px] border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/5 dark:text-slate-100 sm:text-sm"
                >
                  {card.scheduleRequest ? 'Agora não' : 'Ver detalhes'}
                </button>
              </div>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}
