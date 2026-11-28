import { createHash } from 'node:crypto'
import { getAuthenticatedIdentity, getCommercialDatabase, mercadoPagoApiRequest } from '@/lib/commercialServer'
import { getCommercialProduct } from '@/lib/commercialProducts'
import { getFirebaseAdminAuth } from '@/lib/firebaseAdmin'
import { readMercadoPagoResource } from '@/lib/recurringPaymentProcessing'
import {
  isTerminalRecurringCancellation, resolveAuthorizedPaymentId, resolveInvoicePreapprovalId, validateRecurringPreapproval,
} from '@/lib/recurringSubscriptions'
import { isScheduledSubscriptionStaging } from '@/lib/scheduledSubscriptionRuntime'
import { readRecurringReconciliationContext } from '@/lib/subscriptionReconciliation'

export const runtime = 'nodejs'

const origin = 'https://corre-aqui-git-codex-stagingc-155cef-rgstrondahh-2784s-projects.vercel.app'
const applicationId = '680095240238234'
const anchorDigest = '2ba0261e6981b0a0ea55db9988709ae57bd0d31218e071cc574eb4bf73386c1e'
const productId = 'CLIENT_QUARTERLY'
const amountInCents = 1990
const headers = { 'Cache-Control': 'private, no-store' }
const numericId = /^\d{1,30}$/
const hashFormat = /^[a-f0-9]{64}$/
const digest = (value) => createHash('sha256').update(value).digest('hex')
const sandboxBuyer = () => (process.env.MERCADO_PAGO_STAGING_BUYER_EMAIL || '').trim().toLowerCase()

function getScope(request) {
  if (!isScheduledSubscriptionStaging() || request.nextUrl.origin !== origin) return null
  try {
    const scope = JSON.parse(process.env.STAGING_FINANCE_TEST_SCOPE || 'null')
    const remaining = scope?.expiresAt - Date.now()
    if (!/^staging-finance-[a-f0-9]{24}$/.test(scope?.uid || '') || scope.uid.endsWith('7d6714')
      || !hashFormat.test(scope.operatorHash || '') || !hashFormat.test(scope.buyerEmailHash || '')
      || typeof scope.collectorId !== 'string' || !numericId.test(scope.collectorId)
      || typeof scope.anchorPreapprovalId !== 'string' || digest(scope.anchorPreapprovalId) !== anchorDigest
      || !Number.isSafeInteger(scope.expiresAt) || remaining <= 0 || remaining > 2 * 60 * 60_000) return null
    return scope
  } catch {
    return null
  }
}

function respond(body, status = 200) {
  return Response.json(body, { status, headers })
}

function isOperator(identity, scope) {
  return identity?.emailVerified === true && digest(identity.uid) === scope.operatorHash
}

function mayInspect(identity, scope) {
  return identity?.uid === scope.uid || isOperator(identity, scope)
}

function maskId(value) {
  return /^[a-z0-9]{5,30}$/i.test(String(value || '')) ? `…${String(value).slice(-4)}` : null
}

function safeDate(value) {
  if (typeof value !== 'string' && !Number.isSafeInteger(value)) return null
  const date = new Date(value)
  return Number.isFinite(date.valueOf()) && date.valueOf() > 0 ? date.toISOString() : null
}

function safeStatus(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(value) ? value : null
}

