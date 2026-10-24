import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  ATTENDANCE_REWARD_LEDGER_VERSION,
  ATTENDANCE_REWARD_MAX_CLOCK_SKEW_MS,
  AttendanceRewardError,
  attendanceRewardDayKey,
  grantAttendanceRewards as grantAttendanceRewardsImpl,
  isAttendanceGamificationEnabled,
} from '../src/lib/attendanceRewardsServer.js'
import { buildProfessionalReputation } from '../src/lib/professionalReputation.js'

const CLIENT = 'client-A'
const WORKER = 'worker-B'
const OUTSIDER = 'outsider-C'
const BASE_TIME = Date.UTC(2026, 9, 21, 15, 30)
const ACCOUNTING_ENABLED_FROM = BASE_TIME - 100_000

function countService(options) {
  return grantAttendanceRewardsImpl({
    rewardsEnabledFrom: ACCOUNTING_ENABLED_FROM,
    gamificationEnabled: false,
    gamificationEnabledFrom: 0,
    ...options,
  })
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function createMemoryDatabase(initial = {}, {
  failTransactions = {},
  initialNullTransactions = {},
  initialNullMutations = {},
} = {}) {
  const state = clone(initial)
  const locks = new Map()
  const failures = new Map(Object.entries(failTransactions))
  const initialNulls = new Map(Object.entries(initialNullTransactions))
  const nullMutations = new Map(Object.entries(initialNullMutations))
  const partsFor = (path = '') => String(path).split('/').filter(Boolean)

  const read = (path = '') => {
    let current = state
    for (const part of partsFor(path)) {
      if (!current || typeof current !== 'object' || !(part in current)) return null
      current = current[part]
    }
    return clone(current)
  }

  const write = (path, value) => {
    const parts = partsFor(path)
    if (!parts.length) throw new Error('memory_root_set_not_supported')
    let current = state
    for (const part of parts.slice(0, -1)) {
      if (!current[part] || typeof current[part] !== 'object') current[part] = {}
      current = current[part]
    }
    const key = parts.at(-1)
    if (value == null) delete current[key]
    else current[key] = clone(value)
  }

  const snapshot = (value) => ({
    exists: () => value != null,
    val: () => clone(value),
  })

  const withLock = (path, operation) => {
    const previous = locks.get(path) || Promise.resolve()
    const current = previous.catch(() => {}).then(operation)
    locks.set(path, current)
    return current.finally(() => {
      if (locks.get(path) === current) locks.delete(path)
    })
  }

  return {
    ref(path = '') {
      const basePath = partsFor(path).join('/')
      return {
        async get() {
          return snapshot(read(basePath))
        },
        async update(values) {
          for (const [relativePath, value] of Object.entries(values || {})) {
            write([basePath, relativePath].filter(Boolean).join('/'), value)
          }
        },
        async transaction(updater) {
          return withLock(basePath, async () => {
            const remainingFailures = Number(failures.get(basePath) || 0)
            if (remainingFailures > 0) {
              failures.set(basePath, remainingFailures - 1)
              throw new Error(`injected_transaction_failure:${basePath}`)
            }
            await new Promise((resolve) => setImmediate(resolve))
            let current = read(basePath)
            const remainingInitialNulls = Number(initialNulls.get(basePath) || 0)
            if (remainingInitialNulls > 0) {
              initialNulls.set(basePath, remainingInitialNulls - 1)
              const initialProposal = updater(null)
              if (initialProposal === undefined) {
                return { committed: false, snapshot: snapshot(null) }
              }

              const mutateRemote = nullMutations.get(basePath)
              if (typeof mutateRemote === 'function') {
                nullMutations.delete(basePath)
                const mutated = mutateRemote(read(basePath))
                if (mutated !== undefined) write(basePath, mutated)
              }

              current = read(basePath)
              if (current === null) {
                write(basePath, initialProposal)
                return { committed: true, snapshot: snapshot(initialProposal) }
              }
            }
            const next = updater(clone(current))
            if (next === undefined) return { committed: false, snapshot: snapshot(current) }
            write(basePath, next)
            return { committed: true, snapshot: snapshot(next) }
          })
        },
      }
    },
    read,
  }
}

function completionFields() {
  const requestedAt = BASE_TIME - 10_000
  const finalizedAt = BASE_TIME - 5_000
  return {
    finalizacaoSolicitadaEm: requestedAt,
    finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
    finalizadoEm: finalizedAt,
    finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    atendimento: {
      finalizacaoSolicitadaEm: requestedAt,
      finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
      finalizadoEm: finalizedAt,
      finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    },
  }
}

function finalizedPublicOrder(id, overrides = {}) {
  return {
    id,
    status: 'finalizado',
    modoPedido: 'geral',
    criador: { id: CLIENT, nome: 'Cliente A' },
    aceite: { id: WORKER, nome: 'Profissional B' },
    criadoEmServer: BASE_TIME - 50_000,
    ...completionFields(),
    ...overrides,
  }
}

function finalizedPrivateRequest(id, tipo = 'agendamento', overrides = {}) {
  return {
    id,
    tipo,
    status: 'finalizado',
    clienteId: CLIENT,
    clienteNome: 'Cliente A',
    profissionalId: WORKER,
    profissionalNome: 'Profissional B',
    criadoEm: BASE_TIME - 50_000,
    criadoEmServer: BASE_TIME - 50_000,
    ...completionFields(),
    ...overrides,
  }
}

function workerAccount(overrides = {}) {
  return {
    nome: 'Profissional B',
    isCorre: true,
    isProfissional: true,
    xp: 90,
    moedas: 7,
    servicosCorre: 4,
    servicosProf: 2,
    patenteCorre: 1,
    patenteProf: 1,
    patenteAtualizadaEm: BASE_TIME - 1_000_000,
    missaoAtualizadaEm: BASE_TIME - 1_000_000,
    subscriptions: { professional: { status: 'trial' } },
    ...overrides,
  }
}

function publicProfile(overrides = {}) {
  return {
    uid: WORKER,
    id: WORKER,
    nome: 'Profissional B',
    servicosCorre: 4,
    servicosProf: 2,
    servicosConcluidos: 6,
    completedServices: 6,
    rating: 4.8,
    reviewCount: 5,
    reputation: { rating: 4.8, reviewCount: 5, completedServices: 6 },
    ...overrides,
  }
}

function scenario(id, options = {}) {
  const kind = options.kind || 'pedido'
  const record = options.record || (kind === 'privateRequest'
    ? finalizedPrivateRequest(id, options.tipo || 'agendamento')
    : finalizedPublicOrder(id))
  return createMemoryDatabase({
    ...(kind === 'privateRequest' ? { privateRequests: { [id]: record } } : { pedidos: { [id]: record } }),
    users: {
      ...(options.missingWorker ? {} : { [WORKER]: workerAccount(options.worker) }),
      [OUTSIDER]: { nome: 'Terceiro' },
    },
    publicProfiles: options.missingProfile ? {} : { [WORKER]: publicProfile(options.profile) },
    missoes: options.missoes || {
      [WORKER]: {
        [attendanceRewardDayKey(BASE_TIME)]: {
          aceitou: 3,
          entregou: 2,
          boostou: 1,
          xp: 20,
          moedas: 8,
        },
      },
    },
    ...(options.extra || {}),
  }, options.database)
}

function expectRewardError(code, stage = '') {
  return (error) => error instanceof AttendanceRewardError && error.code === code
    && (!stage || error.rewardStage === stage)
}

assert.equal(isAttendanceGamificationEnabled('true'), true)
for (const value of [undefined, null, '', 'false', 'TRUE', ' true', true, 1]) {
  assert.equal(isAttendanceGamificationEnabled(value), false, `gamificação falha fechado para ${String(value)}`)
}

const publicDb = scenario('public-once')
const userGamificationBefore = {
  xp: publicDb.read(`users/${WORKER}/xp`),
  moedas: publicDb.read(`users/${WORKER}/moedas`),
  patenteCorre: publicDb.read(`users/${WORKER}/patenteCorre`),
  patenteProf: publicDb.read(`users/${WORKER}/patenteProf`),
  patenteAtualizadaEm: publicDb.read(`users/${WORKER}/patenteAtualizadaEm`),
  missaoAtualizadaEm: publicDb.read(`users/${WORKER}/missaoAtualizadaEm`),
}
const missionBefore = publicDb.read(`missoes/${WORKER}`)
const ratingBefore = publicDb.read(`publicProfiles/${WORKER}/reputation/rating`)

const publicResult = await countService({
  database: publicDb,
  pedidoId: 'public-once',
  actorUid: CLIENT,
  now: BASE_TIME,
})
assert.equal(publicResult.contabilizado, true)
assert.equal(publicResult.serviceCounted, true)
assert.equal(publicResult.alreadyGranted, false)
assert.equal(publicResult.gamificationStatus, 'disabled')
assert.equal(publicDb.read(`users/${WORKER}/servicosCorre`), 5)
assert.equal(publicDb.read(`users/${WORKER}/serviçosCorre`), 5)
assert.deepEqual({
  xp: publicDb.read(`users/${WORKER}/xp`),
  moedas: publicDb.read(`users/${WORKER}/moedas`),
  patenteCorre: publicDb.read(`users/${WORKER}/patenteCorre`),
  patenteProf: publicDb.read(`users/${WORKER}/patenteProf`),
  patenteAtualizadaEm: publicDb.read(`users/${WORKER}/patenteAtualizadaEm`),
  missaoAtualizadaEm: publicDb.read(`users/${WORKER}/missaoAtualizadaEm`),
}, userGamificationBefore, 'gamificação histórica fica intacta')
assert.deepEqual(publicDb.read(`missoes/${WORKER}`), missionBefore, 'missões não recebem nenhuma escrita')
assert.equal(publicDb.read(`publicProfiles/${WORKER}/servicosCorre`), 5)
assert.equal(publicDb.read(`publicProfiles/${WORKER}/servicosProf`), 2)
assert.equal(publicDb.read(`publicProfiles/${WORKER}/completedServices`), 7)
assert.equal(publicDb.read(`publicProfiles/${WORKER}/servicosConcluidos`), 7)
assert.equal(publicDb.read(`publicProfiles/${WORKER}/reputation/completedServices`), 7)
assert.equal(publicDb.read(`publicProfiles/${WORKER}/reputation/rating`), ratingBefore)
assert.equal(buildProfessionalReputation(publicDb.read(`publicProfiles/${WORKER}`)).completedServices, 7)
assert.equal(publicDb.read('attendanceRewardGrants/public-once/version'), ATTENDANCE_REWARD_LEDGER_VERSION)
assert.equal(publicDb.read('attendanceRewardGrants/public-once/serviceAccountingStatus'), 'completed')
assert.equal(publicDb.read('attendanceRewardGrants/public-once/gamificationStatus'), 'disabled')
assert.equal(publicDb.read('attendanceRewardGrants/public-once/userGamificationApplied'), false)
assert.equal(publicDb.read('pedidos/public-once/atendimento/recompensasContabilizadas'), true)

const repeated = await countService({
  database: publicDb,
  pedidoId: 'public-once',
  actorUid: WORKER,
  now: BASE_TIME + 60_000,
})
assert.equal(repeated.alreadyGranted, true)
assert.equal(publicDb.read(`users/${WORKER}/servicosCorre`), 5, 'repetição não duplica serviço')
assert.equal(publicDb.read(`users/${WORKER}/xp`), 90, 'repetição não concede XP')

const userPath = `users/${WORKER}`
const publicProfilePath = `publicProfiles/${WORKER}`

const coldStartDb = scenario('public-cold-start', {
  database: {
    initialNullTransactions: { [userPath]: 1, [publicProfilePath]: 1 },
  },
})
await countService({
  database: coldStartDb,
  pedidoId: 'public-cold-start',
  actorUid: CLIENT,
  now: BASE_TIME,
})
assert.equal(coldStartDb.read(`${userPath}/servicosCorre`), 5, 'null inicial não aborta contador')
assert.equal(coldStartDb.read(`${publicProfilePath}/servicosCorre`), 5, 'null inicial não aborta projeção')
assert.equal(coldStartDb.read(`${userPath}/attendanceRewardClaims/public-cold-start/serviceApplied`), true)
assert.equal(coldStartDb.read(`${userPath}/xp`), 90, 'null inicial não habilita gamificação')

const concurrentChangeDb = scenario('public-concurrent-change', {
  database: {
    initialNullTransactions: { [userPath]: 1, [publicProfilePath]: 1 },
    initialNullMutations: {
      [userPath]: (current) => ({
        ...current,
        remoteRevision: 2,
        servicosCorre: 20,
        ['serviçosCorre']: 20,
      }),
      [publicProfilePath]: (current) => ({
        ...current,
        remoteRevision: 3,
        servicosCorre: 25,
        completedServices: 40,
        servicosConcluidos: 40,
        reputation: { ...current.reputation, rating: 4.95, completedServices: 40 },
      }),
    },
  },
})
await countService({
  database: concurrentChangeDb,
  pedidoId: 'public-concurrent-change',
  actorUid: CLIENT,
  now: BASE_TIME,
})
assert.equal(concurrentChangeDb.read(`${userPath}/servicosCorre`), 21, 'transação usa contador remoto mais recente')
assert.equal(concurrentChangeDb.read(`${userPath}/remoteRevision`), 2, 'alteração concorrente do usuário é preservada')
assert.equal(concurrentChangeDb.read(`${publicProfilePath}/servicosCorre`), 25, 'projeção monotônica preserva contador maior')
assert.equal(concurrentChangeDb.read(`${publicProfilePath}/completedServices`), 40)
assert.equal(concurrentChangeDb.read(`${publicProfilePath}/reputation/rating`), 4.95)
assert.equal(concurrentChangeDb.read(`${publicProfilePath}/remoteRevision`), 3, 'alteração concorrente do perfil é preservada')

const deletedDuringTransactionDb = scenario('public-user-removed', {
  database: {
    initialNullTransactions: { [userPath]: 1 },
    initialNullMutations: { [userPath]: () => null },
  },
})
await assert.rejects(
  countService({
    database: deletedDuringTransactionDb,
    pedidoId: 'public-user-removed',
    actorUid: CLIENT,
    now: BASE_TIME,
  }),
  expectRewardError('reward_beneficiary_not_found', 'service_counter'),
  'registro removido após a leitura inicial falha fechado e não é recriado',
)
assert.equal(deletedDuringTransactionDb.read(userPath), null)
assert.equal(deletedDuringTransactionDb.read('attendanceRewardGrants/public-user-removed/serviceAccountingStatus'), 'pending')
assert.equal(deletedDuringTransactionDb.read(`${publicProfilePath}/servicosCorre`), 4)

const missingProfileDb = scenario('public-profile-missing', {
  missingProfile: true,
  database: { initialNullTransactions: { [publicProfilePath]: 1 } },
})
await assert.rejects(
  countService({
    database: missingProfileDb,
    pedidoId: 'public-profile-missing',
    actorUid: CLIENT,
    now: BASE_TIME,
  }),
  expectRewardError('reward_public_profile_missing', 'public_profile_projection'),
  'perfil realmente inexistente falha fechado após confirmação transacional',
)
assert.equal(missingProfileDb.read(publicProfilePath), null)
assert.equal(missingProfileDb.read(`${userPath}/servicosCorre`), 5)
assert.equal(missingProfileDb.read('attendanceRewardGrants/public-profile-missing/serviceAccountingStatus'), 'user_applied')

const concurrentDb = scenario('public-concurrent', {
  database: {
    initialNullTransactions: { [userPath]: 10, [publicProfilePath]: 10 },
  },
})
const concurrentResults = await Promise.all(Array.from({ length: 10 }, (_, index) => countService({
  database: concurrentDb,
  pedidoId: 'public-concurrent',
  actorUid: index % 2 ? CLIENT : WORKER,
  now: BASE_TIME,
})))
assert.equal(concurrentResults.length, 10)
assert.equal(concurrentDb.read(`users/${WORKER}/servicosCorre`), 5)
assert.equal(concurrentDb.read(`publicProfiles/${WORKER}/completedServices`), 7)
assert.equal(concurrentDb.read(`users/${WORKER}/xp`), 90)
assert.equal(concurrentDb.read(`missoes/${WORKER}/${attendanceRewardDayKey(BASE_TIME)}/entregou`), 2)

for (const [id, tipo] of [['private-scheduled', 'agendamento'], ['private-direct', 'pedido_direto']]) {
  const privateDb = scenario(id, {
    kind: 'privateRequest',
    tipo,
    database: {
      initialNullTransactions: { [userPath]: 1, [publicProfilePath]: 1 },
    },
  })
  await countService({ database: privateDb, pedidoId: id, actorUid: CLIENT, now: BASE_TIME })
  await countService({ database: privateDb, pedidoId: id, actorUid: WORKER, now: BASE_TIME + 1 })
  assert.equal(privateDb.read(`users/${WORKER}/servicosCorre`), 4)
  assert.equal(privateDb.read(`users/${WORKER}/servicosProf`), 3, `${tipo} conta exatamente um serviço Prof`)
  assert.equal(privateDb.read(`publicProfiles/${WORKER}/servicosProf`), 3)
  assert.equal(privateDb.read(`privateRequests/${id}/atendimento/recompensasContabilizadas`), true)
  assert.equal(privateDb.read(`attendanceRewardGrants/${id}/recordKind`), 'privateRequest')
  assert.equal(privateDb.read(`users/${WORKER}/xp`), 90)
}

const legacyPrivateRecord = finalizedPrivateRequest('private-legacy-created-at')
delete legacyPrivateRecord.criadoEmServer
const legacyPrivateDb = scenario('private-legacy-created-at', {
  kind: 'privateRequest',
  record: legacyPrivateRecord,
})
await countService({
  database: legacyPrivateDb,
  pedidoId: 'private-legacy-created-at',
  actorUid: CLIENT,
  now: BASE_TIME,
})
assert.equal(legacyPrivateDb.read('attendanceRewardGrants/private-legacy-created-at/orderCreatedAtSource'), 'legacyPrivateCriadoEm')

const profileFailurePath = `publicProfiles/${WORKER}`
const pendingLedgerDb = scenario('public-ledger-pending', {
  database: { failTransactions: { [userPath]: 1 } },
})
await assert.rejects(
  countService({ database: pendingLedgerDb, pedidoId: 'public-ledger-pending', actorUid: CLIENT, now: BASE_TIME }),
  (error) => /injected_transaction_failure/.test(error?.message)
    && error.rewardStage === 'service_counter',
)
assert.equal(pendingLedgerDb.read('attendanceRewardGrants/public-ledger-pending/status'), 'processing')
assert.equal(pendingLedgerDb.read('attendanceRewardGrants/public-ledger-pending/serviceAccountingStatus'), 'pending')
assert.equal(pendingLedgerDb.read(`${userPath}/attendanceRewardClaims/public-ledger-pending`), null)
await countService({
  database: pendingLedgerDb,
  pedidoId: 'public-ledger-pending',
  actorUid: WORKER,
  now: BASE_TIME + 1,
})
assert.equal(pendingLedgerDb.read(`${userPath}/servicosCorre`), 5, 'ledger v2 pending é retomado uma vez')
assert.equal(pendingLedgerDb.read(`${userPath}/attendanceRewardClaims/public-ledger-pending/serviceApplied`), true)
assert.equal(pendingLedgerDb.read('attendanceRewardGrants/public-ledger-pending/status'), 'completed')

const partialDb = scenario('public-partial', {
  database: { failTransactions: { [profileFailurePath]: 1 } },
})
await assert.rejects(
  countService({ database: partialDb, pedidoId: 'public-partial', actorUid: CLIENT, now: BASE_TIME }),
  (error) => /injected_transaction_failure/.test(error?.message)
    && error.rewardStage === 'public_profile_projection',
)
assert.equal(partialDb.read(`users/${WORKER}/servicosCorre`), 5, 'contador do usuário foi aplicado antes da falha')
assert.equal(partialDb.read('attendanceRewardGrants/public-partial/serviceAccountingStatus'), 'user_applied')
assert.equal(partialDb.read('pedidos/public-partial/atendimento/recompensasContabilizadas'), null)
await countService({
  database: partialDb,
  pedidoId: 'public-partial',
  actorUid: WORKER,
  now: BASE_TIME + 1,
})
assert.equal(partialDb.read(`users/${WORKER}/servicosCorre`), 5, 'retomada não repete o incremento já reivindicado')
assert.equal(partialDb.read(`publicProfiles/${WORKER}/servicosCorre`), 5)
assert.equal(partialDb.read('attendanceRewardGrants/public-partial/status'), 'completed')

const monotonicDb = scenario('public-monotonic', {
  profile: {
    servicosCorre: 12,
    servicosProf: 9,
    servicosConcluidos: 25,
    completedServices: 25,
    reputation: { rating: 4.9, reviewCount: 20, completedServices: 25 },
  },
})
await countService({ database: monotonicDb, pedidoId: 'public-monotonic', actorUid: CLIENT, now: BASE_TIME })
assert.equal(monotonicDb.read(`publicProfiles/${WORKER}/servicosCorre`), 12, 'sincronização atrasada nunca reduz Corre')
assert.equal(monotonicDb.read(`publicProfiles/${WORKER}/servicosProf`), 9, 'sincronização atrasada nunca reduz Prof')
assert.equal(monotonicDb.read(`publicProfiles/${WORKER}/completedServices`), 25, 'total mais recente não é sobrescrito')
assert.equal(monotonicDb.read(`publicProfiles/${WORKER}/reputation/rating`), 4.9, 'nota permanece intacta')

const portugueseReputationDb = scenario('public-portuguese-reputation', {
  profile: {
    reputation: null,
    reputacao: { rating: 4.7, reviewCount: 8, completedServices: 6 },
  },
})
await countService({
  database: portugueseReputationDb,
  pedidoId: 'public-portuguese-reputation',
  actorUid: CLIENT,
  now: BASE_TIME,
})
assert.equal(portugueseReputationDb.read(`publicProfiles/${WORKER}/reputation`), null)
assert.equal(portugueseReputationDb.read(`publicProfiles/${WORKER}/reputacao/rating`), 4.7)
assert.equal(portugueseReputationDb.read(`publicProfiles/${WORKER}/reputacao/reviewCount`), 8)
assert.equal(portugueseReputationDb.read(`publicProfiles/${WORKER}/reputacao/completedServices`), 7)
assert.equal(buildProfessionalReputation(
  portugueseReputationDb.read(`publicProfiles/${WORKER}`),
).rating, 4.7, 'alias legado de reputação permanece visível')

const legacyCompleteId = 'legacy-v1-complete'
const legacyCompleteRecord = finalizedPublicOrder(legacyCompleteId)
legacyCompleteRecord.atendimento.recompensasContabilizadas = true
legacyCompleteRecord.atendimento.recompensasContabilizadasEm = BASE_TIME - 1
const legacyCompleteDb = scenario(legacyCompleteId, {
  record: legacyCompleteRecord,
  extra: {
    attendanceRewardGrants: {
      [legacyCompleteId]: {
        version: 1,
        pedidoId: legacyCompleteId,
        beneficiaryUid: WORKER,
        clientUid: CLIENT,
        mode: 'corre',
        status: 'completed',
        userApplied: true,
        missionApplied: true,
      },
    },
  },
})
const legacyCompleteResult = await countService({
  database: legacyCompleteDb,
  pedidoId: legacyCompleteId,
  actorUid: CLIENT,
  now: BASE_TIME,
})
assert.equal(legacyCompleteResult.alreadyGranted, true)
assert.equal(legacyCompleteDb.read(`users/${WORKER}/servicosCorre`), 4, 'ledger v1 completo não é reprocessado')

const legacyPartialId = 'legacy-v1-partial'
const legacyPartialDb = scenario(legacyPartialId, {
  extra: {
    attendanceRewardGrants: {
      [legacyPartialId]: {
        version: 1,
        pedidoId: legacyPartialId,
        beneficiaryUid: WORKER,
        clientUid: CLIENT,
        mode: 'corre',
        status: 'processing',
        userApplied: true,
        missionApplied: false,
      },
    },
  },
})
await assert.rejects(
  countService({ database: legacyPartialDb, pedidoId: legacyPartialId, actorUid: CLIENT, now: BASE_TIME }),
  expectRewardError('reward_legacy_ledger_partial'),
  'ledger v1 parcial falha fechado',
)
assert.equal(legacyPartialDb.read(`users/${WORKER}/servicosCorre`), 4)

const unauthorizedDb = scenario('public-unauthorized')
await assert.rejects(
  countService({ database: unauthorizedDb, pedidoId: 'public-unauthorized', actorUid: OUTSIDER, now: BASE_TIME }),
  expectRewardError('reward_actor_not_authorized'),
)
assert.equal(unauthorizedDb.read(`users/${WORKER}/servicosCorre`), 4)

const pendingDb = scenario('public-pending', {
  record: finalizedPublicOrder('public-pending', { status: 'aguardando_confirmacao' }),
})
await assert.rejects(
  countService({ database: pendingDb, pedidoId: 'public-pending', actorUid: CLIENT, now: BASE_TIME }),
  expectRewardError('reward_order_not_finalized'),
)

const oldOrderDb = scenario('public-before-cutoff', {
  record: finalizedPublicOrder('public-before-cutoff', { criadoEmServer: ACCOUNTING_ENABLED_FROM - 1 }),
})
await assert.rejects(
  countService({ database: oldOrderDb, pedidoId: 'public-before-cutoff', actorUid: CLIENT, now: BASE_TIME }),
  expectRewardError('reward_before_activation'),
)
assert.equal(oldOrderDb.read(`users/${WORKER}/servicosCorre`), 4)

const noTrustedTimestampDb = scenario('public-no-server-time', {
  record: finalizedPublicOrder('public-no-server-time', { criadoEmServer: undefined, criadoEm: BASE_TIME }),
})
await assert.rejects(
  countService({ database: noTrustedTimestampDb, pedidoId: 'public-no-server-time', actorUid: CLIENT, now: BASE_TIME }),
  expectRewardError('reward_before_activation'),
)

const futureTimestamp = BASE_TIME + ATTENDANCE_REWARD_MAX_CLOCK_SKEW_MS + 1
const futureDb = scenario('public-future-time', {
  record: finalizedPublicOrder('public-future-time', {
    finalizacaoSolicitadaEm: futureTimestamp - 1,
    finalizadoEm: futureTimestamp,
    atendimento: {
      finalizacaoSolicitadaEm: futureTimestamp - 1,
      finalizacaoSolicitadaPor: { id: WORKER },
      finalizadoEm: futureTimestamp,
      finalizadoPor: { id: CLIENT },
    },
  }),
})
await assert.rejects(
  countService({ database: futureDb, pedidoId: 'public-future-time', actorUid: CLIENT, now: BASE_TIME }),
  expectRewardError('reward_timestamp_invalid'),
)

await assert.rejects(
  grantAttendanceRewardsImpl({
    database: scenario('public-no-config'),
    pedidoId: 'public-no-config',
    actorUid: CLIENT,
    now: BASE_TIME,
  }),
  expectRewardError('reward_configuration_invalid'),
)
await assert.rejects(
  grantAttendanceRewardsImpl({
    database: scenario('public-call-before-cutoff'),
    pedidoId: 'public-call-before-cutoff',
    actorUid: CLIENT,
    rewardsEnabledFrom: BASE_TIME + 1,
    now: BASE_TIME,
  }),
  expectRewardError('reward_activation_pending'),
)

const disabledPhaseDb = scenario('public-disabled-phase')
await grantAttendanceRewardsImpl({
  database: disabledPhaseDb,
  pedidoId: 'public-disabled-phase',
  actorUid: CLIENT,
  rewardsEnabledFrom: ACCOUNTING_ENABLED_FROM,
  gamificationEnabled: true,
  gamificationEnabledFrom: BASE_TIME + 1,
  now: BASE_TIME,
})
assert.equal(disabledPhaseDb.read('attendanceRewardGrants/public-disabled-phase/gamificationStatus'), 'disabled_before_activation')
assert.equal(disabledPhaseDb.read(`users/${WORKER}/xp`), 90)
await grantAttendanceRewardsImpl({
  database: disabledPhaseDb,
  pedidoId: 'public-disabled-phase',
  actorUid: WORKER,
  rewardsEnabledFrom: ACCOUNTING_ENABLED_FROM,
  gamificationEnabled: true,
  gamificationEnabledFrom: ACCOUNTING_ENABLED_FROM,
  now: BASE_TIME + 60_000,
})
assert.equal(disabledPhaseDb.read(`users/${WORKER}/xp`), 90, 'ledger desativado não ganha XP após mudança futura da flag')
assert.equal(disabledPhaseDb.read(`users/${WORKER}/moedas`), 7)

const enabledDb = scenario('public-future-enabled')
await grantAttendanceRewardsImpl({
  database: enabledDb,
  pedidoId: 'public-future-enabled',
  actorUid: CLIENT,
  rewardsEnabledFrom: ACCOUNTING_ENABLED_FROM,
  gamificationEnabled: true,
  gamificationEnabledFrom: BASE_TIME - 60_000,
  now: BASE_TIME,
})
assert.equal(enabledDb.read(`users/${WORKER}/xp`), 100, 'gamificação futura exige flag e cutoff válidos')
assert.equal(enabledDb.read(`users/${WORKER}/moedas`), 11)
assert.equal(enabledDb.read(`missoes/${WORKER}/${attendanceRewardDayKey(BASE_TIME)}/entregou`), 3)

const legacyMarkerDb = scenario('legacy-marker-only', {
  record: (() => {
    const record = finalizedPublicOrder('legacy-marker-only')
    record.atendimento.recompensasContabilizadas = true
    return record
  })(),
})
await assert.rejects(
  countService({ database: legacyMarkerDb, pedidoId: 'legacy-marker-only', actorUid: CLIENT, now: BASE_TIME }),
  expectRewardError('reward_legacy_state_ambiguous'),
)

const [
  routeSource,
  publicCreateSource,
  privateCreateSource,
  privateTransitionSource,
  clientSource,
  chatSource,
  attendanceSource,
  rulesSource,
] = await Promise.all([
  readFile(new URL('../src/app/api/atendimento/rewards/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/pedidos/create/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/private-requests/create/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/private-requests/transition/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/atendimentoRewards.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ChatMensagens.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/atendimento.js', import.meta.url), 'utf8'),
  readFile(new URL('../database.rules.json', import.meta.url), 'utf8'),
])
const rules = JSON.parse(rulesSource).rules

assert.ok(routeSource.indexOf('verifyIdToken(idToken)') < routeSource.indexOf('request.json()'))
assert.match(routeSource, /bodyKeys\.length !== 1/)
assert.match(routeSource, /bodyKeys\[0\] !== 'pedidoId'/)
assert.match(routeSource, /ATTENDANCE_GAMIFICATION_ENABLED/)
assert.match(routeSource, /isAttendanceGamificationEnabled/)
assert.match(routeSource, /ATTENDANCE_GAMIFICATION_ENABLED_FROM/)
assert.doesNotMatch(routeSource, /body\?\.(?:gamification|xp|coins|moedas)/)
assert.match(routeSource, /stage:\s*sanitizedFailureStage\(error\)/)
assert.match(routeSource, /code:\s*reason/)
assert.match(routeSource, /category:\s*knownError\s*\?\s*'domain'\s*:\s*'unexpected'/)
assert.doesNotMatch(routeSource, /error\?*\.(?:message|stack)/, 'logs não expõem mensagem nem stack')
assert.match(publicCreateSource, /criadoEmServer:\s*now/)
assert.match(privateCreateSource, /criadoEmServer:\s*now/)
assert.match(privateTransitionSource, /nextStatus === ATENDIMENTO_STATUS\.FINALIZADO[\s\S]*grantAttendanceRewards/)
assert.match(clientSource, /body: JSON\.stringify\(\{ pedidoId: id \}\)/)
assert.doesNotMatch(clientSource, /runTransaction|missoes\/|users\//)
assert.match(chatSource, /contabilizarAtendimentoFinalizado/)
assert.doesNotMatch(attendanceSource, /claimAtendimentoRewards/)
assert.equal(rules.attendanceRewardGrants['.read'], false)
assert.equal(rules.attendanceRewardGrants['.write'], false)
assert.equal(rules.missoes.$uid['.write'], false)
assert.equal(rules.pedidos.$pedidoId.atendimento.recompensasContabilizadas['.write'], false)
assert.match(rules.privateRequests.$requestId['.write'], /data\.exists\(\) && !newData\.exists\(\)/)
for (const field of [
  'xp', 'moedas', 'servicosCorre', 'servicosProf', 'serviçosCorre', 'serviçosProf',
  'patente', 'patenteCorre', 'patenteProf', 'patenteAtualizadaEm', 'missaoAtualizadaEm',
  'attendanceRewardClaims',
]) {
  assert.equal(rules.users.$uid[field]['.validate'], 'newData.val() === data.val()', `${field} fica server-only`)
  assert.match(rules.users.$uid['.write'], new RegExp(`child\\('${field}'\\)`))
}
for (const field of ['reputation', 'servicosConcluidos', 'completedServices', 'servicosCorre', 'servicosProf']) {
  assert.match(rules.publicProfiles.$uid['.validate'], new RegExp(`child\\('${field}'\\)`), `${field} público fica server-only`)
}

console.log('Serviços concluídos: ledger v2, gamificação fail-closed, público/privado, concorrência, retomada, reputação e Rules OK')
