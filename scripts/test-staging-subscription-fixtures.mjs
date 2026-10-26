import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import {
  STAGING_SUBSCRIPTION_FIXTURE_MAX_DURATION_MINUTES,
  applyStagingClientSubscriptionFixtureOperation,
  assessStagingClientSubscriptionFixture,
  assessStagingSubscriptionFixtureRuntime,
  resolveClientDirectRequestAccessWithFixture,
} from '../src/lib/stagingSubscriptionFixtures.js'
import {
  ensureClientDirectRequestAccess,
  readSubscriptionAccessSummary,
} from '../src/lib/subscriptionServer.js'
import {
  canCreateClientDirectRequest,
  canCreateClientOrder,
} from '../src/lib/subscriptions.js'
import {
  parseStagingSubscriptionFixtureCliArguments,
  validateStagingSubscriptionFixtureCliCommand,
} from './manage-staging-subscription-fixture.mjs'

const now = Date.UTC(2026, 9, 25, 15, 0, 0)
const uid = 'test-user-a'
const testAccountId = 'test-client-a'
const cliBaseArguments = [
  '--project', 'corre-aqui-staging',
  '--instance', 'corre-aqui-staging-default-rtdb',
  '--uid', uid,
  '--operation', 'grant',
  '--operation-id', 'operation-grant-cli-01',
  '--test-account-id', testAccountId,
  '--operator-id', 'local-admin:test-suite',
  '--reason', 'integrated staging test',
  '--duration-minutes', '60',
]

function stagingEnv(overrides = {}) {
  return {
    CORRE_AQUI_ENV: 'staging',
    VERCEL_ENV: 'preview',
    STAGING_SUBSCRIPTION_FIXTURES_ENABLED: 'true',
    FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-staging',
    FIREBASE_ADMIN_CLIENT_EMAIL: 'fixture-test@corre-aqui-staging.iam.gserviceaccount.com',
    FIREBASE_ADMIN_PRIVATE_KEY: 'not-a-real-private-key',
    FIREBASE_ADMIN_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-staging',
    NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
    ...overrides,
  }
}

function operation(type, operationId, overrides = {}) {
  return {
    type,
    uid,
    operationId,
    testAccountId,
    operatorId: 'local-admin:test-suite',
    reason: 'integrated staging test',
    durationMinutes: ['grant', 'renew'].includes(type) ? 60 : 0,
    expectedRevision: 0,
    now,
    ...overrides,
  }
}

function fakeDatabase(values, options = {}) {
  const reads = []
  return {
    reads,
    ref(path) {
      return {
        async get() {
          reads.push(path)
          if (options.throwOnPath === path) throw new Error('simulated_read_failure')
          const value = values[path] ?? null
          return {
            exists: () => value !== null && value !== undefined,
            val: () => value,
          }
        },
      }
    },
  }
}

const runtime = assessStagingSubscriptionFixtureRuntime(stagingEnv())
assert.equal(runtime.enabled, true, 'Staging canônico e flag server-side exata habilitam a leitura da fixture')

const parsedDryRun = parseStagingSubscriptionFixtureCliArguments(cliBaseArguments)
assert.equal(parsedDryRun.apply, false, 'CLI é dry-run por padrão')
assert.equal(
  validateStagingSubscriptionFixtureCliCommand(parsedDryRun, stagingEnv()).apply,
  false,
)
assert.throws(
  () => validateStagingSubscriptionFixtureCliCommand(
    parseStagingSubscriptionFixtureCliArguments([...cliBaseArguments, '--apply']),
    stagingEnv(),
  ),
  /cli_argument_missing_confirm-project/,
  'Apply sem confirmações explícitas é bloqueado antes de inicializar o Admin SDK',
)
const parsedApply = parseStagingSubscriptionFixtureCliArguments([
  ...cliBaseArguments,
  '--apply',
  '--confirm-project', 'corre-aqui-staging',
  '--confirm-uid', uid,
  '--confirm-test-account', testAccountId,
  '--confirm-apply', 'APPLY_STAGING_SUBSCRIPTION_FIXTURE',
])
assert.equal(
  validateStagingSubscriptionFixtureCliCommand(parsedApply, stagingEnv()).apply,
  true,
  'Apply só é aceito com projeto, UID, conta de teste e ação confirmados',
)

