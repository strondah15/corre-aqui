import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { deleteApp, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

import {
  PORTFOLIO2_STAGING_INSTANCE,
  PORTFOLIO2_STAGING_BRANCH,
  PORTFOLIO2_STAGING_PROJECT_ID,
  PORTFOLIO2_VERCEL_PROJECT_ID,
  ProfessionalServicesActivationError,
  buildPortfolio2ActivationPlan,
  executePortfolio2Activation,
  executePortfolio2ActivationRollback,
  validatePortfolio2ActivationState,
} from './lib/professional-services-activation-core.mjs'
import {
  PROFESSIONAL_SERVICES_TEST_EXCLUSION_CONFIRMATION,
  buildProfessionalServicesMigrationReport,
  sha256,
} from './lib/professional-services-migration-core.mjs'
import {
  PORTFOLIO2_STAGING_WRITER_IDENTITY,
  inspectPortfolio2WriterCredential,
} from './lib/portfolio2-writer-auth.mjs'
import { createPortfolio2RtdbRestTransport } from './lib/portfolio2-rtdb-transport.mjs'

const PROJECT_ID = 'demo-corre-aqui-security'
const UID = 'portfolio2-test-owner'
const NOW = Date.now()
const rawHost = String(process.env.FIREBASE_DATABASE_EMULATOR_HOST || '')
const hostMatch = rawHost.match(/^(localhost|127\.0\.0\.1):(\d+)$/)

if (!hostMatch) {
  throw new Error('Execute este teste pelo script test:professional-services:activation:emulator.')
}

const service = {
  id: 'legacy_test_service',
  nome: 'Serviço legado fictício',
  descricao: 'Registro de teste sem preço, dispensado explicitamente.',
  categoriaId: 'reparos',
  categoriaNome: 'Reparos',
  faixaPreco: '',
  tempoMedio: '1 hora',
  regiao: 'Região fictícia',
  atendeDomicilio: true,
  urgente: false,
  ativo: true,
  fotos: ['https://images.example.test/legacy.webp'],
  createdAt: NOW - 10_000,
  updatedAt: NOW - 5_000,
}

function baseSnapshot() {
  return {
    users: {
      [UID]: {
        portfolio: { legacy_test_service: structuredClone(service) },
        profPortfolio: { legacy_test_service: structuredClone(service) },
        profile: {
          profPortfolio: { legacy_test_service: structuredClone(service) },
          portfolio: { legacy_test_service: structuredClone(service) },
        },
      },
    },
    publicProfiles: {
      [UID]: {
        uid: UID,
        portfolio: { legacy_test_service: structuredClone(service) },
      },
    },
    publicPortfolio: {
      [UID]: { legacy_test_service: structuredClone(service) },
    },
  }
}

function migrationDecision(snapshot) {
  const unresolved = buildProfessionalServicesMigrationReport(snapshot, { plannedAt: NOW })
  const resolutionRef = unresolved.uids[0]?.manualResolutionRequirements?.[0]?.resolutionRef
  assert.match(resolutionRef, /^[a-f0-9]{64}$/)
  return {
    version: 1,
    inputHash: sha256(snapshot),
    confirmation: PROFESSIONAL_SERVICES_TEST_EXCLUSION_CONFIRMATION,
    confirmedAt: NOW - 1_000,
    decisions: [{
      serviceRef: resolutionRef,
      action: 'exclude_from_v2',
      reasonCode: 'owner_confirmed_test_service',
    }],
  }
}

function readiness(overrides = {}) {
  return {
    version: 1,
    feature: 'professional_services_v2',
    environment: 'staging',
    target: 'preview',
    projectId: PORTFOLIO2_STAGING_PROJECT_ID,
    instance: PORTFOLIO2_STAGING_INSTANCE,
    branch: PORTFOLIO2_STAGING_BRANCH,
    vercelProjectId: PORTFOLIO2_VERCEL_PROJECT_ID,
    schemaVersion: 2,
    codeReady: true,
    rulesReady: true,
    codeCommit: 'a'.repeat(40),
    verifiedAt: NOW - 1_000,
    expiresAt: NOW + 5 * 60_000,
    ...overrides,
  }
}

function fileHash(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function lastJsonLine(value) {
  const lines = String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index])
    } catch {
      // Node may print module-format warnings before the structured CLI error.
    }
  }
  throw new Error('structured_cli_result_missing')
}

