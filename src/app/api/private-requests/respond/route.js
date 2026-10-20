import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import { isPrivateResponseMarkerValid, isValidConversationId } from '@/lib/conversationActivityServer'
import { ensureProfessionalFeatureAccess } from '@/lib/subscriptionServer'

export const runtime = 'nodejs'

const text = (value, maxLength = 160) => String(value || '').trim().slice(0, maxLength)
const DEBUG_PRIVATE_REQUEST_RESPONSE = process.env.NODE_ENV !== 'production'

function acceptedStatus(record = {}) {
  return text(record.tipo, 40).toLowerCase() === 'agendamento' ? 'agendado' : 'aceito'
}

function actorName(account = {}, decoded = {}) {
  return text(account?.profile?.nome || account?.nome || decoded?.name || 'Profissional', 120) || 'Profissional'
}

function markerIdentityMatches(marker, expected) {
  return Boolean(marker)
    && text(marker.requestId, 128) === expected.requestId
    && text(marker.clienteId, 128) === expected.clienteId
    && text(marker.profissionalId, 128) === expected.profissionalId
    && text(marker.respondedBy, 128) === expected.respondedBy
    && text(marker.previousStatus, 40) === 'pendente'
    && text(marker.status, 40) === expected.status
    && text(marker.decision, 20) === expected.decision
}

function replaceableUncommittedMarker(marker, expected) {
  return Boolean(marker)
    && marker.committed !== true
    && text(marker.requestId, 128) === expected.requestId
    && text(marker.clienteId, 128) === expected.clienteId
    && text(marker.profissionalId, 128) === expected.profissionalId
    && text(marker.respondedBy, 128) === expected.respondedBy
    && text(marker.previousStatus, 40) === 'pendente'
}

function logResponseDiagnostic(stage, reason, diagnostic = {}) {
  if (!DEBUG_PRIVATE_REQUEST_RESPONSE) return
  console.info('[AGENDA_RESPONSE]', {
    stage,
    reason,
    requestId: diagnostic.requestId || null,
    authUid: diagnostic.authUid || null,
    requestExists: diagnostic.requestExists === true,
    status: diagnostic.status || null,
    clienteId: diagnostic.clienteId || null,
    profissionalId: diagnostic.profissionalId || null,
    actorIsParticipant: diagnostic.actorIsParticipant === true,
    actorIsProfessional: diagnostic.actorIsProfessional === true,
    clienteInboxExists: diagnostic.clienteInboxExists === true,
    profissionalInboxExists: diagnostic.profissionalInboxExists === true,
    expectedStatus: diagnostic.expectedStatus || null,
    foundStatus: diagnostic.foundStatus || null,
    responseMarkerExists: diagnostic.responseMarkerExists === true,
    responseMarkerCommitted: diagnostic.responseMarkerCommitted === true,
    responseMarkerMatches: diagnostic.responseMarkerMatches === true,
  })
}