async function verifySandbox(scope, signal) {
  const buyerEmail = sandboxBuyer()
  const buyerMatches = /^[^\s@]+@testuser\.com$/.test(buyerEmail) && digest(buyerEmail) === scope.buyerEmailHash
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()
  if (!buyerMatches || !secret) return null

  const [sellerResponse, anchor] = await Promise.all([
    fetch('https://api.mercadolibre.com/users/me', {
      headers: { Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal,
    }),
    readMercadoPagoResource('/preapproval', scope.anchorPreapprovalId, signal),
  ])
  if (!sellerResponse.ok) return null
  const seller = await sellerResponse.json()
  const payerId = String(anchor?.payer_id || '')
  if (String(seller.id) !== scope.collectorId || !Array.isArray(seller.tags) || !seller.tags.includes('test_user')
    || String(anchor?.collector_id) !== scope.collectorId || String(anchor?.application_id) !== applicationId
    || !numericId.test(payerId) || payerId === scope.collectorId
    || !isTerminalRecurringCancellation(anchor?.status)
    || (anchor.payer_email && String(anchor.payer_email).trim().toLowerCase() !== buyerEmail)) return null
  return { payerId }
}

async function readTestState(database, uid) {
  const [index, plan] = await Promise.all([
    database.ref(`commercialCheckoutAttemptsByUser/${uid}`).get(),
    database.ref(`users/${uid}/subscriptions/client`).get(),
  ])
  const currentPlan = plan.val()
  const attempts = Object.keys(index.val() || {})
  const context = attempts.length === 1
    ? await readRecurringReconciliationContext({ database, uid, kind: 'client', expectedAttemptId: attempts[0], currentPlan })
    : null
  return { empty: attempts.length === 0 && !currentPlan, attempts, context }
}

function validateTestAttempt(context, scope, sandbox) {
  if (!context) return false
  const { attempt, preapprovalId } = context
  return preapprovalId !== scope.anchorPreapprovalId && attempt.productId === productId
    && attempt.amountInCents === amountInCents && attempt.currency === 'BRL'
    && String(attempt.collectorId) === scope.collectorId && String(attempt.applicationId) === applicationId
    && String(attempt.payerId) === sandbox.payerId
}

async function getTestAccount(auth, uid, create) {
  const email = `${uid}@example.test`
  let account
  try {
    account = await auth.getUser(uid)
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error
    if (!create) return null
    try {
      account = await auth.createUser({ uid, email, emailVerified: true, displayName: 'Homologação financeira' })
    } catch (creationError) {
      if (creationError?.code !== 'auth/uid-already-exists') throw creationError
      account = await auth.getUser(uid)
    }
  }
  if (account.uid !== uid || account.email !== email || account.disabled || !account.emailVerified || account.providerData.length) {
    throw new Error('invalid_test_identity')
  }
  return account
}

export async function POST(request) {
  const scope = getScope(request)
  if (!scope) return respond({ error: 'unavailable' }, 404)
  if (!isOperator(await getAuthenticatedIdentity(request).catch(() => null), scope)) {
    return respond({ error: 'operator_required' }, 403)
  }
  try {
    const sandbox = await verifySandbox(scope, AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]))
    if (!sandbox) return respond({ error: 'sandbox_binding_unconfirmed' }, 409)
    const state = await readTestState(getCommercialDatabase(), scope.uid)
    const linked = validateTestAttempt(state.context, scope, sandbox)
    if (!state.empty && (!linked || isTerminalRecurringCancellation(state.context.plan.providerStatus))) {
      return respond({ error: 'test_session_closed' }, 409)
    }
    const auth = getFirebaseAdminAuth()
    if (!await getTestAccount(auth, scope.uid, state.empty)) return respond({ error: 'test_identity_missing' }, 409)
    return respond({ token: await auth.createCustomToken(scope.uid) })
  } catch {
    return respond({ error: 'test_identity_unavailable' }, 503)
  }
}

async function readReceipt(database, topic, id) {
  const receipt = (await database.ref(`commercialAuditLogs/webhook_received_${topic}_${id}`).get()).val()
  return safeDate(receipt?.createdAt)
}

