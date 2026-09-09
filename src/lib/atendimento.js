'use client'

import { get, ref, runTransaction, serverTimestamp, update } from './firebaseDebug'
import { auth } from './firebase'
import { claimPedidoAuthority, synchronizePublicRequest } from './pedidoProjectionClient'
import {
  buildAttendanceTransitionMultipath,
  buildAttendanceTransitionUpdate,
  getAttendanceTransitionChangedFields,
} from './attendanceTransitionWrite'
import {
  ATENDIMENTO_STATUS,
  canTransitionAtendimento,
  normalizeAtendimentoStatus,
  normalizeServiceAttendanceStatus,
} from './attendanceState'

export {
  ATENDIMENTO_STATUS,
  canTransitionAtendimento,
  getAtendimentoStep,
  normalizeAtendimentoStatus,
  normalizeServiceAttendanceStatus,
} from './attendanceState'

function getActorId(value) {
  return String(value?.id || value?.uid || '').trim()
}

function getTransitionAction(nextStatus) {
  if (nextStatus === ATENDIMENTO_STATUS.A_CAMINHO) return 'estou_a_caminho'
  if (nextStatus === ATENDIMENTO_STATUS.CHEGOU) return 'cheguei'
  if (nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) return 'solicitar_conclusao'
  if (nextStatus === ATENDIMENTO_STATUS.FINALIZADO) return 'confirmar_conclusao'
  if (nextStatus === ATENDIMENTO_STATUS.CANCELADO) return 'cancelar'
  return String(nextStatus || 'desconhecida')
}

function logTransition(payload) {
  if (process.env.NODE_ENV !== 'production') {
    console.info('[ATTENDANCE_TRANSITION]', payload)
  }
}

export async function transitionAtendimento({
  database,
  pedidoId,
  actorUid,
  expectedStatus,
  nextStatus,
  atendimentoPatch = {},
  topLevelPatch = {},
  eventWrite = null,
}) {
  const id = String(pedidoId || '').trim()
  const actor = String(actorUid || '').trim()
  const expected = normalizeAtendimentoStatus(expectedStatus)
  const next = normalizeAtendimentoStatus(nextStatus)
  const path = `pedidos/${id}`
  const authUid = auth.currentUser?.uid || null

  if (!database || !id || !actor) throw new Error('Atendimento inválido.')
  if (!canTransitionAtendimento(expected, next)) throw new Error('Essa etapa do atendimento não está disponível.')

  if (next === ATENDIMENTO_STATUS.ACEITO) {
    if (auth.currentUser?.uid !== actor) throw new Error('Sessão inválida para aceitar este pedido.')
    const accepted = await claimPedidoAuthority({
      pedidoId: id,
      local: topLevelPatch?.aceite?.local || null,
    })
    return accepted.pedido
  }

  const action = getTransitionAction(next)
  const pedidoRef = ref(database, path)
  const currentSnapshot = await get(pedidoRef)
  const current = currentSnapshot.exists() ? currentSnapshot.val() : null
  const currentStatus = current ? normalizeServiceAttendanceStatus({
    status: current.status,
    kind: 'pedido',
    type: current.tipo,
    record: current,
  }) : null
  const creatorId = getActorId(current?.criador)
  const workerId = getActorId(current?.aceite)
  const acceptedUidMatches = Boolean(authUid && workerId === authUid)
  const workerAction = next !== ATENDIMENTO_STATUS.FINALIZADO && next !== ATENDIMENTO_STATUS.CANCELADO
  const authorized = next === ATENDIMENTO_STATUS.CANCELADO
    ? creatorId === actor || workerId === actor
    : workerAction
      ? workerId === actor
      : creatorId === actor

  let privateUpdate = null
  let updatePayload = null
  let reason = 'ready'
  try {
    privateUpdate = buildAttendanceTransitionUpdate({
      nextStatus: next,
      atendimentoPatch,
      topLevelPatch: {
        ...topLevelPatch,
        atualizadoEmServer: topLevelPatch.atualizadoEmServer ?? serverTimestamp(),
      },
      updatedAt: Date.now(),
    })
    updatePayload = buildAttendanceTransitionMultipath({
      pedidoId: id,
      actorUid: actor,
      privateUpdate,
      eventWrite,
    })
  } catch (error) {
    reason = 'invalid_transition_fields'
    logTransition({
      pedidoId: id,
      action,
      authUid,
      currentStatus,
      acceptedUidMatches,
      nextStatus: next,
      changedFields: [],
      ruleCompatible: false,
      result: 'rejected',
      reason,
    })
    throw error
  }

  const changedFields = getAttendanceTransitionChangedFields(updatePayload)
  const ruleCompatible = Boolean(
    current &&
    authUid === actor &&
    currentStatus === expected &&
    canTransitionAtendimento(currentStatus, next) &&
    authorized
  )

  if (!current) reason = 'private_request_missing'
  else if (authUid !== actor) reason = 'auth_uid_mismatch'
  else if (currentStatus !== expected) reason = 'status_mismatch'
  else if (!authorized) reason = 'participant_not_authorized'

  logTransition({
    pedidoId: id,
    action,
    authUid,
    currentStatus,
    acceptedUidMatches,
    nextStatus: next,
    changedFields,
    ruleCompatible,
    result: ruleCompatible ? 'attempt' : 'rejected',
    reason,
  })

  if (!ruleCompatible) {
    throw new Error('O atendimento mudou. Atualize a tela e tente novamente.')
  }

  try {
    await update(ref(database), updatePayload)
  } catch (error) {
    logTransition({
      pedidoId: id,
      action,
      authUid: auth.currentUser?.uid || null,
      currentStatus,
      acceptedUidMatches,
      nextStatus: next,
      changedFields,
      ruleCompatible,
      result: 'rejected',
      reason: error?.code || error?.message || 'write_failed',
    })
    throw error
  }

  const savedSnapshot = await get(pedidoRef)
  const savedPedido = savedSnapshot.val()
  logTransition({
    pedidoId: id,
    action,
    authUid: auth.currentUser?.uid || null,
    currentStatus,
    acceptedUidMatches,
    nextStatus: next,
    changedFields,
    ruleCompatible,
    result: 'success',
    reason: 'success',
  })

  await synchronizePublicRequest(id)

  return savedPedido
}

export async function claimAtendimentoRewards({ database, pedidoId }) {
  const id = String(pedidoId || '').trim()
  if (!database || !id) return false

  const result = await runTransaction(ref(database, `pedidos/${id}/atendimento/recompensasContabilizadas`), (current) => {
    if (current === true) return
    return true
  })

  return result.committed
}
