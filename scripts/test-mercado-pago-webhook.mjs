import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { registerHooks } from 'node:module'
import { NextRequest } from 'next/server.js'

const signatureModule = new URL('../src/lib/mercadoPagoWebhookSignature.js', import.meta.url).href
const serverModule = `
import { verifyMercadoPagoHmacSignature } from ${JSON.stringify(signatureModule)}
const state = globalThis.commercialWebhookTestState
export function safeText(value) { return String(value || '').trim() }
export function getCommercialDatabase() {
  state.calls.push('database')
  return {}
}
export function verifyMercadoPagoSignature(input) {
  return verifyMercadoPagoHmacSignature({ ...input, secret: process.env.MERCADO_PAGO_WEBHOOK_SECRET })
}
export async function writeCommercialAudit(database, event) {
  state.calls.push(['audit', event])
}
export async function mercadoPagoApiRequest(path, { signal }) {
  if (!(signal instanceof AbortSignal)) throw new Error('provider_timeout_missing')
  state.calls.push(['provider', path])
  const value = state.provider.get(path)
  if (value instanceof Error) throw value
  return value
}
export async function processRecurringPreapprovalUpdate({ subscription }) {
  state.calls.push(['subscription', subscription.id])
  return { ok: state.acceptSubscription }
}
export async function processApprovedCommercialPayment({ payment, recurringInvoicePreapprovalId }) {
  state.calls.push(['payment', payment.id, recurringInvoicePreapprovalId || null])
  if (state.paymentLeaseActive) return { ok: true, duplicate: true, retryable: true }
  if (state.processed.has(payment.id)) return { ok: true, duplicate: true }
  state.processed.add(payment.id)
  return { ok: true, activated: true }
}
`

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context)
    if (specifier === '@/lib/commercialServer') {
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(serverModule)}` }
    }
    if (specifier.startsWith('@/')) {
      return { shortCircuit: true, url: new URL(`../src/${specifier.slice(2)}.js`, import.meta.url).href }
    }
    return nextResolve(specifier, context)
  },
})

const secret = 'test-only-webhook-secret'
const reqId = 'request-do-not-log'
const timestamp = '1795731300'
const environment = {
  CORRE_AQUI_ENV: 'staging',
  VERCEL_ENV: 'preview',
  FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-staging',
  FIREBASE_ADMIN_CREDENTIALS: '',
  FIREBASE_ADMIN_CLIENT_EMAIL: 'owner@fixture.test',
  FIREBASE_ADMIN_PRIVATE_KEY: 'test-only-key',
  FIREBASE_ADMIN_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-staging',
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
  MERCADO_PAGO_CREDENTIAL_ENV: 'test',
  MERCADO_PAGO_CHECKOUT_ENABLED: 'false',
  MERCADO_PAGO_WEBHOOK_SECRET: secret,
  MERCADO_PAGO_ACCESS_TOKEN: 'test-only-provider-token',
}
Object.assign(process.env, environment)
const state = {
  calls: [],
  provider: new Map(),
  processed: new Set(),
  acceptSubscription: true,
}
globalThis.commercialWebhookTestState = state
const { POST } = await import('../src/app/api/mercado-pago/webhook/route.js')

const warnings = []
const originalWarn = console.warn
console.warn = (message) => warnings.push(JSON.parse(message))

function makeRequest(id, query, body, alterSignature = (value) => value) {
  const manifest = `id:${id};request-id:${reqId};ts:${timestamp};`
  const hash = createHmac('sha256', secret).update(manifest).digest('hex')
  return new NextRequest(`https://preview.example.test/api/mercado-pago/webhook?${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': reqId,
      'x-signature': alterSignature(`ts=${timestamp},v1=${hash}`),
    },
    body: JSON.stringify(body),
  })
}

