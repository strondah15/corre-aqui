import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      return {
        shortCircuit: true,
        url: new URL(`../src/${specifier.slice(2)}.js`, import.meta.url).href,
      }
    }
    return nextResolve(specifier, context)
  },
})

const {
  CLIENT_QUARTERLY_PRICE_CENTS,
  CLIENT_QUARTERLY_PRODUCT_ID,
  PROFESSIONAL_QUARTERLY_PRICE_CENTS,
  PROFESSIONAL_QUARTERLY_PRODUCT_ID,
  PROFESSIONAL_TRIAL_MS,
  getClientSubscriptionStatus,
  getProfessionalSubscriptionStatus,
} = await import('../src/lib/subscriptions.js')
const { getCommercialProduct } = await import('../src/lib/commercialProducts.js')
const {
  buildRecurringPreapprovalPayload,
  nextQuarterlyExpiration,
  resolveAuthorizedPaymentId,
  resolveInvoicePreapprovalId,
  shouldApplyProviderUpdate,
  validateRecurringPreapproval,
} = await import('../src/lib/recurringSubscriptions.js')
const {
  buildSubscriptionNotification,
  materializeSubscriptionNotification,
  subscriptionNotificationsEnabled,
} = await import('../src/lib/subscriptionNotifications.js')
const {
  cancelMercadoPagoRecurringSubscription,
  createMercadoPagoRecurringCheckout,
  processApprovedCommercialPayment,
  processRecurringPreapprovalUpdate,
  referenceKey,
} = await import('../src/lib/commercialServer.js')
const { defaultClientSubscription, ensureProfessionalTrial, readSubscriptionAccessSummary } = await import('../src/lib/subscriptionServer.js')

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function createMemoryDatabase(initial = {}) {
  let root = clone(initial) || {}
  let pushIndex = 0
  const parts = (path = '') => String(path).split('/').filter(Boolean)
  const read = (path) => parts(path).reduce((value, key) => value?.[key], root)
  const write = (path, value) => {
    const pathParts = parts(path)
    if (!pathParts.length) {
      root = clone(value) || {}
      return
    }
    let cursor = root
    pathParts.slice(0, -1).forEach((key) => {
      if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {}
      cursor = cursor[key]
    })
    const key = pathParts.at(-1)
    if (value === null) delete cursor[key]
    else cursor[key] = clone(value)
  }
  const snapshot = (value) => ({ val: () => clone(value), exists: () => value !== undefined && value !== null })
  const ref = (path = '') => ({
    key: parts(path).at(-1) || null,
    get: async () => snapshot(read(path)),
    set: async (value) => write(path, value),
    update: async (value) => {
      if (!parts(path).length) {
        Object.entries(value || {}).forEach(([childPath, childValue]) => write(childPath, childValue))
        return
      }
      const current = read(path)
      write(path, { ...(current && typeof current === 'object' ? current : {}), ...clone(value) })
    },
    transaction: async (callback) => {
      const current = clone(read(path)) ?? null
      const next = callback(current)
      if (next === undefined) return { committed: false, snapshot: snapshot(current) }
      write(path, next)
      return { committed: true, snapshot: snapshot(next) }
    },
    push: () => {
      pushIndex += 1
      return ref(`${path}/${`push-${pushIndex}`}`)
    },
  })
  return { ref, dump: () => clone(root), read: (path) => clone(read(path)) }
}

function stagingEnvironment() {
  return {
    CORRE_AQUI_ENV: 'staging',
    VERCEL_ENV: 'preview',
    MERCADO_PAGO_CHECKOUT_ENABLED: 'true',
    MERCADO_PAGO_CREDENTIAL_ENV: 'test',
    MERCADO_PAGO_ACCESS_TOKEN: 'test-token-not-real',
    MERCADO_PAGO_WEBHOOK_SECRET: 'test-secret-not-real',
    SITE_URL: 'https://preview.example.test',
    NEXT_PUBLIC_SITE_URL: 'https://preview.example.test',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-staging',
    NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
    FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-staging',
    FIREBASE_ADMIN_CLIENT_EMAIL: 'test@example.test',
    FIREBASE_ADMIN_PRIVATE_KEY: 'not-a-real-private-key',
    FIREBASE_ADMIN_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
  }
}

