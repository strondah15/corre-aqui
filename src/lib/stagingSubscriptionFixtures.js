import {
  assessFirebaseEnvironment,
  normalizeFirebaseDatabaseUrl,
} from './commercialRuntimeConfig.js'

export const STAGING_SUBSCRIPTION_FIXTURE_VERSION = 1
export const STAGING_SUBSCRIPTION_FIXTURE_PROJECT_ID = 'corre-aqui-staging'
export const STAGING_SUBSCRIPTION_FIXTURE_DATABASE_INSTANCE = 'corre-aqui-staging-default-rtdb'
export const STAGING_SUBSCRIPTION_FIXTURE_SOURCE = 'staging_subscription_fixture_v1'
export const STAGING_SUBSCRIPTION_FIXTURE_MAX_DURATION_MINUTES = 7 * 24 * 60

const MIN_DURATION_MINUTES = 5
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
const ALLOWED_OPERATIONS = new Set(['grant', 'renew', 'expire', 'revoke'])
const ALLOWED_STATUSES = new Set(['active', 'expired', 'revoked'])
const FORBIDDEN_PAYMENT_FIELDS = [
  'amount',
  'amountInCents',
  'currency',
  'paid',
  'paymentId',
  'paymentReference',
  'revenue',
]

function cleanText(value, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength)
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function validFirebaseKey(value, maxLength = 128) {
  const normalized = cleanText(value, maxLength)
  return normalized.length > 0
    && normalized.length <= maxLength
    && !/[\u0000-\u001F\u007F.#$\[\]/]/.test(normalized)
}

function validOperationId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(cleanText(value, 128))
}

function validTestAccountId(value) {
  return /^test-[a-z0-9][a-z0-9_-]{2,48}$/.test(cleanText(value, 54).toLowerCase())
}

function validOperatorId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9_.:@-]{2,79}$/.test(cleanText(value, 80))
}

function positiveTimestamp(value) {
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 0
}

function databaseInstanceFromOrigin(origin) {
  const parsed = normalizeFirebaseDatabaseUrl(origin)
  if (!parsed.valid) return ''
  const hostname = new URL(parsed.origin).hostname.toLowerCase()
  if (hostname.endsWith('.firebaseio.com')) {
    return hostname.slice(0, -'.firebaseio.com'.length)
  }
  const marker = '.firebasedatabase.app'
  if (!hostname.endsWith(marker)) return ''
  const prefix = hostname.slice(0, -marker.length)
  const regionalSeparator = prefix.indexOf('.')
  return regionalSeparator === -1 ? prefix : prefix.slice(0, regionalSeparator)
}

function hasForbiddenPaymentFields(record) {
  if (!record || typeof record !== 'object') return false
  if (Array.isArray(record)) return record.some((item) => hasForbiddenPaymentFields(item))
  return Object.entries(record).some(([field, value]) => (
    FORBIDDEN_PAYMENT_FIELDS.includes(field)
    || hasForbiddenPaymentFields(value)
  ))
}

function operationSignature(input) {
  return JSON.stringify([
    input.type,
    input.uid,
    input.testAccountId,
    input.durationMinutes,
    input.operatorId,
    input.reason,
  ])
}

function immutableFixtureIdentityMatches(record, input) {
  return record.version === STAGING_SUBSCRIPTION_FIXTURE_VERSION
    && record.kind === 'client'
    && record.source === STAGING_SUBSCRIPTION_FIXTURE_SOURCE
    && record.accountType === 'dedicated_test'
    && record.subjectUid === input.uid
    && record.testAccountId === input.testAccountId
}

function currentFixtureStructureIsValid(record, now) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false
  const issuedAt = positiveTimestamp(record.issuedAt)
  const expiresAt = positiveTimestamp(record.expiresAt)
  const updatedAt = positiveTimestamp(record.updatedAt)
  const revision = Number(record.revision)
  const operations = record.operations
  return ALLOWED_STATUSES.has(record.status)
    && issuedAt > 0
    && issuedAt <= now + MAX_CLOCK_SKEW_MS
    && expiresAt > 0
    && expiresAt <= issuedAt + (STAGING_SUBSCRIPTION_FIXTURE_MAX_DURATION_MINUTES * 60_000)
    && updatedAt >= issuedAt
    && updatedAt <= now + MAX_CLOCK_SKEW_MS
    && (record.status !== 'active' || expiresAt > issuedAt)
    && Number.isSafeInteger(revision)
    && revision >= 1
    && validOperationId(record.lastOperationId)
    && operations
    && typeof operations === 'object'
    && !Array.isArray(operations)
    && !!operations[record.lastOperationId]
}