export async function GET(request) {
  const scope = getScope(request)
  if (!scope) return respond({ error: 'unavailable' }, 404)
  if (!mayInspect(await getAuthenticatedIdentity(request).catch(() => null), scope)) {
    return respond({ error: 'operator_required' }, 403)
  }
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)])
    const sandbox = await verifySandbox(scope, signal)
    if (!sandbox) return respond({ error: 'sandbox_binding_unconfirmed' }, 409)
    const verified = {
      applicationId,
      sellerTestUser: true,
      buyerMatchesVerifiedTestAccount: true,
      uidSuffix: scope.uid.slice(-6),
      amountInCents,
      currency: 'BRL',
      intervalMonths: 3,
    }
    const database = getCommercialDatabase()
    const state = await readTestState(database, scope.uid)
    if (state.empty) return respond({ ...verified, status: 'no_test_subscription', attempts: 0, canRevoke: true, invoices: [] })
    const context = state.context
    if (!validateTestAttempt(context, scope, sandbox)) return respond({ error: 'test_subscription_mismatch' }, 409)
    const { preapprovalId, attempt, plan } = context
    const subscription = await readMercadoPagoResource('/preapproval', preapprovalId, signal)
    if (!validateRecurringPreapproval({ subscription, attempt, product: getCommercialProduct(productId) }).valid) {
      return respond({ error: 'provider_identity_mismatch' }, 502)
    }
    const params = new URLSearchParams({ preapproval_id: preapprovalId, limit: '5' })
    const result = await mercadoPagoApiRequest(`/authorized_payments/search?${params}`, { signal })
    if (!Array.isArray(result?.results) || result.results.length > 5) return respond({ error: 'invalid_invoice_response' }, 502)
    const invoices = []
    for (const invoice of result.results) {
      const invoiceId = String(invoice.id || '')
      if (resolveInvoicePreapprovalId(invoice) !== preapprovalId || !numericId.test(invoiceId)) continue
      const paymentId = resolveAuthorizedPaymentId(invoice)
      const [signedReceiptAt, payment] = await Promise.all([
        readReceipt(database, 'subscription_authorized_payment', invoiceId),
        numericId.test(paymentId) ? readMercadoPagoResource('/v1/payments', paymentId, signal) : null,
      ])
      invoices.push({
        invoice: maskId(invoiceId),
        status: safeStatus(invoice.status),
        debitDate: safeDate(invoice.debit_date),
        signedReceiptAt,
        payment: payment && {
          id: maskId(paymentId),
          state: safeStatus(payment.status),
          amountInCents: Math.round(Number(payment.transaction_amount) * 100),
          currency: payment.currency_id === 'BRL' ? 'BRL' : null,
          approvedAt: safeDate(payment.date_approved),
          liveMode: typeof payment.live_mode === 'boolean' ? payment.live_mode : null,
          collectorMatches: String(payment.collector_id) === scope.collectorId,
          payerMatches: payment.payer?.id ? String(payment.payer.id) === sandbox.payerId : null,
          officialTestCard: payment.card?.first_six_digits && payment.card?.last_four_digits
            ? String(payment.card.first_six_digits) === '423564' && String(payment.card.last_four_digits) === '5682'
            : null,
          signedReceiptAt: await readReceipt(database, 'payment', paymentId),
        },
      })
    }
    return respond({
      ...verified,
      status: safeStatus(subscription.status),
      providerApplicationMatches: String(subscription.application_id) === applicationId,
      providerCollectorMatches: String(subscription.collector_id) === scope.collectorId,
      providerPayerMatches: String(subscription.payer_id) === sandbox.payerId,
      approval: `…${preapprovalId.slice(-4)}`,
      signedAuthorizationReceiptAt: await readReceipt(database, 'subscription_preapproval', preapprovalId),
      nextPaymentDate: safeDate(subscription.next_payment_date),
      firstChargeAt: safeDate(attempt.firstChargeAt),
      firebase: {
        status: safeStatus(plan.status),
        providerStatus: safeStatus(plan.providerStatus),
        autoRenew: plan.autoRenew === true,
        startedAt: safeDate(plan.startedAt),
        expiresAt: safeDate(plan.expiresAt),
        processedPayments: Object.keys(plan.processedPayments || {}).length,
      },
      attempts: state.attempts.length,
      canRevoke: isTerminalRecurringCancellation(subscription.status)
        && isTerminalRecurringCancellation(plan.providerStatus) && plan.autoRenew === false,
      invoices,
    })
  } catch {
    return respond({ error: 'provider_status_unavailable' }, 503)
  }
}

export async function DELETE(request) {
  const scope = getScope(request)
  if (!scope) return respond({ error: 'unavailable' }, 404)
  const identity = await getAuthenticatedIdentity(request).catch(() => null)
  if (!mayInspect(identity, scope)) return respond({ error: 'operator_required' }, 403)
  try {
    const state = await readTestState(getCommercialDatabase(), scope.uid)
    if (!state.empty) {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)])
      const sandbox = await verifySandbox(scope, signal)
      const context = state.context
      if (!sandbox || !validateTestAttempt(context, scope, sandbox)
        || !isTerminalRecurringCancellation(context.plan.providerStatus) || context.plan.autoRenew !== false) {
        return respond({ error: 'test_cancellation_required' }, 409)
      }
      const subscription = await readMercadoPagoResource('/preapproval', context.preapprovalId, signal)
      if (!isTerminalRecurringCancellation(subscription.status)
        || !validateRecurringPreapproval({ subscription, attempt: context.attempt, product: getCommercialProduct(productId) }).valid) {
        return respond({ error: 'test_cancellation_required' }, 409)
      }
    }
    const auth = getFirebaseAdminAuth()
    if (await getTestAccount(auth, scope.uid, false)) await auth.revokeRefreshTokens(scope.uid)
    return respond({ revoked: true, signOut: identity.uid === scope.uid })
  } catch {
    return respond({ error: 'test_session_revocation_failed' }, 503)
  }
}
