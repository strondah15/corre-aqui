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
const { runScheduledSubscriptionReconciliation } = await import('../src/lib/scheduledSubscriptionReconciliation.js')
const { referenceKey } = await import('../src/lib/commercialServer.js')
const { nextQuarterlyExpiration } = await import('../src/lib/recurringSubscriptions.js')
const {
  CLIENT_QUARTERLY_PRODUCT_ID,
  getProfessionalSubscriptionStatus,
  PROFESSIONAL_QUARTERLY_PRODUCT_ID,
} = await import('../src/lib/subscriptions.js')

const now = Date.now()
const day = 86_400_000
const minute = 60_000
const runId = randomUUID()
const app = initializeApp({ projectId, databaseURL: `http://${emulatorHost}?ns=${projectId}` }, `subscriptions-${runId}`)
const database = getDatabase(app)
const scheduledProjectId = `${projectId}-scheduled`
const scheduledApp = initializeApp({
  projectId: scheduledProjectId,
  databaseURL: `http://${emulatorHost}?ns=${scheduledProjectId}`,
}, `scheduled-subscriptions-${runId}`)
const scheduledDatabase = getDatabase(scheduledApp)
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
  const response = responses.get(key)
  if (response instanceof Error) throw response
  return typeof response === 'function' ? response() : Response.json(response)
}
process.env.MERCADO_PAGO_ACCESS_TOKEN = mockToken
process.env.SUBSCRIPTION_NOTIFICATIONS_ENABLED = 'false'

function notifyWarning(...values) {
  warnings.push(values)
}