export function assessStagingSubscriptionFixtureRuntime(env = process.env) {
  const issues = []
  const enabledFlag = cleanText(env.STAGING_SUBSCRIPTION_FIXTURES_ENABLED) === 'true'
  const environment = cleanText(env.CORRE_AQUI_ENV)
  const vercelEnvironment = cleanText(env.VERCEL_ENV)

  if (!enabledFlag) issues.push('staging_subscription_fixtures_flag_not_enabled')
  if (environment !== 'staging') issues.push('staging_subscription_fixtures_environment_mismatch')
  if (vercelEnvironment && !['preview', 'development'].includes(vercelEnvironment)) {
    issues.push('staging_subscription_fixtures_vercel_environment_mismatch')
  }

  const firebase = assessFirebaseEnvironment(env, {
    requireEnvironment: true,
    requireExplicitAdminDatabase: true,
    requireClientConfiguration: true,
  })
  issues.push(...firebase.issues)

  if (firebase.expectedProjectId !== STAGING_SUBSCRIPTION_FIXTURE_PROJECT_ID) {
    issues.push('staging_subscription_fixtures_expected_project_mismatch')
  }
  if (firebase.adminProjectId !== STAGING_SUBSCRIPTION_FIXTURE_PROJECT_ID) {
    issues.push('staging_subscription_fixtures_admin_project_mismatch')
  }
  if (firebase.clientProjectId !== STAGING_SUBSCRIPTION_FIXTURE_PROJECT_ID) {
    issues.push('staging_subscription_fixtures_client_project_mismatch')
  }

  const adminDatabaseInstance = databaseInstanceFromOrigin(firebase.adminDatabaseOrigin)
  const clientDatabaseInstance = databaseInstanceFromOrigin(firebase.clientDatabaseOrigin)
  if (adminDatabaseInstance !== STAGING_SUBSCRIPTION_FIXTURE_DATABASE_INSTANCE) {
    issues.push('staging_subscription_fixtures_admin_database_instance_mismatch')
  }
  if (clientDatabaseInstance !== STAGING_SUBSCRIPTION_FIXTURE_DATABASE_INSTANCE) {
    issues.push('staging_subscription_fixtures_client_database_instance_mismatch')
  }

  const normalizedIssues = unique(issues)
  return Object.freeze({
    enabled: normalizedIssues.length === 0,
    issues: Object.freeze(normalizedIssues),
    environment,
    projectId: firebase.adminProjectId,
    databaseInstance: adminDatabaseInstance,
  })
}

