import {
  mercadoPagoApiRequest,
  parseExternalReference,
  processApprovedCommercialPayment,
  processRecurringPreapprovalUpdate,
  readRecurringSandboxSeller,
} from '@/lib/commercialServer'
import { getCommercialProduct } from '@/lib/commercialProducts'
import { resolveAuthorizedPaymentId, resolveInvoicePreapprovalId } from '@/lib/recurringSubscriptions'
import { validateRecurringPayerInvoice } from '@/lib/recurringPayerBinding'
import { subscriptionKindForProduct } from '@/lib/subscriptions'

const RESOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/

export function normalizeMercadoPagoResourceId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  return typeof value === 'string' && RESOURCE_ID.test(value) ? value : ''
}

export async function readMercadoPagoResource(endpoint, id, signal) {
  if (!normalizeMercadoPagoResourceId(id)) throw new Error('invalid_mercado_pago_resource_id')
  const record = await mercadoPagoApiRequest(`${endpoint}/${encodeURIComponent(id)}`, { signal })
  if (normalizeMercadoPagoResourceId(record?.id) !== String(id)) {
    throw new Error('mercado_pago_resource_id_mismatch')
  }
  return record
}

function ownsPendingBinding(current, attempt) {
  return current?.id === attempt.id && current.userId === attempt.userId
    && current.targetId === attempt.userId && current.productId === attempt.productId
    && current.preapprovalId === attempt.preapprovalId && current.externalReference === attempt.externalReference
    && current.amountInCents === attempt.amountInCents && current.currency === attempt.currency
    && current.collectorId === attempt.collectorId && current.applicationId === attempt.applicationId
    && current.payerId === current.payerBinding?.initialPayerId
    && current.payerBinding?.initialPayerId === attempt.payerBinding.initialPayerId
    && current.payerBinding.buyerBindingSha256 === attempt.payerBinding.buyerBindingSha256
}

async function finalizeInvoicePayer({ database, invoice, subscription, payment, signal }) {
  const reference = parseExternalReference(subscription.external_reference)
  if (!reference) return false
  const attemptRef = database.ref(`commercialCheckoutAttempts/${reference.attemptId}`)
  const attempt = (await attemptRef.get()).val()
  if (!attempt?.payerBinding || attempt.userId !== reference.userId || attempt.targetId !== reference.targetId
    || attempt.productId !== reference.productId || attempt.externalReference !== subscription.external_reference) return false
  if (attempt.payerBinding.finalPayerId) {
    // The first witness is immutable even when other invoices arrive concurrently.
    return false
  }

  const kind = subscriptionKindForProduct(attempt.productId)
  if (!kind) return false
  const plan = (await database.ref(`users/${attempt.userId}/subscriptions/${kind}`).get()).val()
  if (plan?.preapprovalId !== attempt.preapprovalId || plan.checkoutAttemptId !== attempt.id
    || plan.recurringProductId !== attempt.productId
    || (plan.paymentId && plan.paymentReference === attempt.externalReference)) return false
  const invoiceId = normalizeMercadoPagoResourceId(invoice.id)
  if (!invoiceId || !/^\d+$/.test(invoiceId)) return false
  const [officialInvoice, seller] = await Promise.all([
    readMercadoPagoResource('/authorized_payments', invoiceId, signal),
    readRecurringSandboxSeller(attempt.collectorId, signal),
  ])
  const product = getCommercialProduct(attempt.productId)
  const verified = validateRecurringPayerInvoice({ attempt, subscription, invoice: officialInvoice, payment, seller, product })
  if (!verified) return false

  signal?.throwIfAborted()
  const result = await attemptRef.transaction((current) => {
    // RTDB can first supply null from its cache.
    if (current === null) return null
    if (!ownsPendingBinding(current, attempt) || current.payerBinding.finalPayerId) return undefined
    return {
      ...current,
      payerBinding: { ...current.payerBinding, ...verified, finalizedAt: Date.now() },
    }
  })
  const current = result.snapshot.val()
  return ownsPendingBinding(current, attempt) && current.payerBinding.finalPayerId === verified.finalPayerId
}

export async function processRecurringInvoicePayment({ database, invoice, preapprovalId, subscription, signal, onStage }) {
  const linkedPreapprovalId = normalizeMercadoPagoResourceId(resolveInvoicePreapprovalId(invoice))
  const paymentId = normalizeMercadoPagoResourceId(resolveAuthorizedPaymentId(invoice))
  if (!linkedPreapprovalId || linkedPreapprovalId !== preapprovalId || !paymentId) return null

  onStage?.('read_invoice_payment')
  const payment = await readMercadoPagoResource('/v1/payments', paymentId, signal)
  if (subscription && payment.status === 'approved') {
    onStage?.('verify_invoice_payer')
    if (await finalizeInvoicePayer({ database, invoice, subscription, payment, signal })) {
      const state = await processRecurringPreapprovalUpdate({ database, subscription, requireCurrent: true })
      if (!state.ok || state.retryable || state.ignoredOutOfOrder || state.payerBindingPending) {
        return { ok: false, retryable: true, reason: 'payer_binding_sync_required' }
      }
    }
  }
  onStage?.('apply_invoice_payment')
  return processApprovedCommercialPayment({ database, payment, recurringInvoicePreapprovalId: preapprovalId })
}
