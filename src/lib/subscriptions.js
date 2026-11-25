export const CLIENT_ANNUAL_PRODUCT_ID = 'CLIENT_ANNUAL'
export const PROFESSIONAL_ANNUAL_PRODUCT_ID = 'PROFESSIONAL_ANNUAL'
export const CLIENT_QUARTERLY_PRODUCT_ID = 'CLIENT_QUARTERLY'
export const PROFESSIONAL_QUARTERLY_PRODUCT_ID = 'PROFESSIONAL_QUARTERLY'

export const CLIENT_ANNUAL_PRICE_CENTS = 1990
export const PROFESSIONAL_ANNUAL_PRICE_CENTS = 4990
export const CLIENT_QUARTERLY_PRICE_CENTS = 1990
export const PROFESSIONAL_QUARTERLY_PRICE_CENTS = 5000
export const PROFESSIONAL_TRIAL_DAYS = 90
export const PROFESSIONAL_TRIAL_MS = PROFESSIONAL_TRIAL_DAYS * 24 * 60 * 60 * 1000
export const ANNUAL_PLAN_MONTHS = 12
export const QUARTERLY_PLAN_MONTHS = 3
export const PENDING_SUBSCRIPTION_CHECKOUT_MAX_AGE_MS = 24 * 60 * 60 * 1000

export const RECURRING_SUBSCRIPTION_PRODUCT_IDS = Object.freeze([
  CLIENT_QUARTERLY_PRODUCT_ID,
  PROFESSIONAL_QUARTERLY_PRODUCT_ID,
])

export const LEGACY_SUBSCRIPTION_PRODUCT_IDS = Object.freeze([
  CLIENT_ANNUAL_PRODUCT_ID,
  PROFESSIONAL_ANNUAL_PRODUCT_ID,
])

export function subscriptionKindForProduct(productId) {
  const normalized = String(productId || '').trim()
  if ([PROFESSIONAL_ANNUAL_PRODUCT_ID, PROFESSIONAL_QUARTERLY_PRODUCT_ID].includes(normalized)) return 'professional'
  if ([CLIENT_ANNUAL_PRODUCT_ID, CLIENT_QUARTERLY_PRODUCT_ID].includes(normalized)) return 'client'
  return ''
}

export function isRecurringSubscriptionProduct(productId) {
  return RECURRING_SUBSCRIPTION_PRODUCT_IDS.includes(String(productId || '').trim())
}

const NORMAL_CLIENT_ORDER_MODES = new Set([
  'geral',
  'corre',
  'profissional',
  'publico',
  'public',
  'descoberta',
  'discovery',
])

const DIRECT_REQUEST_SEMANTIC_VALUES = new Set([
  'direto',
  'direct',
  'privado',
  'private',
  'pedido_direto',
  'agendamento',
])

const DIRECT_REQUEST_ONLY_FIELDS = [
  'agendamento',
  'aceitadorId',
  'aceite',
  'cliente',
  'clienteId',
  'destinatarioUid',
  'privateRequestId',
  'profissional',
  'profissionalId',
  'profissionalUid',
  'servico',
  'targetId',
]

export const TERMINAL_ORDER_STATUSES = new Set([
  'finalizado',
  'concluido',
  'avaliado',
  'cancelado',
])

export function subscriptionTimestamp(value) {
  if (!value) return 0
  if (typeof value === 'object' && Number.isFinite(Number(value.seconds))) {
    return Number(value.seconds) * 1000
  }
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function addCalendarMonths(timestamp, months) {
  const source = new Date(Number(timestamp) || Date.now())
  const day = source.getUTCDate()
  const result = new Date(source.getTime())
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + Number(months || 0))
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result.getTime()
}

export function isSubscriptionSessionCurrent(expectedUid, currentUid) {
  return typeof expectedUid === 'string'
    && expectedUid.length > 0
    && expectedUid === currentUid
}

