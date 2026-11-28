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
import { CLIENT_QUARTERLY_PRICE_CENTS, PROFESSIONAL_QUARTERLY_PRICE_CENTS, PROFESSIONAL_QUARTERLY_PRODUCT_ID, PROFESSIONAL_TRIAL_MS } from '@/lib/subscriptions'

export const runtime = 'nodejs'

const origin = 'https://corre-aqui-git-codex-stagingc-155cef-rgstrondahh-2784s-projects.vercel.app'
const applicationId = '680095240238234'
const kind = 'professional'
const productId = PROFESSIONAL_QUARTERLY_PRODUCT_ID
const amountInCents = PROFESSIONAL_QUARTERLY_PRICE_CENTS
const trialElapsedMs = 60_000
const headers = { 'Cache-Control': 'private, no-store' }
const numericId = /^\d{1,30}$/
const hashFormat = /^[a-f0-9]{64}$/
const anchorIdFormat = /^[a-f0-9]{32}$/
const anchorReference = /^CLIENT_QUARTERLY:(staging-finance-[a-f0-9]{24}):\1:[A-Za-z0-9_-]+:[a-f0-9]{16}$/
const checkoutOrigins = new Set(['https://www.mercadopago.com.br', 'https://sandbox.mercadopago.com.br'])
const digest = (value) => createHash('sha256').update(value).digest('hex')
const sandboxBuyer = () => (process.env.MERCADO_PAGO_STAGING_BUYER_EMAIL || '').trim().toLowerCase()