const productionRuntime = assessStagingSubscriptionFixtureRuntime(stagingEnv({
  CORRE_AQUI_ENV: 'production',
  VERCEL_ENV: 'production',
  FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-3f9ec',
  FIREBASE_ADMIN_CLIENT_EMAIL: 'fixture-test@corre-aqui-3f9ec.iam.gserviceaccount.com',
  FIREBASE_ADMIN_DATABASE_URL: 'https://corre-aqui-3f9ec-default-rtdb.firebaseio.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-3f9ec',
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://corre-aqui-3f9ec-default-rtdb.firebaseio.com',
}))
assert.equal(productionRuntime.enabled, false, 'Production permanece bloqueada mesmo com a flag true')
assert.ok(productionRuntime.issues.includes('staging_subscription_fixtures_environment_mismatch'))

assert.equal(assessStagingSubscriptionFixtureRuntime(stagingEnv({
  FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-3f9ec',
})).enabled, false, 'Projeto Admin divergente falha fechado')
assert.equal(assessStagingSubscriptionFixtureRuntime(stagingEnv({
  FIREBASE_ADMIN_DATABASE_URL: 'https://corre-aqui-staging-other-rtdb.firebaseio.com',
})).enabled, false, 'Instância RTDB divergente falha fechado')
assert.equal(assessStagingSubscriptionFixtureRuntime(stagingEnv({
  STAGING_SUBSCRIPTION_FIXTURES_ENABLED: 'false',
})).enabled, false, 'Flag ausente ou diferente de true bloqueia o mecanismo')
assert.equal(assessStagingSubscriptionFixtureRuntime(stagingEnv({
  VERCEL_ENV: 'production',
})).enabled, false, 'Preview nunca reconhece a fixture sob VERCEL_ENV production')

const granted = applyStagingClientSubscriptionFixtureOperation(null, operation('grant', 'operation-grant-0001'))
assert.equal(granted.ok, true)
assert.equal(granted.duplicate, false)
assert.equal(granted.record.status, 'active')
assert.equal(granted.record.revision, 1)
assert.equal(
  assessStagingClientSubscriptionFixture(granted.record, { uid, now: now + 1, env: stagingEnv() }).allowed,
  true,
  'Fixture válida concede apenas a capacidade limitada no Staging',
)
assert.equal(
  assessStagingClientSubscriptionFixture(granted.record, {
    uid,
    now: granted.record.expiresAt + 1,
    env: stagingEnv(),
  }).allowed,
  false,
  'Validade temporal expirada bloqueia a fixture mesmo antes de uma revogação administrativa',
)

assert.equal(
  assessStagingClientSubscriptionFixture({
    ...granted.record,
    operations: {
      ...granted.record.operations,
      'operation-grant-0001': {
        ...granted.record.operations['operation-grant-0001'],
        paymentId: 'forbidden',
      },
    },
  }, { uid, now: now + 1, env: stagingEnv() }).allowed,
  false,
  'Campos de pagamento são proibidos também no histórico interno',
)

const duplicateGrant = applyStagingClientSubscriptionFixtureOperation(
  granted.record,
  operation('grant', 'operation-grant-0001'),
)
assert.equal(duplicateGrant.ok, true)
assert.equal(duplicateGrant.duplicate, true)
assert.equal(duplicateGrant.record.revision, 1, 'Repetição da mesma operationId não cria outro benefício')
assert.equal(duplicateGrant.record.expiresAt, granted.record.expiresAt)

const invalidStoredDuration = applyStagingClientSubscriptionFixtureOperation(
  {
    ...granted.record,
    expiresAt: granted.record.issuedAt
      + ((STAGING_SUBSCRIPTION_FIXTURE_MAX_DURATION_MINUTES + 1) * 60_000),
  },
  operation('revoke', 'operation-revoke-invalid', { expectedRevision: 1 }),
)
assert.equal(invalidStoredDuration.ok, false)
assert.equal(invalidStoredDuration.reason, 'fixture_structure_invalid')

const conflictingOperation = applyStagingClientSubscriptionFixtureOperation(
  granted.record,
  operation('grant', 'operation-grant-0001', { reason: 'different request' }),
)
assert.equal(conflictingOperation.ok, false)
assert.equal(conflictingOperation.reason, 'operation_id_conflict')

const concurrentGrant = applyStagingClientSubscriptionFixtureOperation(
  granted.record,
  operation('grant', 'operation-grant-0002', { expectedRevision: 0 }),
)
assert.equal(concurrentGrant.ok, false)
assert.equal(concurrentGrant.reason, 'stale_revision', 'Duas operações concorrentes não podem confirmar a mesma revisão')