export function canReusePendingSubscriptionCheckout(value, expectedUid, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (!isSubscriptionSessionCurrent(value.uid, expectedUid)) return false
  if (![...LEGACY_SUBSCRIPTION_PRODUCT_IDS, ...RECURRING_SUBSCRIPTION_PRODUCT_IDS].includes(value.productId)) return false
  if (typeof value.attemptId !== 'string' || !value.attemptId.trim()) return false
  const createdAt = Number(value.createdAt)
  if (!Number.isFinite(createdAt) || createdAt <= 0 || createdAt > now) return false
  return now - createdAt <= PENDING_SUBSCRIPTION_CHECKOUT_MAX_AGE_MS
}

export function formatSubscriptionPrice(amountInCents) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(amountInCents || 0) / 100)
}

export function getClientSubscriptionStatus(user = {}, now = Date.now()) {
  const plan = user?.subscriptions?.client || {}
  const configuredPlan = String(plan.plan || '').trim().toLowerCase()
  const expiresAt = subscriptionTimestamp(plan.expiresAt)
  const storedStatus = String(plan.status || '').trim().toLowerCase()
  const active = ['active', 'canceled'].includes(storedStatus)
    && ['annual', 'quarterly'].includes(configuredPlan)
    && expiresAt > now
  const renewalStatus = String(plan.renewalStatus || '').trim().toLowerCase()
  const providerStatus = String(plan.providerStatus || '').trim().toLowerCase()
  const autoRenew = [configuredPlan, String(plan.pendingPlan || '').toLowerCase()].includes('quarterly')
    && plan.autoRenew === true
    && !['canceled', 'cancelled', 'paused'].includes(providerStatus)
  const inactiveLifecycleStatus = new Set([
    'pending_authorization',
    'pending_payment',
    'payment_failed',
    'canceled',
    'refunded',
    'chargeback',
  ])
  const status = active
    ? 'active'
    : renewalStatus === 'payment_failed'
      ? 'payment_failed'
      : inactiveLifecycleStatus.has(storedStatus)
      ? storedStatus
      : expiresAt
        ? 'expired'
        : 'free'
  return {
    kind: 'client',
    plan: configuredPlan || 'quarterly',
    status,
    active,
    startedAt: subscriptionTimestamp(plan.startedAt) || null,
    expiresAt: expiresAt || null,
    nextPaymentDate: subscriptionTimestamp(plan.nextPaymentDate) || null,
    autoRenew,
    renewalStatus: renewalStatus || (autoRenew ? 'enabled' : 'disabled'),
    paymentFailed: renewalStatus === 'payment_failed',
    freeOrderUsed: user?.clientFreeOrderUsed === true,
  }
}