async function seedSubscription(label, planOverrides = {}, providerOverrides = {}, {
  targetDatabase = database, kind = 'professional',
} = {}) {
  const uid = `reconcile-${label}-${runId}`
  const attemptId = `attempt-${label}-${runId}`
  const preapprovalId = `preapproval-${label}-${runId}`
  const productId = kind === 'client' ? CLIENT_QUARTERLY_PRODUCT_ID : PROFESSIONAL_QUARTERLY_PRODUCT_ID
  const amountInCents = kind === 'client' ? 1990 : 4990
  const externalReference = `${productId}:${uid}:${uid}:${attemptId}:emulator`
  const planPath = `users/${uid}/subscriptions/${kind}`
  const historyPath = `subscriptionPaymentHistory/${uid}/${kind}`
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
  await targetDatabase.ref().update({
    [planPath]: plan,
    [attemptPath]: {
      id: attemptId,
      userId: uid,
      targetId: uid,
      productId,
      preapprovalId,
      externalReference,
      amountInCents,
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
    auto_recurring: { frequency: 3, frequency_type: 'months', transaction_amount: amountInCents / 100, currency_id: 'BRL' },
    last_modified: new Date(now - 1_000).toISOString(),
    summarized: { charged_quantity: 0 },
    ...providerOverrides,
  })
  return { uid, plan, planPath, historyPath, attemptId, attemptPath, amountInCents, preapprovalId, preapprovalPath }
}

function reconcile(uid) {
  return reconcileOwnedSubscriptions({ database, uid, kind: 'professional', log: notifyWarning })
}

const scheduleRoot = 'subscriptionReconciliationSchedule'

function invoiceSearch(fixture, offset = 0, limit = 4) {
  const params = new URLSearchParams({ preapproval_id: fixture.preapprovalId, limit: String(limit) })
  if (offset) params.set('offset', String(offset))
  return `/authorized_payments/search?${params}`
}

function providerPayment(fixture, id, paidAt, status = 'approved') {
  responses.set(`/v1/payments/${id}`, {
    id,
    status,
    collector_id: 100,
    application_id: 200,
    payer: { id: 300 },
    currency_id: 'BRL',
    transaction_amount: fixture.amountInCents / 100,
    date_approved: new Date(paidAt).toISOString(),
  })
  return {
    id: `invoice-${id}`,
    preapproval_id: fixture.preapprovalId,
    payment: { id },
    date_created: new Date(paidAt).toISOString(),
  }
}

async function testScheduledReconciliation() {
  let scheduledNow = now
  const logs = []
  const run = () => runScheduledSubscriptionReconciliation({
    database: scheduledDatabase, now: () => scheduledNow, log: (event) => logs.push(event),
  })
  const get = async (path) => (await scheduledDatabase.ref(path).get()).val()

  const professional = await seedSubscription('scheduled-professional', { firstChargeAt: now - day }, {
    summarized: { charged_quantity: 2 },
    next_payment_date: new Date(now + 80 * day).toISOString(),
  }, { targetDatabase: scheduledDatabase })
  const professionalProvider = responses.get(professional.preapprovalPath)
  const paidId = '900000000001'
  const paidAt = now - 1_000
  const paidInvoice = providerPayment(professional, paidId, paidAt)
  const historicalId = '900000000002'
  const historicalInvoice = providerPayment(professional, historicalId, paidAt - 95 * day)
  const firstPage = {
    paging: { offset: 0, total: 6 },
    results: [paidInvoice, paidInvoice, {
      ...paidInvoice, preapproval_id: 'unrelated-preapproval', payment: { id: '999999999999' },
    }, { ...paidInvoice, payment: null }],
  }
  responses.set(invoiceSearch(professional), firstPage)
  responses.set(invoiceSearch(professional, 4), {
    paging: { offset: 4, total: 6 }, results: [paidInvoice, historicalInvoice],
  })

  const terminal = await seedSubscription('scheduled-stale-terminal', {
    providerStatus: 'cancelled', status: 'canceled', canceledAt: now - day,
  }, {}, { targetDatabase: scheduledDatabase })
  const late = await seedSubscription('scheduled-after-cancel', {
    providerStatus: 'cancelled', status: 'canceled', canceledAt: now - day, providerLastModifiedAt: now - day,
  }, { status: 'cancelled', last_modified: new Date(now - day).toISOString() }, {
    targetDatabase: scheduledDatabase,
  })
  const lateId = '900000000003'
  responses.set(invoiceSearch(late), { results: [providerPayment(late, lateId, now - minute)] })

  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  responses.set(professional.preapprovalPath, async () => {
    entered.resolve()
    await release.promise
    return Response.json(professionalProvider)
  })
  const firstRun = run()
  try {
    assert.equal(await Promise.race([
      entered.promise.then(() => 'entered'), firstRun.then(() => 'finished'),
    ]), 'entered', 'the worker starts without an app session or webhook')
    const competing = await Promise.all([run(), run()])
    assert.deepEqual(competing, [{ status: 'busy' }, { status: 'busy' }])
  } finally {
    release.resolve()
  }
  assert.equal((await firstRun).deferred, 0)
  responses.set(professional.preapprovalPath, professionalProvider)
  const firstCalls = calls.splice(0)
  assert.equal(firstCalls.filter((path) => path === `/v1/payments/${paidId}`).length, 1)
  assert.ok(!firstCalls.includes('/v1/payments/999999999999'))
  assert.ok(!firstCalls.includes(invoiceSearch(terminal)), 'stale authorization cannot reopen a terminal plan')
  assert.deepEqual(await get(terminal.planPath), terminal.plan)
  assert.equal((await get(late.planPath)).status, 'canceled')
  assert.equal((await get(late.planPath)).autoRenew, false)
  assert.equal(await get(`${late.planPath}/expiresAt`), null)
  assert.equal((await get(`${late.historyPath}/${referenceKey(lateId)}`)).status, 'approved',
    'a provider-confirmed installment after cancellation is recorded without access')

  const expiresAt = await get(`${professional.planPath}/expiresAt`)
  assert.equal(expiresAt, nextQuarterlyExpiration(paidAt))
  assert.equal((await get(`${scheduleRoot}/jobs/${professional.attemptId}`)).invoiceOffset, 4)
  scheduledNow += 30 * minute
  assert.equal((await run()).deferred, 0)
  const laterCalls = calls.splice(0)
  assert.equal(laterCalls[0], professional.preapprovalPath)
  assert.deepEqual(laterCalls.sort(), [professional.preapprovalPath, invoiceSearch(professional, 4),
    `/v1/payments/${paidId}`, `/v1/payments/${historicalId}`].sort())
  assert.equal(await get(`${professional.planPath}/expiresAt`), expiresAt)
  assert.deepEqual(Object.keys(await get(professional.historyPath)).sort(), [paidId, historicalId].map(referenceKey).sort())
  assert.equal((await get(`${scheduleRoot}/jobs/${professional.attemptId}`)).invoiceOffset, 0)
  assert.equal(await get(`${scheduleRoot}/lease`), null, 'a completed run releases its lock immediately')

  const client = await seedSubscription('scheduled-client-retry', { firstChargeAt: now - day }, {
    summarized: { charged_quantity: 1 },
  }, { targetDatabase: scheduledDatabase, kind: 'client' })
  const clientProvider = responses.get(client.preapprovalPath)
  const clientId = '900000000004'
  const clientInvoice = providerPayment(client, clientId, paidAt, 'in_process')
  const clientInvoices = { paging: { offset: 0, total: 1 }, results: [clientInvoice] }
  responses.set(invoiceSearch(client), clientInvoices)
  responses.set(invoiceSearch(client, 0, 1), clientInvoices)
  await scheduledDatabase.ref(`${scheduleRoot}/inbox/${client.attemptId}`).set(true)

  const rateLimitEnd = scheduledNow + 60 * minute
  responses.set(client.preapprovalPath, () => Response.json({ message: 'upstream-secret-fixture' }, {
    status: 429, headers: { 'Retry-After': new Date(rateLimitEnd).toUTCString() },
  }))
  const rateLimited = await run()
  assert.equal(rateLimited.status, 'complete', `HTTP 429 job should execute, got ${JSON.stringify(rateLimited)}`)
  assert.equal(rateLimited.failures.provider_rate_limited, 1)
  assert.equal(await get(`${scheduleRoot}/inbox/${client.attemptId}`), null)
  assert.deepEqual(calls.splice(0), [client.preapprovalPath])
  assert.ok(Math.abs(await get(`${scheduleRoot}/providerResumeAt`) - rateLimitEnd) < 1_000)
  assert.equal(await get(client.historyPath), null)
  scheduledNow += 30 * minute
  assert.equal((await run()).status, 'provider_cooldown')
  assert.deepEqual(calls.splice(0), [])

  scheduledNow = rateLimitEnd + minute
  responses.set(client.preapprovalPath, new TypeError('network-secret-fixture'))
  const networkFailure = await run()
  assert.equal(networkFailure.failures.reconciliation_failed, 1)
  assert.deepEqual(calls.splice(0), [client.preapprovalPath])
  assert.equal((await get(`${scheduleRoot}/jobs/${client.attemptId}`)).failures, 2)

  scheduledNow += 60 * minute
  responses.set(client.preapprovalPath, clientProvider)
  assert.equal((await run()).deferred, 0)
  assert.deepEqual(calls.splice(0), [client.preapprovalPath, invoiceSearch(client, 0, 1), `/v1/payments/${clientId}`])
  assert.equal(await get(`${client.planPath}/expiresAt`), null, 'in_process is not paid access')
  assert.equal((await get(`${client.historyPath}/${referenceKey(clientId)}`)).status, 'in_process')

  scheduledNow += 30 * minute
  providerPayment(client, clientId, paidAt)
  assert.equal((await run()).deferred, 0)
  assert.equal(await get(`${client.planPath}/expiresAt`), nextQuarterlyExpiration(paidAt))
  assert.equal((await get(`${client.historyPath}/${referenceKey(clientId)}`)).status, 'approved')
  calls.splice(0)

  // Recover a full refund on a canceled authorization and a chargeback on an active one.
  scheduledNow += day
  responses.set(professional.preapprovalPath, {
    ...professionalProvider, status: 'cancelled', last_modified: new Date(scheduledNow).toISOString(),
  })
  providerPayment(professional, paidId, paidAt, 'refunded')
  providerPayment(client, clientId, paidAt, 'charged_back')
  assert.equal((await run()).deferred, 0)
  const refundedPlan = await get(professional.planPath)
  assert.equal(refundedPlan.providerStatus, 'cancelled')
  assert.equal(refundedPlan.autoRenew, false)
  assert.equal(refundedPlan.status, 'refunded')
  assert.equal((await get(`${professional.historyPath}/${referenceKey(paidId)}`)).status, 'refunded')
  assert.equal((await get(`${professional.historyPath}/${referenceKey(historicalId)}`)).status, 'approved')
  assert.equal(await get(`${client.planPath}/status`), 'chargeback')
  assert.equal((await get(`${client.historyPath}/${referenceKey(clientId)}`)).status, 'charged_back')
  assert.equal(await get(`${scheduleRoot}/lease`), null)
  const audit = Object.values(await get('commercialAuditLogs'))
  for (const fixture of [professional, client]) {
    assert.equal(audit.filter((entry) => entry.type === 'quarterly_subscription_activated' && entry.userId === fixture.uid).length, 1)
  }
  assert.doesNotMatch(logs.join(' '), /upstream-secret-fixture|network-secret-fixture|subscription-emulator-test-token|90000000000|reconcile-scheduled/)
  console.log('Scheduled reconciliation Emulator: closed app, overlap, pagination, rate limit, retry, cancellation, refund, chargeback and idempotent ledger PASS (provider mocked)')
}

try {
  const trial = await seedSubscription('trial', {
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

  const paid = await seedSubscription('paid', { firstChargeAt: now - day }, { summarized: { charged_quantity: 1 } })
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
    const fixture = await seedSubscription(label, {
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
  await testScheduledReconciliation()
} finally {
  globalThis.fetch = originalFetch
  if (originalToken === undefined) delete process.env.MERCADO_PAGO_ACCESS_TOKEN
  else process.env.MERCADO_PAGO_ACCESS_TOKEN = originalToken
  if (originalNotifications === undefined) delete process.env.SUBSCRIPTION_NOTIFICATIONS_ENABLED
  else process.env.SUBSCRIPTION_NOTIFICATIONS_ENABLED = originalNotifications
  await deleteApp(app)
  await deleteApp(scheduledApp)
}