function getScope(request) {
  if (!isScheduledSubscriptionStaging() || request.nextUrl.origin !== origin) return null
  try {
    const scope = JSON.parse(process.env.STAGING_FINANCE_TEST_SCOPE || 'null')
    const remaining = scope?.expiresAt - Date.now()
    if (!/^staging-finance-pro-[a-f0-9]{24}$/.test(scope?.uid || '')
      || !hashFormat.test(scope.operatorEmailHash || '') || !hashFormat.test(scope.buyerEmailHash || '')
      || typeof scope.collectorId !== 'string' || !numericId.test(scope.collectorId)
      || typeof scope.anchorPreapprovalId !== 'string' || !anchorIdFormat.test(scope.anchorPreapprovalId)
      || !hashFormat.test(scope.anchorPreapprovalHash || '') || digest(scope.anchorPreapprovalId) !== scope.anchorPreapprovalHash
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
  const email = typeof identity?.email === 'string' ? identity.email.trim().toLowerCase() : ''
  return identity?.emailVerified === true && /^[^\s@]+@[^\s@]+$/.test(email) && digest(email) === scope.operatorEmailHash
}

function mayInspect(identity, scope) {
  return identity?.uid === scope.uid || isOperator(identity, scope)
}

function scopedSignal(request, scope) {
  const remaining = Math.max(0, Math.min(10_000, scope.expiresAt - Date.now()))
  return AbortSignal.any([request.signal, AbortSignal.timeout(remaining)])
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

function compareBuyer(left, right) {
  const actual = String(left || '')
  const expected = String(right || '')
  return numericId.test(actual) && numericId.test(expected) ? actual === expected : null
}

function pendingCheckoutUrl({ subscription, preapprovalId, paid, isOwner, buyerConfirmed }) {
  if (subscription.status !== 'pending' || !isOwner || !buyerConfirmed || paid || !anchorIdFormat.test(preapprovalId)) return null
  for (const candidate of [subscription.init_point, subscription.sandbox_init_point]) {
    if (typeof candidate !== 'string') continue
    try {
      const url = new URL(candidate)
      if (checkoutOrigins.has(url.origin) && !url.username && !url.password && !url.hash
        && url.pathname === '/subscriptions/checkout'
        && url.searchParams.get('preapproval_id') === preapprovalId && url.searchParams.size === 1) {
        return url.href
      }
    } catch {
      // The provider may omit one URL variant.
    }
  }
  return null
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
  const recurring = anchor?.auto_recurring
  if (String(seller.id) !== scope.collectorId || !Array.isArray(seller.tags) || !seller.tags.includes('test_user')
    || String(anchor?.collector_id) !== scope.collectorId || String(anchor?.application_id) !== applicationId
    || !numericId.test(payerId) || payerId === scope.collectorId
    || !isTerminalRecurringCancellation(anchor?.status)
    || !anchorReference.test(anchor?.external_reference || '') || recurring?.currency_id !== 'BRL'
    || Number(recurring?.frequency) !== 3 || recurring?.frequency_type !== 'months'
    || Number(recurring?.transaction_amount) !== CLIENT_QUARTERLY_PRICE_CENTS / 100
    || (anchor.payer_email && String(anchor.payer_email).trim().toLowerCase() !== buyerEmail)) return null
  return { payerId }
}

function readSeededTrial(plan, now = Date.now()) {
  const seededAt = plan?.stagingProfessionalTrialSeededAt
  const trialStartedAt = plan?.trialStartedAt
  const trialEndsAt = plan?.trialEndsAt
  if (![seededAt, trialStartedAt, trialEndsAt].every(Number.isSafeInteger)
    || trialStartedAt <= 0 || trialEndsAt >= now || seededAt > now
    || trialEndsAt !== seededAt - trialElapsedMs || trialEndsAt - trialStartedAt !== PROFESSIONAL_TRIAL_MS) return null
  return {
    startedAt: safeDate(trialStartedAt),
    endedAt: safeDate(trialEndsAt),
    seededAt: safeDate(seededAt),
    durationDays: PROFESSIONAL_TRIAL_MS / 86_400_000,
  }
}

async function readTestState(database, uid) {
  const [index, userSnapshot, historySnapshot] = await Promise.all([
    database.ref(`commercialCheckoutAttemptsByUser/${uid}`).get(),
    database.ref(`users/${uid}`).get(),
    database.ref(`subscriptionPaymentHistory/${uid}`).get(),
  ])
  const user = userSnapshot.val()
  const currentPlan = user?.subscriptions?.[kind]
  const historyKinds = Object.keys(historySnapshot.val() || {})
  const attempts = Object.keys(index.val() || {})
  const seed = readSeededTrial(currentPlan)
  const onlyProfessional = Object.keys(user?.subscriptions || {}).every((item) => item === kind)
    && historyKinds.every((item) => item === kind)
  const context = onlyProfessional && seed && attempts.length === 1
    ? await readRecurringReconciliationContext({ database, uid, kind, expectedAttemptId: attempts[0], currentPlan })
    : null
  const vacant = attempts.length === 0 && historyKinds.length === 0 && !user
  const seeded = attempts.length === 0 && historyKinds.length === 0 && onlyProfessional && Boolean(seed)
    && currentPlan.status === 'trial' && currentPlan.plan === 'quarterly'
    && !currentPlan.preapprovalId && !currentPlan.paymentId && !currentPlan.autoRenew
    && !currentPlan.checkoutAttemptId && !currentPlan.processedPayments
    && !currentPlan.startedAt && !currentPlan.expiresAt
  return { vacant, seeded, seed, attempts, context }
}

async function seedExpiredTrial(database, uid, expiresAt) {
  const seededAt = Date.now()
  const trialEndsAt = seededAt - trialElapsedMs
  const plan = {
    status: 'trial',
    plan: 'quarterly',
    trialStartedAt: trialEndsAt - PROFESSIONAL_TRIAL_MS,
    trialEndsAt,
    stagingProfessionalTrialSeededAt: seededAt,
    updatedAt: seededAt,
  }
  // A missing whole user record proves that no other information is overwritten.
  await database.ref(`users/${uid}`).transaction((existing) =>
    existing === null && Date.now() < expiresAt ? { subscriptions: { [kind]: plan } } : undefined)
}

function validateTestAttempt(context, scope) {
  if (!context) return false
  const { attempt, preapprovalId } = context
  return preapprovalId !== scope.anchorPreapprovalId && attempt.productId === productId
    && attempt.amountInCents === amountInCents && attempt.currency === 'BRL'
    && String(attempt.collectorId) === scope.collectorId && String(attempt.applicationId) === applicationId
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
    const sandbox = await verifySandbox(scope, scopedSignal(request, scope))
    if (!sandbox) return respond({ error: 'sandbox_binding_unconfirmed' }, 409)
    const database = getCommercialDatabase()
    const auth = getFirebaseAdminAuth()
    let state = await readTestState(database, scope.uid)
    if (state.vacant) {
      if (await getTestAccount(auth, scope.uid, false)) return respond({ error: 'test_uid_already_exists' }, 409)
      await seedExpiredTrial(database, scope.uid, scope.expiresAt)
      state = await readTestState(database, scope.uid)
      if (!state.seeded) return respond({ error: 'trial_seed_conflict' }, 409)
    }
    const linked = validateTestAttempt(state.context, scope)
      && compareBuyer(state.context.attempt.payerId, sandbox.payerId) === true
    if (!state.seeded && (!linked || isTerminalRecurringCancellation(state.context.plan.providerStatus))) {
      return respond({ error: 'test_session_closed' }, 409)
    }
    if (Date.now() >= scope.expiresAt) return respond({ error: 'unavailable' }, 404)
    if (!await getTestAccount(auth, scope.uid, state.seeded)) return respond({ error: 'test_identity_missing' }, 409)
    if (Date.now() >= scope.expiresAt) return respond({ error: 'unavailable' }, 404)
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
  const identity = await getAuthenticatedIdentity(request).catch(() => null)
  if (!mayInspect(identity, scope)) {
    return respond({ error: 'operator_required' }, 403)
  }
  try {
    const signal = scopedSignal(request, scope)
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
    if (state.vacant || state.seeded) {
      return respond({
        ...verified,
        status: 'no_test_subscription',
        attempts: 0,
        canOpenCheckout: state.seeded && identity.uid === scope.uid,
        canRevoke: true,
        trial: state.seed,
        invoices: [],
      })
    }
    const context = state.context
    if (!validateTestAttempt(context, scope)) return respond({ error: 'test_subscription_mismatch' }, 409)
    const { preapprovalId, attempt, plan } = context
    const subscription = await readMercadoPagoResource('/preapproval', preapprovalId, signal)
    const validation = validateRecurringPreapproval({ subscription, attempt, product: getCommercialProduct(productId) })
    // A payer mismatch is safe to expose as booleans in this read-only report; it never qualifies for resuming checkout.
    if (validation.errors.some((error) => error !== 'payer_mismatch')) {
      return respond({ error: 'provider_identity_mismatch' }, 502)
    }
    const authorizationPayer = subscription.payer_id
    const authorizationMatchesSandbox = compareBuyer(authorizationPayer, sandbox.payerId)
    const attemptMatchesSandbox = compareBuyer(attempt.payerId, sandbox.payerId)
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
      const invoiceBuyerFieldsAgree = compareBuyer(invoice.payer_id, invoice.payer?.id)
      const invoicePayer = invoiceBuyerFieldsAgree === false
        ? null : invoice.payer_id || invoice.payer?.id
      invoices.push({
        invoice: maskId(invoiceId),
        status: safeStatus(invoice.status),
        debitDate: safeDate(invoice.debit_date),
        signedReceiptAt,
        buyerFieldsAgree: invoiceBuyerFieldsAgree,
        buyerMatchesSandbox: compareBuyer(invoicePayer, sandbox.payerId),
        buyerMatchesAuthorization: compareBuyer(invoicePayer, authorizationPayer),
        payment: payment && {
          id: maskId(paymentId),
          state: safeStatus(payment.status),
          amountInCents: Math.round(Number(payment.transaction_amount) * 100),
          currency: payment.currency_id === 'BRL' ? 'BRL' : null,
          approvedAt: safeDate(payment.date_approved),
          liveMode: typeof payment.live_mode === 'boolean' ? payment.live_mode : null,
          collectorMatches: String(payment.collector_id) === scope.collectorId,
          payerMatches: compareBuyer(payment.payer?.id, sandbox.payerId),
          buyerMatchesAuthorization: compareBuyer(payment.payer?.id, authorizationPayer),
          buyerMatchesInvoice: compareBuyer(payment.payer?.id, invoicePayer),
          officialTestCard: payment.card?.first_six_digits && payment.card?.last_four_digits
            ? String(payment.card.first_six_digits) === '423564' && String(payment.card.last_four_digits) === '5682'
            : null,
          signedReceiptAt: await readReceipt(database, 'payment', paymentId),
        },
      })
    }
    const resumeCheckoutUrl = pendingCheckoutUrl({
      subscription,
      preapprovalId,
      paid: invoices.length > 0 || Boolean(plan.paymentId) || Object.keys(plan.processedPayments || {}).length > 0,
      isOwner: identity.uid === scope.uid,
      buyerConfirmed: authorizationMatchesSandbox === true && attemptMatchesSandbox === true
        && plan.providerStatus === 'pending' && plan.autoRenew === false,
    })
    return respond({
      ...verified,
      status: safeStatus(subscription.status),
      providerApplicationMatches: String(subscription.application_id) === applicationId,
      providerCollectorMatches: String(subscription.collector_id) === scope.collectorId,
      providerPayerMatches: authorizationMatchesSandbox,
      attemptBuyerMatchesSandbox: attemptMatchesSandbox,
      authorizationBuyerMatchesAttempt: compareBuyer(authorizationPayer, attempt.payerId),
      ...(resumeCheckoutUrl ? { resumeCheckoutUrl } : {}),
      approval: `…${preapprovalId.slice(-4)}`,
      signedAuthorizationReceiptAt: await readReceipt(database, 'subscription_preapproval', preapprovalId),
      nextPaymentDate: safeDate(subscription.next_payment_date),
      firstChargeAt: safeDate(attempt.firstChargeAt),
      trial: state.seed,
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
    if (!state.vacant && !state.seeded) {
      const signal = scopedSignal(request, scope)
      const sandbox = await verifySandbox(scope, signal)
      const context = state.context
      if (!sandbox || !validateTestAttempt(context, scope)
        || compareBuyer(context.attempt.payerId, sandbox.payerId) !== true
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
    const account = await getTestAccount(auth, scope.uid, false)
    if (Date.now() >= scope.expiresAt) return respond({ error: 'unavailable' }, 404)
    if (account) await auth.revokeRefreshTokens(scope.uid)
    return respond({ revoked: true, signOut: identity.uid === scope.uid })
  } catch {
    return respond({ error: 'test_session_revocation_failed' }, 503)
  }
}
