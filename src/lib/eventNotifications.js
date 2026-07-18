export const EVENT_NOTIFICATION_TYPES = Object.freeze({
  AGENDAMENTO_SOLICITADO: 'AGENDAMENTO_SOLICITADO',
  AGENDAMENTO_ACEITO: 'AGENDAMENTO_ACEITO',
  PEDIDO_ACEITO: 'PEDIDO_ACEITO',
})

const ESSENTIAL_TYPES = new Set(Object.values(EVENT_NOTIFICATION_TYPES))

function clean(value) {
  return String(value ?? '').trim()
}

function safeSegment(value) {
  return clean(value).replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function createEventNotificationId({ type, sourceId, toUid, state = 'novo' } = {}) {
  return [
    'event',
    safeSegment(type).toLowerCase(),
    safeSegment(sourceId),
    safeSegment(toUid),
    safeSegment(state).toLowerCase(),
  ]
    .filter(Boolean)
    .join('_')
}

export function isEssentialEventNotification(notification = {}) {
  return ESSENTIAL_TYPES.has(clean(notification.tipoEvento).toUpperCase())
}

export function getEventSourceId(notification = {}) {
  return clean(
    notification.solicitacaoId ||
      notification.agendamentoId ||
      notification.pedidoId ||
      notification.privateRequestId ||
      notification.conversaId ||
      notification.action?.id,
  )
}

export function getEventPrimaryHref(notification = {}) {
  const type = clean(notification.tipoEvento).toUpperCase()
  const id = encodeURIComponent(getEventSourceId(notification))
  if (!id) return '/'

  if (type === EVENT_NOTIFICATION_TYPES.AGENDAMENTO_SOLICITADO) {
    return `/corre/agenda?requestId=${id}`
  }

  return `/chat/${id}?voltar=cliente`
}

export function getEventSecondaryHref(notification = {}) {
  const type = clean(notification.tipoEvento).toUpperCase()
  const id = encodeURIComponent(getEventSourceId(notification))
  if (!id) return '/'

  if (type === EVENT_NOTIFICATION_TYPES.AGENDAMENTO_SOLICITADO) {
    return `/corre/agenda?requestId=${id}`
  }

  if (notification.privateRequest || notification.privateRequestId) {
    return `/chat/${id}?voltar=cliente&detalhes=1`
  }

  return `/pedido/${id}?voltar=cliente`
}

export function formatEventSchedule(data, hora) {
  const dateText = clean(data)
  const timeText = clean(hora)
  if (!dateText) return timeText ? `às ${timeText}` : ''

  const date = new Date(`${dateText}T12:00:00`)
  if (Number.isNaN(date.getTime())) return [dateText, timeText].filter(Boolean).join(' às ')

  const formatted = date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
  return timeText ? `${formatted}, às ${timeText}` : formatted
}

