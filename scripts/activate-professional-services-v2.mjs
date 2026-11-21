import crypto from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  PORTFOLIO2_ACTIVATION_CONFIRMATION,
  PORTFOLIO2_REMOTE_WRITE_FLAG,
  PORTFOLIO2_ROLLBACK_CONFIRMATION,
  PORTFOLIO2_STAGING_INSTANCE,
  PORTFOLIO2_STAGING_PROJECT_ID,
  ProfessionalServicesActivationError,
  buildPortfolio2ActivationPlan,
  canonicalRulesSha256,
  executePortfolio2Activation,
  executePortfolio2ActivationRollback,
  validatePortfolio2ActivationState,
} from './lib/professional-services-activation-core.mjs'
import {
  PORTFOLIO2_STAGING_WRITER_IDENTITY,
  inspectPortfolio2WriterCredential,
  verifyPortfolio2WriterProjectIsolation,
} from './lib/portfolio2-writer-auth.mjs'
import { createPortfolio2RtdbRestTransport } from './lib/portfolio2-rtdb-transport.mjs'

const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024
const MAX_SMALL_JSON_BYTES = 2 * 1024 * 1024

function usage() {
  return [
    'Uso (DRY-RUN offline, padrão):',
    '  node scripts/activate-professional-services-v2.mjs --project corre-aqui-staging --instance corre-aqui-staging-default-rtdb --snapshot <backup.json> --snapshot-sha256 <sha256> --decisions <manifesto.json> --decisions-sha256 <sha256> --local-rules <database.rules.json> --published-rules <rules-export.json> --readiness <readiness.json>',
    '',
    'Aplicação remota futura (bloqueada sem todos os gates):',
    '  acrescentar --apply --database-url <url> --preview-url <url> --expected-commit <sha> --credential <external-account.json> --expected-writer portfolio2-activation-operator@corre-aqui-staging.iam.gserviceaccount.com --confirm APPLY_PORTFOLIO2_STAGING_MARKERS',
    '  e definir PORTFOLIO2_REMOTE_WRITE_ENABLED=true somente no processo.',
    '',
    'Rollback futuro:',
    '  acrescentar --rollback e usar --confirm ROLLBACK_PORTFOLIO2_STAGING_MARKERS.',
    '',
    'Nunca usa .firebaserc. Credenciais com private_key e credenciais dentro do repositório são recusadas.',
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    apply: false,
    rollback: false,
    help: false,
    projectId: '',
    instance: '',
    snapshot: '',
    snapshotSha256: '',
    decisions: '',
    decisionsSha256: '',
    localRules: '',
    publishedRules: '',
    readiness: '',
    databaseURL: '',
    previewURL: '',
    expectedCommit: '',
    credential: '',
    expectedWriter: '',
    confirmation: '',
  }
  const valueArgs = new Map([
    ['--project', 'projectId'],
    ['--instance', 'instance'],
    ['--snapshot', 'snapshot'],
    ['--snapshot-sha256', 'snapshotSha256'],
    ['--decisions', 'decisions'],
    ['--decisions-sha256', 'decisionsSha256'],
    ['--local-rules', 'localRules'],
    ['--published-rules', 'publishedRules'],
    ['--readiness', 'readiness'],
    ['--database-url', 'databaseURL'],
    ['--preview-url', 'previewURL'],
    ['--expected-commit', 'expectedCommit'],
    ['--credential', 'credential'],
    ['--expected-writer', 'expectedWriter'],
    ['--confirm', 'confirmation'],
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--apply') options.apply = true
    else if (arg === '--rollback') options.rollback = true
    else if (valueArgs.has(arg)) options[valueArgs.get(arg)] = argv[++index] || ''
    else throw new ProfessionalServicesActivationError('portfolio2_activation_argument_unknown')
  }
  return options
}

function rawSha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

async function readJsonFile(filePath, { maxBytes, code, expectedHash = '' } = {}) {
  if (!filePath) throw new ProfessionalServicesActivationError(`${code}_required`)
  const resolved = path.resolve(filePath)
  const metadata = await stat(resolved)
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > maxBytes) {
    throw new ProfessionalServicesActivationError(`${code}_size_invalid`)
  }
  const content = await readFile(resolved)
  const fileHash = rawSha256(content)
  if (expectedHash && fileHash !== String(expectedHash).toLowerCase()) {
    throw new ProfessionalServicesActivationError(`${code}_hash_mismatch`)
  }
  let value
  try {
    value = JSON.parse(content.toString('utf8'))
  } catch {
    throw new ProfessionalServicesActivationError(`${code}_json_invalid`)
  }
  return { resolved, value, fileHash, modifiedAt: metadata.mtimeMs }
}

