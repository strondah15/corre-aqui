import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  PROFESSIONAL_SERVICES_TEST_EXCLUSION_CONFIRMATION,
  PROFESSIONAL_SERVICES_MANUAL_RESOLUTION_CONFIRMATION,
  ProfessionalServicesMigrationError,
  buildProfessionalServicesMigrationReport,
  evaluateProfessionalServicesMigrationRollback,
  sha256,
  simulateProfessionalServicesMigrationPlan,
} from './lib/professional-services-migration-core.mjs'

const NOW = 1_800_000_000_000

const service = (overrides = {}) => ({
  id: 'service_reparos',
  nome: 'Reparos residenciais',
  descricao: 'Serviço fictício de reparos.',
  categoriaId: 'reparos',
  categoriaNome: 'Reparos',
  faixaPreco: 'R$ 80 a R$ 180',
  tempoMedio: '2 horas',
  regiao: 'Região fictícia',
  atendeDomicilio: true,
  urgente: false,
  ativo: true,
  fotos: ['https://images.example.test/reparos.webp'],
  ...overrides,
})

const readySnapshot = () => ({
  users: {
    worker: {
      portfolio: {
        service_reparos: service(),
      },
      profile: {
        portfolio: [service({
          id: undefined,
          nome: 'Montagem fictícia',
          descricao: 'Montagem de teste.',
          categoriaId: 'montagem_moveis',
          categoriaNome: 'Montagem de móveis',
          faixaPreco: 'R$ 120',
          fotos: [],
        })],
      },
    },
  },
  publicProfiles: {
    worker: {
      uid: 'worker',
      id: 'worker',
      nome: 'Profissional fictício',
      portfolio: {
        service_reparos: service(),
      },
    },
  },
  publicPortfolio: {},
  professionalServices: {},
})

const report = buildProfessionalServicesMigrationReport(readySnapshot(), { plannedAt: NOW })
assert.equal(report.mode, 'dry-run')
assert.equal(report.remoteAccess, false)
assert.equal(report.writesPerformed, false)
assert.equal(report.counts.uids, 1)
assert.equal(report.counts.ready, 1)
assert.equal(report.counts.pendingCreates, 2)
assert.equal(report.counts.duplicates, 1, 'projeção pública equivalente é detectada como duplicada')
assert.equal(report.counts.blockingIssues, 0)

const worker = report.uids[0]
assert.equal(worker.status, 'ready')
assert.equal(worker.plan.createOperations.length, 2)
assert.equal(worker.plan.markerOperations.length, 2)
assert.equal(worker.plan.rollback.legacyPathsRemainUntouched, true)
assert.equal(worker.plan.rollback.abortIfAnyCreatedRecordHashChanged, true)
assert.equal(worker.plan.rollback.abortIfCanonicalCollectionChanged, true)
assert.equal(worker.plan.rollback.restoreMarkersOnlyAfterAllCreatedRecordsReverted, true)
assert.equal(worker.plan.rollback.restoreMarkers[0].action, 'delete_marker_if_current_is_2')
assert.equal(worker.plan.preserveLegacyPaths.length, 6)
assert.equal(worker.generatedIds.length, 1)
assert.match(worker.generatedIds[0].serviceId, /^legacy_[a-f0-9]{40}$/)
assert.equal(worker.duplicates[0].keptSource, 'users_portfolio')
assert.equal(worker.duplicates[0].skippedSource, 'public_profiles_portfolio')
assert.equal(
  worker.plan.createOperations.find(({ serviceId }) => serviceId === 'service_reparos').value.faixaPreco,
  'R$ 80 a R$ 180',
)

const repeated = buildProfessionalServicesMigrationReport(readySnapshot(), { plannedAt: NOW })
assert.equal(repeated.reportHash, report.reportHash, 'dry-run repetido é determinístico')
assert.equal(repeated.uids[0].planHash, worker.planHash)

