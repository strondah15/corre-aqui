import { createHash } from 'node:crypto'
import { getCommercialDatabase, getAuthenticatedIdentity, mercadoPagoApiRequest } from '@/lib/commercialServer'
import { getCommercialProduct } from '@/lib/commercialProducts'
import { getFirebaseAdminAuth } from '@/lib/firebaseAdmin'
import {
  isTerminalRecurringCancellation, resolveAuthorizedPaymentId, resolveInvoicePreapprovalId, validateRecurringPreapproval,
} from '@/lib/recurringSubscriptions'
import { readMercadoPagoResource } from '@/lib/recurringPaymentProcessing'
import { isScheduledSubscriptionStaging } from '@/lib/scheduledSubscriptionRuntime'
import { readRecurringReconciliationContext } from '@/lib/subscriptionReconciliation'

export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store' }
const origin = 'https://corre-aqui-git-codex-stagingc-155cef-rgstrondahh-2784s-projects.vercel.app'
const approvalDigest = '2ba0261e6981b0a0ea55db9988709ae57bd0d31218e071cc574eb4bf73386c1e'
const digest = (value) => createHash('sha256').update(value).digest('hex')

function getScope(request) {
  if (!isScheduledSubscriptionStaging() || request.nextUrl.origin !== origin) return null
  try {
    const scope = JSON.parse(process.env.STAGING_FINANCE_TEST_SCOPE || 'null')
    const remaining = scope?.expiresAt - Date.now()
    if (!/^staging-finance-[a-f0-9]{18}7d6714$/.test(scope?.uid || '')
      || !/^[a-f0-9]{64}$/.test(scope?.operatorHash || '')
      || !Number.isSafeInteger(scope.expiresAt) || remaining <= 0 || remaining > 2 * 60 * 60_000) return null
    return scope
  } catch {
    return null
  }
}

function respond(body, status = 200) {
  return Response.json(body, { status, headers })
}

async function identify(request) {
  return getAuthenticatedIdentity(request).catch(() => null)
}

function isOperator(identity, scope) {
  return identity?.emailVerified === true && digest(identity.uid) === scope.operatorHash
}

async function getLinkedContext(database, uid) {
  const context = await readRecurringReconciliationContext({ database, uid, kind: 'client' })
  return context && digest(context.preapprovalId) === approvalDigest ? context : null
}