function validateDatabaseURL(value, expectedInstance) {
  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.toLowerCase()
    const validHost = hostname === `${expectedInstance}.firebaseio.com`
      || (hostname.startsWith(`${expectedInstance}.`) && hostname.endsWith('.firebasedatabase.app'))
    if (
      parsed.protocol !== 'https:'
      || !validHost
      || (parsed.pathname !== '/' && parsed.pathname !== '')
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) throw new Error('invalid')
    return parsed.origin
  } catch {
    throw new ProfessionalServicesActivationError('portfolio2_activation_database_url_invalid')
  }
}

function validatePreviewURL(value) {
  try {
    const parsed = new URL(value)
    if (
      parsed.protocol !== 'https:'
      || !parsed.hostname.toLowerCase().endsWith('.vercel.app')
      || parsed.hostname.toLowerCase() === 'www.correaquibrasil.com.br'
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
    ) throw new Error('invalid')
    parsed.pathname = '/'
    return parsed
  } catch {
    throw new ProfessionalServicesActivationError('portfolio2_activation_preview_url_invalid')
  }
}

async function fetchPreviewReadiness(previewURL, expectedCommit) {
  if (!/^[a-f0-9]{40}$/i.test(String(expectedCommit || ''))) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_expected_commit_invalid')
  }
  const url = validatePreviewURL(previewURL)
  url.pathname = '/api/professional-services/readiness'
  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ProfessionalServicesActivationError('portfolio2_activation_readiness_request_failed')
  }
  if (!response.ok) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_preview_not_ready')
  }
  const readiness = await response.json().catch(() => null)
  if (readiness?.codeCommit !== expectedCommit) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_preview_commit_mismatch')
  }
  return readiness
}

function tokenValue(result) {
  if (typeof result === 'string') return result
  if (result && typeof result.access_token === 'string') return result.access_token
  return ''
}

async function fetchLiveRules({ credential, databaseURL }) {
  let accessToken
  try {
    accessToken = tokenValue(await credential.getAccessToken())
  } catch {
    throw new ProfessionalServicesActivationError('portfolio2_activation_rules_auth_failed')
  }
  if (!accessToken) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_rules_auth_failed')
  }
  let response
  try {
    response = await fetch(`${databaseURL}/.settings/rules.json`, {
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ProfessionalServicesActivationError('portfolio2_activation_rules_read_failed')
  }
  if (!response.ok) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_rules_read_failed')
  }
  const rules = await response.json().catch(() => null)
  canonicalRulesSha256(rules)
  return rules
}

function sanitizedSummary(plan, { apply, rollback, result = null } = {}) {
  return {
    ok: true,
    mode: apply ? (rollback ? 'rollback' : 'apply') : 'dry-run',
    remoteAccess: Boolean(apply),
    writesPerformed: Boolean(result?.committed),
    projectId: plan.projectId,
    instance: plan.instance,
    planHash: plan.planHash,
    uidHash: plan.uidHash,
    snapshotFileHash: plan.snapshotFileHash,
    decisionManifestFileHash: plan.decisionManifestFileHash,
    codeCommit: plan.codeCommit,
    legacySourcesVerified: plan.legacyExpectations.length,
    legacyRecordsVerified: plan.decisionSummary.matchedLegacyRecords,
    canonicalServicesExpected: plan.expectedCanonicalServiceCount,
    markerOperations: plan.markerOperations.length,
    idempotent: Boolean(result?.idempotent),
    status: result?.status || 'ready',
  }
}

async function prepareOfflineInputs(options, readinessOverride = null, publishedRulesOverride = null) {
  const snapshotFile = await readJsonFile(options.snapshot, {
    maxBytes: MAX_SNAPSHOT_BYTES,
    code: 'portfolio2_activation_snapshot_file',
    expectedHash: options.snapshotSha256,
  })
  const decisionsFile = await readJsonFile(options.decisions, {
    maxBytes: MAX_SMALL_JSON_BYTES,
    code: 'portfolio2_activation_decision_file',
    expectedHash: options.decisionsSha256,
  })
  const localRulesFile = await readJsonFile(options.localRules, {
    maxBytes: MAX_SMALL_JSON_BYTES,
    code: 'portfolio2_activation_local_rules_file',
  })
  const publishedRulesFile = publishedRulesOverride == null
    ? await readJsonFile(options.publishedRules, {
      maxBytes: MAX_SMALL_JSON_BYTES,
      code: 'portfolio2_activation_published_rules_file',
    })
    : null
  const readinessFile = readinessOverride == null
    ? await readJsonFile(options.readiness, {
      maxBytes: MAX_SMALL_JSON_BYTES,
      code: 'portfolio2_activation_readiness_file',
    })
    : null
  const readiness = {
    ...(readinessOverride ?? readinessFile.value),
    rulesReady: true,
  }
  const plan = buildPortfolio2ActivationPlan({
    projectId: options.projectId,
    instance: options.instance,
    snapshot: snapshotFile.value,
    migrationDecisions: decisionsFile.value,
    localRules: localRulesFile.value,
    publishedRules: publishedRulesOverride ?? publishedRulesFile.value,
    readiness,
    snapshotFileHash: snapshotFile.fileHash,
    decisionManifestFileHash: decisionsFile.fileHash,
    plannedAt: Date.now(),
  })
  validatePortfolio2ActivationState(snapshotFile.value, plan)
  return { plan, localRules: localRulesFile.value }
}

