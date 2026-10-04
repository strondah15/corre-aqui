import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import { isPrivateResponseMarkerValid } from '@/lib/conversationActivityServer'

export const runtime = 'nodejs'

const text = (value, maxLength = 160) => String(value || '').trim().slice(0, maxLength)
const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[.#$\[\]/]/.test(value)

function isAcceptedPrivateRequest(record = {}) {
  const tipo = text(record.tipo, 40).toLowerCase()
  const status = text(record.status, 40).toLowerCase()
  return (tipo === 'agendamento' && status === 'agendado')
    || (tipo === 'pedido_direto' && status === 'aceito')
}

function conversationMatches(value, requestId, otherUid) {
  return Boolean(value)
    && text(value.pedidoId, 128) === requestId
    && text(value.outroId, 128) === otherUid
}

function buildConversation({ requestId, request, ownerUid, otherUid, otherName, unread, now }) {
  const title = text(request.servicoTitulo || request.titulo || 'Serviço solicitado')
  const professionalName = text(request.profissionalNome || 'Profissional', 120)
  const acceptedText = `${professionalName} aceitou sua solicitação.`

  return {
    pedidoId: requestId,
    privateRequestId: requestId,
    privateRequest: true,
    titulo: title,
    outroId: otherUid,
    outroNome: text(otherName || (ownerUid === request.clienteId ? 'Profissional' : 'Cliente'), 120),
    unread,
    lastText: acceptedText,
    mensagemPreview: acceptedText,
    lastAt: now,
    updatedAt: now,
    lastById: text(request.profissionalId, 128),
    lastByNome: professionalName,
    status: 'ativa',
    pedidoStatus: text(request.status, 40),
  }
}

export async function POST(request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ ok: false, error: 'firebase_admin_not_configured' }, { status: 503 })
  }

  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) return NextResponse.json({ ok: false, error: 'missing_auth_token' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const requestId = text(body?.requestId, 128)
  if (!validId(requestId)) return NextResponse.json({ ok: false, error: 'invalid_request_id' }, { status: 400 })

  let decoded
  let db
  try {
    decoded = await getFirebaseAdminAuth().verifyIdToken(idToken)
    db = getFirebaseAdminDatabase()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_auth_token' }, { status: 401 })
  }

  const actorUid = text(decoded?.uid, 128)
  const requestRecord = (await db.ref(`privateRequests/${requestId}`).get()).val()
  if (!requestRecord || typeof requestRecord !== 'object') {
    return NextResponse.json({ ok: false, error: 'private_request_not_found' }, { status: 404 })
  }

  const clienteId = text(requestRecord.clienteId, 128)
  const profissionalId = text(requestRecord.profissionalId, 128)
  if (!clienteId || !profissionalId || actorUid !== profissionalId || !isAcceptedPrivateRequest(requestRecord)) {
    return NextResponse.json({ ok: false, error: 'conversation_not_authorized' }, { status: 403 })
  }

  const clientePath = `conversas/${clienteId}/${requestId}`
  const profissionalPath = `conversas/${profissionalId}/${requestId}`
  const [clienteSnapshot, profissionalSnapshot, responseMarkerSnapshot] = await Promise.all([
    db.ref(clientePath).get(),
    db.ref(profissionalPath).get(),
    db.ref(`privateRequestResponses/${requestId}`).get(),
  ])
  const clienteConversation = clienteSnapshot.val()
  const profissionalConversation = profissionalSnapshot.val()

  if ((clienteSnapshot.exists() && !conversationMatches(clienteConversation, requestId, profissionalId))
    || (profissionalSnapshot.exists() && !conversationMatches(profissionalConversation, requestId, clienteId))) {
    return NextResponse.json({ ok: false, error: 'conversation_identity_conflict' }, { status: 409 })
  }
  const responseMarkerValid = isPrivateResponseMarkerValid(responseMarkerSnapshot.val(), requestId, requestRecord)
  const legacyPairValid = clienteSnapshot.exists() && profissionalSnapshot.exists()
  if (!responseMarkerValid && !legacyPairValid) {
    return NextResponse.json({ ok: false, error: 'private_request_response_unverified' }, { status: 403 })
  }

  const now = Date.now()
  const ensureConversation = ({ path, ownerUid, otherUid, otherName, unread }) => {
    const desired = buildConversation({
      requestId,
      request: requestRecord,
      ownerUid,
      otherUid,
      otherName,
      unread,
      now,
    })
    return db.ref(path).transaction((current) => {
      if (current && !conversationMatches(current, requestId, otherUid)) return undefined
      if (!current || typeof current !== 'object') return desired
      return {
        ...desired,
        ...current,
        pedidoId: requestId,
        privateRequestId: requestId,
        privateRequest: true,
        outroId: otherUid,
        outroNome: text(current.outroNome || desired.outroNome, 120),
        unread: typeof current.unread === 'boolean' ? current.unread : unread,
        titulo: text(current.titulo || desired.titulo),
        lastText: text(current.lastText || desired.lastText, 96),
        mensagemPreview: text(current.mensagemPreview || desired.mensagemPreview, 96),
        lastAt: current.lastAt || desired.lastAt,
        updatedAt: current.updatedAt || desired.updatedAt,
        status: 'ativa',
        pedidoStatus: text(requestRecord.status, 40),
      }
    })
  }

  const clienteOptions = {
    path: clientePath,
    ownerUid: clienteId,
    otherUid: profissionalId,
    otherName: requestRecord.profissionalNome,
    unread: true,
  }
  const profissionalOptions = {
    path: profissionalPath,
    ownerUid: profissionalId,
    otherUid: clienteId,
    otherName: requestRecord.clienteNome,
    unread: false,
  }
  let clienteResult = null
  let profissionalResult = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const results = await Promise.allSettled([
      ensureConversation(clienteOptions),
      ensureConversation(profissionalOptions),
    ])
    clienteResult = results[0].status === 'fulfilled' ? results[0].value : null
    profissionalResult = results[1].status === 'fulfilled' ? results[1].value : null
    if (clienteResult?.committed && profissionalResult?.committed) break
  }
  if (!clienteResult?.committed || !profissionalResult?.committed) {
    return NextResponse.json({ ok: false, error: 'conversation_identity_conflict' }, { status: 409 })
  }

  const [confirmedCliente, confirmedProfissional] = await Promise.all([
    db.ref(clientePath).get(),
    db.ref(profissionalPath).get(),
  ])
  const ready = conversationMatches(confirmedCliente.val(), requestId, profissionalId)
    && conversationMatches(confirmedProfissional.val(), requestId, clienteId)

  if (!ready) return NextResponse.json({ ok: false, error: 'conversation_not_confirmed' }, { status: 500 })
  return NextResponse.json({ ok: true, conversationId: requestId, conversationReady: true })
}
