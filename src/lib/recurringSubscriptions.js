import {
  QUARTERLY_PLAN_MONTHS,
  isRecurringSubscriptionProduct,
  subscriptionKindForProduct,
  subscriptionTimestamp,
} from './subscriptions.js'

export const RECURRING_PROVIDER = 'mercado_pago_preapproval'
export const RECURRING_FREQUENCY = 3
export const RECURRING_FREQUENCY_TYPE = 'months'
export const RECURRING_CURRENCY = 'BRL'
export const SUBSCRIPTION_CHECKOUT_LEASE_MS = 2 * 60 * 1000

const CANCELED_PROVIDER_STATUSES = new Set(['cancelled', 'canceled', 'paused'])
const PAYMENT_FAILURE_STATUSES = new Set(['rejected', 'cancelled', 'canceled'])

function text(value) {
  return String(value || '').trim()
}

export function isValidPayerEmail(value) {
  const email = text(value).toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function recurringSubscriptionKind(productId) {
  return subscriptionKindForProduct(productId)
}

export function recurringCheckoutAmountInCents(attempt, productId) {
  const amount = attempt?.amountInCents
  return isRecurringSubscriptionProduct(productId)
    && attempt?.productId === productId
    && attempt?.currency === RECURRING_CURRENCY
    && Number.isSafeInteger(amount)
    && amount > 0
    ? amount
    : null
}

export function buildRecurringPreapprovalPayload({
  product,
  attempt,
  payerEmail,
  siteOrigin,
  firstChargeAt = 0,
  now = Date.now(),
}) {
  if (!product || product.billingMode !== 'quarterly_recurring') throw new Error('invalid_recurring_product')
  if (!attempt?.externalReference) throw new Error('missing_external_reference')
  const amountInCents = recurringCheckoutAmountInCents(attempt, product.id)
  if (amountInCents === null || amountInCents !== product.amountInCents) throw new Error('recurring_checkout_price_mismatch')
  if (!isValidPayerEmail(payerEmail)) throw new Error('verified_email_required')
  const origin = new URL(siteOrigin).origin
  const startDate = Number(firstChargeAt) > Number(now) + 60_000
    ? new Date(Number(firstChargeAt)).toISOString()
    : undefined

  return {
    reason: product.name,
    external_reference: attempt.externalReference,
    payer_email: text(payerEmail).toLowerCase(),
    auto_recurring: {
      frequency: RECURRING_FREQUENCY,
      frequency_type: RECURRING_FREQUENCY_TYPE,
      ...(startDate ? { start_date: startDate } : {}),
      transaction_amount: amountInCents / 100,
      currency_id: RECURRING_CURRENCY,
    },
    back_url: `${origin}/?checkout=success`,
    status: 'pending',
  }
}

export function validateRecurringPreapproval({ subscription, attempt, product }) {
  const autoRecurring = subscription?.auto_recurring || {}
  const providerAmount = Number(autoRecurring.transaction_amount)
  const amountInCents = Math.round(providerAmount * 100)
  const expectedAmountInCents = recurringCheckoutAmountInCents(attempt, product?.id)
  const errors = []
  if (!text(subscription?.id)) errors.push('subscription_id_missing')
  if (text(subscription?.external_reference) !== text(attempt?.externalReference)) errors.push('external_reference_mismatch')
  if (Number(autoRecurring.frequency) !== RECURRING_FREQUENCY) errors.push('frequency_mismatch')
  if (text(autoRecurring.frequency_type) !== RECURRING_FREQUENCY_TYPE) errors.push('frequency_type_mismatch')
  if (text(autoRecurring.currency_id) !== RECURRING_CURRENCY) errors.push('currency_mismatch')
  if (expectedAmountInCents === null || providerAmount !== expectedAmountInCents / 100) errors.push('amount_mismatch')
  return { valid: errors.length === 0, errors, amountInCents }
}

export function isCanceledProviderStatus(status) {
  return CANCELED_PROVIDER_STATUSES.has(text(status).toLowerCase())
}

export function providerRenewalStatus(status) {
  const normalized = text(status).toLowerCase()
  if (normalized === 'authorized') return 'enabled'
  if (normalized === 'pending') return 'awaiting_authorization'
  if (isCanceledProviderStatus(normalized)) return 'canceled'
  return normalized || 'unknown'
}

export function paymentRenewalStatus(status) {
  const normalized = text(status).toLowerCase()
  if (normalized === 'approved') return 'enabled'
  if (['pending', 'in_process', 'in_mediation'].includes(normalized)) return 'payment_pending'
  if (PAYMENT_FAILURE_STATUSES.has(normalized)) return 'payment_failed'
  if (normalized === 'refunded') return 'refunded'
  if (normalized === 'charged_back') return 'chargeback'
  return normalized || 'unknown'
}

export function shouldApplyProviderUpdate(current = {}, providerSubscription = {}) {
  const incomingAt = subscriptionTimestamp(providerSubscription?.last_modified || providerSubscription?.date_created)
  const currentAt = subscriptionTimestamp(current?.providerLastModifiedAt)
  if (!incomingAt) return currentAt === 0
  return incomingAt >= currentAt
}

export function resolveAuthorizedPaymentId(invoice = {}) {
  return text(
    invoice?.payment?.id
      || invoice?.payment?.payment_id
      || invoice?.payment_id
      || invoice?.payment?.paymentId,
  )
}

export function resolveInvoicePreapprovalId(invoice = {}) {
  return text(invoice?.preapproval_id || invoice?.preapprovalId || invoice?.subscription_id)
}

export function nextQuarterlyExpiration(baseTimestamp) {
  const source = new Date(Number(baseTimestamp) || Date.now())
  const day = source.getUTCDate()
  const result = new Date(source.getTime())
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + QUARTERLY_PLAN_MONTHS)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result.getTime()
}

export function publicPaymentHistoryEntry(value = {}) {
  const status = text(value.status).toLowerCase()
  return {
    id: text(value.id),
    status,
    amountInCents: Number(value.amountInCents || 0),
    currency: text(value.currency),
    paidAt: subscriptionTimestamp(value.paidAt) || null,
    updatedAt: subscriptionTimestamp(value.updatedAt) || null,
  }
}
