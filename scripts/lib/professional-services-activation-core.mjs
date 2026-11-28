import {
  buildProfessionalServicesMigrationReport,
  sha256,
  stableJson,
} from './professional-services-migration-core.mjs'

export const PORTFOLIO2_STAGING_PROJECT_ID = 'corre-aqui-staging'
export const PORTFOLIO2_STAGING_INSTANCE = 'corre-aqui-staging-default-rtdb'
export const PORTFOLIO2_STAGING_BRANCH = 'codex/staging/consolidated-2026-09-07'
export const PORTFOLIO2_VERCEL_PROJECT_ID = 'prj_M3gKqNx4UkEzAEgL4pcyoYG5kTUB'
export const PORTFOLIO2_ACTIVATION_CONFIRMATION = 'APPLY_PORTFOLIO2_STAGING_MARKERS'
export const PORTFOLIO2_ROLLBACK_CONFIRMATION = 'ROLLBACK_PORTFOLIO2_STAGING_MARKERS'
export const PORTFOLIO2_REMOTE_WRITE_FLAG = 'PORTFOLIO2_REMOTE_WRITE_ENABLED'
export const PORTFOLIO2_READINESS_MAX_AGE_MS = 30 * 60 * 1_000

export class ProfessionalServicesActivationError extends Error {
  constructor(code, message = code) {
    super(message)
    this.name = 'ProfessionalServicesActivationError'
    this.code = code
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function valueAtPath(root, path) {
  return String(path || '').split('/').filter(Boolean).reduce((current, key) => current?.[key], root)
}

function setAtPath(root, path, value) {
  const parts = String(path || '').split('/').filter(Boolean)
  if (!parts.length) throw new ProfessionalServicesActivationError('portfolio2_activation_path_invalid')
  let current = root
  for (const part of parts.slice(0, -1)) {
    if (!isRecord(current[part])) current[part] = {}
    current = current[part]
  }
  const leaf = parts.at(-1)
  if (value === undefined || value === null) delete current[leaf]
  else current[leaf] = value
}

function rulesObject(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      throw new ProfessionalServicesActivationError('portfolio2_activation_rules_json_invalid')
    }
  }
  if (!isRecord(value)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_rules_invalid')
  }
  return value
}

export function canonicalRulesSha256(value) {
  const parsed = rulesObject(value)
  if (!isRecord(parsed.rules)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_rules_root_invalid')
  }
  return sha256(parsed)
}

export function assertPortfolio2RulesContract(value) {
  const parsed = rulesObject(value)
  const root = parsed.rules
  const ownerRules = root?.professionalServices?.['$uid']
  const serviceRules = ownerRules?.['$serviceId']
  const indexes = Array.isArray(ownerRules?.['.indexOn']) ? ownerRules['.indexOn'] : []
  const userMarkerValidation = root?.users?.['$uid']?.portfolioSchemaVersion?.['.validate']
  const publicMarkerValidation = root?.publicProfiles?.['$uid']?.portfolioSchemaVersion?.['.validate']
  if (
    ownerRules?.['.write'] !== false
    || serviceRules?.['.write'] !== false
    || typeof ownerRules?.['.read'] !== 'string'
    || !ownerRules['.read'].includes("query.orderByChild === 'ativo'")
    || !ownerRules['.read'].includes('query.equalTo === true')
    || !indexes.includes('ativo')
    || serviceRules?.['$other']?.['.validate'] !== false
    || userMarkerValidation !== 'newData.val() === data.val()'
    || publicMarkerValidation !== 'newData.val() === data.val()'
  ) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_rules_contract_missing')
  }
  return true
}

export function assertPortfolio2ActivationTarget({ projectId, instance }) {
  if (projectId !== PORTFOLIO2_STAGING_PROJECT_ID) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_project_forbidden')
  }
  if (instance !== PORTFOLIO2_STAGING_INSTANCE) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_instance_forbidden')
  }
}

