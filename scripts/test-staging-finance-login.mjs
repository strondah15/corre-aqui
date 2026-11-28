import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import { NextRequest } from 'next/server.js'

const modules = {
  '@/lib/commercialServer': `
    export const getAuthenticatedIdentity = async (request) => {
      const uid = request.headers.get('authorization');
      if (!uid) return null;
      const operatorEmails = { 'test-operator': ' Operator@Example.Test ', 'unverified': 'operator@example.test', 'wrong-email': 'other@example.test' };
      return { uid, email: operatorEmails[uid], emailVerified: uid !== 'unverified' };
    };
    export const getCommercialDatabase = () => globalThis.financeDatabase;
    export const parseExternalReference = (value) => {
      const [productId, userId, targetId, attemptId] = value.split(':');
      return attemptId ? { productId, userId, targetId, attemptId } : null;
    };
    export const referenceKey = (value) => Buffer.from(value).toString('base64url');
    export const processRecurringPreapprovalUpdate = (args) => globalThis.financeProcessAuthorization(args);
    export const mercadoPagoApiRequest = async (path, options) => {
      if (!path.startsWith('/authorized_payments/search?') || options.method || options.body) throw new Error('unauthorized provider write');
      return { results: globalThis.financeInvoices };
    };
  `,
  '@/lib/commercialProducts': `export const getCommercialProduct = (id) => ({ id });`,
  '@/lib/firebaseAdmin': `export const getFirebaseAdminAuth = () => globalThis.financeAuth;`,
  '@/lib/recurringPaymentProcessing': `
    export const readMercadoPagoResource = (path, id) => globalThis.financeProviderRead(path, id);
    export const processRecurringInvoicePayment = (args) => globalThis.financeProcessInvoice(args);
  `,
  '@/lib/subscriptionReconciliation': `export const readRecurringReconciliationContext = async () => globalThis.financeContext;`,
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (modules[specifier]) return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(modules[specifier])}` }
    if (specifier.startsWith('@/')) {
      return { shortCircuit: true, url: new URL(`../src/${specifier.slice(2)}.js`, import.meta.url).href }
    }
    return nextResolve(specifier, context)
  },
})

const canonical = 'https://corre-aqui-git-codex-stagingc-155cef-rgstrondahh-2784s-projects.vercel.app'
const uid = 'staging-finance-pro-abc123abc123abc123abc123'
const operator = 'test-operator'
const operatorEmail = 'operator@example.test'
const buyer = 'sandbox-buyer@testuser.com'
const hash = (value) => createHash('sha256').update(value).digest('hex')
const anchorPreapprovalId = '41f2b159e9f04467898f4612800d2960'
const pendingPreapprovalId = 'abcd5678abcd5678abcd5678abcd5678'
const currentCheckoutUrl = `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${pendingPreapprovalId}`
const scope = {
  uid,
  operatorEmailHash: hash(operatorEmail),
  expiresAt: Date.now() + 60_000,
  collectorId: '10000',
  buyerEmailHash: hash(buyer),
  anchorPreapprovalId,
  anchorPreapprovalHash: hash(anchorPreapprovalId),
}
Object.assign(process.env, {
  CORRE_AQUI_ENV: 'staging',
  VERCEL_ENV: 'preview',
  VERCEL_TARGET_ENV: 'preview',
  VERCEL_PROJECT_ID: 'prj_M3gKqNx4UkEzAEgL4pcyoYG5kTUB',
  VERCEL_GIT_COMMIT_REF: 'codex/staging/consolidated-2026-09-07',
  MERCADO_PAGO_CREDENTIAL_ENV: 'test',
  MERCADO_PAGO_ACCESS_TOKEN: 'provider-test-placeholder',
  MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-test-placeholder',
  MERCADO_PAGO_STAGING_BUYER_EMAIL: buyer,
  FIREBASE_ADMIN_CREDENTIALS: '',
  FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-staging',
  FIREBASE_ADMIN_CLIENT_EMAIL: 'test@example.test',
  FIREBASE_ADMIN_PRIVATE_KEY: 'firebase-test-placeholder',
  FIREBASE_ADMIN_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-staging',
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
  STAGING_FINANCE_TEST_SCOPE: JSON.stringify(scope),
})
delete process.env.FIREBASE_DATABASE_EMULATOR_HOST
delete process.env.FIREBASE_AUTH_EMULATOR_HOST

let testSeller = true
let account = null
let accountCreations = 0
let revocations = 0
let attemptIndex = null
let currentUser = null
let paymentHistory = null
let concurrentProfile = null
let seedCommits = 0
let payerCommits = 0
let ledger = null
let refundedAmount = 0
let providerExternalReference = 'synthetic-reference'
let payerTransactionConflict = false
let providerStatus = 'authorized'
let checkoutUrl = currentCheckoutUrl
let authorizationPayer = '20000'
let paymentPayer = '20000'
let providerCollectorId = scope.collectorId
let anchorApp = '680095240238234'
const anchorUid = 'staging-finance-ffaaaaabbddeffffffffffff'
const anchorRef = `CLIENT_QUARTERLY:${anchorUid}:${anchorUid}:attempt-test:001122aabbccddff`
let anchorExternalReference = anchorRef
globalThis.financeContext = null
const invoice = {
  id: '987654', preapproval_id: pendingPreapprovalId, status: 'processed',
  payer_id: '20000', payer: { id: '20000' }, payment: { id: '555555' },
}
const approvedPaymentId = invoice.payment.id
const key = (value) => Buffer.from(value).toString('base64url')
globalThis.financeInvoices = [invoice]
globalThis.financeDatabase = {
  ref(path) {
    let value
    if (path === `commercialCheckoutAttemptsByUser/${uid}`) value = attemptIndex
    else if (path === `subscriptionPaymentHistory/${uid}`) value = paymentHistory
    else if (path === `processedPaymentEvents/${key(`${approvedPaymentId}:approved`)}`) value = ledger
    else if (path === 'commercialCheckoutAttempts/allowed-attempt') {
      return {
        async transaction(update) {
          assert.equal(update(null), null)
          const attempt = globalThis.financeContext.attempt
          const current = payerTransactionConflict ? { ...attempt, payerId: '77777' } : attempt
          const next = update(current)
          if (next !== undefined) {
            globalThis.financeContext.attempt = next
            payerCommits++
          }
          return { committed: next !== undefined, snapshot: { val: () => next ?? current } }
        },
      }
    }
    else if (path === `users/${uid}`) {
      return {
        get: async () => ({ val: () => currentUser }),
        async transaction(update) {
          if (concurrentProfile) currentUser = concurrentProfile
          const next = update(currentUser)
          if (next !== undefined) {
            currentUser = next
            seedCommits++
          }
          return { committed: next !== undefined }
        },
      }
    }
    else if (path.startsWith('commercialAuditLogs/webhook_received_')) value = { createdAt: 1_795_817_000_000 }
    else assert.fail(`Unexpected path: ${path}`)
    return { get: async () => ({ val: () => value }) }
  },
}
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.mercadolibre.com/users/me')
  assert.equal(options.redirect, 'error')
  assert.equal(options.method, undefined)
  return Response.json({ id: Number(providerCollectorId), tags: testSeller ? ['test_user'] : [] })
}
globalThis.financeProviderRead = async (path, id) => {
  if (path === '/preapproval' && id === scope.anchorPreapprovalId) {
    return {
      id, application_id: anchorApp, collector_id: scope.collectorId, payer_id: '20000', status: 'cancelled',
      external_reference: anchorExternalReference,
      auto_recurring: { frequency: 3, frequency_type: 'months', transaction_amount: 19.9, currency_id: 'BRL' },
    }
  }
  if (path === '/preapproval') {
    assert.equal(id, pendingPreapprovalId)
    return {
      id, status: providerStatus, collector_id: scope.collectorId, application_id: '680095240238234',
      payer_id: authorizationPayer, external_reference: providerExternalReference, init_point: checkoutUrl,
      auto_recurring: { frequency: 3, frequency_type: 'months', transaction_amount: 49.9, currency_id: 'BRL' },
    }
  }
  if (path === '/authorized_payments') {
    assert.equal(id, invoice.id)
    return invoice
  }
  assert.equal(path, '/v1/payments')
  assert.equal(id, approvedPaymentId)
  return {
    id, status: 'approved', transaction_amount: 49.9, currency_id: 'BRL', live_mode: true, collector_id: scope.collectorId,
    payer: { id: paymentPayer }, card: { first_six_digits: '423564', last_four_digits: '5682' },
    date_approved: '2026-11-28T10:00:00.000Z', status_detail: 'accredited', transaction_amount_refunded: refundedAmount,
  }
}
globalThis.financeAuth = {
  async getUser(requestedUid) {
    assert.equal(requestedUid, uid)
    if (account) return account
    throw Object.assign(new Error('not_found'), { code: 'auth/user-not-found' })
  },
  async createUser(args) {
    assert.equal(args.uid, uid)
    assert.equal(args.email, `${uid}@example.test`)
    accountCreations++
    account = { ...args, providerData: [] }
    return account
  },
  async createCustomToken(requestedUid) {
    assert.equal(requestedUid, uid)
    return 'synthetic-test-token'
  },
  async revokeRefreshTokens(requestedUid) {
    assert.equal(requestedUid, uid)
    revocations++
  },
}

const { GET, POST, PATCH, DELETE } = await import('../src/app/api/internal/staging-finance-login/route.js')
const request = (method, actor, origin = canonical) => new NextRequest(
  `${origin}/api/internal/staging-finance-login`,
  { method, headers: actor ? { authorization: actor } : {}, ...(method === 'POST' && { body: '{"uid":"ignored"}' }) },
)
assert.equal((await GET(request('GET'))).status, 403)
assert.equal((await POST(request('POST', uid))).status, 403)
assert.equal((await POST(request('POST', 'no-email'))).status, 403)
assert.equal((await POST(request('POST', 'unverified'))).status, 403)
assert.equal((await POST(request('POST', 'wrong-email'))).status, 403)
assert.equal((await DELETE(request('DELETE', 'unrelated'))).status, 403)
assert.equal((await POST(request('POST', operator, 'https://different.vercel.app'))).status, 404)
process.env.STAGING_FINANCE_TEST_SCOPE = JSON.stringify({ ...scope, uid: uid.replace('finance-pro-', 'finance-') })
assert.equal((await POST(request('POST', operator))).status, 404)
process.env.STAGING_FINANCE_TEST_SCOPE = JSON.stringify({ ...scope, anchorPreapprovalHash: hash('different') })
assert.equal((await POST(request('POST', operator))).status, 404)
process.env.STAGING_FINANCE_TEST_SCOPE = JSON.stringify(scope)
process.env.VERCEL_ENV = 'production'
assert.equal((await POST(request('POST', operator))).status, 404)
process.env.VERCEL_ENV = 'preview'
process.env.MERCADO_PAGO_STAGING_BUYER_EMAIL = 'wrong@testuser.com'
assert.equal((await POST(request('POST', operator))).status, 409)
process.env.MERCADO_PAGO_STAGING_BUYER_EMAIL = buyer
testSeller = false
assert.equal((await POST(request('POST', operator))).status, 409)
testSeller = true
providerCollectorId = '11111'
assert.equal((await POST(request('POST', operator))).status, 409)
providerCollectorId = scope.collectorId
anchorApp = 'unrelated'
assert.equal((await POST(request('POST', operator))).status, 409)
anchorApp = '680095240238234'
anchorExternalReference = 'CLIENT_QUARTERLY:unrelated:unrelated:attempt-test:001122aabbccddff'
assert.equal((await POST(request('POST', operator))).status, 409)
anchorExternalReference = anchorRef
assert.equal(accountCreations, 0)

const preflight = await GET(request('GET', operator))
assert.equal(preflight.status, 200)
const preflightReport = await preflight.json()
assert.equal(preflightReport.status, 'no_test_subscription')
assert.equal(preflightReport.amountInCents, 4990)
assert.equal(preflightReport.trial, null)
assert.equal(preflightReport.canOpenCheckout, false)

paymentHistory = { professional: { protected: true } }
assert.equal((await POST(request('POST', operator))).status, 409)
assert.deepEqual(paymentHistory, { professional: { protected: true } })
paymentHistory = null
account = { uid, email: `${uid}@example.test`, emailVerified: true, providerData: [] }
assert.equal((await POST(request('POST', operator))).status, 409)
account = null
concurrentProfile = { name: 'unchanged' }
assert.equal((await POST(request('POST', operator))).status, 409)
assert.deepEqual(currentUser, concurrentProfile)
currentUser = null
concurrentProfile = null
assert.equal(seedCommits, 0)
assert.equal(accountCreations, 0)

assert.equal((await POST(request('POST', operator))).status, 200)
const initialSeed = structuredClone(currentUser)
assert.equal((await POST(request('POST', operator))).status, 200)
assert.equal(accountCreations, 1)
assert.equal(seedCommits, 1)
assert.deepEqual(currentUser, initialSeed)
assert.deepEqual(Object.keys(initialSeed), ['subscriptions'])
assert.deepEqual(Object.keys(initialSeed.subscriptions), ['professional'])
const seededPlan = initialSeed.subscriptions.professional
assert.equal(seededPlan.trialEndsAt - seededPlan.trialStartedAt, 90 * 86_400_000)
assert.equal(seededPlan.stagingProfessionalTrialSeededAt - seededPlan.trialEndsAt, 60_000)
assert.ok(seededPlan.trialEndsAt < Date.now())
const testAccountReady = await (await GET(request('GET', uid))).json()
assert.equal(testAccountReady.canOpenCheckout, true)
assert.equal(testAccountReady.trial.durationDays, 90)
assert.equal(testAccountReady.trial.endedAt, new Date(seededPlan.trialEndsAt).toISOString())

attemptIndex = { 'allowed-attempt': true }
const currentPlan = { ...seededPlan, providerStatus: 'authorized', status: 'active', autoRenew: true, processedPayments: { one: true } }
currentUser.subscriptions.professional = currentPlan
paymentHistory = { professional: { single: true } }
globalThis.financeContext = {
  preapprovalId: pendingPreapprovalId,
  plan: currentPlan,
  attempt: {
    amountInCents: 4990, collectorId: scope.collectorId, applicationId: anchorApp, payerId: '20000', currency: 'BRL',
    productId: 'PROFESSIONAL_QUARTERLY', externalReference: 'synthetic-reference',
  },
}
const afterCheckout = await GET(request('GET', uid))
assert.equal(afterCheckout.status, 200)
const report = await afterCheckout.json()
assert.equal(report.attempts, 1)
assert.equal(report.firebase.processedPayments, 1)
assert.equal(report.providerApplicationMatches, true)
assert.equal(report.providerCollectorMatches, true)
assert.equal(report.providerPayerMatches, true)
assert.equal(report.attemptBuyerMatchesSandbox, true)
assert.equal(report.authorizationBuyerMatchesAttempt, true)
assert.equal(report.trial.durationDays, 90)
assert.equal(report.invoices[0].payment.amountInCents, 4990)
assert.equal(report.invoices[0].invoice, '…7654')
assert.equal(report.invoices[0].payment.id, '…5555')
assert.equal(report.invoices[0].payment.officialTestCard, true)
assert.equal(report.invoices[0].buyerFieldsAgree, true)
assert.equal(report.invoices[0].buyerMatchesAuthorization, true)
assert.equal(report.invoices[0].payment.buyerMatchesInvoice, true)
assert.equal(report.invoices[0].payment.buyerMatchesAuthorization, true)
assert.equal(report.invoices[0].signedReceiptAt, new Date(1_795_817_000_000).toISOString())
assert.equal(report.canRevoke, false)
assert.equal(report.resumeCheckoutUrl, undefined)

paymentPayer = '30000'
const guestModeReport = await (await GET(request('GET', uid))).json()
assert.equal(guestModeReport.invoices[0].buyerMatchesSandbox, true)
assert.equal(guestModeReport.invoices[0].payment.payerMatches, false)
assert.equal(guestModeReport.invoices[0].payment.buyerMatchesInvoice, false)
assert.equal(guestModeReport.invoices[0].payment.buyerMatchesAuthorization, false)
assert.doesNotMatch(JSON.stringify(guestModeReport), /"(20000|30000)"/)
globalThis.financeInvoices = [{ ...invoice, payer: { id: '30000' } }]
const conflictingInvoice = await (await GET(request('GET', uid))).json()
assert.equal(conflictingInvoice.invoices[0].buyerFieldsAgree, false)
assert.equal(conflictingInvoice.invoices[0].buyerMatchesAuthorization, null)
assert.equal(conflictingInvoice.invoices[0].payment.buyerMatchesInvoice, null)
globalThis.financeInvoices = []
paymentPayer = '20000'

providerStatus = 'pending'
currentPlan.providerStatus = 'pending'
currentPlan.autoRenew = false
currentPlan.processedPayments = {}
assert.equal((await (await GET(request('GET', uid))).json()).resumeCheckoutUrl, currentCheckoutUrl)
assert.equal((await (await GET(request('GET', operator))).json()).resumeCheckoutUrl, undefined)
checkoutUrl = currentCheckoutUrl.replace('www.mercadopago.com.br', 'www.mercadopago.com.br.invalid')
assert.equal((await (await GET(request('GET', uid))).json()).resumeCheckoutUrl, undefined)
checkoutUrl = currentCheckoutUrl.replace(pendingPreapprovalId, scope.anchorPreapprovalId)
assert.equal((await (await GET(request('GET', uid))).json()).resumeCheckoutUrl, undefined)
checkoutUrl = currentCheckoutUrl
authorizationPayer = '30000'
const mismatchedAuthorization = await (await GET(request('GET', uid))).json()
assert.equal(mismatchedAuthorization.authorizationBuyerMatchesAttempt, false)
assert.equal(mismatchedAuthorization.providerPayerMatches, false)
assert.equal(mismatchedAuthorization.resumeCheckoutUrl, undefined)
authorizationPayer = '20000'
globalThis.financeInvoices = [invoice]
assert.equal((await (await GET(request('GET', uid))).json()).resumeCheckoutUrl, undefined)
providerStatus = 'authorized'
currentPlan.providerStatus = 'authorized'
currentPlan.autoRenew = true

assert.equal((await DELETE(request('DELETE', uid))).status, 409)
currentPlan.providerStatus = 'cancelled'
currentPlan.autoRenew = false
assert.equal((await DELETE(request('DELETE', uid))).status, 409)
providerStatus = 'cancelled'
assert.equal((await POST(request('POST', operator))).status, 409)
const revoked = await DELETE(request('DELETE', uid))
assert.equal(revoked.status, 200)
assert.deepEqual(await revoked.json(), { revoked: true, signOut: true })
assert.equal(revocations, 1)
assert.equal(seedCommits, 1)
assert.equal(currentUser.subscriptions.professional.trialEndsAt, seededPlan.trialEndsAt)

providerStatus = 'authorized'
providerExternalReference = `PROFESSIONAL_QUARTERLY:${uid}:${uid}:allowed-attempt:001122aabbccddff`
const pendingPlan = {
  ...seededPlan, status: 'pending_authorization', providerStatus: 'pending', autoRenew: false,
  checkoutAttemptId: 'allowed-attempt', preapprovalId: pendingPreapprovalId,
}
currentUser.subscriptions.professional = pendingPlan
globalThis.financeContext = {
  preapprovalId: pendingPreapprovalId,
  plan: pendingPlan,
  attempt: {
    id: 'allowed-attempt', userId: uid, targetId: uid, preapprovalId: pendingPreapprovalId,
    applicationId: anchorApp, collectorId: scope.collectorId, productId: 'PROFESSIONAL_QUARTERLY', amountInCents: 4990,
    currency: 'BRL', externalReference: providerExternalReference, payerId: '30000', providerStatus: 'pending', status: 'checkout_created',
  },
}
ledger = {
  paymentId: approvedPaymentId, externalReference: providerExternalReference, paymentStatus: 'approved', status: 'failed',
  reason: 'payment_subscription_identity_mismatch', identityReview: { payer: true, application: false, invoice: false },
}
assert.equal((await (await GET(request('GET', uid))).json()).canFinalizeSandboxPayer, true)
assert.equal((await (await GET(request('GET', operator))).json()).canFinalizeSandboxPayer, false)
assert.equal((await PATCH(request('PATCH', operator))).status, 403)
assert.equal((await PATCH(request('PATCH', uid, 'https://unrelated.vercel.app'))).status, 404)
ledger.identityReview.application = true
assert.equal((await PATCH(request('PATCH', uid))).status, 409)
ledger.identityReview.application = false
refundedAmount = 0.01
assert.equal((await PATCH(request('PATCH', uid))).status, 409)
refundedAmount = 0
payerTransactionConflict = true
assert.equal((await PATCH(request('PATCH', uid))).status, 409)
payerTransactionConflict = false
assert.equal(payerCommits, 0)

let authorizationProcessing = 0
let paymentProcessing = 0
globalThis.financeProcessAuthorization = async ({ database, subscription }) => {
  assert.equal(database, globalThis.financeDatabase)
  assert.equal(subscription.id, pendingPreapprovalId)
  assert.equal(globalThis.financeContext.attempt.payerId, '20000')
  authorizationProcessing++
  pendingPlan.status = 'pending_payment'
  pendingPlan.providerStatus = 'authorized'
  globalThis.financeContext.attempt.providerStatus = 'authorized'
  return { ok: true }
}
globalThis.financeProcessInvoice = async ({ database, invoice: providerInvoice, preapprovalId }) => {
  assert.equal(database, globalThis.financeDatabase)
  assert.equal(providerInvoice, invoice)
  assert.equal(preapprovalId, pendingPreapprovalId)
  paymentProcessing++
  if (paymentProcessing === 1) {
    ledger.reason = 'processing_error'
    return { ok: false, retryable: true }
  }
  pendingPlan.status = 'active'
  pendingPlan.paymentId = approvedPaymentId
  pendingPlan.expiresAt = Date.parse('2027-02-28T10:00:00.000Z')
  pendingPlan.processedPayments = { [key(approvedPaymentId)]: { paymentId: approvedPaymentId } }
  ledger.status = 'processed'
  ledger.identityReview.resolvedAt = Date.now()
  return { ok: true, activated: true }
}

assert.equal((await PATCH(request('PATCH', uid))).status, 503)
assert.equal(payerCommits, 1)
const finalizedAttempt = globalThis.financeContext.attempt
assert.equal(finalizedAttempt.pendingPayerId, '30000')
assert.equal(finalizedAttempt.payerId, '20000')
assert.match(finalizedAttempt.stagingPayerFinalization.proofHash, /^[a-z0-9]{64}$/)
assert.deepEqual(await (await PATCH(request('PATCH', uid))).json(), { finalized: true, alreadyProcessed: false })
assert.deepEqual(await (await PATCH(request('PATCH', uid))).json(), { finalized: true, alreadyProcessed: true })
assert.equal((await (await GET(request('GET', uid))).json()).canFinalizeSandboxPayer, false)
assert.equal(payerCommits, 1)
assert.equal(authorizationProcessing, 2)
assert.equal(paymentProcessing, 2)
assert.equal(pendingPlan.expiresAt, Date.parse('2027-02-28T10:00:00.000Z'))
assert.equal(pendingPlan.trialEndsAt, seededPlan.trialEndsAt)

process.env.STAGING_FINANCE_TEST_SCOPE = JSON.stringify({ ...scope, expiresAt: Date.now() - 1 })
assert.equal((await GET(request('GET', operator))).status, 404)
console.log('Isolated professional trial, guarded revocation, one-time payer binding, payment proof and retry passed.')
