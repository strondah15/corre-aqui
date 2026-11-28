import { createHash, timingSafeEqual } from 'node:crypto'
import {
  resolveAuthorizedPaymentId,
  resolveInvoicePreapprovalId,
  isTerminalRecurringCancellation,
  validateRecurringPreapproval,
} from './recurringSubscriptions.js'
import { isScheduledSubscriptionStaging } from './scheduledSubscriptionRuntime.js'

const SHA256 = /^[a-f0-9]{64}$/i
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,128}$/
const REVERSED_DETAILS = new Set(['partially_refunded', 'refunded', 'charged_back', 'in_dispute', 'in_mediation', 'disputed'])

function numericId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : ''
  return typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value) ? value : ''
}

function sandboxEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return email.length <= 254 && /^[a-z0-9._+-]+@testuser\.com$/.test(email) ? email : ''
}

function buyerPin(value) {
  return typeof value === 'string' && SHA256.test(value) ? value.toLowerCase() : ''
}

function configuredBuyer(env) {
  const email = sandboxEmail(env.MERCADO_PAGO_STAGING_BUYER_EMAIL)
  const pin = buyerPin(env.MERCADO_PAGO_STAGING_BUYER_BINDING_SHA256)
  return email && pin && isScheduledSubscriptionStaging(env) ? { email, pin } : null
}

function capturedBinding(attempt) {
  const binding = attempt?.payerBinding
  const initialPayerId = numericId(binding?.initialPayerId)
  const pin = buyerPin(binding?.buyerBindingSha256)
  return initialPayerId && pin && numericId(attempt?.payerId) === initialPayerId ? binding : null
}

function providerTimestamp(value) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
}

export function createRecurringPayerBinding({ subscription, payerEmail, env = process.env }) {
  const configured = configuredBuyer(env)
  const initialPayerId = numericId(subscription?.payer_id)
  if (!configured || !initialPayerId || subscription.status !== 'pending' || sandboxEmail(payerEmail) !== configured.email) return null
  return { initialPayerId, buyerBindingSha256: configured.pin }
}

export function getRecurringPayerBindingSubmissionPin(payerEmail, env = process.env) {
  const configured = configuredBuyer(env)
  return configured && configured.email === sandboxEmail(payerEmail) ? configured.pin : ''
}

export function getVerifiedRecurringPayerId(attempt) {
  if (attempt?.payerBinding?.finalPayerId != null) {
    return numericId(capturedBinding(attempt)?.finalPayerId)
  }
  const legacyPayer = typeof attempt?.payerId === 'string' || typeof attempt?.payerId === 'number'
    ? String(attempt.payerId).trim() : ''
  return legacyPayer
}

export function validateRecurringPayerBindingCandidate({ attempt, subscription, product, env = process.env, allowTerminal = false }) {
  const configured = configuredBuyer(env)
  const binding = capturedBinding(attempt)
  const finalPayerId = numericId(subscription?.payer_id)
  const validStatus = subscription?.status === 'authorized'
    || (allowTerminal && isTerminalRecurringCancellation(subscription?.status) && providerTimestamp(subscription.last_modified))
  if (!configured || !binding || !finalPayerId || !validStatus
    || buyerPin(binding.buyerBindingSha256) !== configured.pin
    || (binding.finalPayerId != null && numericId(binding.finalPayerId) !== finalPayerId)
    || (subscription.payer_email != null && sandboxEmail(subscription.payer_email) !== configured.email)
    || typeof attempt.preapprovalId !== 'string' || !PROVIDER_ID.test(attempt.preapprovalId)
    || subscription.id !== attempt.preapprovalId || !attempt.externalReference || subscription.external_reference !== attempt.externalReference
    || !numericId(attempt.collectorId) || finalPayerId === numericId(attempt.collectorId)
    || numericId(subscription.collector_id) !== numericId(attempt.collectorId)
    || !numericId(attempt.applicationId) || numericId(subscription.application_id) !== numericId(attempt.applicationId)) return ''

  const digest = createHash('sha256').update(`${configured.email}\n${finalPayerId}`).digest()
  if (!timingSafeEqual(digest, Buffer.from(configured.pin, 'hex'))) return ''

  const validation = validateRecurringPreapproval({ subscription, attempt, product })
  return validation.valid || (validation.errors.length === 1 && validation.errors[0] === 'payer_mismatch') ? finalPayerId : ''
}

export function validateRecurringPayerInvoice({ attempt, subscription, invoice, payment, seller, product, env = process.env }) {
  const finalPayerId = validateRecurringPayerBindingCandidate({ attempt, subscription, product, env, allowTerminal: true })
  const invoiceId = numericId(invoice?.id)
  const paymentId = numericId(payment?.id)
  if (!finalPayerId || !invoiceId || !paymentId || invoice.status !== 'processed' || payment.status !== 'approved') return null

  const collectorId = numericId(attempt.collectorId)
  const invoiceBuyers = [invoice.payer_id, invoice.payer?.id, invoice.payment?.payer_id, invoice.payment?.payer?.id]
  const invoiceSubscriptions = [invoice.preapproval_id, invoice.preapprovalId, invoice.subscription_id]
  const invoicePayments = [invoice.payment?.id, invoice.payment?.payment_id, invoice.payment_id, invoice.payment?.paymentId]
  const reversalDetail = typeof payment.status_detail === 'string' ? payment.status_detail.trim().toLowerCase() : ''
  const approvedAt = providerTimestamp(payment.date_approved)
  if (numericId(seller?.id) !== collectorId || !Array.isArray(seller.tags) || !seller.tags.includes('test_user')
    || resolveInvoicePreapprovalId(invoice) !== attempt.preapprovalId || resolveAuthorizedPaymentId(invoice) !== paymentId
    || invoiceSubscriptions.some((id) => id != null && id !== attempt.preapprovalId)
    || invoicePayments.some((id) => id != null && numericId(id) !== paymentId)
    || (invoice.external_reference != null && invoice.external_reference !== '' && invoice.external_reference !== attempt.externalReference)
    || (invoice.currency_id != null && invoice.currency_id !== attempt.currency)
    || (invoice.transaction_amount != null && Number(invoice.transaction_amount) !== attempt.amountInCents / 100)
    || (invoice.payment?.status != null && invoice.payment.status !== 'approved')
    || numericId(payment.collector_id) !== collectorId || numericId(payment.payer?.id) !== finalPayerId
    || invoiceBuyers.some((id) => id != null && numericId(id) !== finalPayerId)
    || (payment.application_id != null && numericId(payment.application_id) !== numericId(attempt.applicationId))
    || (payment.external_reference != null && payment.external_reference !== '' && payment.external_reference !== attempt.externalReference)
    || Number(payment.transaction_amount) !== attempt.amountInCents / 100 || payment.currency_id !== attempt.currency
    || !approvedAt || approvedAt + 999 < Math.max(Number(attempt.providerSubmissionAt) || 0, Number(attempt.firstChargeAt) || 0)
    || (isTerminalRecurringCancellation(subscription.status) && approvedAt > providerTimestamp(subscription.last_modified))
    || REVERSED_DETAILS.has(reversalDetail) || Number(payment.transaction_amount_refunded ?? 0) !== 0
    || [payment.refunds, payment.chargebacks, payment.disputes].some((items) => items != null && !(Array.isArray(items) && items.length === 0))
    || payment.dispute_id || payment.chargeback_id) return null

  return { finalPayerId, invoiceId, paymentId }
}