function responseError({ error, status, reason, diagnostic = {} }) {
  logResponseDiagnostic('rejected', reason, diagnostic)
  return NextResponse.json({
    ok: false,
    error,
    reason,
    currentStatus: diagnostic.foundStatus || diagnostic.status || null,
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
  const decision = text(body?.decision, 20).toLowerCase()
  if (!isValidConversationId(requestId) || (decision !== 'accept' && decision !== 'reject')) {
    return NextResponse.json({ ok: false, error: 'invalid_private_request_response' }, { status: 400 })
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
  if (decision === 'accept') {
    try {
      await ensureProfessionalFeatureAccess(database, actorUid)
    } catch (subscriptionError) {
      return NextResponse.json({
        ok: false,
        error: 'professional_subscription_required',
        reason: 'professional_subscription_required',
      }, { status: subscriptionError?.status || 402 })
    }
  }
  const requestRef = database.ref(`privateRequests/${requestId}`)
  const [requestSnapshot, accountSnapshot] = await Promise.all([
    requestRef.get(),
    database.ref(`users/${actorUid}`).get(),
  ])
  const stored = requestSnapshot.val()
  if (!stored || typeof stored !== 'object') {
    return responseError({
      error: 'private_request_not_found',
      status: 404,
      reason: 'request_missing',
      diagnostic: { requestId, authUid: actorUid, requestExists: false },
    })
  }

  const clienteId = text(stored.clienteId, 128)
  const profissionalId = text(stored.profissionalId, 128)
  const currentStatus = text(stored.status, 40).toLowerCase()
  const nextStatus = decision === 'accept' ? acceptedStatus(stored) : 'recusado'
  const markerRef = database.ref(`privateRequestResponses/${requestId}`)
  const [clienteInboxSnapshot, profissionalInboxSnapshot, markerSnapshot] = await Promise.all([
    clienteId ? database.ref(`privateRequestInbox/${clienteId}/${requestId}`).get() : Promise.resolve(null),
    profissionalId ? database.ref(`privateRequestInbox/${profissionalId}/${requestId}`).get() : Promise.resolve(null),
    markerRef.get(),
  ])
  const diagnostic = {
    requestId,
    authUid: actorUid,
    requestExists: true,
    status: currentStatus,
    clienteId,
    profissionalId,
    actorIsParticipant: actorUid === clienteId || actorUid === profissionalId,
    actorIsProfessional: actorUid === profissionalId,
    clienteInboxExists: clienteInboxSnapshot?.exists() === true,
    profissionalInboxExists: profissionalInboxSnapshot?.exists() === true,
    expectedStatus: nextStatus,
    foundStatus: currentStatus,
    responseMarkerExists: markerSnapshot.exists(),
    responseMarkerCommitted: markerSnapshot.val()?.committed === true,
  }
  if (!clienteId || !profissionalId || clienteId === profissionalId) {
    return responseError({
      error: 'private_request_response_incompatible',
      status: 409,
      reason: 'legacy_request_incompatible',
      diagnostic,
    })
  }
  if (actorUid !== profissionalId) {
    return responseError({
      error: 'private_request_response_not_authorized',
      status: 403,
      reason: actorUid === clienteId ? 'wrong_responder' : 'not_participant',
      diagnostic,
    })
  }
  if (currentStatus !== 'pendente' && currentStatus !== nextStatus) {
    const knownTerminalStatus = ['aceito', 'agendado', 'recusado'].includes(currentStatus)
    return responseError({
      error: 'private_request_already_answered',
      status: 409,
      reason: knownTerminalStatus ? 'already_responded' : 'invalid_current_status',
      diagnostic,
    })
  }

  const now = Date.now()
  const markerBase = {
    requestId,
    clienteId,
    profissionalId,
    respondedBy: actorUid,
    previousStatus: 'pendente',
    status: nextStatus,
    decision,
    respondedAt: now,
    committed: false,
  }
  const markerResult = await markerRef.transaction((current) => {
    if (current) {
      if (markerIdentityMatches(current, markerBase)) return current
      if (currentStatus === 'pendente' && replaceableUncommittedMarker(current, markerBase)) return markerBase
      return undefined
    }
    if (currentStatus !== 'pendente') return undefined
    return markerBase
  })
  if (!markerResult.committed || !markerIdentityMatches(markerResult.snapshot.val(), markerBase)) {
    const conflictingMarker = markerResult.snapshot.val()
    return responseError({
      error: 'private_request_response_conflict',
      status: 409,
      reason: 'response_marker_conflict',
      diagnostic: {
        ...diagnostic,
        responseMarkerExists: Boolean(conflictingMarker),
        responseMarkerCommitted: conflictingMarker?.committed === true,
        responseMarkerMatches: markerIdentityMatches(conflictingMarker, markerBase),
      },
    })
  }
  const marker = markerResult.snapshot.val()
  const profissionalNome = actorName(accountSnapshot.val(), decoded)

  const responseResult = await requestRef.transaction((current) => {
    // O RTDB pode iniciar a transação com cache local vazio mesmo quando o
    // registro existe no servidor. null mantém a transação viva para que o
    // servidor devolva o valor autoritativo; undefined abortaria cedo demais.
    if (current == null) return null
    if (!current || typeof current !== 'object') return undefined
    if (text(current.clienteId, 128) !== clienteId || text(current.profissionalId, 128) !== profissionalId) return undefined
    const status = text(current.status, 40).toLowerCase()
    if (status === nextStatus && markerIdentityMatches(marker, markerBase)) return current
    if (status !== 'pendente') return undefined
    return {
      ...current,
      status: nextStatus,
      profissionalNome,
      respondidoEm: marker.respondedAt,
      atualizadoEm: marker.respondedAt,
      atualizadoEmServer: marker.respondedAt,
      respondidoPor: { id: actorUid, nome: profissionalNome },
    }
  })
  const updated = responseResult.snapshot.val()
  if (!responseResult.committed || !updated || text(updated.status, 40).toLowerCase() !== nextStatus) {
    const latestSnapshot = await requestRef.get()
    const latest = latestSnapshot.val()
    const latestStatus = text(latest?.status, 40).toLowerCase()
    let reason = 'request_transaction_conflict'
    if (!latest || typeof latest !== 'object') reason = 'request_missing'
    else if (text(latest.clienteId, 128) !== clienteId || text(latest.profissionalId, 128) !== profissionalId) {
      reason = 'legacy_request_incompatible'
    } else if (latestStatus !== 'pendente' && latestStatus !== nextStatus) {
      reason = ['aceito', 'agendado', 'recusado'].includes(latestStatus)
        ? 'already_responded'
        : 'invalid_current_status'
    }
    return responseError({
      error: 'private_request_response_conflict',
      status: 409,
      reason,
      diagnostic: {
        ...diagnostic,
        foundStatus: latestStatus,
        responseMarkerExists: true,
        responseMarkerCommitted: marker?.committed === true,
        responseMarkerMatches: markerIdentityMatches(marker, markerBase),
      },
    })
  }

  const committedMarker = { ...marker, committed: true }
  await markerRef.set(committedMarker)
  if (!isPrivateResponseMarkerValid(committedMarker, requestId, updated)) {
    return NextResponse.json({ ok: false, error: 'private_request_response_not_confirmed' }, { status: 500 })
  }

  logResponseDiagnostic('success', 'success', {
    ...diagnostic,
    foundStatus: nextStatus,
    responseMarkerExists: true,
    responseMarkerCommitted: true,
    responseMarkerMatches: true,
  })

  return NextResponse.json({
    ok: true,
    requestId,
    status: nextStatus,
    respondidoEm: marker.respondedAt,
    profissionalNome,
    responseConfirmed: true,
  })
}
