import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import {
  getOwnPrivatePhone,
  getServiceParticipants,
  isServiceContactActiveStatus,
  isServiceParticipant,
} from '@/lib/serviceContactPolicy'

export const runtime = 'nodejs'

const text = (value) => String(value || '').trim()
const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[.#$\[\]/]/.test(value)

async function readServiceContext(db, pedidoId) {
  const pedido = (await db.ref(`pedidos/${pedidoId}`).get()).val()
  if (pedido) return { kind: 'pedido', record: pedido }

  const privateRequest = (await db.ref(`privateRequests/${pedidoId}`).get()).val()
  if (privateRequest) return { kind: 'privateRequest', record: privateRequest }
  return null
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

  const pedidoId = text(body?.pedidoId)
  if (!validId(pedidoId)) return NextResponse.json({ ok: false, error: 'invalid_pedido_id' }, { status: 400 })

  let decoded
  let db
  try {
    const adminAuth = getFirebaseAdminAuth()
    db = getFirebaseAdminDatabase()
    decoded = await adminAuth.verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_auth_token' }, { status: 401 })
  }

  const uid = text(decoded?.uid)
  const context = await readServiceContext(db, pedidoId)
  if (!context || !isServiceParticipant(context.record, context.kind, uid)) {
    return NextResponse.json({ ok: false, error: 'not_service_participant' }, { status: 403 })
  }

  if (!isServiceContactActiveStatus(context.record?.status)) {
    return NextResponse.json({ ok: true, available: false, reason: 'inactive_service' })
  }

  const { clientId, professionalId } = getServiceParticipants(context.record, context.kind)
  const otherId = uid === clientId ? professionalId : clientId
  if (!otherId) return NextResponse.json({ ok: true, available: false, reason: 'participant_unavailable' })

  const otherUserNode = (await db.ref(`users/${otherId}`).get()).val() || {}
  const consent = otherUserNode?.privacy?.sharePhoneDuringActiveJob === true
  const phone = consent ? getOwnPrivatePhone(otherUserNode) : ''
  if (!phone) {
    return NextResponse.json({
      ok: true,
      available: false,
      reason: consent ? 'phone_unavailable' : 'consent_required',
    })
  }

  return NextResponse.json({
    ok: true,
    available: true,
    contact: { phone, source: 'active_service' },
  })
}