async function withEnvironment(env, callback) {
  const original = {}
  for (const [key, value] of Object.entries(env)) {
    original[key] = process.env[key]
    process.env[key] = value
  }
  try {
    return await callback()
  } finally {
    for (const key of Object.keys(env)) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  }
}

assert.equal(CLIENT_QUARTERLY_PRICE_CENTS, 1990)
assert.equal(PROFESSIONAL_QUARTERLY_PRICE_CENTS, 4990)
assert.equal(PROFESSIONAL_TRIAL_MS, 90 * 24 * 60 * 60 * 1000)
assert.equal(getCommercialProduct(CLIENT_QUARTERLY_PRODUCT_ID).frequency, 3)
const professionalProduct = getCommercialProduct(PROFESSIONAL_QUARTERLY_PRODUCT_ID)
assert.equal(professionalProduct.frequencyType, 'months')
assert.equal(professionalProduct.displayPrice.replace(/\s+/g, ' '), 'R$ 49,90')

const payloadAttempt = {
  productId: CLIENT_QUARTERLY_PRODUCT_ID,
  externalReference: 'CLIENT_QUARTERLY:user-a:user-a:attempt-a:nonce',
  amountInCents: 1990,
  currency: 'BRL',
}
const payload = buildRecurringPreapprovalPayload({
  product: getCommercialProduct(CLIENT_QUARTERLY_PRODUCT_ID),
  attempt: payloadAttempt,
  payerEmail: 'payer@example.test',
  siteOrigin: 'https://preview.example.test',
  now: Date.UTC(2026, 0, 1),
})
assert.deepEqual(payload.auto_recurring, {
  frequency: 3,
  frequency_type: 'months',
  transaction_amount: 19.9,
  currency_id: 'BRL',
})
assert.equal(payload.status, 'pending')
assert.equal(payload.back_url, 'https://preview.example.test/?checkout=success')
assert.equal(Object.hasOwn(payload, 'card_token_id'), false)

const trialFirstCharge = Date.UTC(2026, 3, 1)
const professionalAttempt = {
  productId: PROFESSIONAL_QUARTERLY_PRODUCT_ID,
  externalReference: 'PROFESSIONAL_QUARTERLY:user-b:user-b:attempt-b:nonce',
  amountInCents: 4990,
  currency: 'BRL',
}
const professionalCheckoutInput = {
  product: professionalProduct,
  attempt: professionalAttempt,
  payerEmail: 'pro@example.test',
  siteOrigin: 'https://preview.example.test',
  firstChargeAt: trialFirstCharge,
  now: Date.UTC(2026, 0, 1),
}
const professionalPayload = buildRecurringPreapprovalPayload(professionalCheckoutInput)
assert.equal(professionalPayload.auto_recurring.start_date, new Date(trialFirstCharge).toISOString())
assert.equal(professionalPayload.auto_recurring.transaction_amount, 49.9)
const previousPriceAttempt = { ...professionalAttempt, amountInCents: 5000 }
assert.throws(() => buildRecurringPreapprovalPayload({ ...professionalCheckoutInput, attempt: previousPriceAttempt }), /recurring_checkout_price_mismatch/)

const previousPreapproval = {
  id: 'previous-authorization',
  external_reference: professionalAttempt.externalReference,
  auto_recurring: { ...professionalPayload.auto_recurring, transaction_amount: 50 },
}
assert.equal(validateRecurringPreapproval({ subscription: previousPreapproval, attempt: previousPriceAttempt, product: professionalProduct }).valid, true)
assert.deepEqual(validateRecurringPreapproval({ subscription: previousPreapproval, attempt: professionalAttempt, product: professionalProduct }).errors, ['amount_mismatch'])

const validPreapproval = {
  id: 'preapproval-a',
  external_reference: payloadAttempt.externalReference,
  status: 'pending',
  auto_recurring: payload.auto_recurring,
}
assert.equal(validateRecurringPreapproval({
  subscription: validPreapproval,
  attempt: payloadAttempt,
  product: getCommercialProduct(CLIENT_QUARTERLY_PRODUCT_ID),
}).valid, true)
assert.equal(validateRecurringPreapproval({
  subscription: { ...validPreapproval, auto_recurring: { ...payload.auto_recurring, frequency: 1 } },
  attempt: payloadAttempt,
  product: getCommercialProduct(CLIENT_QUARTERLY_PRODUCT_ID),
}).valid, false)