function activationPlan(snapshot, decisions, rules, overrides = {}) {
  return buildPortfolio2ActivationPlan({
    projectId: PORTFOLIO2_STAGING_PROJECT_ID,
    instance: PORTFOLIO2_STAGING_INSTANCE,
    snapshot,
    migrationDecisions: decisions,
    localRules: rules,
    publishedRules: rules,
    readiness: readiness(overrides.readiness),
    snapshotFileHash: fileHash(JSON.stringify(snapshot)),
    decisionManifestFileHash: fileHash(JSON.stringify(decisions)),
    plannedAt: NOW,
    ...overrides.plan,
  })
}

async function expectActivationError(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof ProfessionalServicesActivationError && error.code === code,
  )
}

const rulesText = await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')
const rules = JSON.parse(rulesText)
const snapshot = baseSnapshot()
const decisions = migrationDecision(snapshot)
const plan = activationPlan(snapshot, decisions, rules)

assert.equal(plan.expectedCanonicalServiceCount, 0)
assert.equal(plan.markerOperations.length, 2)
assert.equal(plan.legacyExpectations.length, 6)
assert.equal(plan.decisionSummary.matchedLegacyRecords, 6)
assert.equal(validatePortfolio2ActivationState(snapshot, plan).status, 'ready')

assert.throws(
  () => buildPortfolio2ActivationPlan({
    projectId: 'corre-aqui-3f9ec',
    instance: PORTFOLIO2_STAGING_INSTANCE,
  }),
  (error) => error.code === 'portfolio2_activation_project_forbidden',
)
assert.throws(
  () => activationPlan(snapshot, decisions, { rules: { '.read': false, '.write': false } }),
  (error) => error.code === 'portfolio2_activation_rules_contract_missing',
)
assert.throws(
  () => activationPlan(snapshot, decisions, rules, { readiness: { codeReady: false } }),
  (error) => error.code === 'portfolio2_activation_release_not_ready',
)