function assertReleaseReadiness(readiness, { projectId, instance, plannedAt }) {
  if (!isRecord(readiness)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_readiness_missing')
  }
  if (
    readiness.version !== 1
    || readiness.environment !== 'staging'
    || readiness.target !== 'preview'
    || readiness.projectId !== projectId
    || readiness.instance !== instance
    || readiness.branch !== PORTFOLIO2_STAGING_BRANCH
    || readiness.vercelProjectId !== PORTFOLIO2_VERCEL_PROJECT_ID
    || readiness.schemaVersion !== 2
  ) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_readiness_target_mismatch')
  }
  if (readiness.codeReady !== true || readiness.rulesReady !== true) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_release_not_ready')
  }
  if (!/^[a-f0-9]{7,64}$/i.test(String(readiness.codeCommit || ''))) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_commit_invalid')
  }
  const verifiedAt = Number(readiness.verifiedAt)
  const expiresAt = Number(readiness.expiresAt)
  if (
    !Number.isSafeInteger(verifiedAt)
    || !Number.isSafeInteger(expiresAt)
    || verifiedAt <= 0
    || expiresAt <= verifiedAt
    || verifiedAt > plannedAt + 5 * 60 * 1_000
    || plannedAt - verifiedAt > PORTFOLIO2_READINESS_MAX_AGE_MS
    || expiresAt < plannedAt
  ) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_readiness_expired')
  }
}

function markerExpectedValue(value) {
  return value === undefined ? null : value
}

export function buildPortfolio2ActivationPlan({
  projectId,
  instance,
  snapshot,
  migrationDecisions,
  localRules,
  publishedRules,
  readiness,
  snapshotFileHash,
  decisionManifestFileHash,
  plannedAt = Date.now(),
} = {}) {
  assertPortfolio2ActivationTarget({ projectId, instance })
  if (!isRecord(snapshot)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_snapshot_invalid')
  }
  const timestamp = Number(plannedAt)
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_time_invalid')
  }
  assertReleaseReadiness(readiness, { projectId, instance, plannedAt: timestamp })
  if (!/^[a-f0-9]{64}$/i.test(String(snapshotFileHash || ''))) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_snapshot_file_hash_invalid')
  }
  if (!/^[a-f0-9]{64}$/i.test(String(decisionManifestFileHash || ''))) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_decision_file_hash_invalid')
  }

  assertPortfolio2RulesContract(localRules)
  assertPortfolio2RulesContract(publishedRules)
  const localRulesHash = canonicalRulesSha256(localRules)
  const publishedRulesHash = canonicalRulesSha256(publishedRules)
  if (localRulesHash !== publishedRulesHash) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_rules_mismatch')
  }

  const migrationReport = buildProfessionalServicesMigrationReport(snapshot, {
    plannedAt: timestamp,
    sourceLabel: 'portfolio2-activation-snapshot',
    migrationDecisions,
  })
  if (
    migrationReport.counts.uids !== 1
    || migrationReport.counts.ready !== 1
    || migrationReport.counts.blocked !== 0
    || migrationReport.counts.pendingCreates !== 0
    || migrationReport.counts.legacyRecords !== 6
    || migrationReport.counts.duplicates !== 5
    || migrationReport.counts.explicitlyDispensed !== 1
    || migrationReport.counts.dispensedLegacyRecords !== 6
    || migrationReport.migrationDecisions.count !== 1
    || migrationReport.migrationDecisions.used !== 1
    || migrationReport.migrationDecisions.entries[0]?.matchedLegacyRecords !== 6
  ) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_migration_plan_not_marker_only')
  }

  const uidReport = migrationReport.uids[0]
  if (
    uidReport.plan?.createOperations?.length !== 0
    || uidReport.plan?.markerOperations?.length !== 2
    || uidReport.plan?.verification?.expectedFinalServiceCount !== 0
    || uidReport.inventory?.length !== 6
    || uidReport.inventory.some(({ count }) => count !== 1)
  ) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_plan_shape_invalid')
  }

  const markerPaths = uidReport.plan.markerOperations.map(({ path, expectedValue, value }) => ({
    path,
    expectedValue: markerExpectedValue(expectedValue),
    value,
  }))
  const expectedMarkerPaths = new Set([
    `users/${uidReport.uid}/portfolioSchemaVersion`,
    `publicProfiles/${uidReport.uid}/portfolioSchemaVersion`,
  ])
  if (
    markerPaths.some(({ path, value }) => !expectedMarkerPaths.has(path) || value !== 2)
    || new Set(markerPaths.map(({ path }) => path)).size !== 2
  ) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_marker_paths_invalid')
  }

  const planCore = {
    version: 1,
    mode: 'dry-run',
    remoteAccess: false,
    writesPerformed: false,
    projectId,
    instance,
    plannedAt: timestamp,
    uid: uidReport.uid,
    uidHash: sha256(uidReport.uid).slice(0, 16),
    snapshotFileHash: String(snapshotFileHash).toLowerCase(),
    decisionManifestFileHash: String(decisionManifestFileHash).toLowerCase(),
    snapshotHash: sha256(snapshot),
    migrationReportHash: migrationReport.reportHash,
    decisionManifestHash: sha256(migrationDecisions),
    localRulesHash,
    publishedRulesHash,
    readinessHash: sha256(readiness),
    codeCommit: readiness.codeCommit,
    legacyExpectations: uidReport.inventory.map(({ source, path, count, sourceHash }) => ({
      source,
      path,
      count,
      sourceHash,
    })),
    expectedCanonicalServiceHashes: uidReport.plan.verification.expectedFinalServiceHashes,
    expectedCanonicalServiceCount: uidReport.plan.verification.expectedFinalServiceCount,
    markerOperations: markerPaths,
    decisionSummary: {
      count: migrationReport.migrationDecisions.count,
      matchedLegacyRecords: migrationReport.migrationDecisions.entries[0]?.matchedLegacyRecords || 0,
      action: migrationReport.migrationDecisions.entries[0]?.action || '',
      reasonCode: migrationReport.migrationDecisions.entries[0]?.reasonCode || '',
    },
    rollback: clone(uidReport.plan.rollback),
  }
  return { ...planCore, planHash: sha256(planCore) }
}