const trialStart = Date.UTC(2026, 0, 31)
const trialDatabase = createMemoryDatabase({ users: { 'pro-user': {} } })
const trial = await ensureProfessionalTrial(trialDatabase, 'pro-user', trialStart)
assert.equal(trial.trialEndsAt, trialStart + PROFESSIONAL_TRIAL_MS, 'gratuidade profissional usa 90 dias exatos')

const legacyClient = getClientSubscriptionStatus({ subscriptions: { client: { status: 'active', plan: 'annual', expiresAt: trialStart + 1_000_000 } } }, trialStart)
assert.equal(legacyClient.active, true, 'beneficio anual legado permanece valido')
const canceledQuarterly = getClientSubscriptionStatus({ subscriptions: { client: { status: 'active', plan: 'quarterly', expiresAt: trialStart + 1_000_000, autoRenew: false, providerStatus: 'canceled' } } }, trialStart)
assert.equal(canceledQuarterly.active, true, 'cancelamento preserva o periodo pago')
assert.equal(canceledQuarterly.autoRenew, false)
const preservedRecurringClient = defaultClientSubscription({
  status: 'active',
  plan: 'quarterly',
  preapprovalId: 'preapproval-preserved',
  autoRenew: true,
  processedPayments: { safe: { paymentId: 'payment-preserved' } },
})
assert.equal(preservedRecurringClient.preapprovalId, 'preapproval-preserved')
assert.equal(preservedRecurringClient.autoRenew, true)
assert.equal(preservedRecurringClient.processedPayments.safe.paymentId, 'payment-preserved')

assert.equal(nextQuarterlyExpiration(Date.UTC(2026, 0, 31)), Date.UTC(2026, 3, 30), 'periodo trimestral respeita calendario')
assert.equal(resolveAuthorizedPaymentId({ payment: { id: 123 } }), '123')
assert.equal(resolveInvoicePreapprovalId({ preapproval_id: 'preapproval-a' }), 'preapproval-a')
assert.equal(shouldApplyProviderUpdate({ providerLastModifiedAt: '2026-02-01T00:00:00Z' }, { last_modified: '2026-01-01T00:00:00Z' }), false)

const checkoutDatabase = createMemoryDatabase({ users: { 'user-a': { clientFreeOrderUsed: true } } })
let postCount = 0
let releaseSearch
const searchGate = new Promise((resolve) => { releaseSearch = resolve })
const originalFetch = globalThis.fetch
globalThis.fetch = async (url, options = {}) => {
  const path = String(url)
  if (path.includes('/preapproval/search')) {
    await searchGate
    return new Response(JSON.stringify({ results: [] }), { status: 200 })
  }
  if (path.endsWith('/preapproval') && options.method === 'POST') {
    postCount += 1
    const body = JSON.parse(options.body)
    return new Response(JSON.stringify({
      id: 'preapproval-created',
      external_reference: body.external_reference,
      status: 'pending',
      init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=preapproval-created',
      collector_id: 321,
      application_id: 654,
      auto_recurring: body.auto_recurring,
      date_created: '2026-01-01T00:00:00Z',
    }), { status: 201 })
  }
  if (path.includes('/preapproval/preapproval-created')) {
    const attempt = checkoutDatabase.read('commercialCheckoutAttempts/push-1')
    return new Response(JSON.stringify({
      id: 'preapproval-created',
      external_reference: attempt.externalReference,
      status: 'pending',
      init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=preapproval-created',
      collector_id: 321,
      application_id: 654,
      auto_recurring: { frequency: 3, frequency_type: 'months', transaction_amount: 19.9, currency_id: 'BRL' },
      date_created: '2026-01-01T00:00:00Z',
    }), { status: 200 })
  }
  throw new Error(`unexpected fetch ${path}`)
}