export function assessStagingClientSubscriptionFixture(fixture, options = {}) {
  const uid = cleanText(options.uid, 128)
  const now = positiveTimestamp(options.now) || Date.now()
  const runtime = options.runtime || assessStagingSubscriptionFixtureRuntime(options.env)
  const issues = []

  if (!runtime?.enabled) issues.push('staging_subscription_fixture_runtime_disabled')
  if (!uid || !validFirebaseKey(uid)) issues.push('staging_subscription_fixture_uid_invalid')
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
    issues.push('staging_subscription_fixture_missing')
  } else {
    const issuedAt = positiveTimestamp(fixture.issuedAt)
    const updatedAt = positiveTimestamp(fixture.updatedAt)
    const expiresAt = positiveTimestamp(fixture.expiresAt)
    const revision = Number(fixture.revision)
    const operations = fixture.operations

    if (fixture.version !== STAGING_SUBSCRIPTION_FIXTURE_VERSION) issues.push('staging_subscription_fixture_version_invalid')
    if (fixture.kind !== 'client') issues.push('staging_subscription_fixture_kind_invalid')
    if (fixture.source !== STAGING_SUBSCRIPTION_FIXTURE_SOURCE) issues.push('staging_subscription_fixture_source_invalid')
    if (fixture.accountType !== 'dedicated_test') issues.push('staging_subscription_fixture_account_type_invalid')
    if (fixture.subjectUid !== uid) issues.push('staging_subscription_fixture_subject_mismatch')
    if (!validTestAccountId(fixture.testAccountId)) issues.push('staging_subscription_fixture_test_account_invalid')
    if (!ALLOWED_STATUSES.has(fixture.status)) issues.push('staging_subscription_fixture_status_invalid')
    if (fixture.status !== 'active') issues.push('staging_subscription_fixture_not_active')
    if (!issuedAt || issuedAt > now + MAX_CLOCK_SKEW_MS) issues.push('staging_subscription_fixture_issued_at_invalid')
    if (!updatedAt || updatedAt < issuedAt || updatedAt > now + MAX_CLOCK_SKEW_MS) {
      issues.push('staging_subscription_fixture_updated_at_invalid')
    }
    if (!expiresAt || expiresAt <= now) issues.push('staging_subscription_fixture_expired')
    if (issuedAt && expiresAt > issuedAt + (STAGING_SUBSCRIPTION_FIXTURE_MAX_DURATION_MINUTES * 60_000)) {
      issues.push('staging_subscription_fixture_duration_exceeded')
    }
    if (!Number.isSafeInteger(revision) || revision < 1) issues.push('staging_subscription_fixture_revision_invalid')
    if (!validOperationId(fixture.lastOperationId)) issues.push('staging_subscription_fixture_last_operation_invalid')
    if (!operations || typeof operations !== 'object' || Array.isArray(operations)) {
      issues.push('staging_subscription_fixture_operations_invalid')
    } else if (!operations[fixture.lastOperationId]) {
      issues.push('staging_subscription_fixture_last_operation_missing')
    }
    if (hasForbiddenPaymentFields(fixture)) issues.push('staging_subscription_fixture_payment_data_forbidden')
  }

  const normalizedIssues = unique(issues)
  return Object.freeze({
    allowed: normalizedIssues.length === 0,
    reason: normalizedIssues[0] || 'staging_subscription_fixture_active',
    issues: Object.freeze(normalizedIssues),
  })
}

export function resolveClientDirectRequestAccessWithFixture({
  commercialAccess,
  fixture,
  uid,
  now = Date.now(),
  env = process.env,
  runtime,
} = {}) {
  if (commercialAccess?.allowed === true) {
    return Object.freeze({
      ...commercialAccess,
      accessSource: 'commercial_subscription',
    })
  }

  const fixtureAccess = assessStagingClientSubscriptionFixture(fixture, {
    uid,
    now,
    env,
    runtime,
  })
  if (fixtureAccess.allowed) {
    return Object.freeze({
      allowed: true,
      reason: 'staging_subscription_fixture',
      subscription: commercialAccess?.subscription || null,
      accessSource: 'staging_subscription_fixture',
    })
  }

  return Object.freeze({
    allowed: false,
    reason: commercialAccess?.reason || 'client_direct_subscription_required',
    subscription: commercialAccess?.subscription || null,
    accessSource: 'none',
  })
}