function normalizeRootForSnapshotHash(root, plan) {
  const normalized = clone(root)
  for (const operation of plan.markerOperations) {
    setAtPath(normalized, operation.path, operation.expectedValue)
  }
  return normalized
}

function canonicalCollectionMatches(root, plan) {
  const collection = valueAtPath(root, `professionalServices/${plan.uid}`)
  const current = isRecord(collection) ? collection : {}
  const expected = isRecord(plan.expectedCanonicalServiceHashes)
    ? plan.expectedCanonicalServiceHashes
    : {}
  const currentIds = Object.keys(current).sort()
  const expectedIds = Object.keys(expected).sort()
  return stableJson(currentIds) === stableJson(expectedIds)
    && expectedIds.every((serviceId) => sha256(current[serviceId]) === expected[serviceId])
}

export function validatePortfolio2ActivationState(root, plan) {
  if (!isRecord(root)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_database_root_invalid')
  }
  if (!isRecord(plan)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_plan_invalid')
  }
  const { planHash, ...planCore } = plan
  if (
    plan.projectId !== PORTFOLIO2_STAGING_PROJECT_ID
    || plan.instance !== PORTFOLIO2_STAGING_INSTANCE
    || !/^[a-f0-9]{64}$/i.test(String(planHash || ''))
    || sha256(planCore) !== planHash
  ) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_plan_invalid')
  }
  if (!isRecord(valueAtPath(root, `users/${plan.uid}`))) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_owner_missing')
  }
  for (const expected of plan.legacyExpectations) {
    if (sha256(valueAtPath(root, expected.path) ?? null) !== expected.sourceHash) {
      throw new ProfessionalServicesActivationError('portfolio2_activation_legacy_changed')
    }
  }
  if (!canonicalCollectionMatches(root, plan)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_canonical_collection_changed')
  }

  const markerValues = plan.markerOperations.map(({ path }) => valueAtPath(root, path) ?? null)
  const expectedMarkers = plan.markerOperations.map(({ expectedValue }) => expectedValue ?? null)
  const markersExpected = stableJson(markerValues) === stableJson(expectedMarkers)
  const markersActive = markerValues.every((value) => Number(value) === 2)
  if (!markersExpected && !markersActive) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_marker_state_partial_or_changed')
  }

  const normalized = markersActive ? normalizeRootForSnapshotHash(root, plan) : root
  if (sha256(normalized) !== plan.snapshotHash) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_snapshot_stale')
  }
  return {
    ok: true,
    status: markersActive ? 'already_active' : 'ready',
    idempotent: markersActive,
  }
}

