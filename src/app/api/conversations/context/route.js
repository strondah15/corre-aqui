import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import {
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
  if (!isValidConversationId(conversationId)) {
    return NextResponse.json({ ok: false, error: 'invalid_conversation_id' }, { status: 400 })
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
  const indexSnapshot = await database.ref(`conversas/${actorUid}/${conversationId}`).get()
  const index = indexSnapshot.val()
  if (!indexSnapshot.exists()
    || text(index?.pedidoId) !== conversationId
    || !text(index?.outroId)) {
    return NextResponse.json({ ok: false, error: 'conversation_index_not_ready' }, { status: 403 })
  }

  const context = await resolveActiveConversationContext(database, conversationId, actorUid)
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: 403 })
  }

  return NextResponse.json({ ok: true, conversationId, kind: context.kind })
}