const applied = simulateProfessionalServicesMigrationPlan(readySnapshot(), report, {
  confirmation: 'LOCAL_SNAPSHOT_SIMULATION_ONLY',
})
assert.equal(applied.interrupted, false)
assert.equal(applied.createsApplied, 2)
assert.equal(applied.snapshot.users.worker.portfolioSchemaVersion, 2)
assert.equal(applied.snapshot.publicProfiles.worker.portfolioSchemaVersion, 2)
assert.ok(applied.snapshot.users.worker.portfolio.service_reparos, 'dados legados são preservados')
const rollbackGuard = worker.plan.rollback.deleteOnlyIfHashMatches.find(
  ({ path: rollbackPath }) => rollbackPath.endsWith('/service_reparos'),
)
const changedAfterMigration = {
  ...applied.snapshot.professionalServices.worker.service_reparos,
  revision: applied.snapshot.professionalServices.worker.service_reparos.revision + 1,
}
assert.notEqual(
  sha256(changedAfterMigration),
  rollbackGuard.valueHash,
  'alterações posteriores não satisfazem o hash de exclusão do rollback',
)

const afterApply = buildProfessionalServicesMigrationReport(applied.snapshot, { plannedAt: NOW })
assert.equal(afterApply.uids[0].status, 'already_migrated')
assert.equal(afterApply.uids[0].counts.pendingCreates, 0)
assert.equal(afterApply.uids[0].plan.createOperations.length, 0)
assert.equal(afterApply.uids[0].plan.markerOperations.length, 0)

const interrupted = simulateProfessionalServicesMigrationPlan(readySnapshot(), report, {
  confirmation: 'LOCAL_SNAPSHOT_SIMULATION_ONLY',
  failAfterCreates: 1,
})
assert.equal(interrupted.interrupted, true)
assert.equal(interrupted.snapshot.users.worker.portfolioSchemaVersion, undefined, 'falha parcial não define marcador')
const resumedReport = buildProfessionalServicesMigrationReport(interrupted.snapshot, { plannedAt: NOW })
assert.equal(resumedReport.uids[0].status, 'ready')
assert.equal(resumedReport.uids[0].counts.pendingCreates, 1, 'retomada planeja somente o registro ausente')
const resumed = simulateProfessionalServicesMigrationPlan(interrupted.snapshot, resumedReport, {
  confirmation: 'LOCAL_SNAPSHOT_SIMULATION_ONLY',
})
assert.equal(resumed.snapshot.users.worker.portfolioSchemaVersion, 2)
assert.equal(Object.keys(resumed.snapshot.professionalServices.worker).length, 2)

const conflictSnapshot = readySnapshot()
conflictSnapshot.publicProfiles.worker.portfolio.service_reparos.faixaPreco = 'R$ 999'
const conflict = buildProfessionalServicesMigrationReport(conflictSnapshot, { plannedAt: NOW })
assert.equal(conflict.uids[0].status, 'blocked')
assert.equal(conflict.uids[0].plan, null)
assert.ok(conflict.uids[0].issues.some(({ code }) => code === 'migration_conflicting_service_id'))
assert.equal(conflict.uids[0].conflicts[0].authoritativeSource, 'users_portfolio')
assert.equal(conflict.uids[0].conflicts[0].privateSourcePreserved, true)

const invalidSnapshot = readySnapshot()
invalidSnapshot.users.worker.portfolio = {
  'id inválido': service({ id: 'id inválido' }),
  missing_price: service({ id: 'missing_price', faixaPreco: '' }),
  invalid_photo: service({ id: 'invalid_photo', fotos: ['blob:https://example.test/photo'] }),
}
invalidSnapshot.publicProfiles.worker.portfolio = {}
const invalid = buildProfessionalServicesMigrationReport(invalidSnapshot, { plannedAt: NOW })
const invalidCodes = new Set(invalid.uids[0].issues.map(({ code }) => code))
assert.equal(invalid.uids[0].status, 'blocked')
assert.ok(invalidCodes.has('migration_service_id_invalid'))
assert.ok(invalidCodes.has('migration_required_field_missing'))
assert.ok(invalidCodes.has('migration_photo_url_invalid'))