export async function executePortfolio2Activation({
  transport,
  plan,
  onAfterPreflight = null,
  onValidatedTransactionAttempt = null,
} = {}) {
  if (!transport?.readRoot || !transport?.conditionalReplaceRoot || !isRecord(plan)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_executor_invalid')
  }
  const initial = await transport.readRoot()
  const initialState = validatePortfolio2ActivationState(initial.value, plan)
  if (initialState.idempotent) {
    return { committed: false, idempotent: true, status: 'already_active', attempts: 0 }
  }
  if (typeof onAfterPreflight === 'function') await onAfterPreflight()
  try {
    if (typeof onValidatedTransactionAttempt === 'function') {
      onValidatedTransactionAttempt({ transactionAttempts: 1, totalAttempts: 1 })
    }
  } catch {
    throw new ProfessionalServicesActivationError('portfolio2_activation_precommit_failed')
  }
  const next = clone(initial.value)
  for (const operation of plan.markerOperations) setAtPath(next, operation.path, 2)
  const result = await transport.conditionalReplaceRoot(next, initial.version)
  if (!result.committed) {
    const latest = await transport.readRoot()
    const latestState = validatePortfolio2ActivationState(latest.value, plan)
    if (latestState.idempotent) {
      return { committed: false, idempotent: true, status: 'already_active', attempts: 1 }
    }
    throw new ProfessionalServicesActivationError('portfolio2_activation_concurrent_change')
  }
  const finalSnapshot = await transport.readRoot()
  const finalState = validatePortfolio2ActivationState(finalSnapshot.value, plan)
  if (!finalState.idempotent) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_postcondition_failed')
  }
  return { committed: true, idempotent: false, status: 'activated', attempts: 1 }
}

export async function executePortfolio2ActivationRollback({
  transport,
  plan,
} = {}) {
  if (!transport?.readRoot || !transport?.conditionalReplaceRoot || !isRecord(plan)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_executor_invalid')
  }
  const initial = await transport.readRoot()
  const initialState = validatePortfolio2ActivationState(initial.value, plan)
  if (!initialState.idempotent) {
    return { committed: false, idempotent: true, status: 'already_rolled_back', attempts: 0 }
  }
  const next = clone(initial.value)
  for (const operation of plan.markerOperations) {
    setAtPath(next, operation.path, operation.expectedValue)
  }
  const result = await transport.conditionalReplaceRoot(next, initial.version)
  if (!result.committed) {
    const latest = await transport.readRoot()
    const latestState = validatePortfolio2ActivationState(latest.value, plan)
    if (!latestState.idempotent) {
      return { committed: false, idempotent: true, status: 'already_rolled_back', attempts: 1 }
    }
    throw new ProfessionalServicesActivationError('portfolio2_activation_rollback_concurrent_change')
  }
  const finalSnapshot = await transport.readRoot()
  const finalState = validatePortfolio2ActivationState(finalSnapshot.value, plan)
  if (finalState.idempotent) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_rollback_postcondition_failed')
  }
  return { committed: true, idempotent: false, status: 'rolled_back', attempts: 1 }
}
