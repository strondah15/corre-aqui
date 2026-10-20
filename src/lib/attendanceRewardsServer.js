import { ATENDIMENTO_STATUS, normalizeAtendimentoStatus } from './attendanceState.js'

export const ATTENDANCE_REWARD_LEDGER_VERSION = 1
export const ATTENDANCE_REWARD_XP = 10
export const ATTENDANCE_REWARD_COINS = 4
export const ATTENDANCE_REWARD_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'
const SERVICE_PATENT_THRESHOLDS = Object.freeze([0, 5, 15, 30, 60])

export class AttendanceRewardError extends Error {
  constructor(code, status = 409) {
    super(code)
    this.name = 'AttendanceRewardError'
    this.code = code
    this.status = status
  }
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function actorId(value) {
  return String(value?.id || value?.uid || '').trim()
}

function positiveTimestamp(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function safeCounter(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0
}

function isProfessionalAccount(account = {}) {
  return Boolean(
    account.isProfissional
    || account?.profile?.isProfissional
    || account?.profissional?.ativo,
  )
}

export function normalizeAttendanceRewardOrderId(value) {
  const pedidoId = String(value || '').trim()
  return ORDER_ID_PATTERN.test(pedidoId) ? pedidoId : ''
}

export function parseAttendanceRewardsEnabledFrom(value) {
  const raw = String(value || '').trim()
  if (!raw) return 0
  const parsed = /^\d{13}$/.test(raw) ? Number(raw) : Date.parse(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function attendanceRewardDayKey(timestamp = Date.now()) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) throw new AttendanceRewardError('reward_invalid_timestamp', 500)

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function calculateServicePatent(services = 0) {
  const total = safeCounter(services)
  if (total >= SERVICE_PATENT_THRESHOLDS[4]) return 5
  if (total >= SERVICE_PATENT_THRESHOLDS[3]) return 4
  if (total >= SERVICE_PATENT_THRESHOLDS[2]) return 3
  if (total >= SERVICE_PATENT_THRESHOLDS[1]) return 2
  return 1
}

function rewardModeFor(pedido, account) {
  const requestedMode = String(pedido?.modoPedido || 'geral').trim().toLowerCase()
  if (requestedMode === 'profissional') {
    if (!isProfessionalAccount(account)) {
      throw new AttendanceRewardError('reward_professional_profile_required', 409)
    }
    return 'prof'
  }
  if (!requestedMode || requestedMode === 'geral' || requestedMode === 'corre') return 'corre'
  throw new AttendanceRewardError('reward_order_mode_invalid', 409)
}

export function assessAttendanceRewardEligibility({ pedido, actorUid }) {
  if (!pedido || typeof pedido !== 'object') throw new AttendanceRewardError('reward_order_not_found', 404)

  const beneficiaryUid = actorId(pedido.aceite)
  const clientUid = actorId(pedido.criador)
  const callerUid = String(actorUid || '').trim()
  if (!beneficiaryUid || !clientUid || !callerUid || beneficiaryUid !== callerUid) {
    throw new AttendanceRewardError('reward_actor_not_authorized', 403)
  }

  if (normalizeAtendimentoStatus(pedido.status) !== ATENDIMENTO_STATUS.FINALIZADO) {
    throw new AttendanceRewardError('reward_order_not_finalized', 409)
  }

  const atendimento = objectValue(pedido.atendimento)
  const requestedBy = actorId(atendimento.finalizacaoSolicitadaPor)
  const requestedByTopLevel = actorId(pedido.finalizacaoSolicitadaPor)
  const finalizedBy = actorId(atendimento.finalizadoPor)
  const finalizedByTopLevel = actorId(pedido.finalizadoPor)
  const requestTime = positiveTimestamp(atendimento.finalizacaoSolicitadaEm)
  const requestTimeTopLevel = positiveTimestamp(pedido.finalizacaoSolicitadaEm)
  const finalizedAt = positiveTimestamp(atendimento.finalizadoEm)
  const finalizedAtTopLevel = positiveTimestamp(pedido.finalizadoEm)
  const orderCreatedAtServer = positiveTimestamp(pedido.criadoEmServer)

  if (
    requestedBy !== beneficiaryUid
    || requestedByTopLevel !== beneficiaryUid
    || !requestTime
    || !requestTimeTopLevel
    || requestTime !== requestTimeTopLevel
  ) {
    throw new AttendanceRewardError('reward_completion_request_unverified', 409)
  }

  if (
    finalizedBy !== clientUid
    || finalizedByTopLevel !== clientUid
    || !finalizedAt
    || !finalizedAtTopLevel
    || finalizedAt !== finalizedAtTopLevel
    || requestTime > finalizedAt
  ) {
    throw new AttendanceRewardError('reward_client_confirmation_unverified', 409)
  }

  return Object.freeze({
    beneficiaryUid,
    clientUid,
    requestTime,
    finalizedAt,
    orderCreatedAtServer,
  })
}

function createExpectedLedger({ pedidoId, eligibility, mode, now }) {
  return {
    version: ATTENDANCE_REWARD_LEDGER_VERSION,
    pedidoId,
    beneficiaryUid: eligibility.beneficiaryUid,
    clientUid: eligibility.clientUid,
    orderCreatedAtServer: eligibility.orderCreatedAtServer,
    finalizedAt: eligibility.finalizedAt,
    mode,
    xp: ATTENDANCE_REWARD_XP,
    coins: ATTENDANCE_REWARD_COINS,
    serviceCounter: mode === 'prof' ? 'servicosProf' : 'servicosCorre',
    missionDay: attendanceRewardDayKey(now),
    status: 'processing',
    userApplied: false,
    missionApplied: false,
    createdAt: now,
    updatedAt: now,
  }
}

function assertLedgerMatches(ledger, expected) {
  const immutableFields = [
    'version',
    'pedidoId',
    'beneficiaryUid',
    'clientUid',
    'orderCreatedAtServer',
    'finalizedAt',
    'mode',
    'xp',
    'coins',
    'serviceCounter',
  ]
  if (!ledger || typeof ledger !== 'object') throw new AttendanceRewardError('reward_ledger_invalid', 409)
  for (const field of immutableFields) {
    if (ledger[field] !== expected[field]) throw new AttendanceRewardError('reward_ledger_conflict', 409)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ledger.missionDay || ''))) {
    throw new AttendanceRewardError('reward_ledger_invalid', 409)
  }
  return ledger
}

async function initializeLedger({ database, expectedLedger }) {
  const ledgerRef = database.ref(`attendanceRewardGrants/${expectedLedger.pedidoId}`)
  const result = await ledgerRef.transaction((current) => {
    if (current != null) return current
    return expectedLedger
  })
  const ledger = result.snapshot.val()
  return { ledgerRef, ledger: assertLedgerMatches(ledger, expectedLedger) }
}

function rewardClaimMatches(claim, ledger) {
  return Boolean(
    claim
    && typeof claim === 'object'
    && claim.version === ATTENDANCE_REWARD_LEDGER_VERSION
    && claim.pedidoId === ledger.pedidoId
    && claim.mode === ledger.mode,
  )
}

async function applyUserReward({ database, ledger, now }) {
  const userRef = database.ref(`users/${ledger.beneficiaryUid}`)
  const result = await userRef.transaction((current) => {
    if (!current || typeof current !== 'object') return
    const user = objectValue(current)
    const existingClaim = objectValue(user.attendanceRewardClaims)[ledger.pedidoId]
    if (existingClaim != null) return user

    const servicesCorreBefore = safeCounter(user.servicosCorre ?? user['serviçosCorre'])
    const servicesProfBefore = safeCounter(user.servicosProf ?? user['serviçosProf'])
    const servicesCorre = ledger.mode === 'corre' ? servicesCorreBefore + 1 : servicesCorreBefore
    const servicesProf = ledger.mode === 'prof' ? servicesProfBefore + 1 : servicesProfBefore
    const professionalAccount = isProfessionalAccount(user)

    return {
      ...user,
      servicosCorre: servicesCorre,
      servicosProf: servicesProf,
      ['serviçosCorre']: servicesCorre,
      ['serviçosProf']: servicesProf,
      patenteCorre: calculateServicePatent(servicesCorre),
      patenteProf: professionalAccount ? calculateServicePatent(servicesProf) : safeCounter(user.patenteProf),
      xp: safeCounter(user.xp) + ledger.xp,
      moedas: safeCounter(user.moedas) + ledger.coins,
      patenteAtualizadaEm: now,
      missaoAtualizadaEm: now,
      attendanceRewardClaims: {
        ...objectValue(user.attendanceRewardClaims),
        [ledger.pedidoId]: {
          version: ATTENDANCE_REWARD_LEDGER_VERSION,
          pedidoId: ledger.pedidoId,
          mode: ledger.mode,
          appliedAt: now,
        },
      },
    }
  })

  const savedUser = result.snapshot.val()
  if (!savedUser || !rewardClaimMatches(savedUser?.attendanceRewardClaims?.[ledger.pedidoId], ledger)) {
    throw new AttendanceRewardError('reward_user_update_failed', 500)
  }
  return savedUser
}

async function applyMissionReward({ database, ledger, now }) {
  const missionRef = database.ref(`missoes/${ledger.beneficiaryUid}/${ledger.missionDay}`)
  const result = await missionRef.transaction((current) => {
    const mission = objectValue(current)
    const existingClaim = objectValue(mission.attendanceRewardClaims)[ledger.pedidoId]
    if (existingClaim != null) return mission

    return {
      ...mission,
      aceitou: safeCounter(mission.aceitou),
      boostou: safeCounter(mission.boostou),
      entregou: safeCounter(mission.entregou) + 1,
      xp: safeCounter(mission.xp) + ledger.xp,
      moedas: safeCounter(mission.moedas) + ledger.coins,
      updatedAt: now,
      attendanceRewardClaims: {
        ...objectValue(mission.attendanceRewardClaims),
        [ledger.pedidoId]: {
          version: ATTENDANCE_REWARD_LEDGER_VERSION,
          pedidoId: ledger.pedidoId,
          mode: ledger.mode,
          appliedAt: now,
        },
      },
    }
  })

  const savedMission = result.snapshot.val()
  if (!rewardClaimMatches(savedMission?.attendanceRewardClaims?.[ledger.pedidoId], ledger)) {
    throw new AttendanceRewardError('reward_mission_update_failed', 500)
  }
  return savedMission
}

function completedResult(ledger, alreadyGranted) {
  return Object.freeze({
    pedidoId: ledger.pedidoId,
    contabilizado: true,
    alreadyGranted,
    mode: ledger.mode,
  })
}

export async function grantAttendanceRewards({
  database,
  pedidoId,
  actorUid,
  rewardsEnabledFrom,
  now = Date.now(),
}) {
  const id = normalizeAttendanceRewardOrderId(pedidoId)
  const callerUid = String(actorUid || '').trim()
  const activationTime = positiveTimestamp(rewardsEnabledFrom)
  const serverNow = positiveTimestamp(now)
  if (!database || !id || !callerUid) throw new AttendanceRewardError('reward_request_invalid', 400)
  if (!activationTime) throw new AttendanceRewardError('reward_configuration_invalid', 503)
  if (!serverNow) throw new AttendanceRewardError('reward_server_clock_invalid', 503)
  if (serverNow < activationTime) throw new AttendanceRewardError('reward_activation_pending', 503)

  const [pedidoSnapshot, accountSnapshot, existingLedgerSnapshot] = await Promise.all([
    database.ref(`pedidos/${id}`).get(),
    database.ref(`users/${callerUid}`).get(),
    database.ref(`attendanceRewardGrants/${id}`).get(),
  ])
  const pedido = pedidoSnapshot.val()
  const account = accountSnapshot.val()
  const eligibility = assessAttendanceRewardEligibility({ pedido, actorUid: callerUid })
  if (!account || typeof account !== 'object') throw new AttendanceRewardError('reward_beneficiary_not_found', 404)
  if (!eligibility.orderCreatedAtServer || eligibility.orderCreatedAtServer < activationTime) {
    throw new AttendanceRewardError('reward_before_activation', 409)
  }
  const earliestPlausibleOrderTime = eligibility.orderCreatedAtServer - ATTENDANCE_REWARD_MAX_CLOCK_SKEW_MS
  const latestPlausibleClientTime = serverNow + ATTENDANCE_REWARD_MAX_CLOCK_SKEW_MS
  if (
    eligibility.orderCreatedAtServer > latestPlausibleClientTime
    || eligibility.requestTime < earliestPlausibleOrderTime
    || eligibility.requestTime > latestPlausibleClientTime
    || eligibility.finalizedAt < earliestPlausibleOrderTime
    || eligibility.finalizedAt > latestPlausibleClientTime
  ) {
    throw new AttendanceRewardError('reward_timestamp_invalid', 409)
  }

  const existingLedger = existingLedgerSnapshot.val()
  if (pedido?.atendimento?.recompensasContabilizadas === true && existingLedger == null) {
    throw new AttendanceRewardError('reward_legacy_state_ambiguous', 409)
  }

  const mode = existingLedger?.mode || rewardModeFor(pedido, account)
  const expectedLedger = createExpectedLedger({ pedidoId: id, eligibility, mode, now: serverNow })
  const { ledgerRef, ledger } = await initializeLedger({ database, expectedLedger })

  if (pedido?.atendimento?.recompensasContabilizadas === true) {
    if (ledger.status === 'completed' && ledger.userApplied === true && ledger.missionApplied === true) {
      return completedResult(ledger, true)
    }
    throw new AttendanceRewardError('reward_state_inconsistent', 409)
  }

  await applyUserReward({ database, ledger, now: serverNow })
  await ledgerRef.update({ userApplied: true, updatedAt: serverNow })

  await applyMissionReward({ database, ledger, now: serverNow })
  await ledgerRef.update({ missionApplied: true, updatedAt: serverNow })

  await database.ref().update({
    [`attendanceRewardGrants/${id}/status`]: 'completed',
    [`attendanceRewardGrants/${id}/userApplied`]: true,
    [`attendanceRewardGrants/${id}/missionApplied`]: true,
    [`attendanceRewardGrants/${id}/completedAt`]: serverNow,
    [`attendanceRewardGrants/${id}/updatedAt`]: serverNow,
    [`pedidos/${id}/atendimento/recompensasContabilizadas`]: true,
    [`pedidos/${id}/atendimento/recompensasContabilizadasEm`]: serverNow,
  })

  return completedResult({ ...ledger, status: 'completed' }, false)
}
