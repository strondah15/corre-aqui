import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import { NextRequest } from 'next/server.js'

const stubModules = {
  '@/lib/commercialServer': `
    export const getCommercialDatabase = () => ({ ref: (path) => {
      assertForFinanceLogin(path === 'commercialAuditLogs/webhook_received_subscription_authorized_payment_2');
      return { get: async () => ({ val: () => null }) };
    } });
    export const getAuthenticatedIdentity = async (request) => {
      const uid = request.headers.get('authorization');
      if (!uid) throw new Error('missing_token');
      return { uid, emailVerified: uid !== 'unverified' };
    };
    export const mercadoPagoApiRequest = async (path) => {
      assertForFinanceLogin(path.startsWith('/authorized_payments/search?'));
      return { results: [
        { id: 1, preapproval_id: 'another', payment: { id: 123 } },
        { id: 2, preapproval_id: globalThis.financeTestApproval, payment: { id: 456 } },
      ] };
    };
  `,
  '@/lib/firebaseAdmin': `export const getFirebaseAdminAuth = () => globalThis.financeLoginAuth;`,
  '@/lib/commercialProducts': `export const getCommercialProduct = () => ({});`,
  '@/lib/subscriptionReconciliation': `
    export const readRecurringReconciliationContext = async () => ({
      preapprovalId: globalThis.financeTestApproval,
      attempt: { amountInCents: 1990, collectorId: '10000', payerId: '20000', productId: 'CLIENT_QUARTERLY' },
      plan: { providerStatus: globalThis.financeTestStatus, autoRenew: globalThis.financeTestStatus === 'authorized' },
    });
  `,
  '@/lib/recurringSubscriptions': `
    export const resolveAuthorizedPaymentId = (invoice) => String(invoice.payment?.id || '');
    export const resolveInvoicePreapprovalId = (invoice) => invoice.preapproval_id;
    export const validateRecurringPreapproval = () => ({ valid: true });
    export const isTerminalRecurringCancellation = (status) => ['canceled','cancelled'].includes(status);
  `,
  '@/lib/recurringPaymentProcessing': `
    export const readMercadoPagoResource = async (path, id) => {
      if (path === '/preapproval') return { status: globalThis.financeTestStatus, auto_recurring: { frequency: 3 }, payer_id: 20000 };
      assertForFinanceLogin(path === '/v1/payments' && id === '456');
      return { id, status: 'approved', transaction_amount: 19.90, currency_id: 'BRL', live_mode: true, collector_id: 10000, payer: { id: 20000 }, card: { first_six_digits: '423564', last_four_digits: '5682' } };
    };
  `,
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (stubModules[specifier]) {
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(stubModules[specifier])}` }
    }
    if (specifier.startsWith('@/')) {
      return { shortCircuit: true, url: new URL(`../src/${specifier.slice(2)}.js`, import.meta.url).href }
    }
    return nextResolve(specifier, context)
  },
})

const { POST, GET, DELETE } = await import('../src/app/api/internal/staging-finance-login/route.js')
const uid = 'staging-finance-abcdefabcdefabcdef7d6714'
const operator = 'test-operator'
const scope = { uid, operatorHash: createHash('sha256').update(operator).digest('hex'), expiresAt: Date.now() + 60_000 }
Object.assign(process.env, {
  CORRE_AQUI_ENV: 'staging',
  VERCEL_ENV: 'preview',
  VERCEL_TARGET_ENV: 'preview',
  VERCEL_PROJECT_ID: 'prj_M3gKqNx4UkEzAEgL4pcyoYG5kTUB',
  VERCEL_GIT_COMMIT_REF: 'codex/staging/consolidated-2026-09-07',
  MERCADO_PAGO_CREDENTIAL_ENV: 'test',
  MERCADO_PAGO_ACCESS_TOKEN: 'provider-test-placeholder',
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
globalThis.assertForFinanceLogin = assert.ok
const linkedApproval = '41f2b159e9f04467898f4612800d2960'
globalThis.financeTestApproval = linkedApproval
globalThis.financeTestStatus = 'authorized'
globalThis.fetch = async (url, options) => {
  assert.ok(['https://api.mercadolibre.com/users/me', 'https://api.mercadolibre.com/users/20000'].includes(url))
  assert.equal(options.redirect, 'error')
  assert.equal(options.method, undefined)
  assert.equal(options.headers.Authorization, 'Bearer provider-test-placeholder')
  return Response.json({ id: url.endsWith('/me') ? 10000 : 20000, tags: ['test_user'], email: 'omit-from-report@example.test' })
}
let accountExists = true
let revocations = 0
globalThis.financeLoginAuth = {
  async getUser(requestedUid) {
    assert.equal(requestedUid, uid)
    if (accountExists) return { email: `${uid}@example.test`, emailVerified: true, providerData: [] }
    throw Object.assign(new Error('test_account_absent'), { code: 'auth/user-not-found' })
  },
  async createCustomToken(requestedUid) {
    assert.equal(requestedUid, uid)
    return 'test-only-synthetic-token'
  },
  async revokeRefreshTokens(requestedUid) {
    assert.equal(requestedUid, uid)
    revocations++
  },
}

const canonical = 'https://corre-aqui-git-codex-stagingc-155cef-rgstrondahh-2784s-projects.vercel.app'
const request = (actor, method = 'POST', origin = canonical) => new NextRequest(
  `${origin}/api/internal/staging-finance-login`,
  { method, headers: actor ? { authorization: actor } : {}, ...(method === 'POST' && { body: '{"uid":"not-the-configured-uid"}' }) },
)
assert.equal((await POST(request())).status, 403)
assert.equal((await POST(request('wrong-operator'))).status, 403)
assert.equal((await POST(request(uid))).status, 403)
assert.equal((await POST(request(operator, 'POST', 'https://another-preview.vercel.app'))).status, 404)
process.env.VERCEL_ENV = 'production'
assert.equal((await POST(request(operator))).status, 404)
process.env.VERCEL_ENV = 'preview'
process.env.STAGING_FINANCE_TEST_SCOPE = JSON.stringify({ ...scope, expiresAt: Date.now() - 1 })
assert.equal((await POST(request(operator))).status, 404)
process.env.STAGING_FINANCE_TEST_SCOPE = JSON.stringify(scope)
accountExists = false
assert.equal((await POST(request(operator))).status, 503)
accountExists = true
assert.equal((await POST(request(operator))).status, 200)
assert.equal((await GET(request('another-user', 'GET'))).status, 403)
assert.equal((await DELETE(request('another-user', 'DELETE'))).status, 403)
assert.equal((await DELETE(request(uid, 'DELETE'))).status, 409)
const response = await GET(request(uid, 'GET'))
assert.equal(response.status, 200)
const outcome = await response.json()
assert.equal(outcome.intervalMonths, 3)
assert.deepEqual(outcome.invoices.map((item) => item.payment.id), ['456'])
assert.equal(outcome.invoices[0].payment.amountInCents, 1990)
assert.equal(outcome.invoices[0].payment.liveMode, true)
assert.equal(outcome.invoices[0].payment.officialTestCard, true)
assert.equal(outcome.invoices[0].payment.payerMatches, true)
assert.equal(outcome.invoices[0].signedReceiptAt, null)
assert.deepEqual(outcome.seller, { collectorMatches: true, testUser: true })
assert.deepEqual(outcome.buyer, { payerMatches: true, testUser: true })
assert.equal(outcome.token, undefined)
globalThis.financeTestApproval = 'different-preapproval'
assert.equal((await POST(request(operator))).status, 409)
assert.equal((await GET(request(uid, 'GET'))).status, 409)
assert.equal((await DELETE(request(uid, 'DELETE'))).status, 409)
globalThis.financeTestApproval = linkedApproval
globalThis.financeTestStatus = 'cancelled'
assert.equal((await POST(request(operator))).status, 409)
assert.equal((await DELETE(request(uid, 'DELETE'))).status, 200)
assert.equal(revocations, 1)
console.log('Isolated existing identity, exact approval, read-only provider checks and final session revocation passed.')