const missingPriceSnapshot = readySnapshot()
missingPriceSnapshot.users.worker.portfolio.service_reparos.faixaPreco = ''
missingPriceSnapshot.publicProfiles.worker.portfolio.service_reparos.faixaPreco = ''
const missingPrice = buildProfessionalServicesMigrationReport(missingPriceSnapshot, { plannedAt: NOW })
assert.equal(missingPrice.uids[0].status, 'blocked')
assert.equal(missingPrice.uids[0].manualResolutionRequirements.length, 1)
const [{ resolutionRef }] = missingPrice.uids[0].manualResolutionRequirements
assert.match(resolutionRef, /^[a-f0-9]{64}$/)

const manualResolutions = {
  version: 1,
  inputHash: missingPrice.inputHash,
  confirmation: PROFESSIONAL_SERVICES_MANUAL_RESOLUTION_CONFIRMATION,
  confirmedAt: NOW - 1_000,
  resolutions: [{
    resolutionRef,
    field: 'faixaPreco',
    value: 'R$ 80 a R$ 180',
  }],
}
const resolvedPrice = buildProfessionalServicesMigrationReport(missingPriceSnapshot, {
  plannedAt: NOW,
  manualResolutions,
})
assert.equal(resolvedPrice.uids[0].status, 'ready')
assert.equal(resolvedPrice.manualResolutions.count, 1)
assert.equal(resolvedPrice.manualResolutions.used, 1)
assert.equal(resolvedPrice.manualResolutions.entries[0].resolutionRef, resolutionRef)
assert.equal(Object.hasOwn(resolvedPrice.manualResolutions.entries[0], 'value'), false)
assert.equal(
  resolvedPrice.uids[0].plan.createOperations.find(({ serviceId }) => serviceId === 'service_reparos').value.faixaPreco,
  'R$ 80 a R$ 180',
)
const repeatedResolution = buildProfessionalServicesMigrationReport(missingPriceSnapshot, {
  plannedAt: NOW,
  manualResolutions,
})
assert.equal(repeatedResolution.reportHash, resolvedPrice.reportHash)
assert.equal(repeatedResolution.uids[0].planHash, resolvedPrice.uids[0].planHash)

assert.throws(
  () => buildProfessionalServicesMigrationReport(missingPriceSnapshot, {
    plannedAt: NOW,
    manualResolutions: { ...manualResolutions, inputHash: '0'.repeat(64) },
  }),
  (error) => error?.code === 'migration_resolution_input_hash_mismatch',
)
assert.throws(
  () => buildProfessionalServicesMigrationReport(missingPriceSnapshot, {
    plannedAt: NOW,
    manualResolutions: { ...manualResolutions, confirmation: 'UNCONFIRMED' },
  }),
  (error) => error?.code === 'migration_resolution_owner_confirmation_required',
)
assert.throws(
  () => buildProfessionalServicesMigrationReport(missingPriceSnapshot, {
    plannedAt: NOW,
    manualResolutions: { ...manualResolutions, unexpectedApproval: true },
  }),
  (error) => error?.code === 'migration_resolutions_unknown_field',
)
assert.throws(
  () => buildProfessionalServicesMigrationReport(missingPriceSnapshot, {
    plannedAt: NOW,
    manualResolutions: {
      ...manualResolutions,
      resolutions: [{ ...manualResolutions.resolutions[0], resolutionRef: 'f'.repeat(64) }],
    },
  }),
  (error) => error?.code === 'migration_resolution_target_not_found',
)

