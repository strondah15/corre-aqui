import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  createRecurringPayerBinding,
  getVerifiedRecurringPayerId,
  validateRecurringPayerBindingCandidate,
  validateRecurringPayerInvoice,
} from '../src/lib/recurringPayerBinding.js'
import { CLIENT_QUARTERLY_PRODUCT_ID, PROFESSIONAL_QUARTERLY_PRODUCT_ID } from '../src/lib/subscriptions.js'

const buyer = 'sandbox@testuser.com'
const initialPayerId = '20001'
const finalPayerId = '20002'
const buyerPin = (email, id) => createHash('sha256').update(`${email}\n${id}`).digest('hex')
const pin = buyerPin(buyer, finalPayerId)
const env = {
  CORRE_AQUI_ENV: 'staging',
  VERCEL_ENV: 'preview',
  VERCEL_TARGET_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'codex/staging/consolidated-2026-09-07',
  VERCEL_PROJECT_ID: 'prj_M3gKqNx4UkEzAEgL4pcyoYG5kTUB',
  FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-staging',
  FIREBASE_ADMIN_CLIENT_EMAIL: 'service@example.test',
  FIREBASE_ADMIN_PRIVATE_KEY: 'test-placeholder',
  FIREBASE_ADMIN_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-staging',
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
  MERCADO_PAGO_CREDENTIAL_ENV: 'test',
  MERCADO_PAGO_ACCESS_TOKEN: 'test-placeholder',
  MERCADO_PAGO_STAGING_BUYER_EMAIL: ` ${buyer.toUpperCase()} `,
  MERCADO_PAGO_STAGING_BUYER_BINDING_SHA256: pin.toUpperCase(),
}

