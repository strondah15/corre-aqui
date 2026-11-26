import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { registerHooks } from 'node:module'
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const projectId = 'demo-corre-aqui-subscriptions'
const emulatorHost = String(process.env.FIREBASE_DATABASE_EMULATOR_HOST || '')
if (!/^(localhost|127\.0\.0\.1):[0-9]{1,5}$/.test(emulatorHost)) {
  throw new Error('Run this test with the local Firebase Realtime Database emulator.')
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@/')) return nextResolve(specifier, context)
    return { shortCircuit: true, url: new URL(`../src/${specifier.slice(2)}.js`, import.meta.url).href }
  },
})

const { reconcileOwnedSubscriptions } = await import('../src/lib/subscriptionReconciliation.js')
const { referenceKey } = await import('../src/lib/commercialServer.js')
const { nextQuarterlyExpiration } = await import('../src/lib/recurringSubscriptions.js')
const { getProfessionalSubscriptionStatus, PROFESSIONAL_QUARTERLY_PRODUCT_ID } = await import('../src/lib/subscriptions.js')

const now = Date.now()
const day = 86_400_000
const runId = randomUUID()
const app = initializeApp({ projectId, databaseURL: `http://${emulatorHost}?ns=${projectId}` }, `subscriptions-${runId}`)
const database = getDatabase(app)
const originalFetch = globalThis.fetch
const originalToken = process.env.MERCADO_PAGO_ACCESS_TOKEN
const originalNotifications = process.env.SUBSCRIPTION_NOTIFICATIONS_ENABLED
const mockToken = 'subscription-emulator-test-token'
const providerOrigin = 'https://api.mercadopago.com'
const calls = []
const responses = new Map()
const warnings = []

async function read(path) {
  return (await database.ref(path).get()).val()
}

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input)
  if (url.origin === `http://${emulatorHost}`) return originalFetch(input, options)
  const key = url.pathname + url.search
  calls.push(key)
  assert.equal(url.origin, providerOrigin, 'all non-emulator network calls are mocked')
  assert.equal(options.method, 'GET', 'reconciliation does not mutate Mercado Pago')
  assert.equal(options.headers?.Authorization, `Bearer ${mockToken}`)
  assert.ok(responses.has(key), `unexpected provider lookup: ${key}`)
  return Response.json(responses.get(key))
}
process.env.MERCADO_PAGO_ACCESS_TOKEN = mockToken
process.env.SUBSCRIPTION_NOTIFICATIONS_ENABLED = 'false'

function notifyWarning(...values) {
  warnings.push(values)
}

async function seedProfessional(label, planOverrides = {}, providerOverrides = {}) {
  const uid = `reconcile-${label}-${runId}`
  const attemptId = `attempt-${label}-${runId}`
  const preapprovalId = `preapproval-${label}-${runId}`
  const productId = PROFESSIONAL_QUARTERLY_PRODUCT_ID
  const externalReference = `${productId}:${uid}:${uid}:${attemptId}:emulator`
  const planPath = `users/${uid}/subscriptions/professional`
  const historyPath = `subscriptionPaymentHistory/${uid}/professional`
  const attemptPath = `commercialCheckoutAttempts/${attemptId}`
  const plan = {
    preapprovalId,
    checkoutAttemptId: attemptId,
    recurringProductId: productId,
    status: 'pending_authorization',
    providerStatus: 'pending',
    providerLastModifiedAt: now - 4_000,
    plan: 'quarterly',
    autoRenew: false,
    ...planOverrides,
  }
  await database.ref().update({
    [planPath]: plan,
    [attemptPath]: {
      id: attemptId,
      userId: uid,
      targetId: uid,
      productId,
      preapprovalId,
      externalReference,
      amountInCents: 4990,
      currency: 'BRL',
      collectorId: '100',
      applicationId: '200',
      payerId: '300',
    },
    [`commercialCheckoutAttemptsBySubscription/${referenceKey(preapprovalId)}`]: attemptId,
  })
  const preapprovalPath = `/preapproval/${preapprovalId}`
  responses.set(preapprovalPath, {
    id: preapprovalId,
    external_reference: externalReference,
    collector_id: 100,
    application_id: 200,
    payer_id: 300,
    status: 'authorized',
    auto_recurring: { frequency: 3, frequency_type: 'months', transaction_amount: 49.9, currency_id: 'BRL' },
    last_modified: new Date(now - 1_000).toISOString(),
    summarized: { charged_quantity: 0 },
    ...providerOverrides,
  })
  return { uid, plan, planPath, historyPath, attemptPath, preapprovalId, preapprovalPath }
}

function reconcile(uid) {
  return reconcileOwnedSubscriptions({ database, uid, kind: 'professional', log: notifyWarning })
}