const testOnlySnapshot = {
  users: {
    worker: {
      portfolio: {
        service_reparos: service({ faixaPreco: '' }),
      },
    },
  },
  publicProfiles: {
    worker: {
      portfolio: {
        service_reparos: service({ faixaPreco: '' }),
      },
    },
  },
  publicPortfolio: {},
  professionalServices: {},
}
const testOnlyBlocked = buildProfessionalServicesMigrationReport(testOnlySnapshot, { plannedAt: NOW })
const [{ resolutionRef: testServiceRef }] = testOnlyBlocked.uids[0].manualResolutionRequirements
const exclusionManifest = {
  version: 1,
  inputHash: testOnlyBlocked.inputHash,
  confirmation: PROFESSIONAL_SERVICES_TEST_EXCLUSION_CONFIRMATION,
  confirmedAt: NOW - 500,
  decisions: [{
    serviceRef: testServiceRef,
    action: 'exclude_from_v2',
    reasonCode: 'owner_confirmed_test_service',
  }],
}
const excludedTestService = buildProfessionalServicesMigrationReport(testOnlySnapshot, {
  plannedAt: NOW,
  migrationDecisions: exclusionManifest,
})
assert.equal(excludedTestService.counts.ready, 1)
assert.equal(excludedTestService.counts.blocked, 0)
assert.equal(excludedTestService.counts.pendingCreates, 0)
assert.equal(excludedTestService.counts.explicitlyDispensed, 1)
assert.equal(excludedTestService.counts.dispensedLegacyRecords, 2)
assert.equal(excludedTestService.migrationDecisions.entries[0].matchedLegacyRecords, 2)
assert.equal(excludedTestService.uids[0].plan.createOperations.length, 0)
assert.equal(excludedTestService.uids[0].plan.markerOperations.length, 2)
assert.equal(excludedTestService.uids[0].plan.rollback.expectedCanonicalServiceCount, 0)
assert.deepEqual(excludedTestService.uids[0].plan.rollback.deleteOnlyIfHashMatches, [])

const repeatedExclusion = buildProfessionalServicesMigrationReport(testOnlySnapshot, {
  plannedAt: NOW,
  migrationDecisions: exclusionManifest,
})
assert.equal(repeatedExclusion.reportHash, excludedTestService.reportHash)
assert.equal(repeatedExclusion.uids[0].planHash, excludedTestService.uids[0].planHash)

const logicallyExcluded = simulateProfessionalServicesMigrationPlan(testOnlySnapshot, excludedTestService, {
  confirmation: 'LOCAL_SNAPSHOT_SIMULATION_ONLY',
})
assert.equal(logicallyExcluded.createsApplied, 0)
assert.equal(logicallyExcluded.snapshot.users.worker.portfolioSchemaVersion, 2)
assert.equal(logicallyExcluded.snapshot.publicProfiles.worker.portfolioSchemaVersion, 2)
assert.equal(Object.keys(logicallyExcluded.snapshot.professionalServices?.worker || {}).length, 0)
assert.ok(logicallyExcluded.snapshot.users.worker.portfolio.service_reparos)
const logicallyExcludedAgain = simulateProfessionalServicesMigrationPlan(
  logicallyExcluded.snapshot,
  excludedTestService,
  { confirmation: 'LOCAL_SNAPSHOT_SIMULATION_ONLY' },
)
assert.equal(logicallyExcludedAgain.createsApplied, 0)
assert.equal(logicallyExcludedAgain.snapshot.users.worker.portfolioSchemaVersion, 2)
assert.equal(evaluateProfessionalServicesMigrationRollback(logicallyExcluded.snapshot, excludedTestService).safe, true)

const postActivationService = structuredClone(logicallyExcluded.snapshot)
postActivationService.professionalServices = {
  worker: {
    future_service: {
      ...resolvedPrice.uids[0].plan.createOperations.find(({ serviceId }) => serviceId === 'service_reparos').value,
      id: 'future_service',
    },
  },
}
const unsafeRollback = evaluateProfessionalServicesMigrationRollback(postActivationService, excludedTestService)
assert.equal(unsafeRollback.safe, false)
assert.equal(unsafeRollback.uids[0].canonicalCollectionUnchanged, false)

const additionalRealService = structuredClone(testOnlySnapshot)
additionalRealService.users.worker.portfolio.real_service = service({
  id: 'real_service',
  nome: 'Serviço real fictício',
})
const additionalBlocked = buildProfessionalServicesMigrationReport(additionalRealService, { plannedAt: NOW })
const exclusionWithUpdatedHash = {
  ...exclusionManifest,
  inputHash: additionalBlocked.inputHash,
}
const excludesOnlyTarget = buildProfessionalServicesMigrationReport(additionalRealService, {
  plannedAt: NOW,
  migrationDecisions: exclusionWithUpdatedHash,
})
assert.equal(excludesOnlyTarget.counts.explicitlyDispensed, 1)
assert.equal(excludesOnlyTarget.counts.pendingCreates, 1)
assert.equal(excludesOnlyTarget.uids[0].plan.createOperations[0].serviceId, 'real_service')

