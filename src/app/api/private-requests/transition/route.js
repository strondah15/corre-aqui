import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import {
  ATENDIMENTO_STATUS,
  authorizePrivateAttendanceTransition,
  normalizeAtendimentoStatus,
  validateAttendanceCancellation,
} from '@/lib/attendanceState'
import { isValidConversationId, readConversationContext } from '@/lib/conversationActivityServer'

export const runtime = 'nodejs'

const text = (value, maxLength = 160) => String(value || '').trim().slice(0, maxLength)
const ALLOWED_NEXT_STATUSES = new Set([
  ATENDIMENTO_STATUS.EM_ANDAMENTO,
  ATENDIMENTO_STATUS.A_CAMINHO,
  ATENDIMENTO_STATUS.CHEGOU,
  ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO,
  ATENDIMENTO_STATUS.FINALIZADO,
  ATENDIMENTO_STATUS.CANCELADO,
])

function actorName(record, actorUid) {
  return actorUid === text(record?.clienteId, 128)
    ? text(record?.clienteNome || 'Cliente', 80)
    : text(record?.profissionalNome || 'Profissional', 80)
}

function transitionPatch(nextStatus, actorUid, name, now) {
  const actor = { id: actorUid, nome: name }
  if (nextStatus === ATENDIMENTO_STATUS.A_CAMINHO) {
    return {
      aCaminhoEm: now,
      aCaminhoPor: actor,
      atendimento: { aCaminhoEm: now, aCaminhoPor: actor },
    }
  }
  if (nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO) {
    return {
      atendimentoIniciadoEm: now,
      atendimento: { iniciadoEm: now, iniciadoPor: actor },
    }
  }
  if (nextStatus === ATENDIMENTO_STATUS.CHEGOU) {
    return {
      chegouEm: now,
      chegouPor: actor,
      atendimento: { chegouEm: now, chegouPor: actor },
    }
  }
  if (nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) {
    return {
      finalizacaoSolicitadaEm: now,
      finalizacaoSolicitadaPor: actor,
      atendimento: { finalizacaoSolicitadaEm: now, finalizacaoSolicitadaPor: actor },
    }
  }
  if (nextStatus === ATENDIMENTO_STATUS.CANCELADO) return { atendimento: {} }
  return {
    finalizadoEm: now,
    finalizadoPor: actor,
    avaliacaoPendente: true,
    atendimento: { finalizadoEm: now, finalizadoPor: actor },
  }
}

function logTransition(result, payload = {}) {
  if (process.env.NODE_ENV === 'production') return
  console.info('[PRIVATE_ATTENDANCE_TRANSITION]', {
    result,
    requestId: payload.requestId || null,
    authUid: payload.authUid || null,
    currentStatus: payload.currentStatus || null,
    expectedStatus: payload.expectedStatus || null,
    nextStatus: payload.nextStatus || null,
    reason: payload.reason || null,
  })
}

function reject(status, reason, diagnostic) {
  logTransition('rejected', { ...diagnostic, reason })
  return NextResponse.json({
    ok: false,
    error: 'private_attendance_transition_rejected',
    reason,
    message: reason === 'status_mismatch'
      ? 'O atendimento mudou. Atualize a tela e tente novamente.'
      : reason === 'transition_conflict'
        ? 'Não foi possível confirmar esta etapa. Atualize a tela e tente novamente.'
      : 'Esta etapa não está disponível para sua conta.',
  }, { status })
}

