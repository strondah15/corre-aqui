import { pathToFileURL } from 'node:url'
import { cert, deleteApp, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getDatabase } from 'firebase-admin/database'
import {
  STAGING_SUBSCRIPTION_FIXTURE_DATABASE_INSTANCE,
  STAGING_SUBSCRIPTION_FIXTURE_PROJECT_ID,
  applyStagingClientSubscriptionFixtureOperation,
  assessStagingSubscriptionFixtureRuntime,
} from '../src/lib/stagingSubscriptionFixtures.js'
import { getClientSubscriptionStatus } from '../src/lib/subscriptions.js'

const APPLY_CONFIRMATION = 'APPLY_STAGING_SUBSCRIPTION_FIXTURE'
const FIREBASE_SERVER_TIME_TIMEOUT_MS = 10_000
const MAX_SERVER_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000
const ALLOWED_ARGUMENTS = new Set([
  'apply',
  'confirm-apply',
  'confirm-project',
  'confirm-test-account',
  'confirm-uid',
  'duration-minutes',
  'instance',
  'operation',
  'operation-id',
  'operator-id',
  'project',
  'reason',
  'test-account-id',
  'uid',
])

function clean(value) {
  return String(value || '').trim()
}

export function parseStagingSubscriptionFixtureCliArguments(argv) {
  const values = {}
  const flags = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error('cli_argument_invalid')
    const name = token.slice(2)
    if (!ALLOWED_ARGUMENTS.has(name)) throw new Error(`cli_argument_unknown_${name}`)
    if (name === 'apply') {
      flags.add(name)
      continue
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`cli_argument_missing_${name}`)
    values[name] = value
    index += 1
  }
  return { values, apply: flags.has('apply') }
}

function readCredentials(env) {
  if (clean(env.FIREBASE_ADMIN_CREDENTIALS)) {
    let parsed
    try {
      parsed = JSON.parse(env.FIREBASE_ADMIN_CREDENTIALS)
    } catch {
      throw new Error('firebase_admin_credentials_invalid_json')
    }
    return {
      projectId: clean(parsed.project_id || parsed.projectId),
      clientEmail: clean(parsed.client_email || parsed.clientEmail),
      privateKey: String(parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n'),
    }
  }
  return {
    projectId: clean(env.FIREBASE_ADMIN_PROJECT_ID),
    clientEmail: clean(env.FIREBASE_ADMIN_CLIENT_EMAIL),
    privateKey: String(env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }
}

async function readTrustedFirebaseServerNow({ credential, databaseURL, uid }) {
  let endpoint
  try {
    endpoint = new URL(clean(databaseURL))
  } catch {
    throw new Error('firebase_server_time_unavailable')
  }
  if (endpoint.protocol !== 'https:') throw new Error('firebase_server_time_unavailable')

  endpoint.pathname = `/stagingSubscriptionFixtures/${encodeURIComponent(uid)}/client.json`
  endpoint.search = '?shallow=true'

  const tokenResult = await credential.getAccessToken().catch(() => null)
  const accessToken = clean(tokenResult?.access_token)
  if (!accessToken) throw new Error('firebase_server_time_unavailable')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FIREBASE_SERVER_TIME_TIMEOUT_MS)
  let response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Cache-Control': 'no-cache, no-store',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch {
    throw new Error('firebase_server_time_unavailable')
  } finally {
    clearTimeout(timeout)
  }

  const serverDate = response.headers.get('date')
  await response.body?.cancel().catch(() => {})
  if (!response.ok || !serverDate) throw new Error('firebase_server_time_unavailable')

  const serverNow = Date.parse(serverDate)
  const localNow = Date.now()
  if (!Number.isFinite(serverNow) || Math.abs(serverNow - localNow) > MAX_SERVER_CLOCK_SKEW_MS) {
    throw new Error('firebase_server_time_unavailable')
  }
  return Math.round(serverNow)
}

function required(values, name) {
  const value = clean(values[name])
  if (!value) throw new Error(`cli_argument_missing_${name}`)
  return value
}

export function validateStagingSubscriptionFixtureCliCommand(parsed, env) {
  const { values, apply } = parsed
  const projectId = required(values, 'project')
  const instance = required(values, 'instance')
  const uid = required(values, 'uid')
  const type = required(values, 'operation').toLowerCase()
  const operationId = required(values, 'operation-id')
  const testAccountId = required(values, 'test-account-id').toLowerCase()
  const operatorId = required(values, 'operator-id')
  const reason = required(values, 'reason')
  const durationMinutes = ['grant', 'renew'].includes(type)
    ? Number(required(values, 'duration-minutes'))
    : 0

  if (projectId !== STAGING_SUBSCRIPTION_FIXTURE_PROJECT_ID) throw new Error('cli_project_mismatch')
  if (instance !== STAGING_SUBSCRIPTION_FIXTURE_DATABASE_INSTANCE) throw new Error('cli_database_instance_mismatch')

  const runtime = assessStagingSubscriptionFixtureRuntime(env)
  if (!runtime.enabled) {
    const error = new Error('staging_subscription_fixture_runtime_invalid')
    error.code = runtime.issues[0] || error.message
    throw error
  }
  if (runtime.projectId !== projectId) throw new Error('cli_runtime_project_mismatch')
  if (runtime.databaseInstance !== instance) throw new Error('cli_runtime_database_instance_mismatch')

  if (apply) {
    if (required(values, 'confirm-project') !== projectId) throw new Error('cli_project_confirmation_mismatch')
    if (required(values, 'confirm-uid') !== uid) throw new Error('cli_uid_confirmation_mismatch')
    if (required(values, 'confirm-test-account') !== testAccountId) {
      throw new Error('cli_test_account_confirmation_mismatch')
    }
    if (required(values, 'confirm-apply') !== APPLY_CONFIRMATION) throw new Error('cli_apply_confirmation_mismatch')
  }

  return {
    apply,
    projectId,
    instance,
    uid,
    type,
    operationId,
    testAccountId,
    operatorId,
    reason,
    durationMinutes,
  }
}

