import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const environment = {
  CORRE_AQUI_ENV: 'staging',
  VERCEL_ENV: 'preview',
  VERCEL_TARGET_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'codex/staging/consolidated-2026-09-07',
  VERCEL_PROJECT_ID: 'prj_M3gKqNx4UkEzAEgL4pcyoYG5kTUB',
  MERCADO_PAGO_CREDENTIAL_ENV: 'test',
  MERCADO_PAGO_ACCESS_TOKEN: 'test-only-placeholder',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-staging',
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
  FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-staging',
  FIREBASE_ADMIN_CLIENT_EMAIL: 'test-only@example.test',
  FIREBASE_ADMIN_PRIVATE_KEY: 'test-only-placeholder',
  FIREBASE_ADMIN_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
  FIREBASE_ADMIN_CREDENTIALS: '',
  FIREBASE_DATABASE_EMULATOR_HOST: '',
  FIREBASE_AUTH_EMULATOR_HOST: '',
  CRON_SECRET: 'f'.repeat(48),
}

Object.assign(process.env, environment)
const { isScheduledSubscriptionStaging } = await import('../src/lib/scheduledSubscriptionRuntime.js')
assert.equal(isScheduledSubscriptionStaging(), true)
assert.equal(isScheduledSubscriptionStaging({ ...environment, CRON_SECRET: '' }), true)

const mismatches = {
  CORRE_AQUI_ENV: 'production',
  VERCEL_ENV: 'production',
  VERCEL_TARGET_ENV: 'production',
  VERCEL_PROJECT_ID: 'prj_other',
  VERCEL_GIT_COMMIT_REF: 'main',
  MERCADO_PAGO_CREDENTIAL_ENV: 'production',
  MERCADO_PAGO_ACCESS_TOKEN: '',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-3f9ec',
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://corre-aqui-3f9ec-default-rtdb.firebaseio.com',
  FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-3f9ec',
  FIREBASE_ADMIN_CREDENTIALS: JSON.stringify({
    project_id: 'corre-aqui-3f9ec', client_email: 'test-only@example.test', private_key: 'test-only-placeholder',
  }),
  FIREBASE_ADMIN_DATABASE_URL: 'https://corre-aqui-staging.firebaseio.com',
  FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
}
for (const [key, value] of Object.entries(mismatches)) {
  assert.equal(isScheduledSubscriptionStaging({ ...environment, [key]: value }), false, key)
}

const config = (await import('../vercel.ts?stage')).config
assert.deepEqual(config.schedules['subscription-reconciliation'], {
  schedule: '*/30 * * * *', path: '/api/internal/subscription-reconciliation', requestMethod: 'POST',
})
for (const key of ['VERCEL_ENV', 'VERCEL_TARGET_ENV', 'VERCEL_GIT_COMMIT_REF', 'VERCEL_PROJECT_ID']) {
  process.env[key] = mismatches[key]
  assert.deepEqual((await import(`../vercel.ts?${key}`)).config, {}, key)
  process.env[key] = environment[key]
}

const importedRuntime = new URL('../src/lib/scheduledSubscriptionRuntime.js', import.meta.url).href
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@/lib/scheduledSubscriptionRuntime') {
      return { shortCircuit: true, url: importedRuntime }
    }
    if (specifier === '@/lib/commercialServer') {
      const source = `export const getCommercialDatabase = () => globalThis.scheduleAdapterTest.database()`
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` }
    }
    if (specifier === '@/lib/scheduledSubscriptionReconciliation') {
      const source = `export const runScheduledSubscriptionReconciliation = (input) => globalThis.scheduleAdapterTest.run(input)`
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(source)}` }
    }
    return nextResolve(specifier, context)
  },
})

const { POST, maxDuration } = await import('../src/app/api/internal/subscription-reconciliation/route.js')
const summary = { ok: true, checked: 1 }
const fixtureDb = {}
const calls = []
globalThis.scheduleAdapterTest = {
  database() {
    calls.push('db')
    return fixtureDb
  },
  run({ database, signal }) {
    calls.push('run')
    assert.equal(database, fixtureDb)
    assert.equal(signal instanceof AbortSignal, true)
    return summary
  },
}

function call(authorization) {
  const headers = { 'User-Agent': 'vercel-cron/1.0', 'ce-type': 'com.vercel.schedule.v1beta' }
  if (authorization !== undefined) headers.authorization = authorization
  return POST(new Request('https://example.test/api/internal/subscription-reconciliation', { method: 'POST', headers }))
}

assert.equal(maxDuration, 60)
assert.equal((await call()).status, 401)
assert.equal((await call(`Bearer ${'a'.repeat(48)}`)).status, 401)
process.env.CRON_SECRET = 'short'
assert.equal((await call('Bearer short')).status, 401)
process.env.CRON_SECRET = environment.CRON_SECRET
process.env.VERCEL_TARGET_ENV = 'production'
assert.equal((await call(`Bearer ${environment.CRON_SECRET}`)).status, 404)
process.env.VERCEL_TARGET_ENV = environment.VERCEL_TARGET_ENV
assert.deepEqual(calls, [], 'unauthorized invocations never open Firebase')

const response = await call(`Bearer ${environment.CRON_SECRET}`)
assert.equal(response.status, 200)
assert.equal(response.headers.get('cache-control'), 'private, no-store')
assert.deepEqual(await response.json(), summary)
assert.deepEqual(calls, ['db', 'run'])

const originalWarn = console.warn
console.warn = (log) => assert.deepEqual(JSON.parse(log), { event: 'subscription_reconciliation_schedule_failed' })
try {
  globalThis.scheduleAdapterTest.run = () => { throw new Error('must-never-log-even-provider-errors') }
  const failed = await call(`Bearer ${environment.CRON_SECRET}`)
  assert.equal(failed.status, 503)
  assert.deepEqual(await failed.json(), { ok: false })
} finally {
  console.warn = originalWarn
  delete globalThis.scheduleAdapterTest
}

console.log('Subscription schedule deployment guard and authenticated adapter tests passed.')
