import { createHash } from 'node:crypto'
import {
  mercadoPagoApiRequest, processApprovedCommercialPayment, processRecurringPreapprovalUpdate,
  referenceKey,
  safeText,
} from '@/lib/commercialServer'
import { processRecurringInvoicePayment, readMercadoPagoResource } from '@/lib/recurringPaymentProcessing'
import { resolveAuthorizedPaymentId, resolveInvoicePreapprovalId } from '@/lib/recurringSubscriptions'
import { consumeFixedWindowLimit } from '@/lib/serverRateLimit'
import { subscriptionKindForProduct, isRecurringSubscriptionProduct } from '@/lib/subscriptions'

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

export function hasDueRecurringInvoices(plan, provider, now = Date.now()) {
  const firstExpected = Number(plan.firstChargeAt || Math.max(Number(plan.trialEndsAt) || 0, Number(plan.expiresAt) || 0))
  const chargedQuantity = Number(provider.summarized?.charged_quantity || 0)
  // A successful authorization can have no invoice until the trial ends.
  return firstExpected <= now || chargedQuantity > 0 || Boolean(plan.paymentId)
}

export async function reconcileRecurringInvoicePage({
  database, preapprovalId, signal, offset = 0, limit = MAX_INVOICES, checkedPaymentId,
}) {
  const query = new URLSearchParams({ preapproval_id: preapprovalId, limit: String(limit) })
  if (offset) query.set('offset', String(offset))
  const result = await mercadoPagoApiRequest(
    `/authorized_payments/search?${query}`,
    { signal },
  )
  if (!Array.isArray(result?.results) || result.results.length > limit) throw new Error('invalid_invoice_search')
  const rows = result.results
  const total = result.paging?.total
  if ((offset || result.paging) && (!Number.isSafeInteger(total) || total < 0 || result.paging?.offset !== offset)) {
    throw new Error('invalid_invoice_pagination')
  }
  if (!rows.length && total > offset) throw new Error('invalid_invoice_pagination')
  const invoices = rows
    .filter((invoice) => resolveInvoicePreapprovalId(invoice) === preapprovalId)
    .sort((left, right) => (Date.parse(right.date_created) || 0) - (Date.parse(left.date_created) || 0))
  const seen = new Set()
  let identityReviewPending = false
  for (const invoice of invoices) {
    const paymentId = resolveAuthorizedPaymentId(invoice)
    if (!/^\d{1,30}$/.test(paymentId) || seen.has(paymentId) || paymentId === checkedPaymentId) continue
    seen.add(paymentId)
    signal?.throwIfAborted()
    const applied = await processRecurringInvoicePayment({ database, invoice, preapprovalId, signal })
    if (applied?.reason === 'payment_subscription_identity_mismatch') {
      identityReviewPending = true
      continue
    }
    if (!applied?.ok || applied.retryable) throw new Error('recovery_payment_not_applied')
  }
  // Finish the page so a disputed payment cannot delay matching siblings.
  // Keep the cursor on this page while the provider's identity data conflicts.
  if (identityReviewPending) throw new Error('payment_subscription_identity_mismatch')
  const next = offset + rows.length
  return rows.length && (total === undefined ? rows.length === limit : next < total) ? next : 0
}

export async function readRecurringReconciliationContext({ database, uid, kind, expectedAttemptId, currentPlan }) {
  if (typeof uid !== 'string' || !uid || /[.#$\[\]/]/.test(uid) || !KINDS.includes(kind)) return null
  const plan = currentPlan ?? ((await database.ref(`users/${uid}/subscriptions/${kind}`).get()).val() || {})
  const preapprovalId = safeText(plan.preapprovalId)
  if (!PROVIDER_KEY.test(preapprovalId) || !isRecurringSubscriptionProduct(plan.recurringProductId)
    || subscriptionKindForProduct(plan.recurringProductId) !== kind) return null
  const index = plan.checkoutAttemptId ? '' : (await database.ref(
    `commercialCheckoutAttemptsBySubscription/${referenceKey(preapprovalId)}`,
  ).get()).val()
  const attemptId = safeText(plan.checkoutAttemptId || index)
  if (!PROVIDER_KEY.test(attemptId) || (expectedAttemptId && attemptId !== expectedAttemptId)) return null
  const attempt = (await database.ref(`commercialCheckoutAttempts/${attemptId}`).get()).val()
  if (
    !attempt || attempt.id !== attemptId || attempt.userId !== uid || attempt.targetId !== uid
    || attempt.preapprovalId !== preapprovalId || attempt.productId !== plan.recurringProductId
  ) return null
  return { plan, attempt, preapprovalId }
}

export async function reconcileRecurringProviderState({ database, context, signal }) {
  const { preapprovalId, attempt } = context
  const provider = await readMercadoPagoResource('/preapproval', preapprovalId, signal)
  if (provider.external_reference !== attempt.externalReference) {
    throw new Error('provider_subscription_identity_mismatch')
  }
  const state = await processRecurringPreapprovalUpdate({ database, subscription: provider })
  if (!state.ok || state.retryable) throw new Error('recovery_subscription_not_applied')
  return { provider, state }
}

export async function reconcilePaidInstallment({ database, context, signal }) {
  const { plan, attempt, preapprovalId } = context
  const paymentId = safeText(plan.paymentId)
  if (!/^\d{1,30}$/.test(paymentId)) return
  const kind = subscriptionKindForProduct(attempt.productId)
  const history = (await database.ref(
    `subscriptionPaymentHistory/${attempt.userId}/${kind}/${referenceKey(paymentId)}`,
  ).get()).val()
  // A quarterly checkout can still carry the previous annual payment ID.
  if (history?.id !== paymentId || history?.preapprovalId !== preapprovalId
    || history?.status !== 'approved' || history.attemptId !== attempt.id || history.productId !== attempt.productId) return
  const payment = await readMercadoPagoResource('/v1/payments', paymentId, signal)
  if (['refunded', 'charged_back'].includes(payment.status)) {
    const result = await processApprovedCommercialPayment({ database, payment, recurringInvoicePreapprovalId: preapprovalId })
    if (!result?.ok || result.retryable) throw new Error('recovery_payment_not_applied')
  }
  return paymentId
}

async function reconcileKind({ database, uid, kind, signal }) {
  const context = await readRecurringReconciliationContext({ database, uid, kind })
  if (!context || !await consume(database, uid, `reconcile_${kind}`, 20_000)) return
  const { provider, state } = await reconcileRecurringProviderState({ database, context, signal })
  if (state.ignoredOutOfOrder || !hasDueRecurringInvoices(context.plan, provider)
    || !await consume(database, uid, `invoices_${kind}`, 5 * 60_000)) return
  await reconcileRecurringInvoicePage({ database, preapprovalId: context.preapprovalId, signal })
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
