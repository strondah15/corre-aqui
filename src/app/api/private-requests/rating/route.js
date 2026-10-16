import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import { isValidConversationId, readConversationContext } from '@/lib/conversationActivityServer'

export const runtime = 'nodejs'

const text = (value, maxLength = 500) => String(value || '').trim().slice(0, maxLength)

export async function POST(request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ ok: false, error: 'firebase_admin_not_configured' }, { status: 503 })
  }

  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) return NextResponse.json({ ok: false, error: 'missing_auth_token' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const requestId = text(body?.requestId, 128)
  const nota = Number(body?.nota)
  const comentario = text(body?.comentario, 500)
  if (!isValidConversationId(requestId) || !Number.isInteger(nota) || nota < 1 || nota > 5) {
    return NextResponse.json({ ok: false, error: 'invalid_private_request_rating' }, { status: 400 })
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
  const context = await readConversationContext(database, requestId, { kind: 'privateRequest' })
  const record = context?.record || null
  if (!context.ok || context.privateResponseAuthorized !== true || !record) {
    return NextResponse.json({ ok: false, error: 'private_request_rating_unverified' }, { status: 403 })
  }

  const clienteId = text(record.clienteId, 128)
  const profissionalId = text(record.profissionalId, 128)
  if (actorUid !== clienteId || !profissionalId || text(record.status, 40).toLowerCase() !== 'finalizado') {
    return NextResponse.json({ ok: false, error: 'private_request_rating_not_authorized' }, { status: 403 })
  }

  const now = Date.now()
  const rating = {
    pedidoId: requestId,
    nota,
    comentario,
    cliente: { id: clienteId, nome: text(record.clienteNome || 'Cliente', 80) || 'Cliente' },
    avaliado: { id: profissionalId, nome: text(record.profissionalNome || 'Corre', 80) || 'Corre' },
    criadoEm: now,
    criadoEmServer: now,
    origem: 'pos_servico',
  }

  const ratingRef = database.ref(`avaliacoes/${requestId}`)
  const transaction = await ratingRef.transaction((current) => (current ? undefined : rating))
  if (!transaction.committed) {
    return NextResponse.json({ ok: false, error: 'private_request_rating_already_exists' }, { status: 409 })
  }
  const stored = transaction.snapshot.val()
  if (!stored
    || text(stored?.pedidoId, 128) !== requestId
    || text(stored?.cliente?.id, 128) !== clienteId
    || text(stored?.avaliado?.id, 128) !== profissionalId) {
    return NextResponse.json({ ok: false, error: 'private_request_rating_conflict' }, { status: 409 })
  }

  await database.ref().update({
    [`privateRequests/${requestId}/avaliacao`]: stored,
    [`privateRequests/${requestId}/avaliacaoPendente`]: false,
    [`privateRequests/${requestId}/atualizadoEm`]: now,
    [`privateRequests/${requestId}/atualizadoEmServer`]: now,
  })

  return NextResponse.json({ ok: true, requestId, ratingSaved: true, rating: stored })
}
