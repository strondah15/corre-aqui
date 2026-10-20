import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import {
  applyConversationActivity,
  isValidConversationId,
  resolveActiveConversationContext,
} from '@/lib/conversationActivityServer'

export const runtime = 'nodejs'

const text = (value) => String(value || '').trim()

export async function POST(request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ ok: false, error: 'firebase_admin_not_configured' }, { status: 503 })
  }

  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) return NextResponse.json({ ok: false, error: 'missing_auth_token' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const conversationId = text(body?.conversationId)
  const messageId = text(body?.messageId)
  if (!isValidConversationId(conversationId) || !isValidConversationId(messageId)) {
    return NextResponse.json({ ok: false, error: 'invalid_conversation_activity' }, { status: 400 })
  }

  let decoded
  let database
  try {
    decoded = await getFirebaseAdminAuth().verifyIdToken(idToken)
    database = getFirebaseAdminDatabase()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_auth_token' }, { status: 401 })
  }

  const actorUid = text(decoded?.uid)
  const actorConversationSnapshot = await database.ref(`conversas/${actorUid}/${conversationId}`).get()
  const actorConversation = actorConversationSnapshot.val()
  if (!actorConversationSnapshot.exists()
    || text(actorConversation?.pedidoId) !== conversationId
    || !text(actorConversation?.outroId)) {
    return NextResponse.json({ ok: false, error: 'conversation_index_not_ready' }, { status: 403 })
  }
  const context = await resolveActiveConversationContext(database, conversationId, actorUid)
  if (!context.ok) {
    const status = context.error === 'conversation_context_not_found' ? 404 : 409
    return NextResponse.json({ ok: false, error: context.error }, { status })
  }

  const messageSnapshot = await database.ref(`chats/${conversationId}/${messageId}`).get()
  const message = messageSnapshot.val()
  if (!message || typeof message !== 'object') {
    return NextResponse.json({ ok: false, error: 'conversation_message_not_found' }, { status: 404 })
  }
  if (text(message.userId) !== actorUid) {
    return NextResponse.json({ ok: false, error: 'conversation_message_author_mismatch' }, { status: 403 })
  }

  const result = await applyConversationActivity({
    database,
    context,
    conversationId,
    messageId,
    message,
    actorUid,
  })
  if (!result.ok) {
    const status = result.error === 'conversation_actor_not_participant' || result.error === 'conversation_not_active'
      ? 403
      : result.error === 'conversation_identity_conflict'
        ? 409
        : 500
    return NextResponse.json({ ok: false, error: result.error }, { status })
  }

  return NextResponse.json({ ok: true, conversationId, messageId })
}