assert.throws(
  () => buildProfessionalServicesMigrationReport(testOnlySnapshot, {
    plannedAt: NOW,
    migrationDecisions: {
      ...exclusionManifest,
      decisions: [{ ...exclusionManifest.decisions[0], serviceRef: 'e'.repeat(64) }],
    },
  }),
  (error) => error?.code === 'migration_decision_target_not_found',
)
assert.throws(
  () => buildProfessionalServicesMigrationReport(testOnlySnapshot, {
    plannedAt: NOW,
    migrationDecisions: exclusionManifest,
    manualResolutions: {
      version: 1,
      inputHash: testOnlyBlocked.inputHash,
      confirmation: PROFESSIONAL_SERVICES_MANUAL_RESOLUTION_CONFIRMATION,
      confirmedAt: NOW - 500,
      resolutions: [{ resolutionRef: testServiceRef, field: 'faixaPreco', value: 'R$ 100' }],
    },
  }),
  (error) => error?.code === 'migration_decision_conflicts_with_resolution',
)

const photoLimitSnapshot = readySnapshot()
photoLimitSnapshot.users.worker.portfolio.service_reparos.fotos = Array.from(
  { length: 6 },
  (_, index) => `https://images.example.test/photo-${index}.webp`,
)
photoLimitSnapshot.publicProfiles.worker.portfolio = {}
const photoLimit = buildProfessionalServicesMigrationReport(photoLimitSnapshot, { plannedAt: NOW })
assert.equal(photoLimit.uids[0].status, 'blocked')
assert.ok(photoLimit.uids[0].issues.some(({ code }) => code === 'migration_photo_limit_exceeded'))

const excessiveSnapshot = readySnapshot()
excessiveSnapshot.users.worker.portfolio = Object.fromEntries(
  Array.from({ length: 13 }, (_, index) => {
    const id = `service_${index}`
    return [id, service({ id, nome: `Serviço ${index}`, fotos: [] })]
  }),
)
excessiveSnapshot.users.worker.profile.portfolio = []
excessiveSnapshot.publicProfiles.worker.portfolio = {}
const excessive = buildProfessionalServicesMigrationReport(excessiveSnapshot, { plannedAt: NOW })
assert.equal(excessive.uids[0].status, 'blocked')
assert.ok(excessive.uids[0].issues.some(({ code }) => code === 'migration_service_limit_exceeded'))

const markedSnapshot = readySnapshot()
markedSnapshot.users.worker.portfolioSchemaVersion = 2
markedSnapshot.publicProfiles.worker.portfolioSchemaVersion = 2
const marked = buildProfessionalServicesMigrationReport(markedSnapshot, { plannedAt: NOW })
assert.equal(marked.uids[0].status, 'blocked')
assert.ok(marked.uids[0].issues.some(({ code }) => code === 'migration_marker_v2_has_unmigrated_legacy'))

const existingSnapshot = readySnapshot()
const existingService = worker.plan.createOperations.find(({ serviceId }) => serviceId === 'service_reparos').value
existingSnapshot.professionalServices.worker = { service_reparos: existingService }
const withExisting = buildProfessionalServicesMigrationReport(existingSnapshot, { plannedAt: NOW })
assert.equal(withExisting.uids[0].counts.alreadyPresent, 1)
assert.equal(withExisting.uids[0].counts.pendingCreates, 1)

const conflictingExistingSnapshot = readySnapshot()
conflictingExistingSnapshot.professionalServices.worker = {
  service_reparos: {
    ...existingService,
    faixaPreco: 'R$ 999',
  },
}
const conflictingExisting = buildProfessionalServicesMigrationReport(conflictingExistingSnapshot, { plannedAt: NOW })
assert.equal(conflictingExisting.uids[0].status, 'blocked')
assert.ok(conflictingExisting.uids[0].issues.some(({ code }) => code === 'migration_existing_v2_id_conflict'))

await assert.rejects(
  async () => simulateProfessionalServicesMigrationPlan(readySnapshot(), report),
  (error) => error instanceof ProfessionalServicesMigrationError
    && error.code === 'migration_local_simulation_confirmation_required',
)