const pending = { status: 'pending', payer_id: Number(initialPayerId) }
const capture = (input = {}) => createRecurringPayerBinding({ subscription: pending, payerEmail: buyer, env, ...input })
const binding = capture()
assert.deepEqual(binding, { initialPayerId, buyerBindingSha256: pin })
assert.deepEqual(capture({ payerEmail: buyer.toUpperCase() }), binding)
for (const invalidEnv of [
  { CORRE_AQUI_ENV: 'production' },
  { VERCEL_ENV: 'production' },
  { VERCEL_TARGET_ENV: 'production' },
  { VERCEL_GIT_COMMIT_REF: 'an-unrelated-preview-branch' },
  { VERCEL_PROJECT_ID: 'a-different-project' },
  { FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-3f9ec' },
  { NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://corre-aqui-3f9ec-default-rtdb.firebaseio.com' },
  { MERCADO_PAGO_CREDENTIAL_ENV: 'production' },
  { MERCADO_PAGO_STAGING_BUYER_EMAIL: 'buyer@example.test' },
  { MERCADO_PAGO_STAGING_BUYER_BINDING_SHA256: undefined },
  { MERCADO_PAGO_STAGING_BUYER_BINDING_SHA256: 'x'.repeat(64) },
]) {
  assert.equal(capture({ env: { ...env, ...invalidEnv } }), null)
}
assert.equal(capture({ payerEmail: 'another@testuser.com' }), null)
assert.equal(capture({ subscription: { ...pending, status: 'authorized' } }), null)
for (const payerId of [null, 0, '0', '0011', -1, 'x', Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(capture({ subscription: { ...pending, payer_id: payerId } }), null)
}

assert.equal(getVerifiedRecurringPayerId(), '')
assert.equal(getVerifiedRecurringPayerId({ payerId: initialPayerId }), initialPayerId)
assert.equal(getVerifiedRecurringPayerId({ payerId: initialPayerId, payerBinding: binding }), initialPayerId)
assert.equal(getVerifiedRecurringPayerId({ payerId: initialPayerId, payerBinding: { ...binding, finalPayerId: '0' } }), '')
assert.equal(getVerifiedRecurringPayerId({ payerId: initialPayerId, payerBinding: { ...binding, finalPayerId } }), finalPayerId)
assert.equal(getVerifiedRecurringPayerId({ payerId: '20003', payerBinding: { ...binding, finalPayerId } }), '')

for (const product of [
  { id: CLIENT_QUARTERLY_PRODUCT_ID, amountInCents: 1990 },
  { id: PROFESSIONAL_QUARTERLY_PRODUCT_ID, amountInCents: 4990 },
]) {
  const attempt = {
    preapprovalId: 'sandbox-subscription', collectorId: '20003', applicationId: '20004', payerId: initialPayerId,
    productId: product.id, amountInCents: product.amountInCents, currency: 'BRL', payerBinding: binding,
    externalReference: `${product.id}:test-uid:test-uid:test-attempt:0000000000000000`,
  }
  const subscription = {
    id: attempt.preapprovalId, collector_id: Number(attempt.collectorId), application_id: attempt.applicationId,
    payer_id: Number(finalPayerId), payer_email: buyer, status: 'authorized', external_reference: attempt.externalReference,
    auto_recurring: { frequency: 3, frequency_type: 'months', currency_id: 'BRL', transaction_amount: product.amountInCents / 100 },
  }
  const invoice = { id: '30001', status: 'processed', preapproval_id: subscription.id, payment: { id: 30002 } }
  const payment = {
    id: '30002', status: 'approved', status_detail: 'accredited', collector_id: attempt.collectorId, payer: { id: finalPayerId },
    transaction_amount: product.amountInCents / 100, currency_id: 'BRL', date_approved: '2026-11-28T15:00:00-03:00',
    application_id: attempt.applicationId, live_mode: true,
  }
  const seller = { id: Number(attempt.collectorId), tags: ['test_user'] }
  const candidate = (input = {}) => validateRecurringPayerBindingCandidate({ attempt, subscription, product, env, ...input })
  const evidence = (input = {}) => validateRecurringPayerInvoice({ attempt, subscription, invoice, payment, seller, product, env, ...input })
  const confirmed = { finalPayerId, invoiceId: invoice.id, paymentId: payment.id }
  assert.equal(candidate(), finalPayerId)
  assert.equal(candidate({ subscription: { ...subscription, payer_email: undefined } }), finalPayerId)
  assert.equal(candidate({ attempt: { ...attempt, payerId: finalPayerId, payerBinding: { ...binding, initialPayerId: finalPayerId } } }), finalPayerId)
  assert.equal(candidate({ attempt: { ...attempt, payerBinding: { ...binding, finalPayerId } } }), finalPayerId)
  assert.equal(candidate({ attempt: { ...attempt, payerBinding: undefined } }), '')
  assert.equal(candidate({ attempt: { ...attempt, payerBinding: { ...binding, finalPayerId: '99999' } } }), '')
  assert.equal(candidate({ env: { ...env, MERCADO_PAGO_STAGING_BUYER_BINDING_SHA256: buyerPin(buyer, initialPayerId) } }), '')
  for (const invalid of [
    { id: 'different' }, { status: 'pending' }, { payer_id: initialPayerId }, { payer_email: 'another@testuser.com' },
    { application_id: '99999' }, { collector_id: '99999' }, { external_reference: 'wrong' },
    { auto_recurring: { ...subscription.auto_recurring, frequency: 12 } },
    { auto_recurring: { ...subscription.auto_recurring, transaction_amount: 1 } },
  ]) {
    assert.equal(candidate({ subscription: { ...subscription, ...invalid } }), '')
  }
  assert.deepEqual(evidence(), confirmed)
  assert.deepEqual(evidence({ payment: { ...payment, application_id: undefined, external_reference: '' } }), confirmed)
  assert.deepEqual(evidence({ invoice: { ...invoice, payer_id: finalPayerId, payer: { id: finalPayerId } } }), confirmed)
  for (const invalid of [
    { status: 'pending' }, { preapproval_id: 'wrong' }, { payment: { id: '99999' } }, { id: '0' },
    { payer_id: initialPayerId }, { payer: { id: initialPayerId } }, { payment_id: '99999' }, { subscription_id: 'wrong' },
  ]) {
    assert.equal(evidence({ invoice: { ...invoice, ...invalid } }), null)
  }
  for (const invalid of [
    { id: '99999' }, { status: 'refunded' }, { status_detail: 'partially_refunded' }, { status_detail: 'in_dispute' },
    { transaction_amount_refunded: 0.01 }, { refunds: [{ id: '1' }] }, { chargebacks: [{ id: '1' }] }, { dispute_id: '1' },
    { date_approved: 'not-a-date' }, { collector_id: '99999' }, { payer: { id: initialPayerId } },
    { application_id: '99999' }, { external_reference: 'wrong' }, { transaction_amount: 1 }, { currency_id: 'USD' },
  ]) {
    assert.equal(evidence({ payment: { ...payment, ...invalid } }), null)
  }
  assert.equal(evidence({ seller: { ...seller, tags: [] } }), null)
  assert.equal(evidence({ seller: { ...seller, id: '99999' } }), null)
  const cancelled = { ...subscription, status: 'cancelled', last_modified: '2026-11-28T18:00:00Z' }
  assert.equal(candidate({ subscription: cancelled }), '')
  assert.equal(candidate({ subscription: cancelled, allowTerminal: true }), finalPayerId)
  assert.deepEqual(evidence({ subscription: cancelled }), confirmed)
  const staleCancellation = { ...cancelled, last_modified: '2026-11-28T17:59:59Z' }
  assert.equal(evidence({ subscription: staleCancellation }), null)
  assert.equal(evidence({ subscription: { ...cancelled, last_modified: undefined } }), null)
}

console.log('Recurring payer binding passed for both quarterly products, sandbox isolation, reversals and late cancellation evidence.')
