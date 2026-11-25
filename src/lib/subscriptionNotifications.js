import crypto from 'crypto'

const ENABLED_VALUE = 'true'
const SUPPORTED_TYPES = new Set([
  'trial_ending',
  'renewal_upcoming',
  'payment_approved',
  'payment_failed',
  'cancellation_confirmed',
  'subscription_expired',
])

function text(value, max = 160) {
  return String(value || '').trim().slice(0, max)
}

function timestamp(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function notificationCopy(type, kind) {
  const audience = kind === 'professional' ? 'Corre/Profissional' : 'Cliente'
  const copy = {
    trial_ending: ['Seu período gratuito está terminando', `Confira a assinatura trimestral ${audience}.`],
    renewal_upcoming: ['Renovação trimestral próxima', 'Confira a data da próxima cobrança na sua assinatura.'],
    payment_approved: ['Pagamento aprovado', `Sua assinatura ${audience} está ativa.`],
    payment_failed: ['Pagamento não aprovado', 'Confira sua forma de pagamento no Mercado Pago.'],
    cancellation_confirmed: ['Renovação cancelada', 'Não haverá nova cobrança; o acesso pago atual permanece até a validade informada.'],
    subscription_expired: ['Assinatura encerrada', 'Seu período de acesso pago terminou.'],
  }
  return copy[type]
}

export function subscriptionNotificationsEnabled(env = process.env) {
  return String(env?.SUBSCRIPTION_NOTIFICATIONS_ENABLED || '').trim().toLowerCase() === ENABLED_VALUE
}

export function buildSubscriptionNotification({
  uid,
  kind,
  type,
  reference,
  occurredAt = Date.now(),
  accessUntil = null,
  nextPaymentDate = null,
} = {}) {
  const safeUid = text(uid, 128)
  const safeKind = text(kind, 32).toLowerCase()
  const safeType = text(type, 64).toLowerCase()
  const safeReference = text(reference, 180)
  if (!safeUid || !['client', 'professional'].includes(safeKind)) throw new Error('invalid_subscription_notification_identity')
  if (!SUPPORTED_TYPES.has(safeType) || !safeReference) throw new Error('invalid_subscription_notification_event')
  const [title, body] = notificationCopy(safeType, safeKind)
  const id = `subscription_${crypto.createHash('sha256')
    .update(`${safeUid}|${safeKind}|${safeType}|${safeReference}`)
    .digest('hex')
    .slice(0, 40)}`
  const createdAt = timestamp(occurredAt) || Date.now()
  return {
    schemaVersion: 1,
    id,
    eventId: id,
    serverGenerated: true,
    delivery: 'in_app_only',
    fromUid: 'system',
    toUid: safeUid,
    tipo: safeType,
    tipoEvento: safeType.toUpperCase(),
    titulo: title,
    mensagem: body,
    lida: false,
    read: false,
    criadoEm: createdAt,
    createdAt,
    subscriptionKind: safeKind,
    accessUntil: timestamp(accessUntil),
    nextPaymentDate: timestamp(nextPaymentDate),
    action: { label: 'Ver assinatura', screen: 'notifications', id: safeKind },
    url: '/?subscription=1',
  }
}

function sameEvent(current, expected) {
  return Boolean(current)
    && current.schemaVersion === expected.schemaVersion
    && current.eventId === expected.eventId
    && current.toUid === expected.toUid
    && current.tipo === expected.tipo
    && current.subscriptionKind === expected.subscriptionKind
}

export async function materializeSubscriptionNotification({ database, env = process.env, ...input } = {}) {
  if (!subscriptionNotificationsEnabled(env)) return { ok: true, skipped: true, reason: 'subscription_notifications_disabled' }
  if (!database?.ref) throw new Error('subscription_notification_database_unavailable')
  const notification = buildSubscriptionNotification(input)
  const reservationRef = database.ref(`serverSubscriptionNotificationEvents/${notification.id}`)
  const reservation = await reservationRef.transaction((current) => {
    if (current) return sameEvent(current, notification) ? current : undefined
    return notification
  })
  const stored = reservation.snapshot.val()
  if (!reservation.committed || !sameEvent(stored, notification)) {
    throw new Error('subscription_notification_conflict')
  }
  if (stored.materializedAt) return { ok: true, idempotent: true, notificationId: notification.id }

  const paths = [
    `notifications/${notification.toUid}/${notification.id}`,
    `notificacoes/${notification.toUid}/${notification.id}`,
  ]
  const snapshots = await Promise.all(paths.map((path) => database.ref(path).get()))
  for (const snapshot of snapshots) {
    const current = snapshot.val()
    if (current && !sameEvent(current, notification)) throw new Error('subscription_notification_materialization_conflict')
  }
  await database.ref().update(Object.fromEntries(paths.map((path) => [path, notification])))
  await reservationRef.update({ materializedAt: Date.now() })
  return { ok: true, stored: true, notificationId: notification.id }
}
