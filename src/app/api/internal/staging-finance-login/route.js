import { createHash } from 'node:crypto'
import { getCommercialDatabase, getAuthenticatedIdentity, mercadoPagoApiRequest } from '@/lib/commercialServer'
import { getCommercialProduct } from '@/lib/commercialProducts'
import { getFirebaseAdminAuth } from '@/lib/firebaseAdmin'
import {
  resolveAuthorizedPaymentId, resolveInvoicePreapprovalId, validateRecurringPreapproval,
} from '@/lib/recurringSubscriptions'
import { readMercadoPagoResource } from '@/lib/recurringPaymentProcessing'
import { isScheduledSubscriptionStaging } from '@/lib/scheduledSubscriptionRuntime'
import { readRecurringReconciliationContext } from '@/lib/subscriptionReconciliation'

export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store' }
const origin = 'https://corre-aqui-git-codex-stagingc-155cef-rgstrondahh-2784s-projects.vercel.app'

function getScope(request) {
  if (!isScheduledSubscriptionStaging() || request.nextUrl.origin !== origin) return null
  try {
    const scope = JSON.parse(process.env.STAGING_FINANCE_TEST_SCOPE || 'null')
    const remaining = scope?.expiresAt - Date.now()
    if (!/^staging-finance-[a-f0-9]{24}$/.test(scope?.uid || '')
      || !/^[a-f0-9]{64}$/.test(scope?.operatorHash || '')
      || !Number.isSafeInteger(scope.expiresAt) || remaining <= 0 || remaining > 4 * 60 * 60_000) return null
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
  return identity?.emailVerified === true && createHash('sha256').update(identity.uid).digest('hex') === scope.operatorHash
}

export async function POST(request) {
  const scope = getScope(request)
  if (!scope) return respond({ error: 'unavailable' }, 404)
  if (!isOperator(await identify(request), scope)) return respond({ error: 'operator_required' }, 403)
  try {
    const auth = getFirebaseAdminAuth()
    const email = `${scope.uid}@example.test`
    let account
    try {
      account = await auth.getUser(scope.uid)
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error
      try {
        account = await auth.createUser({ uid: scope.uid, email, emailVerified: true, displayName: 'Homologação financeira' })
      } catch (error) {
        if (error?.code !== 'auth/uid-already-exists') throw error
        account = await auth.getUser(scope.uid)
      }
    }
    if (account.email !== email || account.disabled || !account.emailVerified || account.providerData.length) {
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
    const context = await readRecurringReconciliationContext({ database, uid: scope.uid, kind: 'client' })
    if (!context) return respond({ status: 'no_test_subscription', allowTestCheckout: identity.uid === scope.uid })
    const { preapprovalId, attempt } = context
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)])
    const subscription = await readMercadoPagoResource('/preapproval', preapprovalId, signal)
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
      const paymentId = resolveAuthorizedPaymentId(invoice)
      const payment = /^\d{1,30}$/.test(paymentId) ? await readMercadoPagoResource('/v1/payments', paymentId, signal) : null
      invoices.push({
        invoice: String(invoice.id || ''),
        status: invoice.status || null,
        debitDate: invoice.debit_date || null,
        payment: payment && {
          id: String(payment.id),
          state: payment.status,
          detail: payment.status_detail,
          amountInCents: Math.round(Number(payment.transaction_amount) * 100),
          currency: payment.currency_id,
          approvedAt: payment.date_approved || null,
          liveMode: typeof payment.live_mode === 'boolean' ? payment.live_mode : null,
          collectorMatches: String(payment.collector_id) === String(attempt.collectorId),
        },
      })
    }
    return respond({
      status: subscription.status,
      nextPaymentDate: subscription.next_payment_date || null,
      intervalMonths: subscription.auto_recurring?.frequency,
      amountInCents: attempt.amountInCents,
      invoices,
    })
  } catch {
    return respond({ error: 'provider_status_unavailable' }, 503)
  }
}