export function applyStagingClientSubscriptionFixtureOperation(currentValue, rawInput = {}) {
  const type = cleanText(rawInput.type, 20).toLowerCase()
  const uid = cleanText(rawInput.uid, 128)
  const operationId = cleanText(rawInput.operationId, 128)
  const testAccountId = cleanText(rawInput.testAccountId, 54).toLowerCase()
  const operatorId = cleanText(rawInput.operatorId, 80)
  const reason = cleanText(rawInput.reason, 200)
  const now = positiveTimestamp(rawInput.now)
  const expectedRevision = Number(rawInput.expectedRevision)
  const durationMinutes = ['grant', 'renew'].includes(type)
    ? Number(rawInput.durationMinutes)
    : 0

  if (!ALLOWED_OPERATIONS.has(type)) return { ok: false, reason: 'operation_invalid' }
  if (!validFirebaseKey(uid)) return { ok: false, reason: 'uid_invalid' }
  if (!validOperationId(operationId)) return { ok: false, reason: 'operation_id_invalid' }
  if (!validTestAccountId(testAccountId)) return { ok: false, reason: 'test_account_id_invalid' }
  if (!validOperatorId(operatorId)) return { ok: false, reason: 'operator_id_invalid' }
  if (!reason) return { ok: false, reason: 'reason_required' }
  if (!now) return { ok: false, reason: 'operation_time_invalid' }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { ok: false, reason: 'expected_revision_invalid' }
  }
  if (
    ['grant', 'renew'].includes(type)
    && (!Number.isSafeInteger(durationMinutes)
      || durationMinutes < MIN_DURATION_MINUTES
      || durationMinutes > STAGING_SUBSCRIPTION_FIXTURE_MAX_DURATION_MINUTES)
  ) {
    return { ok: false, reason: 'duration_invalid' }
  }

  const input = {
    type,
    uid,
    operationId,
    testAccountId,
    operatorId,
    reason,
    now,
    expectedRevision,
    durationMinutes,
  }
  const signature = operationSignature(input)
  const current = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
    ? currentValue
    : null
  const currentOperations = current?.operations && typeof current.operations === 'object' && !Array.isArray(current.operations)
    ? current.operations
    : {}
  const previousOperation = currentOperations[operationId]

  if (current && !immutableFixtureIdentityMatches(current, input)) {
    return { ok: false, reason: 'fixture_identity_mismatch' }
  }
  if (current && !currentFixtureStructureIsValid(current, now)) {
    return { ok: false, reason: 'fixture_structure_invalid' }
  }
  if (current && hasForbiddenPaymentFields(current)) {
    return { ok: false, reason: 'fixture_payment_data_forbidden' }
  }

  if (previousOperation) {
    if (previousOperation.signature !== signature) {
      return { ok: false, reason: 'operation_id_conflict' }
    }
    return { ok: true, duplicate: true, record: current }
  }

  const currentRevision = current ? Number(current.revision) : 0
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 0) {
    return { ok: false, reason: 'fixture_revision_invalid' }
  }
  if (currentRevision !== expectedRevision) return { ok: false, reason: 'stale_revision' }

  if (!current && type !== 'grant') return { ok: false, reason: 'fixture_not_found' }
  if (current && type === 'grant' && current.status === 'active' && positiveTimestamp(current.expiresAt) > now) {
    return { ok: false, reason: 'fixture_already_active' }
  }
  if (type === 'renew' && (current?.status !== 'active' || positiveTimestamp(current.expiresAt) <= now)) {
    return { ok: false, reason: 'fixture_not_active' }
  }

  const issuedAt = type === 'grant' ? now : positiveTimestamp(current?.issuedAt)
  if (!issuedAt) return { ok: false, reason: 'fixture_issued_at_invalid' }
  const maximumExpiry = issuedAt + (STAGING_SUBSCRIPTION_FIXTURE_MAX_DURATION_MINUTES * 60_000)
  let nextStatus = current?.status || 'expired'
  let nextExpiresAt = positiveTimestamp(current?.expiresAt) || (now - 1)

  if (type === 'grant') {
    nextStatus = 'active'
    nextExpiresAt = now + (durationMinutes * 60_000)
  } else if (type === 'renew') {
    nextStatus = 'active'
    nextExpiresAt = positiveTimestamp(current.expiresAt) + (durationMinutes * 60_000)
  } else if (type === 'expire') {
    nextStatus = 'expired'
    nextExpiresAt = Math.max(1, now - 1)
  } else if (type === 'revoke') {
    nextStatus = 'revoked'
    nextExpiresAt = Math.max(1, now - 1)
  }

  if (nextExpiresAt > maximumExpiry) return { ok: false, reason: 'maximum_fixture_duration_exceeded' }

  const nextRevision = currentRevision + 1
  const auditEntry = {
    operationId,
    signature,
    type,
    operatorId,
    reason,
    appliedAt: now,
    previousStatus: current?.status || 'missing',
    nextStatus,
    previousExpiresAt: positiveTimestamp(current?.expiresAt) || null,
    nextExpiresAt,
    revision: nextRevision,
  }

  const record = {
    ...(current || {}),
    version: STAGING_SUBSCRIPTION_FIXTURE_VERSION,
    kind: 'client',
    source: STAGING_SUBSCRIPTION_FIXTURE_SOURCE,
    accountType: 'dedicated_test',
    subjectUid: uid,
    testAccountId,
    status: nextStatus,
    issuedAt,
    expiresAt: nextExpiresAt,
    updatedAt: now,
    revision: nextRevision,
    lastOperationId: operationId,
    operations: {
      ...currentOperations,
      [operationId]: auditEntry,
    },
  }
  if (type === 'revoke') record.revokedAt = now
  else delete record.revokedAt

  return { ok: true, duplicate: false, record }
}