async function runRemote(options) {
  if (process.env[PORTFOLIO2_REMOTE_WRITE_FLAG] !== 'true') {
    throw new ProfessionalServicesActivationError('portfolio2_activation_remote_write_disabled')
  }
  const expectedConfirmation = options.rollback
    ? PORTFOLIO2_ROLLBACK_CONFIRMATION
    : PORTFOLIO2_ACTIVATION_CONFIRMATION
  if (options.confirmation !== expectedConfirmation) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_confirmation_invalid')
  }
  if (options.expectedWriter !== PORTFOLIO2_STAGING_WRITER_IDENTITY) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_identity_mismatch')
  }
  const databaseURL = validateDatabaseURL(options.databaseURL, options.instance)
  const credentialInspection = await inspectPortfolio2WriterCredential({
    credentialPath: options.credential,
    expectedIdentity: options.expectedWriter,
    repositoryRoot: process.cwd(),
  })
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialInspection.credentialPath
  process.env.GOOGLE_CLOUD_PROJECT = options.projectId

  const { applicationDefault } = await import('firebase-admin/app')
  const credential = applicationDefault()
  await verifyPortfolio2WriterProjectIsolation({
    credential,
    declaredProjectId: options.projectId,
  })
  const [previewReadiness, liveRules] = await Promise.all([
    fetchPreviewReadiness(options.previewURL, options.expectedCommit),
    fetchLiveRules({ credential, databaseURL }),
  ])
  const { plan, localRules } = await prepareOfflineInputs(options, previewReadiness, liveRules)
  if (canonicalRulesSha256(localRules) !== canonicalRulesSha256(liveRules)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_rules_mismatch')
  }

  let accessToken
  try {
    accessToken = tokenValue(await credential.getAccessToken())
  } catch {
    throw new ProfessionalServicesActivationError('portfolio2_writer_authentication_failed')
  }
  if (!accessToken) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_authentication_failed')
  }
  const transport = createPortfolio2RtdbRestTransport({ databaseURL, accessToken })
  const result = options.rollback
    ? await executePortfolio2ActivationRollback({ transport, plan })
    : await executePortfolio2Activation({ transport, plan })
  return sanitizedSummary(plan, { apply: true, rollback: options.rollback, result })
}

export async function runPortfolio2ActivationCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return { exitCode: 0, summary: null }
  }
  if (options.rollback && !options.apply) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_rollback_requires_apply')
  }
  if (options.projectId !== PORTFOLIO2_STAGING_PROJECT_ID || options.instance !== PORTFOLIO2_STAGING_INSTANCE) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_target_forbidden')
  }
  if (!/^[a-f0-9]{64}$/i.test(options.snapshotSha256)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_snapshot_file_hash_required')
  }
  if (!/^[a-f0-9]{64}$/i.test(options.decisionsSha256)) {
    throw new ProfessionalServicesActivationError('portfolio2_activation_decision_file_hash_required')
  }
  const summary = options.apply
    ? await runRemote(options)
    : sanitizedSummary((await prepareOfflineInputs(options)).plan, { apply: false })
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  return { exitCode: 0, summary }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedDirectly) {
  runPortfolio2ActivationCli().then(({ exitCode }) => {
    process.exitCode = exitCode
  }).catch((error) => {
    const code = error instanceof ProfessionalServicesActivationError
      ? error.code
      : 'portfolio2_activation_unexpected_error'
    process.stderr.write(`${JSON.stringify({
      ok: false,
      mode: process.argv.includes('--apply') ? 'apply' : 'dry-run',
      writesPerformed: false,
      code,
    })}\n`)
    process.exitCode = 1
  })
}
