import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  assessMercadoPagoCheckoutConfiguration,
  firebaseDatabaseBelongsToProject,
} from '../src/lib/commercialRuntimeConfig.js'
import { assessFirebaseClientConfiguration } from '../src/lib/firebaseClientConfig.js'

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
  createMercadoPagoCheckout,
  getMercadoPagoCheckoutReadiness,
  isMercadoPagoCheckoutEnabled,
} = await import('../src/lib/commercialServer.js')
const { getFirebaseAdminConfigurationStatus } = await import('../src/lib/firebaseAdmin.js')

const fakePrivateKey = '-----BEGIN PRIVATE KEY-----\\nfake-test-key\\n-----END PRIVATE KEY-----\\n'
const productionDatabaseUrl = 'https://corre-aqui-3f9ec-default-rtdb.firebaseio.com'
const stagingDatabaseUrl = 'https://corre-aqui-staging-default-rtdb.firebaseio.com'

function clientConfiguration(projectId, databaseURL) {
  return {
    apiKey: 'public-api-key-for-tests',
    authDomain: `${projectId}.firebaseapp.com`,
    databaseURL,
    projectId,
    storageBucket: `${projectId}.appspot.com`,
    messagingSenderId: '1234567890',
    appId: '1:1234567890:web:test',
  }
}

function productionEnvironment(overrides = {}) {
  return {
    CORRE_AQUI_ENV: 'production',
    SITE_URL: 'https://www.correaquibrasil.com.br',
    NEXT_PUBLIC_SITE_URL: 'https://www.correaquibrasil.com.br',
    MERCADO_PAGO_CHECKOUT_ENABLED: 'true',
    MERCADO_PAGO_CREDENTIAL_ENV: 'production',
    MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-fake-production-token',
    MERCADO_PAGO_WEBHOOK_SECRET: 'fake-production-webhook-secret',
    FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-3f9ec',
    FIREBASE_ADMIN_CLIENT_EMAIL: 'firebase-admin-test@corre-aqui-3f9ec.iam.gserviceaccount.com',
    FIREBASE_ADMIN_PRIVATE_KEY: fakePrivateKey,
    FIREBASE_ADMIN_DATABASE_URL: productionDatabaseUrl,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-3f9ec',
    NEXT_PUBLIC_FIREBASE_DATABASE_URL: productionDatabaseUrl,
    VERCEL_ENV: 'production',
    ...overrides,
  }
}

function stagingEnvironment(overrides = {}) {
  return {
    CORRE_AQUI_ENV: 'staging',
    SITE_URL: 'https://corre-aqui-staging.vercel.app',
    NEXT_PUBLIC_SITE_URL: 'https://corre-aqui-staging.vercel.app',
    MERCADO_PAGO_CHECKOUT_ENABLED: 'true',
    MERCADO_PAGO_CREDENTIAL_ENV: 'test',
    MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-fake-staging-token',
    MERCADO_PAGO_WEBHOOK_SECRET: 'fake-staging-webhook-secret',
    FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-staging',
    FIREBASE_ADMIN_CLIENT_EMAIL: 'firebase-admin-test@corre-aqui-staging.iam.gserviceaccount.com',
    FIREBASE_ADMIN_PRIVATE_KEY: fakePrivateKey,
    FIREBASE_ADMIN_DATABASE_URL: stagingDatabaseUrl,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-staging',
    NEXT_PUBLIC_FIREBASE_DATABASE_URL: stagingDatabaseUrl,
    VERCEL_ENV: 'preview',
    ...overrides,
  }
}

const runtimeEnvironmentKeys = [
  'CORRE_AQUI_ENV',
  'SITE_URL',
  'NEXT_PUBLIC_SITE_URL',
  'MERCADO_PAGO_CHECKOUT_ENABLED',
  'MERCADO_PAGO_CREDENTIAL_ENV',
  'MERCADO_PAGO_ACCESS_TOKEN',
  'MERCADO_PAGO_WEBHOOK_SECRET',
  'FIREBASE_ADMIN_CREDENTIALS',
  'FIREBASE_ADMIN_PROJECT_ID',
  'FIREBASE_ADMIN_CLIENT_EMAIL',
  'FIREBASE_ADMIN_PRIVATE_KEY',
  'FIREBASE_ADMIN_DATABASE_URL',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
  'VERCEL_ENV',
]