export function getProfessionalSubscriptionStatus(user = {}, now = Date.now()) {
  const plan = user?.subscriptions?.professional || {}
  const expiresAt = subscriptionTimestamp(plan.expiresAt)
  const trialStartedAt = subscriptionTimestamp(plan.trialStartedAt)
  const trialEndsAt = subscriptionTimestamp(plan.trialEndsAt)
  const storedStatus = String(plan.status || '').trim().toLowerCase()
  const active = ['active', 'canceled'].includes(storedStatus) && expiresAt > now
  const trialActive = !active && trialStartedAt > 0 && trialEndsAt > now
  const configuredPlan = String(plan.plan || '').trim().toLowerCase()
  const renewalStatus = String(plan.renewalStatus || '').trim().toLowerCase()
  const providerLifecycleStatus = new Set([
    'pending_authorization',
    'pending_payment',
    'payment_failed',
    'canceled',
    'refunded',
    'chargeback',
  ])
  const status = active
    ? 'active'
    : trialActive
      ? 'trial'
      : renewalStatus === 'payment_failed'
        ? 'payment_failed'
        : providerLifecycleStatus.has(storedStatus)
          ? storedStatus
          : trialStartedAt || trialEndsAt || expiresAt
            ? 'expired'
            : 'not_started'
  const daysRemaining = trialActive
    ? Math.max(1, Math.ceil((trialEndsAt - now) / (24 * 60 * 60 * 1000)))
    : 0

  const providerStatus = String(plan.providerStatus || '').trim().toLowerCase()
  const autoRenew = [configuredPlan, String(plan.pendingPlan || '').toLowerCase()].includes('quarterly')
    && plan.autoRenew === true
    && !['canceled', 'cancelled', 'paused'].includes(providerStatus)

  return {
    kind: 'professional',
    plan: configuredPlan || 'quarterly',
    status,
    active,
    trialActive,
    canUseProfessionalFeatures: active || trialActive,
    trialStartedAt: trialStartedAt || null,
    trialEndsAt: trialEndsAt || null,
    startedAt: subscriptionTimestamp(plan.startedAt) || null,
    expiresAt: expiresAt || null,
    nextPaymentDate: subscriptionTimestamp(plan.nextPaymentDate) || null,
    autoRenew,
    renewalStatus: renewalStatus || (autoRenew ? 'enabled' : 'disabled'),
    paymentFailed: renewalStatus === 'payment_failed',
    daysRemaining,
  }
}

export function canCreateClientOrder(user = {}, options = {}) {
  const subscription = getClientSubscriptionStatus(user, options.now)
  if (subscription.active) return { allowed: true, reason: 'active_subscription', subscription }
  const hasExistingOrder = options.hasExistingOrder === true
  if (!subscription.freeOrderUsed && !hasExistingOrder) {
    return { allowed: true, reason: 'first_free_order', subscription }
  }
  return {
    allowed: false,
    reason: options.hasOpenOrder ? 'free_order_in_progress' : 'client_subscription_required',
    subscription,
  }
}

export function canCreateClientDirectRequest(user = {}, options = {}) {
  const subscription = getClientSubscriptionStatus(user, options.now)
  const allowed = subscription.active && ['annual', 'quarterly'].includes(subscription.plan)
  return {
    allowed,
    reason: allowed ? 'active_client_subscription' : 'client_direct_subscription_required',
    subscription,
  }
}

export function validateNormalClientOrderRequest(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { allowed: false, reason: 'invalid_normal_order' }
  }
  const input = body.order
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { allowed: false, reason: 'invalid_normal_order' }
  }

  const type = String(input.tipo || 'pedido').trim().toLowerCase()
  const mode = String(input.modoPedido || 'geral').trim().toLowerCase()
  if (DIRECT_REQUEST_SEMANTIC_VALUES.has(type) || DIRECT_REQUEST_SEMANTIC_VALUES.has(mode)) {
    return { allowed: false, reason: 'direct_request_requires_client_subscription' }
  }
  if (!NORMAL_CLIENT_ORDER_MODES.has(mode)) {
    return { allowed: false, reason: 'invalid_normal_order_mode' }
  }

  const hasDirectRequestField = DIRECT_REQUEST_ONLY_FIELDS.some((field) => (
    Object.prototype.hasOwnProperty.call(body, field)
    || Object.prototype.hasOwnProperty.call(input, field)
  ))
  if (
    hasDirectRequestField
    || body.privateRequest === true
    || input.privateRequest === true
    || body.privado === true
    || input.privado === true
    || body.publico === false
    || input.publico === false
  ) {
    return { allowed: false, reason: 'direct_request_requires_client_subscription' }
  }

  return { allowed: true, reason: 'normal_client_order' }
}

export function canUseProfessionalFeatures(user = {}, now = Date.now()) {
  return getProfessionalSubscriptionStatus(user, now).canUseProfessionalFeatures
}

export function isTerminalOrderStatus(status) {
  return TERMINAL_ORDER_STATUSES.has(String(status || '').trim().toLowerCase())
}
