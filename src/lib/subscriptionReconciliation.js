import { createHash } from 'node:crypto'
import {
  mercadoPagoApiRequest,
  processApprovedCommercialPayment,
  processRecurringPreapprovalUpdate,
  referenceKey,
  safeText,
} from '@/lib/commercialServer'
import { resolveAuthorizedPaymentId, resolveInvoicePreapprovalId } from '@/lib/recurringSubscriptions'
import { consumeFixedWindowLimit } from '@/lib/serverRateLimit'
import { isRecurringSubscriptionProduct } from '@/lib/subscriptions'

const KINDS = ['client', 'professional']
const PROVIDER_KEY = /^[A-Za-z0-9_-]{1,128}$/
const MAX_INVOICES = 8

async function consume(database, uid, scope, interval) {
  const key = createHash('sha256').update(uid).digest('hex')
  const decision = await consumeFixedWindowLimit({
    database,
    path: `serverUsage/subscriptions/${key}/${scope}`,
    windowMs: interval,
    maxRequests: 1,
    minIntervalMs: interval,
  })
  return decision.allowed
}

async function reconcileInvoices(database, uid, kind, preapprovalId, plan, provider, signal) {
  const now = Date.now()
  const firstExpected = Number(plan.firstChargeAt || Math.max(Number(plan.trialEndsAt) || 0, Number(plan.expiresAt) || 0))
  const chargedQuantity = Number(provider.summarized?.charged_quantity || 0)
  // A successful authorization can have no invoice until the trial ends.
  if (firstExpected > now && chargedQuantity === 0 && !plan.paymentId) return
  if (!await consume(database, uid, `invoices_${kind}`, 5 * 60_000)) return

  const result = await mercadoPagoApiRequest(
    `/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}&limit=${MAX_INVOICES}`,
    { signal },
  )
  if (!Array.isArray(result?.results)) throw new Error('invalid_invoice_search')
  const invoices = result.results
    .filter((invoice) => resolveInvoicePreapprovalId(invoice) === preapprovalId)
    .slice(0, MAX_INVOICES)
    .sort((left, right) => (Date.parse(right.date_created) || 0) - (Date.parse(left.date_created) || 0))
  for (const invoice of invoices) {
    if (signal.aborted) throw new Error('reconciliation_timeout')
    const paymentId = resolveAuthorizedPaymentId(invoice)
    if (!/^\d{1,30}$/.test(paymentId)) continue
    const payment = await mercadoPagoApiRequest(`/v1/payments/${paymentId}`, { signal })
    if (safeText(payment?.id) !== paymentId) throw new Error('provider_payment_id_mismatch')
    const applied = await processApprovedCommercialPayment({ database, payment, recurringInvoicePreapprovalId: preapprovalId })
    if (!applied.ok) throw new Error('recovery_payment_not_applied')
  }
}

async function reconcileKind({ database, uid, kind, signal }) {
  const plan = (await database.ref(`users/${uid}/subscriptions/${kind}`).get()).val() || {}
  const preapprovalId = safeText(plan.preapprovalId)
  if (!PROVIDER_KEY.test(preapprovalId) || !isRecurringSubscriptionProduct(plan.recurringProductId)) return
  const index = (await database.ref(`commercialCheckoutAttemptsBySubscription/${referenceKey(preapprovalId)}`).get()).val()
  const attemptId = safeText(plan.checkoutAttemptId || index)
  if (!PROVIDER_KEY.test(attemptId)) return
  const attempt = (await database.ref(`commercialCheckoutAttempts/${attemptId}`).get()).val()
  if (
    !attempt || attempt.id !== attemptId || attempt.userId !== uid || attempt.targetId !== uid
    || attempt.preapprovalId !== preapprovalId || attempt.productId !== plan.recurringProductId
  ) return
  if (!await consume(database, uid, `reconcile_${kind}`, 20_000)) return

  const provider = await mercadoPagoApiRequest(`/preapproval/${encodeURIComponent(preapprovalId)}`, { signal })
  if (safeText(provider?.id) !== preapprovalId || provider.external_reference !== attempt.externalReference) {
    throw new Error('provider_subscription_identity_mismatch')
  }
  const state = await processRecurringPreapprovalUpdate({ database, subscription: provider })
  if (!state.ok) throw new Error('recovery_subscription_not_applied')
  if (!state.ignoredOutOfOrder) {
    await reconcileInvoices(database, uid, kind, preapprovalId, plan, provider, signal)
  }
}

export async function reconcileOwnedSubscriptions({ database, uid, kind, signal, log = console.warn }) {
  const kinds = kind && KINDS.includes(kind) ? [kind] : KINDS
  const timeout = AbortSignal.timeout(5_000)
  const budget = signal ? AbortSignal.any([timeout, signal]) : timeout
  const results = await Promise.allSettled(kinds.map((item) => reconcileKind({ database, uid, kind: item, signal: budget })))
  results.forEach((result, index) => {
    if (result.status === 'rejected') log('[subscriptions] provider_reconciliation_unavailable', { kind: kinds[index] })
  })
}
