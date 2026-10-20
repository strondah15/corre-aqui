import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  ATTENDANCE_REWARD_MAX_CLOCK_SKEW_MS,
  AttendanceRewardError,
  attendanceRewardDayKey,
  grantAttendanceRewards as grantAttendanceRewardsImpl,
} from '../src/lib/attendanceRewardsServer.js'

const CLIENT = 'client-A'
const WORKER = 'worker-B'
const OUTSIDER = 'outsider-C'
const BASE_TIME = Date.UTC(2026, 9, 18, 15, 30)
const REWARDS_ENABLED_FROM = BASE_TIME - 100_000

function grantAttendanceRewards(options) {
  return grantAttendanceRewardsImpl({
    ...options,
    rewardsEnabledFrom: REWARDS_ENABLED_FROM,
  })
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function createMemoryDatabase(initial = {}, { failTransactions = {} } = {}) {
  const state = clone(initial)
  const locks = new Map()
  const failures = new Map(Object.entries(failTransactions))
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
            const current = read(basePath)
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

function finalizedOrder(id, overrides = {}) {
  const createdAtServer = BASE_TIME - 50_000
  const requestedAt = BASE_TIME - 10_000
  const finalizedAt = BASE_TIME - 5_000
  return {
    id,
    status: 'finalizado',
    modoPedido: 'geral',
    criador: { id: CLIENT, nome: 'Cliente A' },
    aceite: { id: WORKER, nome: 'Profissional B' },
    criadoEmServer: createdAtServer,
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
    subscriptions: { professional: { status: 'trial' } },
    ...overrides,
  }
}

function scenario(orderId, options = {}) {
  return createMemoryDatabase({
    pedidos: { [orderId]: finalizedOrder(orderId, options.order) },
    users: {
      [WORKER]: workerAccount(options.worker),
      [OUTSIDER]: { nome: 'Terceiro' },
    },
  }, options.database)
}

const onceDatabase = scenario('order-once')
const firstGrant = await grantAttendanceRewards({
  database: onceDatabase,
  pedidoId: 'order-once',
  actorUid: WORKER,
  now: BASE_TIME,
})
assert.equal(firstGrant.contabilizado, true)
assert.equal(firstGrant.alreadyGranted, false)
assert.equal(onceDatabase.read(`users/${WORKER}/xp`), 100)
assert.equal(onceDatabase.read(`users/${WORKER}/moedas`), 11)
assert.equal(onceDatabase.read(`users/${WORKER}/servicosCorre`), 5)
assert.equal(onceDatabase.read(`users/${WORKER}/patenteCorre`), 2)
assert.equal(onceDatabase.read(`missoes/${WORKER}/${attendanceRewardDayKey(BASE_TIME)}/entregou`), 1)
assert.equal(onceDatabase.read('pedidos/order-once/atendimento/recompensasContabilizadas'), true)
assert.equal(onceDatabase.read('attendanceRewardGrants/order-once/status'), 'completed')
assert.equal(
  onceDatabase.read('attendanceRewardGrants/order-once/orderCreatedAtServer'),
  BASE_TIME - 50_000,
  'ledger preserva a prova server-side usada no cutoff',
)

const repeatedGrant = await grantAttendanceRewards({
  database: onceDatabase,
  pedidoId: 'order-once',
  actorUid: WORKER,
  now: BASE_TIME + 60_000,
})
assert.equal(repeatedGrant.alreadyGranted, true)
assert.equal(onceDatabase.read(`users/${WORKER}/xp`), 100, 'repetição não duplica XP')
assert.equal(onceDatabase.read(`users/${WORKER}/moedas`), 11, 'repetição não duplica moedas')
assert.equal(onceDatabase.read(`users/${WORKER}/servicosCorre`), 5, 'repetição não duplica serviço')

const concurrentDatabase = scenario('order-concurrent')
const concurrentResults = await Promise.all(Array.from({ length: 8 }, () => grantAttendanceRewards({
  database: concurrentDatabase,
  pedidoId: 'order-concurrent',
  actorUid: WORKER,
  now: BASE_TIME,
})))
assert.equal(concurrentResults.length, 8)
assert.equal(concurrentDatabase.read(`users/${WORKER}/xp`), 100, 'concorrência concede XP uma vez')
assert.equal(concurrentDatabase.read(`users/${WORKER}/moedas`), 11, 'concorrência concede moedas uma vez')
assert.equal(concurrentDatabase.read(`missoes/${WORKER}/${attendanceRewardDayKey(BASE_TIME)}/entregou`), 1)
assert.equal(concurrentDatabase.read('attendanceRewardGrants/order-concurrent/status'), 'completed')

const missionPath = `missoes/${WORKER}/${attendanceRewardDayKey(BASE_TIME)}`
const partialDatabase = scenario('order-partial', {
  database: { failTransactions: { [missionPath]: 1 } },
})
await assert.rejects(
  grantAttendanceRewards({
    database: partialDatabase,
    pedidoId: 'order-partial',
    actorUid: WORKER,
    now: BASE_TIME,
  }),
  /injected_transaction_failure/,
)
assert.equal(partialDatabase.read(`users/${WORKER}/xp`), 100, 'etapa de usuário foi aplicada antes da falha')
assert.equal(partialDatabase.read('pedidos/order-partial/atendimento/recompensasContabilizadas'), null)
assert.equal(partialDatabase.read('attendanceRewardGrants/order-partial/status'), 'processing')

await grantAttendanceRewards({
  database: partialDatabase,
  pedidoId: 'order-partial',
  actorUid: WORKER,
  now: BASE_TIME + 86_400_000,
})
assert.equal(partialDatabase.read(`users/${WORKER}/xp`), 100, 'retomada não repete a etapa de usuário')
assert.equal(partialDatabase.read(`${missionPath}/entregou`), 1, 'retomada usa o dia fixado no ledger')
assert.equal(partialDatabase.read('pedidos/order-partial/atendimento/recompensasContabilizadas'), true)

const professionalDatabase = scenario('order-professional', {
  order: { modoPedido: 'profissional' },
})
await grantAttendanceRewards({
  database: professionalDatabase,
  pedidoId: 'order-professional',
  actorUid: WORKER,
  now: BASE_TIME,
})
assert.equal(professionalDatabase.read(`users/${WORKER}/servicosCorre`), 4)
assert.equal(professionalDatabase.read(`users/${WORKER}/servicosProf`), 3)

const pendingDatabase = scenario('order-pending', {
  order: { status: 'aguardando_confirmacao' },
})
await assert.rejects(
  grantAttendanceRewards({
    database: pendingDatabase,
    pedidoId: 'order-pending',
    actorUid: WORKER,
    now: BASE_TIME,
  }),
  (error) => error instanceof AttendanceRewardError && error.code === 'reward_order_not_finalized',
)
assert.equal(pendingDatabase.read(`users/${WORKER}/xp`), 90)

const beforeActivationDatabase = scenario('order-before-activation', {
  order: {
    criadoEmServer: BASE_TIME - 1,
    finalizacaoSolicitadaEm: BASE_TIME + 1,
    finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
    finalizadoEm: BASE_TIME + 2,
    finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    atendimento: {
      finalizacaoSolicitadaEm: BASE_TIME + 1,
      finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
      finalizadoEm: BASE_TIME + 2,
      finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    },
  },
})
await assert.rejects(
  grantAttendanceRewardsImpl({
    database: beforeActivationDatabase,
    pedidoId: 'order-before-activation',
    actorUid: WORKER,
    rewardsEnabledFrom: BASE_TIME,
    now: BASE_TIME + 10_000,
  }),
  (error) => error instanceof AttendanceRewardError && error.code === 'reward_before_activation',
  'pedido criado antes do corte não recebe recompensa mesmo com conclusão posterior manipulada',
)
assert.equal(beforeActivationDatabase.read(`users/${WORKER}/xp`), 90)

const legacyWithoutServerTimestampDatabase = scenario('order-legacy-without-server-timestamp', {
  order: { criadoEmServer: undefined },
})
await assert.rejects(
  grantAttendanceRewards({
    database: legacyWithoutServerTimestampDatabase,
    pedidoId: 'order-legacy-without-server-timestamp',
    actorUid: WORKER,
    now: BASE_TIME,
  }),
  (error) => error instanceof AttendanceRewardError && error.code === 'reward_before_activation',
  'pedido legado sem prova server-side de criação não recebe recompensa retroativa',
)
assert.equal(legacyWithoutServerTimestampDatabase.read(`users/${WORKER}/xp`), 90)

const beforeCutoffCallDatabase = scenario('order-call-before-cutoff', {
  order: {
    criadoEmServer: BASE_TIME,
    finalizacaoSolicitadaEm: BASE_TIME + 1,
    finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
    finalizadoEm: BASE_TIME + 2,
    finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    atendimento: {
      finalizacaoSolicitadaEm: BASE_TIME + 1,
      finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
      finalizadoEm: BASE_TIME + 2,
      finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    },
  },
})
await assert.rejects(
  grantAttendanceRewardsImpl({
    database: beforeCutoffCallDatabase,
    pedidoId: 'order-call-before-cutoff',
    actorUid: WORKER,
    rewardsEnabledFrom: BASE_TIME,
    now: BASE_TIME - 1,
  }),
  (error) => error instanceof AttendanceRewardError && error.code === 'reward_activation_pending',
  'relógio do servidor bloqueia chamadas anteriores ao cutoff',
)
assert.equal(beforeCutoffCallDatabase.read(`users/${WORKER}/xp`), 90)

const afterCutoffDatabase = scenario('order-call-after-cutoff', {
  order: {
    criadoEmServer: BASE_TIME,
    finalizacaoSolicitadaEm: BASE_TIME + 1,
    finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
    finalizadoEm: BASE_TIME + 2,
    finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    atendimento: {
      finalizacaoSolicitadaEm: BASE_TIME + 1,
      finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
      finalizadoEm: BASE_TIME + 2,
      finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    },
  },
})
await grantAttendanceRewardsImpl({
  database: afterCutoffDatabase,
  pedidoId: 'order-call-after-cutoff',
  actorUid: WORKER,
  rewardsEnabledFrom: BASE_TIME,
  now: BASE_TIME + 3,
})
assert.equal(afterCutoffDatabase.read(`users/${WORKER}/xp`), 100, 'chamada posterior ao cutoff é permitida')

const futureTimestamp = BASE_TIME + ATTENDANCE_REWARD_MAX_CLOCK_SKEW_MS + 1
const futureTimestampDatabase = scenario('order-future-timestamp', {
  order: {
    criadoEmServer: BASE_TIME,
    finalizacaoSolicitadaEm: futureTimestamp - 1,
    finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
    finalizadoEm: futureTimestamp,
    finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    atendimento: {
      finalizacaoSolicitadaEm: futureTimestamp - 1,
      finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
      finalizadoEm: futureTimestamp,
      finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    },
  },
})
await assert.rejects(
  grantAttendanceRewardsImpl({
    database: futureTimestampDatabase,
    pedidoId: 'order-future-timestamp',
    actorUid: WORKER,
    rewardsEnabledFrom: BASE_TIME,
    now: BASE_TIME,
  }),
  (error) => error instanceof AttendanceRewardError && error.code === 'reward_timestamp_invalid',
  'profissional e cliente não antecipam elegibilidade com timestamps futuros',
)
assert.equal(futureTimestampDatabase.read(`users/${WORKER}/xp`), 90)

const oldTimestamp = BASE_TIME - ATTENDANCE_REWARD_MAX_CLOCK_SKEW_MS - 1
const oldTimestampDatabase = scenario('order-old-timestamp', {
  order: {
    criadoEmServer: BASE_TIME,
    finalizacaoSolicitadaEm: oldTimestamp,
    finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
    finalizadoEm: oldTimestamp + 1,
    finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    atendimento: {
      finalizacaoSolicitadaEm: oldTimestamp,
      finalizacaoSolicitadaPor: { id: WORKER, nome: 'Profissional B' },
      finalizadoEm: oldTimestamp + 1,
      finalizadoPor: { id: CLIENT, nome: 'Cliente A' },
    },
  },
})
await assert.rejects(
  grantAttendanceRewardsImpl({
    database: oldTimestampDatabase,
    pedidoId: 'order-old-timestamp',
    actorUid: WORKER,
    rewardsEnabledFrom: BASE_TIME,
    now: BASE_TIME,
  }),
  (error) => error instanceof AttendanceRewardError && error.code === 'reward_timestamp_invalid',
  'timestamps anteriores à criação server-side não são aceitos',
)
assert.equal(oldTimestampDatabase.read(`users/${WORKER}/xp`), 90)

await assert.rejects(
  grantAttendanceRewardsImpl({
    database: scenario('order-no-config'),
    pedidoId: 'order-no-config',
    actorUid: WORKER,
    now: BASE_TIME,
  }),
  (error) => error instanceof AttendanceRewardError && error.code === 'reward_configuration_invalid',
  'ausência do corte de ativação falha fechado',
)

const unauthorizedDatabase = scenario('order-unauthorized')
await assert.rejects(
  grantAttendanceRewards({
    database: unauthorizedDatabase,
    pedidoId: 'order-unauthorized',
    actorUid: OUTSIDER,
    now: BASE_TIME,
  }),
  (error) => error instanceof AttendanceRewardError && error.code === 'reward_actor_not_authorized',
)
assert.equal(unauthorizedDatabase.read(`users/${WORKER}/xp`), 90)

const unconfirmedDatabase = scenario('order-unconfirmed', {
  order: {
    atendimento: {
      finalizacaoSolicitadaEm: BASE_TIME - 10_000,
      finalizacaoSolicitadaPor: { id: WORKER },
      finalizadoEm: BASE_TIME - 5_000,
      finalizadoPor: { id: WORKER },
    },
  },
})
await assert.rejects(
  grantAttendanceRewards({
    database: unconfirmedDatabase,
    pedidoId: 'order-unconfirmed',
    actorUid: WORKER,
    now: BASE_TIME,
  }),
  (error) => error instanceof AttendanceRewardError && error.code === 'reward_client_confirmation_unverified',
)

const legacyDatabase = scenario('order-legacy', {
  order: {
    atendimento: {
      finalizacaoSolicitadaEm: BASE_TIME - 10_000,
      finalizacaoSolicitadaPor: { id: WORKER },
      finalizadoEm: BASE_TIME - 5_000,
      finalizadoPor: { id: CLIENT },
      recompensasContabilizadas: true,
    },
  },
})
await assert.rejects(
  grantAttendanceRewards({
    database: legacyDatabase,
    pedidoId: 'order-legacy',
    actorUid: WORKER,
    now: BASE_TIME,
  }),
  (error) => error instanceof AttendanceRewardError && error.code === 'reward_legacy_state_ambiguous',
  'marcador legado sem ledger não gera crédito retroativo',
)

const [routeSource, orderCreationRouteSource, clientSource, attendanceSource, rulesSource] = await Promise.all([
  readFile(new URL('../src/app/api/atendimento/rewards/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/pedidos/create/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/atendimentoRewards.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/atendimento.js', import.meta.url), 'utf8'),
  readFile(new URL('../database.rules.json', import.meta.url), 'utf8'),
])
const rules = JSON.parse(rulesSource).rules

assert.ok(routeSource.indexOf('verifyIdToken(idToken)') < routeSource.indexOf('request.json()'))
assert.match(routeSource, /bodyKeys\.length !== 1/)
assert.match(routeSource, /grantAttendanceRewards/)
assert.match(routeSource, /ATTENDANCE_REWARDS_ENABLED_FROM/)
assert.match(orderCreationRouteSource, /criadoEmServer:\s*now/)
assert.match(clientSource, /body: JSON\.stringify\(\{ pedidoId: id \}\)/)
assert.doesNotMatch(clientSource, /runTransaction|missoes\/|users\//)
assert.doesNotMatch(attendanceSource, /claimAtendimentoRewards/)
assert.equal(rules.attendanceRewardGrants['.read'], false)
assert.equal(rules.attendanceRewardGrants['.write'], false)
assert.equal(rules.missoes.$uid['.write'], false)
assert.equal(rules.pedidos.$pedidoId.atendimento.recompensasContabilizadas['.write'], false)
for (const field of [
  'xp',
  'moedas',
  'servicosCorre',
  'servicosProf',
  'serviçosCorre',
  'serviçosProf',
  'patente',
  'patenteCorre',
  'patenteProf',
  'patenteAtualizadaEm',
  'missaoAtualizadaEm',
  'attendanceRewardClaims',
]) {
  assert.equal(rules.users.$uid[field]['.validate'], 'newData.val() === data.val()', `${field} fica server-only`)
  assert.match(rules.users.$uid['.write'], new RegExp(`child\\('${field}'\\)`))
}

console.log('Recompensas: autenticação, elegibilidade, idempotência, concorrência, retomada e Rules server-only OK')