async function withRuntimeEnvironment(env, callback) {
  const previous = new Map(runtimeEnvironmentKeys.map((key) => [key, process.env[key]]))
  try {
    for (const key of runtimeEnvironmentKeys) {
      if (Object.hasOwn(env, key)) process.env[key] = env[key]
      else delete process.env[key]
    }
    return await callback()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function expectBlocked(env, expectedIssue, message) {
  const assessment = assessMercadoPagoCheckoutConfiguration(env)
  assert.equal(assessment.ready, false, message)
  assert.ok(assessment.issues.includes(expectedIssue), `${message}: ${expectedIssue}`)
  return assessment
}

assert.equal(
  assessMercadoPagoCheckoutConfiguration(productionEnvironment()).ready,
  true,
  'configuracao completa de Production habilita o gate',
)
assert.equal(
  assessMercadoPagoCheckoutConfiguration(stagingEnvironment()).ready,
  true,
  'configuracao completa de Staging com credencial APP_USR de teste habilita o gate',
)

const productionClientConfiguration = clientConfiguration('corre-aqui-3f9ec', productionDatabaseUrl)
const stagingClientConfiguration = clientConfiguration('corre-aqui-staging', stagingDatabaseUrl)
assert.equal(
  assessFirebaseClientConfiguration(productionClientConfiguration, {
    hostname: 'www.correaquibrasil.com.br',
  }).valid,
  true,
  'Firebase Client aceita Production apenas no host canonico de Production',
)
assert.equal(
  assessFirebaseClientConfiguration(stagingClientConfiguration, {
    hostname: 'corre-aqui-git-staging.example.vercel.app',
  }).valid,
  true,
  'Firebase Client aceita Staging em host publico de Preview sem inventar uma URL fixa',
)
assert.ok(
  assessFirebaseClientConfiguration(productionClientConfiguration, {
    hostname: 'corre-aqui-git-staging.example.vercel.app',
  }).issues.includes('firebase_client_host_environment_mismatch'),
  'Firebase Client bloqueia projeto Production em Preview',
)
assert.ok(
  assessFirebaseClientConfiguration(stagingClientConfiguration, {
    hostname: 'www.correaquibrasil.com.br',
  }).issues.includes('firebase_client_host_environment_mismatch'),
  'Firebase Client bloqueia projeto Staging no dominio de Production',
)
assert.ok(
  assessFirebaseClientConfiguration({
    ...stagingClientConfiguration,
    databaseURL: productionDatabaseUrl,
  }).issues.includes('firebase_client_database_project_mismatch'),
  'Firebase Client bloqueia RTDB cruzado antes de inicializar',
)
assert.ok(
  assessFirebaseClientConfiguration({
    ...stagingClientConfiguration,
    apiKey: '',
  }).issues.includes('firebase_client_apiKey_missing'),
  'Firebase Client bloqueia configuracao incompleta',
)
assert.ok(
  assessFirebaseClientConfiguration({
    ...stagingClientConfiguration,
    projectId: 'projeto-nao-autorizado',
  }).issues.includes('firebase_client_project_unknown'),
  'Firebase Client aceita somente os projetos conhecidos do Corre Aqui',
)
await withRuntimeEnvironment(productionEnvironment(), async () => {
  assert.equal(isMercadoPagoCheckoutEnabled(), true)
})
await withRuntimeEnvironment(stagingEnvironment(), async () => {
  assert.equal(getMercadoPagoCheckoutReadiness().ready, true)
})

expectBlocked({}, 'checkout_flag_not_enabled', 'checkout fica desativado por padrao')
expectBlocked(productionEnvironment({ MERCADO_PAGO_CHECKOUT_ENABLED: '' }), 'checkout_flag_not_enabled', 'flag ausente bloqueia')
expectBlocked(productionEnvironment({ MERCADO_PAGO_CHECKOUT_ENABLED: 'TRUE' }), 'checkout_flag_not_enabled', 'flag aceita somente true exato')
expectBlocked(productionEnvironment({ MERCADO_PAGO_ACCESS_TOKEN: '' }), 'mercado_pago_access_token_missing', 'token ausente bloqueia')
expectBlocked(productionEnvironment({ MERCADO_PAGO_WEBHOOK_SECRET: '' }), 'mercado_pago_webhook_secret_missing', 'webhook secret ausente bloqueia')
expectBlocked(productionEnvironment({ MERCADO_PAGO_CREDENTIAL_ENV: '' }), 'mercado_pago_credential_environment_missing', 'declaracao da credencial ausente bloqueia')
expectBlocked(productionEnvironment({ MERCADO_PAGO_CREDENTIAL_ENV: 'live' }), 'mercado_pago_credential_environment_invalid', 'declaracao fora do contrato bloqueia')
expectBlocked(stagingEnvironment({ MERCADO_PAGO_CREDENTIAL_ENV: 'production' }), 'mercado_pago_credential_environment_mismatch', 'Staging rejeita declaracao de credencial de Production')
expectBlocked(productionEnvironment({ MERCADO_PAGO_CREDENTIAL_ENV: 'test' }), 'mercado_pago_credential_environment_mismatch', 'Production rejeita declaracao de credencial de teste')
assert.equal(
  assessMercadoPagoCheckoutConfiguration(stagingEnvironment({
    MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-fake-staging-token',
  })).ready,
  true,
  'Staging aceita Access Token APP_USR quando a origem server-side declarada e test',
)
assert.equal(
  assessMercadoPagoCheckoutConfiguration(productionEnvironment({
    MERCADO_PAGO_ACCESS_TOKEN: 'opaque-fake-production-token',
  })).ready,
  true,
  'gate trata o Access Token como opaco e nao infere ambiente pelo prefixo',
)

expectBlocked(productionEnvironment({ CORRE_AQUI_ENV: '' }), 'app_environment_missing', 'ambiente ausente bloqueia')
expectBlocked(productionEnvironment({ CORRE_AQUI_ENV: 'preview' }), 'app_environment_invalid', 'ambiente desconhecido bloqueia')
expectBlocked(productionEnvironment({ VERCEL_ENV: 'preview' }), 'vercel_environment_mismatch', 'Production nao roda como Preview')
expectBlocked(stagingEnvironment({ VERCEL_ENV: 'production' }), 'vercel_environment_mismatch', 'Staging nao roda como Production')

expectBlocked(productionEnvironment({ SITE_URL: '' }), 'site_url_missing', 'SITE_URL ausente bloqueia')
expectBlocked(productionEnvironment({ SITE_URL: 'http://www.correaquibrasil.com.br' }), 'site_url_invalid', 'HTTP bloqueia')
expectBlocked(productionEnvironment({ SITE_URL: 'https://user:pass@www.correaquibrasil.com.br' }), 'site_url_invalid', 'URL com credenciais bloqueia')
expectBlocked(productionEnvironment({ SITE_URL: 'https://www.correaquibrasil.com.br/app' }), 'site_url_invalid', 'URL com path bloqueia')
expectBlocked(productionEnvironment({ SITE_URL: 'https://correaquibrasil.com.br' }), 'site_url_environment_mismatch', 'Production exige origem canonica exata')
expectBlocked(stagingEnvironment({ SITE_URL: 'https://www.correaquibrasil.com.br' }), 'site_url_environment_mismatch', 'Staging rejeita origem de Production')
expectBlocked(productionEnvironment({ NEXT_PUBLIC_SITE_URL: 'https://preview.example.com' }), 'public_site_url_mismatch', 'espelho publico divergente bloqueia')

expectBlocked(productionEnvironment({ FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-staging' }), 'firebase_admin_project_environment_mismatch', 'Admin de Staging bloqueia Production')
expectBlocked(productionEnvironment({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-staging' }), 'firebase_client_project_environment_mismatch', 'Client de Staging bloqueia Production')
expectBlocked(productionEnvironment({ FIREBASE_ADMIN_DATABASE_URL: stagingDatabaseUrl }), 'firebase_admin_database_project_mismatch', 'RTDB Admin de Staging bloqueia Production')
expectBlocked(productionEnvironment({ NEXT_PUBLIC_FIREBASE_DATABASE_URL: stagingDatabaseUrl }), 'firebase_client_database_project_mismatch', 'RTDB Client de Staging bloqueia Production')
expectBlocked(stagingEnvironment({ FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-3f9ec' }), 'firebase_admin_project_environment_mismatch', 'Admin de Production bloqueia Staging')
expectBlocked(stagingEnvironment({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-3f9ec' }), 'firebase_client_project_environment_mismatch', 'Client de Production bloqueia Staging')
expectBlocked(stagingEnvironment({ FIREBASE_ADMIN_DATABASE_URL: productionDatabaseUrl }), 'firebase_admin_database_project_mismatch', 'RTDB Admin de Production bloqueia Staging')
expectBlocked(productionEnvironment({ FIREBASE_ADMIN_DATABASE_URL: '' }), 'firebase_admin_database_missing', 'checkout exige RTDB server-side')

const mismatchedJsonCredentials = productionEnvironment({
  FIREBASE_ADMIN_CREDENTIALS: JSON.stringify({
    project_id: 'corre-aqui-3f9ec',
    client_email: 'firebase-admin-test@corre-aqui-3f9ec.iam.gserviceaccount.com',
    private_key: fakePrivateKey,
  }),
  FIREBASE_ADMIN_PROJECT_ID: 'corre-aqui-staging',
})
expectBlocked(mismatchedJsonCredentials, 'firebase_admin_project_sources_mismatch', 'fontes Admin divergentes bloqueiam')
expectBlocked(productionEnvironment({ FIREBASE_ADMIN_CREDENTIALS: '{invalid-json' }), 'firebase_admin_credentials_invalid_json', 'JSON Admin invalido bloqueia')

const regionalProductionDatabaseUrl = 'https://corre-aqui-3f9ec-default-rtdb.southamerica-east1.firebasedatabase.app'
assert.equal(
  assessMercadoPagoCheckoutConfiguration(productionEnvironment({
    FIREBASE_ADMIN_DATABASE_URL: regionalProductionDatabaseUrl,
    NEXT_PUBLIC_FIREBASE_DATABASE_URL: regionalProductionDatabaseUrl,
  })).ready,
  true,
  'hostname regional oficial da RTDB e aceito',
)
assert.equal(firebaseDatabaseBelongsToProject(productionDatabaseUrl, 'corre-aqui-3f9ec'), true)
assert.equal(
  firebaseDatabaseBelongsToProject('https://corre-aqui-3f9ec.evil.example.com', 'corre-aqui-3f9ec'),
  false,
  'hostname semelhante nao passa por correspondencia parcial',
)

const productionAssessment = assessMercadoPagoCheckoutConfiguration(productionEnvironment())
const serializedAssessment = JSON.stringify(productionAssessment)
for (const secretMarker of [
  'APP_USR-fake-production-token',
  'fake-production-webhook-secret',
  'fake-test-key',
]) {
  assert.equal(serializedAssessment.includes(secretMarker), false, 'diagnostico nao serializa segredos')
}

const legacyAdminEnvironment = productionEnvironment({
  CORRE_AQUI_ENV: '',
  FIREBASE_ADMIN_DATABASE_URL: '',
})
assert.equal(
  getFirebaseAdminConfigurationStatus(legacyAdminEnvironment).configured,
  false,
  'rotas Admin falham fechado sem ambiente e RTDB server-side explicitos',
)
assert.ok(
  getFirebaseAdminConfigurationStatus(legacyAdminEnvironment).issues.includes('app_environment_missing'),
  'Firebase Admin exige CORRE_AQUI_ENV',
)
assert.ok(
  getFirebaseAdminConfigurationStatus(legacyAdminEnvironment).issues.includes('firebase_admin_database_missing'),
  'Firebase Admin exige FIREBASE_ADMIN_DATABASE_URL',
)
assert.equal(
  getFirebaseAdminConfigurationStatus(productionEnvironment()).configured,
  true,
  'Firebase Admin aceita contrato server-side completo',
)
assert.equal(
  getFirebaseAdminConfigurationStatus(productionEnvironment({
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'corre-aqui-staging',
  })).configured,
  false,
  'Firebase Admin rejeita Client cruzado mesmo fora do gate comercial',
)

const firebaseInitializationSource = await readFile(new URL('../src/lib/firebase.js', import.meta.url), 'utf8')
const firebaseConfigRouteSource = await readFile(new URL('../src/app/api/firebase-config/route.js', import.meta.url), 'utf8')
const clientGuardAt = firebaseInitializationSource.indexOf('if (!clientAssessment.valid)')
const clientInitializationAt = firebaseInitializationSource.lastIndexOf('initializeApp(firebaseConfig)')
assert.ok(clientGuardAt >= 0 && clientInitializationAt > clientGuardAt, 'Firebase Client valida o ambiente antes de inicializar')
assert.match(firebaseInitializationSource, /firebase_client_existing_app_mismatch/, 'Firebase Client bloqueia app DEFAULT preexistente divergente')
assert.match(firebaseConfigRouteSource, /getFirebaseAdminConfigurationStatus/, 'configuracao do service worker depende do ambiente Admin validado')
assert.match(firebaseConfigRouteSource, /status:\s*503/, 'endpoint de configuracao Firebase falha fechado em ambiente inconsistente')

function createRecordingDatabase() {
  const writes = []
  let pushCount = 0
  const database = {
    ref(path) {
      return {
        push() {
          pushCount += 1
          const key = `attempt-test-${pushCount}`
          return {
            key,
            async set(value) {
              writes.push({ operation: 'set', path: `${path}/${key}`, value })
            },
          }
        },
        async set(value) {
          writes.push({ operation: 'set', path, value })
        },
        async update(value) {
          writes.push({ operation: 'update', path, value })
        },
      }
    },
  }
  return { database, writes }
}

const product = {
  id: 'CLIENT_ANNUAL',
  name: 'Plano Cliente anual - teste',
  type: 'subscription',
  amountInCents: 1990,
  currency: 'BRL',
}

let blockedDatabaseTouches = 0
let blockedFetchCalls = 0
await withRuntimeEnvironment(
  productionEnvironment({ MERCADO_PAGO_WEBHOOK_SECRET: '' }),
  async () => {
    const previousFetch = globalThis.fetch
    globalThis.fetch = async () => {
      blockedFetchCalls += 1
      throw new Error('network_must_not_be_called')
    }
    try {
      await assert.rejects(
        () => createMercadoPagoCheckout({
          database: {
            ref() {
              blockedDatabaseTouches += 1
              throw new Error('database_must_not_be_touched')
            },
          },
          userId: 'user-test',
          product,
          targetId: 'user-test',
          targetType: 'subscription',
        }),
        (error) => {
          assert.equal(error.code, 'checkout_configuration_incomplete')
          assert.equal(JSON.stringify(error).includes('fake-production-token'), false)
          return true
        },
      )
    } finally {
      globalThis.fetch = previousFetch
    }
  },
)
assert.equal(blockedDatabaseTouches, 0, 'configuracao invalida nao grava tentativa')
assert.equal(blockedFetchCalls, 0, 'configuracao invalida nao chama Mercado Pago')

const stagingDatabase = createRecordingDatabase()
let stagingFetchCalls = 0
let stagingPreferenceRequest = null
const stagingCheckout = await withRuntimeEnvironment(stagingEnvironment(), async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    stagingFetchCalls += 1
    stagingPreferenceRequest = { url, options }
    return {
      ok: true,
      status: 201,
      async json() {
        return {
          id: 'preference-test-only',
          init_point: 'https://www.mercadopago.com.br/live-must-not-be-used',
          sandbox_init_point: 'https://sandbox.mercadopago.com.br/test-checkout',
        }
      },
    }
  }
  try {
    return await createMercadoPagoCheckout({
      database: stagingDatabase.database,
      userId: 'user-staging-test',
      product,
      targetId: 'user-staging-test',
      targetType: 'subscription',
    })
  } finally {
    globalThis.fetch = previousFetch
  }
})
assert.equal(stagingFetchCalls, 1, 'configuracao valida chama o fetch injetado uma vez')
assert.equal(stagingPreferenceRequest.url, 'https://api.mercadopago.com/checkout/preferences')
assert.equal(
  stagingCheckout.checkout.checkoutUrl,
  'https://sandbox.mercadopago.com.br/test-checkout',
  'Staging usa somente sandbox_init_point',
)
const stagingPreferenceBody = JSON.parse(stagingPreferenceRequest.options.body)
assert.equal(
  stagingPreferenceBody.notification_url,
  'https://corre-aqui-staging.vercel.app/api/mercado-pago/webhook',
)
assert.equal(stagingPreferenceBody.external_reference, stagingCheckout.attempt.externalReference)
assert.ok(stagingDatabase.writes.some(({ path }) => path.startsWith('commercialCheckoutAttempts/')))

const productionDatabase = createRecordingDatabase()
const productionCheckout = await withRuntimeEnvironment(productionEnvironment(), async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    status: 201,
    async json() {
      return {
        id: 'preference-production-test-only',
        init_point: 'https://www.mercadopago.com.br/production-checkout',
        sandbox_init_point: 'https://sandbox.mercadopago.com.br/must-not-be-used',
      }
    },
  })
  try {
    return await createMercadoPagoCheckout({
      database: productionDatabase.database,
      userId: 'user-production-test',
      product,
      targetId: 'user-production-test',
      targetType: 'subscription',
    })
  } finally {
    globalThis.fetch = previousFetch
  }
})
assert.equal(
  productionCheckout.checkout.checkoutUrl,
  'https://www.mercadopago.com.br/production-checkout',
  'Production usa somente init_point',
)

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectSourceFiles(path))
    else if (/\.(?:js|jsx|mjs)$/.test(entry.name)) files.push(path)
  }
  return files
}

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourceFiles = await collectSourceFiles(resolve(repositoryRoot, 'src'))
const preferenceEndpointOwners = []
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8')
  if (source.includes('api.mercadopago.com/checkout/preferences')) {
    preferenceEndpointOwners.push(relative(repositoryRoot, file).split(sep).join('/'))
  }
}
assert.deepEqual(
  preferenceEndpointOwners.sort(),
  ['src/lib/commercialServer.js'],
  'endpoint bruto de Preference existe somente no gateway server-side',
)

for (const routePath of [
  'src/app/api/planos/checkout/route.js',
  'src/app/api/request-boost/checkout/route.js',
]) {
  const routeSource = await readFile(resolve(repositoryRoot, routePath), 'utf8')
  assert.match(routeSource, /getMercadoPagoCheckoutReadiness\(\)/, `${routePath} executa preflight`)
  assert.match(routeSource, /createMercadoPagoCheckout\(/, `${routePath} usa gateway unico`)
  assert.doesNotMatch(routeSource, /createCommercialCheckoutAttempt|maybeCreateMercadoPagoPreference/)
}

const firebaseClientSource = await readFile(resolve(repositoryRoot, 'src/lib/firebase.js'), 'utf8')
assert.doesNotMatch(firebaseClientSource, /EXPECTED_PROJECT_ID|EXPECTED_DATABASE_URL/)
assert.doesNotMatch(firebaseClientSource, /databaseHost\.includes\(firebaseConfig\.projectId\)/)

console.log('Commercial runtime configuration tests passed.')