assert.throws(
  () => buildProfessionalServicesMigrationReport({ private_key: 'not-a-real-key' }, { plannedAt: NOW }),
  (error) => error?.code === 'migration_snapshot_looks_like_credentials',
)

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'corre-aqui-migration-'))
try {
  const inputPath = path.join(temporaryDirectory, 'snapshot.json')
  await writeFile(inputPath, `${JSON.stringify(readySnapshot())}\n`, 'utf8')
  const beforeHash = sha256(await readFile(inputPath, 'utf8'))
  const { spawnSync } = await import('node:child_process')
  const denied = spawnSync(process.execPath, [
    path.resolve('scripts/migrate-professional-services.mjs'),
    '--input', inputPath,
    '--apply',
  ], { cwd: process.cwd(), encoding: 'utf8' })
  assert.equal(denied.status, 1)
  assert.match(denied.stderr, /migration_apply_disabled/)
  assert.equal(sha256(await readFile(inputPath, 'utf8')), beforeHash, '--apply recusado não altera o snapshot')

  const missingPricePath = path.join(temporaryDirectory, 'missing-price.json')
  const resolutionsPath = path.join(temporaryDirectory, 'manual-resolutions.json')
  await writeFile(missingPricePath, `${JSON.stringify(missingPriceSnapshot)}\n`, 'utf8')
  await writeFile(resolutionsPath, `${JSON.stringify(manualResolutions)}\n`, 'utf8')
  const resolvedCli = spawnSync(process.execPath, [
    path.resolve('scripts/migrate-professional-services.mjs'),
    '--input', missingPricePath,
    '--resolutions', resolutionsPath,
    '--now', String(NOW),
  ], { cwd: process.cwd(), encoding: 'utf8' })
  assert.equal(resolvedCli.status, 0)
  const resolvedCliSummary = JSON.parse(resolvedCli.stdout)
  assert.equal(resolvedCliSummary.mode, 'dry-run')
  assert.equal(resolvedCliSummary.remoteAccess, false)
  assert.equal(resolvedCliSummary.writesPerformed, false)
  assert.equal(resolvedCliSummary.manualResolutions.count, 1)
  assert.equal(resolvedCliSummary.manualResolutions.used, 1)

  const testOnlyPath = path.join(temporaryDirectory, 'test-only.json')
  const decisionsPath = path.join(temporaryDirectory, 'migration-decisions.json')
  await writeFile(testOnlyPath, `${JSON.stringify(testOnlySnapshot)}\n`, 'utf8')
  await writeFile(decisionsPath, `${JSON.stringify(exclusionManifest)}\n`, 'utf8')
  const excludedCli = spawnSync(process.execPath, [
    path.resolve('scripts/migrate-professional-services.mjs'),
    '--input', testOnlyPath,
    '--decisions', decisionsPath,
    '--now', String(NOW),
  ], { cwd: process.cwd(), encoding: 'utf8' })
  assert.equal(excludedCli.status, 0)
  const excludedCliSummary = JSON.parse(excludedCli.stdout)
  assert.equal(excludedCliSummary.remoteAccess, false)
  assert.equal(excludedCliSummary.writesPerformed, false)
  assert.equal(excludedCliSummary.counts.pendingCreates, 0)
  assert.equal(excludedCliSummary.counts.blocked, 0)
  assert.equal(excludedCliSummary.migrationDecisions.count, 1)
  assert.equal(excludedCliSummary.migrationDecisions.entries[0].matchedLegacyRecords, 2)
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}

const [cliSource, coreSource] = await Promise.all([
  readFile(new URL('./migrate-professional-services.mjs', import.meta.url), 'utf8'),
  readFile(new URL('./lib/professional-services-migration-core.mjs', import.meta.url), 'utf8'),
])
assert.doesNotMatch(cliSource, /firebase-admin|firebase\/database|fetch\s*\(/i)
assert.doesNotMatch(coreSource, /firebase-admin|firebase\/database|fetch\s*\(/i)
assert.match(cliSource, /migration_apply_disabled/)

console.log('Migração Portfólio 2.0: dry-run, prioridade privada, conflitos, limite, retomada, idempotência e rollback OK')