try {
  await withEnvironment(stagingEnvironment(), async () => {
    const product = getCommercialProduct(CLIENT_QUARTERLY_PRODUCT_ID)
    const first = createMercadoPagoRecurringCheckout({ database: checkoutDatabase, userId: 'user-a', product, payerEmail: 'payer@example.test' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = createMercadoPagoRecurringCheckout({ database: checkoutDatabase, userId: 'user-a', product, payerEmail: 'payer@example.test' })
    releaseSearch()
    const results = await Promise.allSettled([first, second])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1, 'duas criacoes simultaneas geram um checkout')
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
    assert.equal(postCount, 1, 'provider recebe um unico POST')
    const retry = await createMercadoPagoRecurringCheckout({ database: checkoutDatabase, userId: 'user-a', product, payerEmail: 'payer@example.test' })
    assert.equal(retry.checkout.reused, true, 'repeticao reutiliza preapproval existente')
    assert.equal(postCount, 1)
  })
} finally {
  globalThis.fetch = originalFetch
}

const attemptId = 'attempt-quarterly'
const externalReference = `${CLIENT_QUARTERLY_PRODUCT_ID}:user-pay:user-pay:${attemptId}:nonce`
const paymentDatabase = createMemoryDatabase({
  commercialCheckoutAttempts: {
    [attemptId]: {
      id: attemptId,
      userId: 'user-pay',
      productId: CLIENT_QUARTERLY_PRODUCT_ID,
      targetId: 'user-pay',
      externalReference,
      amountInCents: 1990,
      currency: 'BRL',
      preapprovalId: 'preapproval-pay',
      collectorId: '321',
    },
  },
})
const approvedPayment = {
  id: 'payment-quarterly',
  status: 'approved',
  external_reference: externalReference,
  transaction_amount: 19.9,
  currency_id: 'BRL',
  collector_id: 321,
  date_approved: '2026-01-31T12:00:00Z',
}
const paymentNow = Date.UTC(2026, 0, 31, 12)
const originalNow = Date.now
Date.now = () => paymentNow
try {
  const [left, right] = await Promise.all([
    processApprovedCommercialPayment({ database: paymentDatabase, payment: approvedPayment }),
    processApprovedCommercialPayment({ database: paymentDatabase, payment: approvedPayment }),
  ])
  assert.equal([left, right].filter((result) => result.duplicate === true).length, 1)
  assert.equal(paymentDatabase.read('users/user-pay/subscriptions/client/expiresAt'), Date.UTC(2026, 3, 30, 12))
  assert.equal(Object.keys(paymentDatabase.read('users/user-pay/subscriptions/client/processedPayments')).length, 1)
  assert.equal(Object.keys(paymentDatabase.read('subscriptionPaymentHistory/user-pay/client')).length, 1)
} finally {
  Date.now = originalNow
}

const providerAttempt = paymentDatabase.read(`commercialCheckoutAttempts/${attemptId}`)
const authorizedSubscription = {
  id: 'preapproval-pay',
  external_reference: externalReference,
  status: 'authorized',
  collector_id: 321,
  application_id: 654,
  next_payment_date: '2026-04-30T12:00:00Z',
  last_modified: '2026-02-01T00:00:00Z',
  auto_recurring: { frequency: 3, frequency_type: 'months', transaction_amount: 19.9, currency_id: 'BRL' },
}
Date.now = () => Date.UTC(2026, 1, 1)
try {
  assert.equal((await processRecurringPreapprovalUpdate({ database: paymentDatabase, subscription: authorizedSubscription })).ok, true)
  const stalePending = { ...authorizedSubscription, status: 'pending', last_modified: '2026-01-01T00:00:00Z' }
  assert.equal((await processRecurringPreapprovalUpdate({ database: paymentDatabase, subscription: stalePending })).ignoredOutOfOrder, true)
  assert.equal(paymentDatabase.read('users/user-pay/subscriptions/client/providerStatus'), 'authorized')
  assert.equal(providerAttempt.userId, 'user-pay')

  const rejectedRenewal = {
    ...approvedPayment,
    id: 'payment-quarterly-rejected',
    status: 'rejected',
    date_approved: null,
  }
  assert.equal((await processApprovedCommercialPayment({ database: paymentDatabase, payment: rejectedRenewal })).activated, false)
  assert.equal(paymentDatabase.read('users/user-pay/subscriptions/client/status'), 'active', 'falha de renovacao nao encerra periodo ja pago')
  assert.equal(paymentDatabase.read('users/user-pay/subscriptions/client/renewalStatus'), 'payment_failed')
} finally {
  Date.now = originalNow
}

const secondApproved = {
  ...approvedPayment,
  id: 'payment-quarterly-second',
  date_approved: '2026-04-30T12:00:00Z',
  date_last_updated: '2026-04-30T12:00:00Z',
}
Date.now = () => Date.UTC(2026, 3, 30, 12)
try {
  assert.equal((await processApprovedCommercialPayment({ database: paymentDatabase, payment: secondApproved })).activated, true)
  assert.equal(paymentDatabase.read('users/user-pay/subscriptions/client/expiresAt'), Date.UTC(2026, 6, 30, 12))
  const lateRejected = { ...secondApproved, status: 'rejected' }
  await processApprovedCommercialPayment({ database: paymentDatabase, payment: lateRejected })
  assert.equal(paymentDatabase.read('users/user-pay/subscriptions/client/lastPaymentStatus'), 'approved', 'evento antigo nao rebaixa pagamento aprovado')

  const olderRejected = {
    ...approvedPayment,
    id: 'payment-quarterly-older-rejected',
    status: 'rejected',
    date_approved: null,
    date_created: '2026-02-01T00:00:00Z',
    date_last_updated: '2026-02-01T00:00:00Z',
  }
  await processApprovedCommercialPayment({ database: paymentDatabase, payment: olderRejected })
  assert.equal(paymentDatabase.read('users/user-pay/subscriptions/client/lastPaymentStatus'), 'approved', 'falha antiga de outro paymentId nao rebaixa renovacao nova')

  const oldRefund = {
    ...approvedPayment,
    status: 'refunded',
    date_last_updated: '2026-05-01T00:00:00Z',
  }
  const refundResult = await processApprovedCommercialPayment({ database: paymentDatabase, payment: oldRefund })
  assert.equal(refundResult.ended, false, 'estorno de periodo antigo nao encerra periodo renovado')
  assert.equal(paymentDatabase.read('users/user-pay/subscriptions/client/status'), 'active')
  assert.equal(paymentDatabase.read('users/user-pay/subscriptions/client/expiresAt'), Date.UTC(2026, 6, 30, 12))
} finally {
  Date.now = originalNow
}

for (const amountInCents of [4990, 5000]) {
  const attempt = {
    ...professionalAttempt,
    id: 'attempt-b',
    userId: 'user-b',
    targetId: 'user-b',
    preapprovalId: 'professional-pay',
    collectorId: '321',
    amountInCents,
  }
  const database = createMemoryDatabase({ commercialCheckoutAttempts: { [attempt.id]: attempt } })
  const payment = { ...approvedPayment, id: 'professional-payment', external_reference: attempt.externalReference }
  const wrongAmount = amountInCents === 4990 ? 50 : 49.9
  const invalid = await processApprovedCommercialPayment({ database, payment: { ...payment, id: 'wrong-price', transaction_amount: wrongAmount } })
  assert.equal(invalid.reason, 'invalid_amount_or_currency')
  assert.equal(database.read('users/user-b/subscriptions/professional'), undefined)

  const chargedAmount = { ...payment, transaction_amount: amountInCents / 100 }
  assert.equal((await processApprovedCommercialPayment({ database, payment: chargedAmount })).activated, true)
  assert.equal((await processApprovedCommercialPayment({ database, payment: chargedAmount })).duplicate, true)
  const payments = Object.values(database.read('subscriptionPaymentHistory/user-b/professional'))
  assert.deepEqual(payments.map((entry) => entry.amountInCents), [amountInCents])
  console.log(`Professional webhook validates ${amountInCents} cents against its original checkout and applies payment once`)
}

const paidUntil = Date.now() + 10 * 86_400_000
const cancelDatabase = createMemoryDatabase({
  users: {
    'cancel-user': {
      subscriptions: {
        professional: {
          status: 'active',
          plan: 'quarterly',
          expiresAt: paidUntil,
          autoRenew: false,
          providerStatus: 'pending',
          preapprovalId: 'preapproval-cancel',
          recurringProductId: PROFESSIONAL_QUARTERLY_PRODUCT_ID,
          checkoutAttemptId: 'attempt-cancel',
        },
      },
    },
  },
  commercialCheckoutAttempts: {
    'attempt-cancel': {
      id: 'attempt-cancel',
      userId: 'cancel-user',
      productId: PROFESSIONAL_QUARTERLY_PRODUCT_ID,
      targetId: 'cancel-user',
      externalReference: `${PROFESSIONAL_QUARTERLY_PRODUCT_ID}:cancel-user:cancel-user:attempt-cancel:nonce`,
      amountInCents: 5000,
      currency: 'BRL',
      preapprovalId: 'preapproval-cancel',
      collectorId: '321',
    },
  },
  subscriptionCheckoutLocks: {
    'cancel-user': {
      professional: {
        status: 'ready',
        productId: PROFESSIONAL_QUARTERLY_PRODUCT_ID,
        preapprovalId: 'preapproval-cancel',
        attemptId: 'attempt-cancel',
      },
    },
  },
})
const cancelFetch = globalThis.fetch
let cancelPutCount = 0
let replacementPostCount = 0
let previousStatus = 'pending'
globalThis.fetch = async (url, options = {}) => {
  if (String(url).endsWith('/preapproval') && options.method === 'POST') {
    replacementPostCount += 1
    const body = JSON.parse(options.body)
    assert.equal(body.auto_recurring.transaction_amount, 49.9)
    assert.equal(body.auto_recurring.start_date, new Date(paidUntil).toISOString())
    return Response.json({
      id: 'preapproval-new',
      external_reference: body.external_reference,
      status: 'pending',
      init_point: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=preapproval-new',
      auto_recurring: body.auto_recurring,
    }, { status: 201 })
  }
  assert.ok(String(url).endsWith('/preapproval/preapproval-cancel'))
  const attempt = cancelDatabase.read('commercialCheckoutAttempts/attempt-cancel')
  if (options.method === 'PUT') {
    assert.deepEqual(JSON.parse(options.body), { status: 'canceled' })
    cancelPutCount += 1
    previousStatus = 'canceled'
  }
  return new Response(JSON.stringify({
    id: 'preapproval-cancel',
    external_reference: attempt.externalReference,
    status: previousStatus,
    collector_id: 321,
    application_id: 654,
    last_modified: previousStatus === 'canceled' ? '2026-05-01T00:00:00Z' : '2026-04-30T00:00:00Z',
    auto_recurring: { frequency: 3, frequency_type: 'months', transaction_amount: 50, currency_id: 'BRL' },
  }), { status: 200 })
}
try {
  const env = stagingEnvironment()
  const request = { database: cancelDatabase, userId: 'cancel-user', product: professionalProduct, payerEmail: 'pro@example.test' }
  await withEnvironment(env, async () => {
    const baseline = cancelDatabase.dump()
    const status = await readSubscriptionAccessSummary(cancelDatabase, request.userId, Date.now(), env)
    assert.equal(status.subscriptions.professional.recurringAmountInCents, 5000)
    await assert.rejects(createMercadoPagoRecurringCheckout(request), { message: 'subscription_checkout_previous_price', status: 409 })
    assert.equal(replacementPostCount, 0)
    assert.deepEqual(cancelDatabase.dump(), baseline, 'new consent at R$ 49.90 does not change an old R$ 50 authorization')

    const canceled = await cancelMercadoPagoRecurringSubscription({ database: cancelDatabase, userId: request.userId, kind: 'professional' })
    assert.equal(canceled.canceled, true)
    assert.equal(cancelDatabase.read('users/cancel-user/subscriptions/professional/autoRenew'), false)
    assert.equal(cancelDatabase.read('users/cancel-user/subscriptions/professional/status'), 'active')
    assert.equal(cancelDatabase.read('users/cancel-user/subscriptions/professional/expiresAt'), paidUntil)

    const oldAttempt = cancelDatabase.read('commercialCheckoutAttempts/attempt-cancel')
    const replacement = await createMercadoPagoRecurringCheckout(request)
    assert.notEqual(replacement.attempt.externalReference, oldAttempt.externalReference)
    assert.equal(replacement.attempt.amountInCents, 4990)
    assert.deepEqual(cancelDatabase.read('commercialCheckoutAttempts/attempt-cancel'), oldAttempt)
    assert.equal(cancelDatabase.read('users/cancel-user/subscriptions/professional/expiresAt'), paidUntil)
  })
} finally {
  globalThis.fetch = cancelFetch
}
assert.equal(cancelPutCount, 1)
assert.equal(replacementPostCount, 1)
console.log('Old R$ 50 authorization and paid term are preserved; a new checkout at R$ 49.90 requires a separate authorization')

assert.equal(
  getClientSubscriptionStatus({
    subscriptions: { client: { status: 'active', plan: 'quarterly', expiresAt: Date.UTC(2025, 0, 1) } },
  }, Date.UTC(2026, 0, 1)).status,
  'expired',
  'assinatura vencida nao pode conservar rotulo active',
)

const notificationDatabase = createMemoryDatabase()
assert.equal(subscriptionNotificationsEnabled({ SUBSCRIPTION_NOTIFICATIONS_ENABLED: 'false' }), false)
const disabledNotification = await materializeSubscriptionNotification({
  database: notificationDatabase,
  env: { SUBSCRIPTION_NOTIFICATIONS_ENABLED: 'false' },
  uid: 'notification-user',
  kind: 'client',
  type: 'payment_approved',
  reference: 'payment-safe-reference',
})
assert.equal(disabledNotification.skipped, true)
assert.equal(notificationDatabase.read('notifications'), undefined, 'sandbox nao envia notificacao financeira automaticamente')

const notificationInput = {
  database: notificationDatabase,
  env: { SUBSCRIPTION_NOTIFICATIONS_ENABLED: 'true' },
  uid: 'notification-user',
  kind: 'client',
  type: 'payment_approved',
  reference: 'payment-safe-reference',
  occurredAt: Date.UTC(2026, 0, 1),
  accessUntil: Date.UTC(2026, 3, 1),
}
const notification = buildSubscriptionNotification(notificationInput)
assert.equal(Object.hasOwn(notification, 'token'), false)
assert.equal(notification.delivery, 'in_app_only')
assert.equal((await materializeSubscriptionNotification(notificationInput)).stored, true)
assert.equal((await materializeSubscriptionNotification(notificationInput)).idempotent, true)
assert.equal(Object.keys(notificationDatabase.read('notifications/notification-user')).length, 1)
assert.equal(Object.keys(notificationDatabase.read('notificacoes/notification-user')).length, 1)

const checkoutRoute = await readFile(new URL('../src/app/api/planos/checkout/route.js', import.meta.url), 'utf8')
const cancelRoute = await readFile(new URL('../src/app/api/subscriptions/cancel/route.js', import.meta.url), 'utf8')
const webhookRoute = await readFile(new URL('../src/app/api/mercado-pago/webhook/route.js', import.meta.url), 'utf8')
const statusCard = await readFile(new URL('../src/components/SubscriptionStatusCard.jsx', import.meta.url), 'utf8')
assert.match(checkoutRoute, /autoRenewConsent !== true/)
assert.match(checkoutRoute, /getAuthenticatedIdentity\(request\)/)
assert.doesNotMatch(checkoutRoute, /body\?\.(?:uid|userId|amount|amountInCents|price|preco)/)
assert.match(cancelRoute, /getAuthenticatedUid\(request\)/)
assert.match(webhookRoute, /subscription_preapproval/)
assert.match(webhookRoute, /subscription_authorized_payment/)
assert.match(statusCard, /renovação automática/i)
assert.match(statusCard, /Cancelar renovação automática/)

const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules
assert.equal(rules.commercialCheckoutAttempts?.['.read'], false)
assert.equal(rules.processedPaymentEvents?.['.write'], false)
assert.equal(rules.subscriptionPaymentHistory, undefined, 'nova raiz permanece server-only pelo deny padrao')
assert.equal(rules.serverSubscriptionNotificationEvents, undefined, 'reservas de notificacao permanecem server-only pelo deny padrao')

console.log('recurring subscription tests passed')