try {
  const trial = await seedProfessional('trial', {
    trialStartedAt: now - day,
    trialEndsAt: now + 89 * day,
    firstChargeAt: now + 89 * day,
  })
  await reconcile(trial.uid)
  assert.deepEqual(calls.splice(0), [trial.preapprovalPath], 'a trial authorization has no invoice yet')
  const trialPlan = await read(trial.planPath)
  assert.equal(trialPlan.providerStatus, 'authorized')
  assert.equal(trialPlan.autoRenew, true)
  assert.equal(trialPlan.status, 'trial', 'the database retains trial status for direct professional actions')
  assert.equal(trialPlan.trialStartedAt, trial.plan.trialStartedAt)
  assert.equal(trialPlan.trialEndsAt, trial.plan.trialEndsAt)
  const trialAccess = getProfessionalSubscriptionStatus({ subscriptions: { professional: trialPlan } })
  assert.equal(trialAccess.active, false, 'authorization alone is not paid access')
  assert.equal(trialAccess.trialActive, true)
  assert.equal(await read(trial.historyPath), null)

  const paid = await seedProfessional('paid', { firstChargeAt: now - day }, { summarized: { charged_quantity: 1 } })
  const invoicesPath = `/authorized_payments/search?preapproval_id=${paid.preapprovalId}&limit=8`
  const paymentId = String(now)
  const paymentPath = `/v1/payments/${paymentId}`
  const invoice = {
    id: 'invoice-paid',
    preapproval_id: paid.preapprovalId,
    payment: { id: paymentId },
    date_created: new Date(now - 2_000).toISOString(),
  }
  responses.set(invoicesPath, {
    results: [
      invoice,
      { ...invoice, id: 'unrelated-invoice', preapproval_id: trial.preapprovalId, payment: { id: '123456789' } },
      invoice,
    ],
  })
  responses.set(paymentPath, {
    id: paymentId,
    status: 'approved',
    collector_id: 100,
    application_id: 200,
    payer: { id: 300 },
    currency_id: 'BRL',
    transaction_amount: 49.9,
    date_approved: new Date(now - 1_000).toISOString(),
  })
  await Promise.all(Array.from({ length: 6 }, () => reconcile(paid.uid)))
  const paidCalls = calls.splice(0)
  assert.deepEqual(paidCalls.slice(0, 2), [paid.preapprovalPath, invoicesPath], 'the RTDB throttle admits one provider reconciliation')
  assert.ok(paidCalls.length >= 3 && paidCalls.slice(2).every((call) => call === paymentPath), 'only invoices owned by the preapproval are queried')
  const paidPlan = await read(paid.planPath)
  assert.equal(paidPlan.status, 'active')
  assert.equal(paidPlan.expiresAt, nextQuarterlyExpiration(paidPlan.startedAt), 'the same payment adds only one quarter')
  assert.deepEqual(Object.keys(await read(paid.historyPath)), [referenceKey(paymentId)])
  assert.deepEqual(Object.keys(paidPlan.processedPayments), [referenceKey(paymentId)])

  const otherUid = `reconcile-other-owner-${runId}`
  const otherPath = `users/${otherUid}/subscriptions/professional`
  await database.ref(otherPath).set(trial.plan)
  const originalAttempt = await read(trial.attemptPath)
  await reconcile(otherUid)
  assert.deepEqual(calls.splice(0), [], 'the caller cannot reconcile a preapproval belonging to another UID')
  assert.deepEqual(await read(otherPath), trial.plan)
  assert.deepEqual(await read(trial.attemptPath), originalAttempt)

  const staleCases = [
    { label: 'terminal', storedStatus: 'cancelled', receivedStatus: 'authorized', receivedAt: now + 1_000 },
    { label: 'older', storedStatus: 'authorized', receivedStatus: 'paused', receivedAt: now - 1_000 },
  ]
  for (const { label, storedStatus, receivedStatus, receivedAt } of staleCases) {
    const fixture = await seedProfessional(label, {
      providerStatus: storedStatus,
      providerLastModifiedAt: now,
      autoRenew: storedStatus === 'authorized',
    }, { status: receivedStatus, last_modified: new Date(receivedAt).toISOString() })
    await reconcile(fixture.uid)
    assert.deepEqual(calls.splice(0), [fixture.preapprovalPath])
    assert.deepEqual(await read(fixture.planPath), fixture.plan, `${label} provider response cannot overwrite ownership state`)
    assert.equal(await read(fixture.historyPath), null)
  }
  assert.deepEqual(warnings, [], 'valid fixtures reconcile without unexpected provider errors')
  console.log('Subscription reconciliation Emulator: concurrency, idempotent approved payment, trial, owner, terminal state and out-of-order updates PASS')
} finally {
  globalThis.fetch = originalFetch
  if (originalToken === undefined) delete process.env.MERCADO_PAGO_ACCESS_TOKEN
  else process.env.MERCADO_PAGO_ACCESS_TOKEN = originalToken
  if (originalNotifications === undefined) delete process.env.SUBSCRIPTION_NOTIFICATIONS_ENABLED
  else process.env.SUBSCRIPTION_NOTIFICATIONS_ENABLED = originalNotifications
  await deleteApp(app)
}