export async function POST(request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ ok: false, error: 'firebase_admin_not_configured' }, { status: 503 })
  }

  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) return NextResponse.json({ ok: false, error: 'missing_auth_token' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const requestId = text(body?.requestId, 128)
  const expectedStatus = normalizeAtendimentoStatus(body?.expectedStatus)
  const nextStatus = normalizeAtendimentoStatus(body?.nextStatus)
  if (!isValidConversationId(requestId) || !ALLOWED_NEXT_STATUSES.has(nextStatus)) {
    return NextResponse.json({ ok: false, error: 'invalid_private_attendance_transition' }, { status: 400 })
  }

  let decoded
  let database
  try {
    decoded = await getFirebaseAdminAuth().verifyIdToken(idToken)
    database = getFirebaseAdminDatabase()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_auth_token' }, { status: 401 })
  }

  const actorUid = text(decoded?.uid, 128)
  const diagnostic = { requestId, authUid: actorUid, expectedStatus, nextStatus }
  const cancellation = nextStatus === ATENDIMENTO_STATUS.CANCELADO
    ? validateAttendanceCancellation({ reasonCode: body?.reasonCode, reason: body?.reason })
    : null
  if (cancellation && !cancellation.ok) return reject(400, cancellation.reason, diagnostic)
  const context = await readConversationContext(database, requestId, { kind: 'privateRequest' })
  if (!context.ok || context.privateResponseAuthorized !== true) {
    return reject(403, 'private_response_unverified', diagnostic)
  }

  const record = context.record || {}
  const authorizationResult = authorizePrivateAttendanceTransition({
    record,
    actorUid,
    expectedStatus,
    nextStatus,
    responseAuthorized: context.privateResponseAuthorized === true,
  })
  const currentStatus = authorizationResult.currentStatus
  diagnostic.currentStatus = currentStatus
  if (!authorizationResult.ok) {
    const status = authorizationResult.reason === 'wrong_actor' || authorizationResult.reason === 'private_response_unverified' ? 403 : 409
    return reject(status, authorizationResult.reason, diagnostic)
  }

  const { clienteId, profissionalId } = authorizationResult

  const now = Date.now()
  const name = actorName(record, actorUid)
  const requestRef = database.ref(`privateRequests/${requestId}`)
  const transaction = await requestRef.transaction((current) => {
    // O RTDB pode executar primeiro com cache local vazio. Manter null permite
    // que o servidor devolva o registro autoritativo; undefined abortaria cedo.
    if (current == null) return null
    if (!current || typeof current !== 'object') return undefined
    if (text(current.clienteId, 128) !== clienteId || text(current.profissionalId, 128) !== profissionalId) return undefined
    const liveAuthorization = authorizePrivateAttendanceTransition({
      record: current,
      actorUid,
      expectedStatus,
      nextStatus,
      responseAuthorized: true,
    })
    if (!liveAuthorization.ok
      || liveAuthorization.clienteId !== clienteId
      || liveAuthorization.profissionalId !== profissionalId) return undefined
    const patch = transitionPatch(nextStatus, actorUid, name, now)
    const cancellationPatch = nextStatus === ATENDIMENTO_STATUS.CANCELADO ? {
      canceladoEm: now,
      canceladoPor: { id: actorUid, nome: name },
      canceladoNaEtapa: liveAuthorization.currentStatus,
      motivoCodigo: cancellation.reasonCode,
      motivo: cancellation.reason,
      atendimento: {
        canceladoEm: now,
        canceladoPor: { id: actorUid, nome: name },
      },
    } : null
    return {
      ...current,
      ...patch,
      ...(cancellationPatch || {}),
      status: nextStatus,
      atualizadoEm: now,
      atualizadoEmServer: now,
      atendimento: {
        ...(current.atendimento && typeof current.atendimento === 'object' ? current.atendimento : {}),
        ...patch.atendimento,
        ...(cancellationPatch?.atendimento || {}),
      },
    }
  })

  const saved = transaction.snapshot.val()
  if (!transaction.committed || normalizeAtendimentoStatus(saved?.status) !== nextStatus) {
    return reject(409, 'transition_conflict', diagnostic)
  }

  await database.ref().update({
    [`privateRequestInbox/${clienteId}/${requestId}/status`]: nextStatus,
    [`privateRequestInbox/${clienteId}/${requestId}/atualizadoEm`]: now,
    [`privateRequestInbox/${profissionalId}/${requestId}/status`]: nextStatus,
    [`privateRequestInbox/${profissionalId}/${requestId}/atualizadoEm`]: now,
    [`conversas/${clienteId}/${requestId}/pedidoStatus`]: nextStatus,
    [`conversas/${profissionalId}/${requestId}/pedidoStatus`]: nextStatus,
  })

  logTransition('success', { ...diagnostic, currentStatus, reason: 'success' })
  return NextResponse.json({
    ok: true,
    requestId,
    previousStatus: currentStatus,
    status: nextStatus,
    transitionConfirmed: true,
  })
}