const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'corre-aqui-portfolio2-activation-'))
try {
  const wifPath = path.join(tempDirectory, 'writer.external-account.json')
  const subjectTokenPath = path.join(tempDirectory, 'subject-token.txt')
  await writeFile(subjectTokenPath, 'short-lived-fictitious-subject-token')
  await writeFile(wifPath, JSON.stringify({
    type: 'external_account',
    audience: '//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/test/providers/local',
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${PORTFOLIO2_STAGING_WRITER_IDENTITY}:generateAccessToken`,
    credential_source: { file: subjectTokenPath },
  }))
  const inspected = await inspectPortfolio2WriterCredential({
    credentialPath: wifPath,
    expectedIdentity: PORTFOLIO2_STAGING_WRITER_IDENTITY,
    repositoryRoot: process.cwd(),
  })
  assert.equal(inspected.credentialType, 'external_account')
  await writeFile(path.join(tempDirectory, 'forbidden-key.json'), JSON.stringify({
    type: 'service_account',
    private_key: 'not-a-real-key',
  }))
  await expectActivationError(inspectPortfolio2WriterCredential({
    credentialPath: path.join(tempDirectory, 'forbidden-key.json'),
    expectedIdentity: PORTFOLIO2_STAGING_WRITER_IDENTITY,
    repositoryRoot: process.cwd(),
  }), 'portfolio2_writer_key_file_forbidden')

  const snapshotPath = path.join(tempDirectory, 'snapshot.json')
  const decisionPath = path.join(tempDirectory, 'decisions.json')
  const localRulesPath = path.join(tempDirectory, 'local-rules.json')
  const publishedRulesPath = path.join(tempDirectory, 'published-rules.json')
  const readinessPath = path.join(tempDirectory, 'readiness.json')
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot))
  const decisionBytes = Buffer.from(JSON.stringify(decisions))
  await Promise.all([
    writeFile(snapshotPath, snapshotBytes),
    writeFile(decisionPath, decisionBytes),
    writeFile(localRulesPath, rulesText),
    writeFile(publishedRulesPath, rulesText),
    writeFile(readinessPath, JSON.stringify(readiness())),
  ])
  const cli = spawnSync(process.execPath, [
    path.resolve('scripts/activate-professional-services-v2.mjs'),
    '--project', PORTFOLIO2_STAGING_PROJECT_ID,
    '--instance', PORTFOLIO2_STAGING_INSTANCE,
    '--snapshot', snapshotPath,
    '--snapshot-sha256', fileHash(snapshotBytes),
    '--decisions', decisionPath,
    '--decisions-sha256', fileHash(decisionBytes),
    '--local-rules', localRulesPath,
    '--published-rules', publishedRulesPath,
    '--readiness', readinessPath,
  ], { encoding: 'utf8', cwd: process.cwd() })
  assert.equal(cli.status, 0, cli.stderr)
  const cliSummary = JSON.parse(cli.stdout)
  assert.equal(cliSummary.mode, 'dry-run')
  assert.equal(cliSummary.remoteAccess, false)
  assert.equal(cliSummary.writesPerformed, false)
  assert.equal(cliSummary.legacyRecordsVerified, 6)

  const disabledApply = spawnSync(process.execPath, [
    path.resolve('scripts/activate-professional-services-v2.mjs'),
    '--project', PORTFOLIO2_STAGING_PROJECT_ID,
    '--instance', PORTFOLIO2_STAGING_INSTANCE,
    '--snapshot', snapshotPath,
    '--snapshot-sha256', fileHash(snapshotBytes),
    '--decisions', decisionPath,
    '--decisions-sha256', fileHash(decisionBytes),
    '--local-rules', localRulesPath,
    '--apply',
  ], {
    encoding: 'utf8',
    cwd: process.cwd(),
    env: { ...process.env, PORTFOLIO2_REMOTE_WRITE_ENABLED: 'false' },
  })
  assert.notEqual(disabledApply.status, 0)
  assert.equal(lastJsonLine(disabledApply.stderr).code, 'portfolio2_activation_remote_write_disabled')
} finally {
  await rm(tempDirectory, { recursive: true, force: true })
}

const adminApp = initializeApp({
  projectId: PROJECT_ID,
  databaseURL: `http://${hostMatch[1]}:${hostMatch[2]}?ns=${PROJECT_ID}`,
}, `portfolio2-activation-emulator-${process.pid}`)
const database = getDatabase(adminApp)
const rootRef = database.ref('/')
const transport = createPortfolio2RtdbRestTransport({
  databaseURL: `http://${hostMatch[1]}:${hostMatch[2]}?ns=${PROJECT_ID}`,
  accessToken: 'owner',
})

try {
  await rootRef.set(snapshot)
  const activated = await executePortfolio2Activation({ transport, plan })
  assert.equal(activated.status, 'activated')
  assert.equal(activated.committed, true)
  let current = (await rootRef.get()).val()
  assert.equal(current.users[UID].portfolioSchemaVersion, 2)
  assert.equal(current.publicProfiles[UID].portfolioSchemaVersion, 2)
  assert.equal(current.professionalServices?.[UID], undefined)
  assert.equal(sha256(current.users[UID].portfolio), sha256(snapshot.users[UID].portfolio))
  assert.equal(sha256(current.publicPortfolio[UID]), sha256(snapshot.publicPortfolio[UID]))

  const repeated = await executePortfolio2Activation({ transport, plan })
  assert.equal(repeated.status, 'already_active')
  assert.equal(repeated.committed, false)

  await rootRef.set(snapshot)
  const concurrent = await Promise.all([
    executePortfolio2Activation({ transport, plan }),
    executePortfolio2Activation({ transport, plan }),
  ])
  assert.equal(concurrent.filter(({ committed }) => committed).length, 1)
  assert.equal(concurrent.filter(({ idempotent }) => idempotent).length, 1)
  current = (await rootRef.get()).val()
  assert.equal(current.users[UID].portfolioSchemaVersion, 2)
  assert.equal(current.publicProfiles[UID].portfolioSchemaVersion, 2)

  await rootRef.set(snapshot)
  await database.ref('unrelatedActivity').set({ changedAfterSnapshot: true })
  await expectActivationError(
    executePortfolio2Activation({ transport, plan }),
    'portfolio2_activation_snapshot_stale',
  )
  current = (await rootRef.get()).val()
  assert.equal(current.users[UID].portfolioSchemaVersion, undefined)
  assert.equal(current.publicProfiles[UID].portfolioSchemaVersion, undefined)

  await rootRef.set(snapshot)
  await database.ref(`professionalServices/${UID}/new_after_snapshot`).set({ id: 'new_after_snapshot' })
  await expectActivationError(
    executePortfolio2Activation({ transport, plan }),
    'portfolio2_activation_canonical_collection_changed',
  )
  assert.ok((await database.ref(`professionalServices/${UID}/new_after_snapshot`).get()).exists())

  await rootRef.set(snapshot)
  await database.ref(`users/${UID}/portfolioSchemaVersion`).set(2)
  await expectActivationError(
    executePortfolio2Activation({ transport, plan }),
    'portfolio2_activation_marker_state_partial_or_changed',
  )
  assert.equal((await database.ref(`publicProfiles/${UID}/portfolioSchemaVersion`).get()).exists(), false)

  await rootRef.set(snapshot)
  await expectActivationError(executePortfolio2Activation({
    transport,
    plan,
    onValidatedTransactionAttempt: () => {
      throw new Error('synthetic_failure_before_commit')
    },
  }), 'portfolio2_activation_precommit_failed')
  current = (await rootRef.get()).val()
  assert.equal(current.users[UID].portfolioSchemaVersion, undefined)
  assert.equal(current.publicProfiles[UID].portfolioSchemaVersion, undefined)

  await rootRef.set(snapshot)
  await executePortfolio2Activation({ transport, plan })
  const rolledBack = await executePortfolio2ActivationRollback({ transport, plan })
  assert.equal(rolledBack.status, 'rolled_back')
  current = (await rootRef.get()).val()
  assert.equal(current.users[UID].portfolioSchemaVersion, undefined)
  assert.equal(current.publicProfiles[UID].portfolioSchemaVersion, undefined)
  assert.equal(current.professionalServices?.[UID], undefined)
  const repeatedRollback = await executePortfolio2ActivationRollback({ transport, plan })
  assert.equal(repeatedRollback.status, 'already_rolled_back')

  await executePortfolio2Activation({ transport, plan })
  await database.ref(`professionalServices/${UID}/created_after_activation`).set({
    id: 'created_after_activation',
  })
  await expectActivationError(
    executePortfolio2ActivationRollback({ transport, plan }),
    'portfolio2_activation_canonical_collection_changed',
  )
  assert.ok((await database.ref(`professionalServices/${UID}/created_after_activation`).get()).exists())
  assert.equal((await database.ref(`users/${UID}/portfolioSchemaVersion`).get()).val(), 2)

  console.log('Portfolio 2.0 activation Emulator: dry-run, atomic markers, concurrency, stale snapshot, new service, partial marker, failure, idempotency and safe rollback PASS')
} finally {
  await deleteApp(adminApp)
}