try {
  const payment = { type: 'payment', data: { id: '123' } }
  const paymentQuery = 'data.id=123&type=payment'
  const rawIncorrect = await POST(makeRequest('123', paymentQuery, payment, (value) => value + 'zz'))
  assert.equal(rawIncorrect.status, 401, 'HMAC malformado é rejeitado integralmente')
  const duplicateTimestamp = await POST(makeRequest('123', paymentQuery, payment, (value) => `${value},ts=${timestamp}`))
  assert.equal(duplicateTimestamp.status, 401, 'timestamp ambíguo é rejeitado')
  assert.equal((await POST(makeRequest('123', 'id=123&topic=payment', payment))).status, 401, 'IPN sem data.id assinado permanece bloqueado')
  assert.equal((await POST(makeRequest('123', 'data.id=123&data.id=124&type=payment', payment))).status, 400)
  assert.equal(warnings.at(-1).signatureVerified, false)
  assert.equal((await POST(makeRequest('123', paymentQuery, { ...payment, data: { id: '124' } }))).status, 400)
  assert.equal(warnings.at(-1).reason, 'inconsistent_webhook_resource')
  assert.equal((await POST(makeRequest('123', 'data.id=123&type=subscription_preapproval', payment))).status, 400)
  const simulatorId = 'PRE-SIMULATOR'
  const conflictingRecurringTopic = await POST(makeRequest(
    simulatorId,
    `data.id=${simulatorId}&type=subscription_authorized_payment`,
    { type: 'subscription_preapproval', entity: 'preapproval', data: { id: simulatorId } },
  ))
  assert.equal(conflictingRecurringTopic.status, 400)
  assert.equal((await conflictingRecurringTopic.json()).error, 'inconsistent_webhook_topic')
  assert.deepEqual(warnings.at(-1), {
    event: 'mercado_pago_webhook_malformed',
    reason: 'inconsistent_webhook_topic',
    signatureVerified: true,
  })
  assert.equal((await POST(makeRequest('123', paymentQuery, { ...payment, padding: 'x'.repeat(70_000) }))).status, 413)
  const unknown = await POST(makeRequest('123', 'data.id=123&type=subscription_preapproval_plan', { data: { id: 123 } }))
  assert.equal(unknown.status, 200)
  assert.equal((await unknown.json()).ignored, true)
  assert.deepEqual(state.calls, [], 'identificadores conflitantes e assinaturas inválidas não consultam Firebase ou Mercado Pago')

  process.env.VERCEL_ENV = 'production'
  assert.equal((await POST(makeRequest('123', paymentQuery, payment))).status, 503)
  process.env.VERCEL_ENV = environment.VERCEL_ENV
  process.env.MERCADO_PAGO_CREDENTIAL_ENV = 'production'
  assert.equal((await POST(makeRequest('123', paymentQuery, payment))).status, 503)
  process.env.MERCADO_PAGO_CREDENTIAL_ENV = environment.MERCADO_PAGO_CREDENTIAL_ENV
  assert.deepEqual(state.calls, [], 'ambientes divergentes falham antes do acesso')

  state.provider.set('/v1/payments/123', { id: 123 })
  const approved = await POST(makeRequest('123', 'data.id=123&topic=payments', { ...payment, action: 'valor-externo-nao-auditado' }))
  assert.equal(approved.status, 200)
  assert.equal((await approved.json()).activated, true)
  const receivedAudit = state.calls.find((call) => Array.isArray(call) && call[0] === 'audit')[1]
  assert.equal(receivedAudit.statusAfter, 'received')
  assert.equal(receivedAudit.eventId, 'webhook_received_payment_123')
  const repeated = await POST(makeRequest('123', paymentQuery, payment))
  assert.equal((await repeated.json()).duplicate, true)
  state.paymentLeaseActive = true
  const processingLease = await POST(makeRequest('123', paymentQuery, payment))
  assert.equal(processingLease.status, 503, 'entrega concorrente com processamento em andamento não confirma descarte')
  assert.equal(warnings.at(-1).stage, 'apply_payment')
  state.paymentLeaseActive = false

  const preapproval = 'PRE-MiXeD'
  const recurringQuery = `data.id=${preapproval}&type=subscription_preapproval`
  state.provider.set(`/preapproval/${preapproval}`, { id: preapproval })
  assert.equal((await POST(makeRequest(preapproval, recurringQuery, {
    type: 'subscription_preapproval', data: { id: preapproval },
  }))).status, 200)
  assert.ok(state.calls.some((call) => Array.isArray(call) && call[0] === 'subscription' && call[1] === preapproval))

  const invoiceId = '88'
  const invoiceQuery = `data.id=${invoiceId}&type=subscription_authorized_payment`
  state.provider.set('/authorized_payments/88', { id: 88, preapproval_id: preapproval, payment: { id: 456 } })
  state.provider.set('/v1/payments/456', { id: 456 })
  state.acceptSubscription = false
  state.calls.length = 0
  const unrelatedInvoice = await POST(makeRequest(invoiceId, invoiceQuery, { data: { id: invoiceId } }))
  assert.equal((await unrelatedInvoice.json()).paymentProcessed, false)
  assert.ok(!state.calls.some((call) => Array.isArray(call) && call[1] === '/v1/payments/456'))
  state.acceptSubscription = true
  const linkedInvoice = await POST(makeRequest(invoiceId, invoiceQuery, { data: { id: invoiceId } }))
  assert.equal((await linkedInvoice.json()).paymentProcessed, true)
  assert.deepEqual(state.calls.at(-1), ['payment', 456, preapproval])

  state.calls.length = 0
  state.provider.set('/authorized_payments/88', { id: 89, preapproval_id: preapproval, payment: { id: 456 } })
  const wrongInvoice = await POST(makeRequest(invoiceId, invoiceQuery, { data: { id: invoiceId } }))
  assert.equal(wrongInvoice.status, 503)
  assert.deepEqual(state.calls.at(-1), ['provider', '/authorized_payments/88'])

  state.provider.set('/v1/payments/123', Object.assign(new Error('upstream-sensitive-detail'), { status: 429 }))
  const upstreamFailure = await POST(makeRequest('123', paymentQuery, payment))
  assert.equal(upstreamFailure.status, 503)
  assert.deepEqual(await upstreamFailure.json(), { ok: false, error: 'mercado_pago_webhook_retry' })
  assert.deepEqual(warnings.at(-1), {
    event: 'mercado_pago_webhook_retry',
    type: 'payment',
    stage: 'read_payment',
    status: 429,
  })
  assert.doesNotMatch(JSON.stringify(warnings), /upstream-sensitive-detail|request-do-not-log|test-only/)
} finally {
  console.warn = originalWarn
  delete globalThis.commercialWebhookTestState
}

console.log('Mercado Pago webhook route tests passed.')