const renewed = applyStagingClientSubscriptionFixtureOperation(
  granted.record,
  operation('renew', 'operation-renew-0001', {
    expectedRevision: 1,
    now: now + 1_000,
  }),
)
assert.equal(renewed.ok, true)
assert.equal(renewed.record.revision, 2)
assert.equal(renewed.record.expiresAt, granted.record.expiresAt + (60 * 60_000))

const excessiveDuration = applyStagingClientSubscriptionFixtureOperation(null, operation(
  'grant',
  'operation-grant-long',
  { durationMinutes: STAGING_SUBSCRIPTION_FIXTURE_MAX_DURATION_MINUTES + 1 },
))
assert.equal(excessiveDuration.ok, false)
assert.equal(excessiveDuration.reason, 'duration_invalid')

const expired = applyStagingClientSubscriptionFixtureOperation(
  renewed.record,
  operation('expire', 'operation-expire-01', {
    expectedRevision: 2,
    now: now + 2_000,
  }),
)
assert.equal(expired.ok, true)
assert.equal(expired.record.status, 'expired')
assert.equal(
  assessStagingClientSubscriptionFixture(expired.record, { uid, now: now + 2_001, env: stagingEnv() }).allowed,
  false,
  'Fixture expirada não concede acesso',
)

const grantedAgain = applyStagingClientSubscriptionFixtureOperation(
  expired.record,
  operation('grant', 'operation-grant-0003', {
    expectedRevision: 3,
    now: now + 3_000,
  }),
)
assert.equal(grantedAgain.ok, true)
const revoked = applyStagingClientSubscriptionFixtureOperation(
  grantedAgain.record,
  operation('revoke', 'operation-revoke-01', {
    expectedRevision: 4,
    now: now + 4_000,
  }),
)
assert.equal(revoked.ok, true)
assert.equal(revoked.record.status, 'revoked')
assert.equal(
  assessStagingClientSubscriptionFixture(revoked.record, { uid, now: now + 4_001, env: stagingEnv() }).allowed,
  false,
  'Fixture revogada não concede acesso',
)

const commercialInactive = canCreateClientDirectRequest({}, { now })
const fixtureAccess = resolveClientDirectRequestAccessWithFixture({
  commercialAccess: commercialInactive,
  fixture: granted.record,
  uid,
  now: now + 1,
  env: stagingEnv(),
})
assert.equal(fixtureAccess.allowed, true)
assert.equal(fixtureAccess.accessSource, 'staging_subscription_fixture')

const productionCopyAccess = resolveClientDirectRequestAccessWithFixture({
  commercialAccess: commercialInactive,
  fixture: granted.record,
  uid,
  now: now + 1,
  env: stagingEnv({
    CORRE_AQUI_ENV: 'production',
    VERCEL_ENV: 'production',
    FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-3f9ec',
    FIREBASE_ADMIN_DATABASE_URL: 'https://corre-aqui-3f9ec-default-rtdb.firebaseio.com',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-3f9ec',
    NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://corre-aqui-3f9ec-default-rtdb.firebaseio.com',
  }),
})
assert.equal(productionCopyAccess.allowed, false, 'Registro copiado para Production é inerte')

const flagDisabledAccess = resolveClientDirectRequestAccessWithFixture({
  commercialAccess: commercialInactive,
  fixture: granted.record,
  uid,
  now: now + 1,
  env: stagingEnv({ STAGING_SUBSCRIPTION_FIXTURES_ENABLED: 'false' }),
})
assert.equal(flagDisabledAccess.allowed, false)

const commercialAccount = {
  subscriptions: {
    client: {
      status: 'active',
      plan: 'annual',
      expiresAt: now + 86_400_000,
    },
  },
}
const commercialAccess = canCreateClientDirectRequest(commercialAccount, { now })
const paidPrecedence = resolveClientDirectRequestAccessWithFixture({
  commercialAccess,
  fixture: revoked.record,
  uid,
  now,
  env: stagingEnv({ STAGING_SUBSCRIPTION_FIXTURES_ENABLED: 'false' }),
})
assert.equal(paidPrecedence.allowed, true)
assert.equal(paidPrecedence.accessSource, 'commercial_subscription', 'Assinatura paga sempre prevalece')

const noSubscriptionDb = fakeDatabase({ [`users/${uid}`]: { clientFreeOrderUsed: true } })
await assert.rejects(
  ensureClientDirectRequestAccess(noSubscriptionDb, uid, now, stagingEnv()),
  (error) => error?.status === 402 && error?.message === 'client_direct_subscription_required',
  'Cliente sem assinatura nem fixture continua recebendo HTTP 402 do gate',
)