function sanitizedResult(command, operation, record) {
  return {
    ok: true,
    mode: command.apply ? 'apply' : 'dry-run',
    projectId: command.projectId,
    databaseInstance: command.instance,
    operation: command.type,
    duplicate: operation.duplicate === true,
    resultingStatus: record?.status || null,
    resultingRevision: Number(record?.revision || 0),
    expiresAt: Number(record?.expiresAt || 0) || null,
  }
}

export async function runStagingSubscriptionFixtureCli({
  argv = process.argv.slice(2),
  env = process.env,
} = {}) {
  const parsed = parseStagingSubscriptionFixtureCliArguments(argv)
  const command = validateStagingSubscriptionFixtureCliCommand(parsed, env)
  const credentials = readCredentials(env)
  if (
    credentials.projectId !== command.projectId
    || !credentials.clientEmail
    || !credentials.privateKey
  ) throw new Error('firebase_admin_credentials_environment_mismatch')

  const credential = cert(credentials)
  const app = initializeApp({
    credential,
    projectId: command.projectId,
    databaseURL: clean(env.FIREBASE_ADMIN_DATABASE_URL),
  }, `staging-subscription-fixture-${Date.now()}`)

  try {
    const authRecord = await getAuth(app).getUser(command.uid)
    if (authRecord.disabled) throw new Error('test_account_disabled')

    const database = getDatabase(app)
    // The Admin SDK rejects reads from .info/serverTimeOffset in this execution path.
    // Use the authenticated RTDB HTTPS response date instead; the local clock is only a skew guard.
    const [accountSnapshot, fixtureSnapshot, serverNow] = await Promise.all([
      database.ref(`users/${command.uid}`).get(),
      database.ref(`stagingSubscriptionFixtures/${command.uid}/client`).get(),
      readTrustedFirebaseServerNow({
        credential,
        databaseURL: env.FIREBASE_ADMIN_DATABASE_URL,
        uid: command.uid,
      }),
    ])
    if (!accountSnapshot.exists()) throw new Error('test_account_profile_missing')

    const account = accountSnapshot.val() || {}
    const commercialSubscription = getClientSubscriptionStatus(account, serverNow)
    if (
      commercialSubscription.active
      && ['grant', 'renew'].includes(command.type)
    ) throw new Error('commercial_subscription_already_active')

    const currentFixture = fixtureSnapshot.val()
    const expectedRevision = currentFixture && typeof currentFixture === 'object'
      ? Number(currentFixture.revision)
      : 0
    const input = {
      type: command.type,
      uid: command.uid,
      operationId: command.operationId,
      testAccountId: command.testAccountId,
      operatorId: command.operatorId,
      reason: command.reason,
      durationMinutes: command.durationMinutes,
      expectedRevision,
      now: serverNow,
    }
    const preview = applyStagingClientSubscriptionFixtureOperation(currentFixture, input)
    if (!preview.ok) throw new Error(preview.reason)

    if (!command.apply) {
      console.log(JSON.stringify(sanitizedResult(command, preview, preview.record)))
      return sanitizedResult(command, preview, preview.record)
    }

    const fixtureRef = database.ref(`stagingSubscriptionFixtures/${command.uid}/client`)
    let transactionOutcome = null
    const transaction = await fixtureRef.transaction((remoteCurrent) => {
      transactionOutcome = applyStagingClientSubscriptionFixtureOperation(remoteCurrent, input)
      if (!transactionOutcome.ok) return undefined
      return transactionOutcome.record
    }, undefined, false)

    if (!transaction.committed || !transactionOutcome?.ok) {
      throw new Error(transactionOutcome?.reason || 'fixture_transaction_not_committed')
    }

    const result = sanitizedResult(command, transactionOutcome, transaction.snapshot.val())
    console.log(JSON.stringify(result))
    return result
  } finally {
    await deleteApp(app)
  }
}

const isMain = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url

if (isMain) {
  runStagingSubscriptionFixtureCli().catch((error) => {
    console.error(JSON.stringify({
      ok: false,
      code: clean(error?.code || error?.message || 'staging_subscription_fixture_cli_failed'),
    }))
    process.exitCode = 1
  })
}