async function verifyProviderUser(resource, expectedId, signal) {
  if (!/^\d{1,30}$/.test(expectedId)) return null
  try {
    const result = await fetch(`https://api.mercadolibre.com/users/${resource}`, {
      headers: { Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal,
    })
    if (!result.ok) return null
    const user = await result.json()
    return { matches: String(user.id) === expectedId, testUser: Array.isArray(user.tags) ? user.tags.includes('test_user') : null }
  } catch {
    return null
  }
}

export async function POST(request) {
  const scope = getScope(request)
  if (!scope) return respond({ error: 'unavailable' }, 404)
  if (!isOperator(await identify(request), scope)) return respond({ error: 'operator_required' }, 403)
  try {
    const context = await getLinkedContext(getCommercialDatabase(), scope.uid)
    if (!context || isTerminalRecurringCancellation(context.plan.providerStatus)) return respond({ error: 'test_session_closed' }, 409)
    const auth = getFirebaseAdminAuth()
    const account = await auth.getUser(scope.uid)
    if (account.email !== `${scope.uid}@example.test` || account.disabled || !account.emailVerified || account.providerData.length) {
      return respond({ error: 'invalid_test_identity' }, 409)
    }
    return respond({ token: await auth.createCustomToken(scope.uid) })
  } catch {
    return respond({ error: 'test_identity_unavailable' }, 503)
  }
}

export async function GET(request) {
  const scope = getScope(request)
  if (!scope) return respond({ error: 'unavailable' }, 404)
  const identity = await identify(request)
  if (!isOperator(identity, scope) && identity?.uid !== scope.uid) return respond({ error: 'operator_required' }, 403)
  try {
    const database = getCommercialDatabase()
    const context = await getLinkedContext(database, scope.uid)
    if (!context) return respond({ error: 'test_subscription_mismatch' }, 409)
    const { preapprovalId, attempt } = context
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)])
    const payerId = String(attempt.payerId || '')
    const [subscription, seller, buyer] = await Promise.all([
      readMercadoPagoResource('/preapproval', preapprovalId, signal),
      verifyProviderUser('me', String(attempt.collectorId || ''), signal),
      verifyProviderUser(payerId, payerId, signal),
    ])
    const product = getCommercialProduct(attempt.productId)
    if (!validateRecurringPreapproval({ subscription, attempt, product }).valid) {
      return respond({ error: 'provider_identity_mismatch' }, 502)
    }
    const params = new URLSearchParams({ preapproval_id: preapprovalId, limit: '5' })
    const result = await mercadoPagoApiRequest(`/authorized_payments/search?${params}`, { signal })
    if (!Array.isArray(result?.results) || result.results.length > 5) return respond({ error: 'invalid_invoice_response' }, 502)
    const invoices = []
    for (const invoice of result.results) {
      if (resolveInvoicePreapprovalId(invoice) !== preapprovalId) continue
      const invoiceId = String(invoice.id || '')
      const receipt = /^\d{1,30}$/.test(invoiceId)
        ? (await database.ref(`commercialAuditLogs/webhook_received_subscription_authorized_payment_${invoiceId}`).get()).val()
        : null
      const paymentId = resolveAuthorizedPaymentId(invoice)
      const payment = /^\d{1,30}$/.test(paymentId) ? await readMercadoPagoResource('/v1/payments', paymentId, signal) : null
      invoices.push({
        invoice: invoiceId,
        status: invoice.status || null,
        debitDate: invoice.debit_date || null,
        signedReceiptAt: Number.isSafeInteger(receipt?.createdAt) ? new Date(receipt.createdAt).toISOString() : null,
        payment: payment && {
          id: String(payment.id),
          state: payment.status,
          detail: payment.status_detail,
          amountInCents: Math.round(Number(payment.transaction_amount) * 100),
          currency: payment.currency_id,
          approvedAt: payment.date_approved || null,
          liveMode: typeof payment.live_mode === 'boolean' ? payment.live_mode : null,
          collectorMatches: String(payment.collector_id) === String(attempt.collectorId),
          payerMatches: payment.payer?.id ? String(payment.payer.id) === payerId : null,
          officialTestCard: payment.card?.first_six_digits && payment.card?.last_four_digits
            ? String(payment.card.first_six_digits) === '423564' && String(payment.card.last_four_digits) === '5682'
            : null,
        },
      })
    }
    return respond({
      status: subscription.status,
      nextPaymentDate: subscription.next_payment_date || null,
      intervalMonths: subscription.auto_recurring?.frequency,
      amountInCents: attempt.amountInCents,
      seller: seller && { collectorMatches: seller.matches, testUser: seller.testUser },
      buyer: buyer && { payerMatches: buyer.matches && String(subscription.payer_id) === payerId, testUser: buyer.testUser },
      invoices,
    })
  } catch {
    return respond({ error: 'provider_status_unavailable' }, 503)
  }
}

export async function DELETE(request) {
  const scope = getScope(request)
  if (!scope) return respond({ error: 'unavailable' }, 404)
  const identity = await identify(request)
  if (!isOperator(identity, scope) && identity?.uid !== scope.uid) return respond({ error: 'operator_required' }, 403)
  try {
    const context = await getLinkedContext(getCommercialDatabase(), scope.uid)
    if (!context || !isTerminalRecurringCancellation(context.plan.providerStatus) || context.plan.autoRenew !== false) {
      return respond({ error: 'test_cancellation_required' }, 409)
    }
    await getFirebaseAdminAuth().revokeRefreshTokens(scope.uid)
    return respond({ revoked: true })
  } catch {
    return respond({ error: 'test_session_revocation_failed' }, 503)
  }
}