const missingProfileDb = fakeDatabase({
  [`stagingSubscriptionFixtures/${uid}/client`]: granted.record,
})
await assert.rejects(
  ensureClientDirectRequestAccess(missingProfileDb, uid, now, stagingEnv()),
  (error) => error?.status === 402,
  'Fixture órfã não libera uma conta sem perfil privado existente',
)
assert.deepEqual(missingProfileDb.reads, [`users/${uid}`])

const fixtureDb = fakeDatabase({
  [`users/${uid}`]: { clientFreeOrderUsed: true },
  [`stagingSubscriptionFixtures/${uid}/client`]: granted.record,
})
const fixtureServerAccess = await ensureClientDirectRequestAccess(fixtureDb, uid, now + 1, stagingEnv())
assert.equal(fixtureServerAccess.accessSource, 'staging_subscription_fixture')
assert.equal(fixtureServerAccess.subscription.active, false, 'Fixture não se apresenta como assinatura paga')

const paidDb = fakeDatabase({ [`users/${uid}`]: commercialAccount })
const paidServerAccess = await ensureClientDirectRequestAccess(paidDb, uid, now, stagingEnv())
assert.equal(paidServerAccess.accessSource, 'commercial_subscription')
assert.deepEqual(paidDb.reads, [`users/${uid}`], 'Assinatura real não consulta nem depende da fixture')

const statusDb = fakeDatabase({
  [`users/${uid}`]: { clientFreeOrderUsed: true },
  [`stagingSubscriptionFixtures/${uid}/client`]: granted.record,
})
const statusSummary = await readSubscriptionAccessSummary(statusDb, uid, now + 1, stagingEnv())
assert.deepEqual(statusSummary.capabilities, { clientDirectRequests: true })
assert.equal(statusSummary.subscriptions.client.active, false)
const serializedStatus = JSON.stringify(statusSummary)
assert.doesNotMatch(serializedStatus, /staging_subscription_fixture|test-client-a|operation-grant/)

assert.equal(
  canCreateClientOrder({ clientFreeOrderUsed: true }, { now }).allowed,
  false,
  'Fixture limitada não desbloqueia pedidos públicos nem altera gratuidade',
)

const serializedFixture = JSON.stringify(granted.record)
assert.doesNotMatch(serializedFixture, /paymentId|paymentReference|amountInCents|revenue|currency/)
assert.equal(granted.record.operations['operation-grant-0001'].type, 'grant')

const [statusRouteSource, clientSource, serverSource, privateRouteSource, cliSource, rulesSource] = await Promise.all([
  readFile(new URL('../src/app/api/subscriptions/status/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/subscriptionClient.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/subscriptionServer.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/private-requests/create/route.js', import.meta.url), 'utf8'),
  readFile(new URL('./manage-staging-subscription-fixture.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../database.rules.json', import.meta.url), 'utf8'),
])
assert.match(statusRouteSource, /capabilities: summary\.capabilities/)
assert.doesNotMatch(statusRouteSource, /stagingSubscriptionFixtures|testAccountId|operationId/)
assert.match(clientSource, /capabilities\?\.clientDirectRequests === true/)
assert.doesNotMatch(clientSource, /STAGING_SUBSCRIPTION_FIXTURES_ENABLED|stagingSubscriptionFixtures/)
assert.match(serverSource, /stagingSubscriptionFixtures\/\$\{uid\}\/client/)
assert.doesNotMatch(serverSource, /NEXT_PUBLIC_STAGING|body\?.*fixture/)
assert.match(privateRouteSource, /ensureClientDirectRequestAccess\(database, uid, now\)/)
assert.doesNotMatch(privateRouteSource, /fixture|testAccountId|STAGING_SUBSCRIPTION/)
assert.match(cliSource, /name === 'apply'/)
assert.match(cliSource, /confirm-project/)
assert.match(cliSource, /confirm-uid/)
assert.match(cliSource, /confirm-test-account/)
assert.match(cliSource, /APPLY_STAGING_SUBSCRIPTION_FIXTURE/)
assert.match(cliSource, /\.info\/serverTimeOffset/)
assert.doesNotMatch(cliSource, /paymentId|paymentReference|MercadoPago|mercadoPago/)

const rules = JSON.parse(rulesSource).rules
assert.equal(rules.stagingSubscriptionFixtures['.read'], false)
assert.equal(rules.stagingSubscriptionFixtures['.write'], false)

await assert.rejects(
  access(new URL('../src/app/api/staging-subscription-fixtures', import.meta.url)),
  (error) => error?.code === 'ENOENT',
  'Não existe rota HTTP pública para administrar fixtures',
)

console.log('staging subscription fixture policy tests passed')
