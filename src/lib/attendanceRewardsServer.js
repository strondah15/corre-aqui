import { ATENDIMENTO_STATUS, normalizeAtendimentoStatus } from './attendanceState.js'

export const ATTENDANCE_REWARD_LEDGER_VERSION = 2
export const ATTENDANCE_REWARD_LEGACY_LEDGER_VERSION = 1
export const ATTENDANCE_REWARD_XP = 10
export const ATTENDANCE_REWARD_COINS = 4
export const ATTENDANCE_REWARD_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'
const SERVICE_PATENT_THRESHOLDS = Object.freeze([0, 5, 15, 30, 60])
const RECORD_KINDS = Object.freeze({ PUBLIC: 'pedido', PRIVATE: 'privateRequest' })
const DISABLED_GAMIFICATION_STATUSES = new Set([
  'disabled',
  'disabled_configuration',
  'disabled_before_activation',
])

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

function maxCounter(...values) {
  return Math.max(0, ...values.map(safeCounter))
}

function isProfessionalAccount(account = {}) {
  return Boolean(account.isProfissional || account?.profile?.isProfissional || account?.profissional?.ativo)
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

export function isAttendanceGamificationEnabled(value) {
  return value === 'true'
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

function rewardModeFor(record, account, recordKind) {
  if (recordKind === RECORD_KINDS.PRIVATE) return 'prof'
  const requestedMode = String(record?.modoPedido || 'geral').trim().toLowerCase()
  if (requestedMode === 'profissional') {
    if (!isProfessionalAccount(account)) {
      throw new AttendanceRewardError('reward_professional_profile_required', 409)
    }
    return 'prof'
  }
  if (!requestedMode || requestedMode === 'geral' || requestedMode === 'corre') return 'corre'
  throw new AttendanceRewardError('reward_order_mode_invalid', 409)
}

function participantIds(record, recordKind) {
  if (recordKind === RECORD_KINDS.PRIVATE) {
    return {
      beneficiaryUid: String(record?.profissionalId || '').trim(),
      clientUid: String(record?.clienteId || '').trim(),
    }
  }
  return { beneficiaryUid: actorId(record?.aceite), clientUid: actorId(record?.criador) }
}

export function assessAttendanceRewardEligibility({ pedido, actorUid, recordKind = RECORD_KINDS.PUBLIC }) {
  if (!pedido || typeof pedido !== 'object') throw new AttendanceRewardError('reward_order_not_found', 404)
  if (recordKind !== RECORD_KINDS.PUBLIC && recordKind !== RECORD_KINDS.PRIVATE) {
    throw new AttendanceRewardError('reward_record_kind_invalid', 409)
  }
  const { beneficiaryUid, clientUid } = participantIds(pedido, recordKind)
  const callerUid = String(actorUid || '').trim()
  if (!beneficiaryUid || !clientUid || !callerUid || ![beneficiaryUid, clientUid].includes(callerUid)) {
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
  const createdAtServer = positiveTimestamp(pedido.criadoEmServer)
  const legacyPrivateCreatedAt = recordKind === RECORD_KINDS.PRIVATE ? positiveTimestamp(pedido.criadoEm) : 0
  const orderCreatedAtServer = createdAtServer || legacyPrivateCreatedAt

  if (requestedBy !== beneficiaryUid || requestedByTopLevel !== beneficiaryUid
    || !requestTime || !requestTimeTopLevel || requestTime !== requestTimeTopLevel) {
    throw new AttendanceRewardError('reward_completion_request_unverified', 409)
  }
  if (finalizedBy !== clientUid || finalizedByTopLevel !== clientUid
    || !finalizedAt || !finalizedAtTopLevel || finalizedAt !== finalizedAtTopLevel
    || requestTime > finalizedAt) {
    throw new AttendanceRewardError('reward_client_confirmation_unverified', 409)
  }
  return Object.freeze({
    beneficiaryUid,
    clientUid,
    requestTime,
    finalizedAt,
    orderCreatedAtServer,
    orderCreatedAtSource: createdAtServer ? 'criadoEmServer' : 'legacyPrivateCriadoEm',
  })
}

function resolveGamificationPolicy({ enabled, enabledFrom, orderCreatedAtServer, serverNow }) {
  if (enabled !== true) return Object.freeze({ enabled: false, status: 'disabled' })
  const activationTime = positiveTimestamp(enabledFrom)
  if (!activationTime) return Object.freeze({ enabled: false, status: 'disabled_configuration' })
  if (serverNow < activationTime || orderCreatedAtServer < activationTime) {
    return Object.freeze({ enabled: false, status: 'disabled_before_activation' })
  }
  return Object.freeze({ enabled: true, status: 'pending' })
}

function createExpectedLedger({ pedidoId, recordKind, eligibility, mode, now, gamification }) {
  return {
    version: ATTENDANCE_REWARD_LEDGER_VERSION,
    pedidoId,
    recordKind,
    beneficiaryUid: eligibility.beneficiaryUid,
    clientUid: eligibility.clientUid,
    orderCreatedAtServer: eligibility.orderCreatedAtServer,
    orderCreatedAtSource: eligibility.orderCreatedAtSource,
    finalizedAt: eligibility.finalizedAt,
    mode,
    serviceCounter: mode === 'prof' ? 'servicosProf' : 'servicosCorre',
    serviceAccountingStatus: 'pending',
    serviceApplied: false,
    publicProfileApplied: false,
    gamificationEnabled: gamification.enabled,
    gamificationStatus: gamification.status,
    userGamificationApplied: false,
    missionGamificationApplied: false,
    xp: gamification.enabled ? ATTENDANCE_REWARD_XP : 0,
    coins: gamification.enabled ? ATTENDANCE_REWARD_COINS : 0,
    missionDay: gamification.enabled ? attendanceRewardDayKey(now) : '',
    status: 'processing',
    createdAt: now,
    updatedAt: now,
  }
}

function assertV2LedgerMatches(ledger, expected) {
  const immutableFields = [
    'version', 'pedidoId', 'recordKind', 'beneficiaryUid', 'clientUid',
    'orderCreatedAtServer', 'orderCreatedAtSource', 'finalizedAt', 'mode', 'serviceCounter',
  ]
  if (!ledger || typeof ledger !== 'object') throw new AttendanceRewardError('reward_ledger_invalid', 409)
  for (const field of immutableFields) {
    if (ledger[field] !== expected[field]) throw new AttendanceRewardError('reward_ledger_conflict', 409)
  }
  if (typeof ledger.gamificationEnabled !== 'boolean') throw new AttendanceRewardError('reward_ledger_invalid', 409)
  if (ledger.gamificationEnabled) {
    if (ledger.xp !== ATTENDANCE_REWARD_XP || ledger.coins !== ATTENDANCE_REWARD_COINS
      || !/^\d{4}-\d{2}-\d{2}$/.test(String(ledger.missionDay || ''))
      || !['pending', 'completed'].includes(ledger.gamificationStatus)) {
      throw new AttendanceRewardError('reward_ledger_invalid', 409)
    }
  } else if (ledger.xp !== 0 || ledger.coins !== 0 || String(ledger.missionDay || '') !== ''
    || !DISABLED_GAMIFICATION_STATUSES.has(ledger.gamificationStatus)) {
    throw new AttendanceRewardError('reward_ledger_invalid', 409)
  }
  return ledger
}

async function initializeLedger({ database, expectedLedger }) {
  const ledgerRef = database.ref(`attendanceRewardGrants/${expectedLedger.pedidoId}`)
  const result = await ledgerRef.transaction((current) => current ?? expectedLedger)
  return { ledgerRef, ledger: result.snapshot.val() }
}

function markerWasWritten(record) {
  return record?.atendimento?.recompensasContabilizadas === true
}

function legacyV1IsComplete(ledger, markerWritten) {
  return Boolean(markerWritten && ledger?.version === ATTENDANCE_REWARD_LEGACY_LEDGER_VERSION
    && ledger?.status === 'completed' && ledger?.userApplied === true && ledger?.missionApplied === true)
}

function v2IsComplete(ledger, markerWritten) {
  if (!markerWritten || ledger?.version !== ATTENDANCE_REWARD_LEDGER_VERSION
    || ledger?.status !== 'completed' || ledger?.serviceAccountingStatus !== 'completed'
    || ledger?.serviceApplied !== true || ledger?.publicProfileApplied !== true) return false
  if (ledger.gamificationEnabled === true) {
    return ledger.gamificationStatus === 'completed'
      && ledger.userGamificationApplied === true && ledger.missionGamificationApplied === true
  }
  return DISABLED_GAMIFICATION_STATUSES.has(ledger.gamificationStatus)
    && ledger.userGamificationApplied === false && ledger.missionGamificationApplied === false
}

function serviceClaimMatches(claim, ledger) {
  return Boolean(claim && typeof claim === 'object'
    && claim.version === ATTENDANCE_REWARD_LEDGER_VERSION
    && claim.pedidoId === ledger.pedidoId && claim.mode === ledger.mode && claim.serviceApplied === true)
}

async function applyServiceCounter({ database, ledger, now }) {
  const userRef = database.ref(`users/${ledger.beneficiaryUid}`)
  const result = await userRef.transaction((current) => {
    if (!current || typeof current !== 'object') return undefined
    const user = objectValue(current)
    const existingClaim = objectValue(user.attendanceRewardClaims)[ledger.pedidoId]
    if (existingClaim != null) return serviceClaimMatches(existingClaim, ledger) ? user : undefined
    const servicesCorreBefore = maxCounter(user.servicosCorre, user['serviçosCorre'])
    const servicesProfBefore = maxCounter(user.servicosProf, user['serviçosProf'])
    const servicesCorre = ledger.mode === 'corre' ? servicesCorreBefore + 1 : servicesCorreBefore
    const servicesProf = ledger.mode === 'prof' ? servicesProfBefore + 1 : servicesProfBefore
    return {
      ...user,
      servicosCorre: servicesCorre,
      servicosProf: servicesProf,
      ['serviçosCorre']: servicesCorre,
      ['serviçosProf']: servicesProf,
      attendanceRewardClaims: {
        ...objectValue(user.attendanceRewardClaims),
        [ledger.pedidoId]: {
          version: ATTENDANCE_REWARD_LEDGER_VERSION,
          pedidoId: ledger.pedidoId,
          mode: ledger.mode,
          serviceApplied: true,
          gamificationApplied: false,
          gamificationStatus: ledger.gamificationStatus,
          appliedAt: now,
        },
      },
    }
  })
  const savedUser = result.snapshot.val()
  if (!savedUser || !serviceClaimMatches(savedUser?.attendanceRewardClaims?.[ledger.pedidoId], ledger)) {
    throw new AttendanceRewardError('reward_user_update_failed', 500)
  }
  return savedUser
}

async function syncPublicProfileServiceCounts({ database, ledger, savedUser }) {
  const targetCorre = maxCounter(savedUser?.servicosCorre, savedUser?.['serviçosCorre'])
  const targetProf = maxCounter(savedUser?.servicosProf, savedUser?.['serviçosProf'])
  const publicProfileRef = database.ref(`publicProfiles/${ledger.beneficiaryUid}`)
  const result = await publicProfileRef.transaction((current) => {
    if (!current || typeof current !== 'object') return undefined
    const profile = objectValue(current)
    const servicesCorre = Math.max(safeCounter(profile.servicosCorre), targetCorre)
    const servicesProf = Math.max(safeCounter(profile.servicosProf), targetProf)
    const completedServices = Math.max(
      servicesCorre + servicesProf,
      safeCounter(profile.completedServices),
      safeCounter(profile.servicosConcluidos),
      safeCounter(profile.entregas),
      safeCounter(profile?.reputation?.completedServices),
      safeCounter(profile?.reputacao?.completedServices),
    )
    const reputation = objectValue(profile.reputation)
    const reputacao = objectValue(profile.reputacao)
    return {
      ...profile,
      servicosCorre: servicesCorre,
      servicosProf: servicesProf,
      completedServices,
      servicosConcluidos: completedServices,
      ...(profile.reputation && typeof profile.reputation === 'object'
        ? { reputation: { ...reputation, completedServices } }
        : {}),
      ...(profile.reputacao && typeof profile.reputacao === 'object'
        ? { reputacao: { ...reputacao, completedServices } }
        : {}),
    }
  })
  const profile = result.snapshot.val()
  if (!result.committed || !profile || typeof profile !== 'object') {
    throw new AttendanceRewardError('reward_public_profile_missing', 500)
  }
  if (safeCounter(profile.servicosCorre) < targetCorre || safeCounter(profile.servicosProf) < targetProf
    || safeCounter(profile.completedServices) < targetCorre + targetProf) {
    throw new AttendanceRewardError('reward_public_profile_update_failed', 500)
  }
  return profile
}

function gamificationClaimMatches(claim, ledger) {
  return serviceClaimMatches(claim, ledger) && claim.gamificationApplied === true
}

async function applyUserGamification({ database, ledger, now }) {
  const userRef = database.ref(`users/${ledger.beneficiaryUid}`)
  const result = await userRef.transaction((current) => {
    if (!current || typeof current !== 'object') return undefined
    const user = objectValue(current)
    const existingClaim = objectValue(user.attendanceRewardClaims)[ledger.pedidoId]
    if (!serviceClaimMatches(existingClaim, ledger)) return undefined
    if (existingClaim.gamificationApplied === true) return user
    const servicesCorre = maxCounter(user.servicosCorre, user['serviçosCorre'])
    const servicesProf = maxCounter(user.servicosProf, user['serviçosProf'])
    return {
      ...user,
      patenteCorre: calculateServicePatent(servicesCorre),
      patenteProf: isProfessionalAccount(user) ? calculateServicePatent(servicesProf) : safeCounter(user.patenteProf),
      xp: safeCounter(user.xp) + ledger.xp,
      moedas: safeCounter(user.moedas) + ledger.coins,
      patenteAtualizadaEm: now,
      missaoAtualizadaEm: now,
      attendanceRewardClaims: {
        ...objectValue(user.attendanceRewardClaims),
        [ledger.pedidoId]: {
          ...existingClaim,
          gamificationApplied: true,
          gamificationStatus: 'completed',
          gamificationAppliedAt: now,
        },
      },
    }
  })
  const savedUser = result.snapshot.val()
  if (!savedUser || !gamificationClaimMatches(savedUser?.attendanceRewardClaims?.[ledger.pedidoId], ledger)) {
    throw new AttendanceRewardError('reward_user_gamification_failed', 500)
  }
  return savedUser
}

function missionClaimMatches(claim, ledger) {
  return Boolean(claim && typeof claim === 'object'
    && claim.version === ATTENDANCE_REWARD_LEDGER_VERSION
    && claim.pedidoId === ledger.pedidoId && claim.mode === ledger.mode)
}

async function applyMissionGamification({ database, ledger, now }) {
  const missionRef = database.ref(`missoes/${ledger.beneficiaryUid}/${ledger.missionDay}`)
  const result = await missionRef.transaction((current) => {
    const mission = objectValue(current)
    const existingClaim = objectValue(mission.attendanceRewardClaims)[ledger.pedidoId]
    if (existingClaim != null) return missionClaimMatches(existingClaim, ledger) ? mission : undefined
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
  if (!missionClaimMatches(savedMission?.attendanceRewardClaims?.[ledger.pedidoId], ledger)) {
    throw new AttendanceRewardError('reward_mission_update_failed', 500)
  }
  return savedMission
}

function completedResult(ledger, alreadyGranted) {
  return Object.freeze({
    pedidoId: ledger.pedidoId,
    contabilizado: true,
    serviceCounted: true,
    alreadyGranted,
    mode: ledger.mode,
    gamificationStatus: ledger.gamificationStatus || 'legacy_completed',
  })
}

function validateTimestamps({ eligibility, activationTime, serverNow }) {
  if (!eligibility.orderCreatedAtServer || eligibility.orderCreatedAtServer < activationTime) {
    throw new AttendanceRewardError('reward_before_activation', 409)
  }
  const earliestPlausibleOrderTime = eligibility.orderCreatedAtServer - ATTENDANCE_REWARD_MAX_CLOCK_SKEW_MS
  const latestPlausibleServerTime = serverNow + ATTENDANCE_REWARD_MAX_CLOCK_SKEW_MS
  if (eligibility.orderCreatedAtServer > latestPlausibleServerTime
    || eligibility.requestTime < earliestPlausibleOrderTime
    || eligibility.requestTime > latestPlausibleServerTime
    || eligibility.finalizedAt < earliestPlausibleOrderTime
    || eligibility.finalizedAt > latestPlausibleServerTime) {
    throw new AttendanceRewardError('reward_timestamp_invalid', 409)
  }
}

async function readAttendanceRecord(database, id) {
  const [publicSnapshot, privateSnapshot, ledgerSnapshot] = await Promise.all([
    database.ref(`pedidos/${id}`).get(),
    database.ref(`privateRequests/${id}`).get(),
    database.ref(`attendanceRewardGrants/${id}`).get(),
  ])
  const publicRecord = publicSnapshot.val()
  const privateRecord = privateSnapshot.val()
  if (publicRecord && privateRecord) throw new AttendanceRewardError('reward_record_source_conflict', 409)
  if (!publicRecord && !privateRecord) throw new AttendanceRewardError('reward_order_not_found', 404)
  return {
    record: publicRecord || privateRecord,
    recordKind: publicRecord ? RECORD_KINDS.PUBLIC : RECORD_KINDS.PRIVATE,
    existingLedger: ledgerSnapshot.val(),
  }
}

function assertExistingLedgerState({ ledger, expectedLedger, markerWritten }) {
  if (ledger?.version === ATTENDANCE_REWARD_LEGACY_LEDGER_VERSION) {
    if (legacyV1IsComplete(ledger, markerWritten)) return { completed: true, ledger }
    throw new AttendanceRewardError('reward_legacy_ledger_partial', 409)
  }
  if (ledger?.version !== ATTENDANCE_REWARD_LEDGER_VERSION) {
    throw new AttendanceRewardError('reward_ledger_invalid', 409)
  }
  const checked = assertV2LedgerMatches(ledger, expectedLedger)
  if (markerWritten) {
    if (v2IsComplete(checked, true)) return { completed: true, ledger: checked }
    throw new AttendanceRewardError('reward_state_inconsistent', 409)
  }
  if (checked.status === 'completed') {
    return { completed: false, needsMarkerRefresh: true, ledger: checked }
  }
  return { completed: false, ledger: checked }
}

async function refreshCompletedMarker({ database, id, recordKind, state }) {
  if (state.completed || state.needsMarkerRefresh !== true) return state
  const recordRoot = recordKind === RECORD_KINDS.PRIVATE ? 'privateRequests' : 'pedidos'
  const currentRecord = (await database.ref(`${recordRoot}/${id}`).get()).val()
  if (v2IsComplete(state.ledger, markerWasWritten(currentRecord))) {
    return { ...state, completed: true, needsMarkerRefresh: false }
  }
  throw new AttendanceRewardError('reward_state_inconsistent', 409)
}

export async function grantAttendanceRewards({
  database,
  pedidoId,
  actorUid,
  rewardsEnabledFrom,
  gamificationEnabled = false,
  gamificationEnabledFrom = 0,
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

  const { record, recordKind, existingLedger } = await readAttendanceRecord(database, id)
  const eligibility = assessAttendanceRewardEligibility({ pedido: record, actorUid: callerUid, recordKind })
  validateTimestamps({ eligibility, activationTime, serverNow })
  const account = (await database.ref(`users/${eligibility.beneficiaryUid}`).get()).val()
  if (!account || typeof account !== 'object') throw new AttendanceRewardError('reward_beneficiary_not_found', 404)

  const markerWritten = markerWasWritten(record)
  if (markerWritten && existingLedger == null) throw new AttendanceRewardError('reward_legacy_state_ambiguous', 409)
  const mode = existingLedger?.mode || rewardModeFor(record, account, recordKind)
  const gamification = resolveGamificationPolicy({
    enabled: gamificationEnabled === true,
    enabledFrom: gamificationEnabledFrom,
    orderCreatedAtServer: eligibility.orderCreatedAtServer,
    serverNow,
  })
  const expectedLedger = createExpectedLedger({
    pedidoId: id, recordKind, eligibility, mode, now: serverNow, gamification,
  })

  if (existingLedger != null) {
    const existingState = await refreshCompletedMarker({
      database,
      id,
      recordKind,
      state: assertExistingLedgerState({ ledger: existingLedger, expectedLedger, markerWritten }),
    })
    if (existingState.completed) return completedResult(existingState.ledger, true)
  }

  const { ledgerRef, ledger: initializedLedger } = await initializeLedger({ database, expectedLedger })
  const initializedState = await refreshCompletedMarker({
    database,
    id,
    recordKind,
    state: assertExistingLedgerState({
      ledger: initializedLedger, expectedLedger, markerWritten,
    }),
  })
  if (initializedState.completed) return completedResult(initializedState.ledger, true)
  const ledger = initializedState.ledger

  const savedUser = await applyServiceCounter({ database, ledger, now: serverNow })
  await ledgerRef.update({ serviceApplied: true, serviceAccountingStatus: 'user_applied', updatedAt: serverNow })
  await syncPublicProfileServiceCounts({ database, ledger, savedUser })
  await ledgerRef.update({ publicProfileApplied: true, serviceAccountingStatus: 'completed', updatedAt: serverNow })

  if (ledger.gamificationEnabled === true) {
    await applyUserGamification({ database, ledger, now: serverNow })
    await ledgerRef.update({ userGamificationApplied: true, updatedAt: serverNow })
    await applyMissionGamification({ database, ledger, now: serverNow })
    await ledgerRef.update({ missionGamificationApplied: true, updatedAt: serverNow })
  }

  const recordRoot = recordKind === RECORD_KINDS.PRIVATE ? 'privateRequests' : 'pedidos'
  const finalGamificationStatus = ledger.gamificationEnabled === true ? 'completed' : ledger.gamificationStatus
  await database.ref().update({
    [`attendanceRewardGrants/${id}/status`]: 'completed',
    [`attendanceRewardGrants/${id}/serviceAccountingStatus`]: 'completed',
    [`attendanceRewardGrants/${id}/serviceApplied`]: true,
    [`attendanceRewardGrants/${id}/publicProfileApplied`]: true,
    [`attendanceRewardGrants/${id}/gamificationStatus`]: finalGamificationStatus,
    [`attendanceRewardGrants/${id}/userGamificationApplied`]: ledger.gamificationEnabled === true,
    [`attendanceRewardGrants/${id}/missionGamificationApplied`]: ledger.gamificationEnabled === true,
    [`attendanceRewardGrants/${id}/completedAt`]: serverNow,
    [`attendanceRewardGrants/${id}/updatedAt`]: serverNow,
    [`${recordRoot}/${id}/atendimento/recompensasContabilizadas`]: true,
    [`${recordRoot}/${id}/atendimento/recompensasContabilizadasEm`]: serverNow,
  })

  return completedResult({
    ...ledger,
    status: 'completed',
    serviceAccountingStatus: 'completed',
    serviceApplied: true,
    publicProfileApplied: true,
    gamificationStatus: finalGamificationStatus,
  }, false)
}
