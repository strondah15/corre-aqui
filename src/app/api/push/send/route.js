import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  getFirebaseAdminMessaging,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import { buildPushPayload } from '@/lib/pushPayload'

export const runtime = 'nodejs'

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
])

function text(value, fallback = '', max = 160) {
  const normalized = String(value || fallback || '').trim()
  return normalized.slice(0, max)
}

function validFirebaseId(value) {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(String(value || ''))
}

function logPushError(label, error) {
  const safe = {
    code: String(error?.code || 'unknown').slice(0, 100),
    name: String(error?.name || 'Error').slice(0, 80),
  }
  if (process.env.NODE_ENV !== 'production') {
    console.error(label, { ...safe, message: String(error?.message || '').slice(0, 240) })
    return
  }
  console.error(label, safe)
}

function stringData(payload) {
  return Object.fromEntries(
    Object.entries(payload || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)])
  )
}

function getParticipantIds(pedido) {
  const criador = pedido?.criador || pedido?.cliente || pedido?.creator || {}
  const aceite = pedido?.aceite || pedido?.profissional || pedido?.worker || {}
  const firstId = (...values) => values.find((value) => typeof value === 'string' && value.trim()) || ''

  return {
    criadorId: String(firstId(criador.id, criador.uid, criador.userId, pedido?.criadorUid, pedido?.clienteId, pedido?.autorUid)).trim(),
    aceiteId: String(firstId(aceite.id, aceite.uid, aceite.userId, aceite.por, pedido?.profissionalId, pedido?.profissionalUid, pedido?.destinatarioUid, pedido?.aceitadorUid)).trim(),
  }
}

function canSendForContext({ actorUid, toUid, pedido }) {
  const { criadorId, aceiteId } = getParticipantIds(pedido)
  const actorIsParticipant = actorUid === criadorId || actorUid === aceiteId
  const targetIsParticipant = toUid === criadorId || toUid === aceiteId
  return actorIsParticipant && targetIsParticipant && actorUid !== toUid
}

function pushErrorPayload(error, fallbackReason = 'push_send_failed') {
  const code = String(error?.code || '')
  const message = String(error?.message || '').slice(0, 240)
  const reason =
    code === 'app/invalid-credential' || code === 'app/invalid-app-options'
      ? 'firebase_admin_init_failed'
      : code === 'messaging/mismatched-credential'
        ? 'fcm_project_mismatch'
        : code === 'messaging/third-party-auth-error'
          ? 'fcm_auth_error'
          : fallbackReason

  return {
    ok: false,
    reason,
    code,
    message: process.env.NODE_ENV !== 'production' ? message : '',
  }
}

async function disableInvalidTokens(db, toUid, tokenEntries, responses) {
  const updates = {}
  const now = Date.now()

  responses.forEach((response, index) => {
    const code = response?.error?.code
    const entry = tokenEntries[index]

    if (entry?.key && code && INVALID_TOKEN_CODES.has(code)) {
      updates[`userPrivate/${toUid}/pushTokens/${entry.key}/enabled`] = false
      updates[`userPrivate/${toUid}/pushTokens/${entry.key}/lastError`] = code
      updates[`userPrivate/${toUid}/pushTokens/${entry.key}/lastErrorAt`] = now
    }
  })

  if (Object.keys(updates).length) {
    await db.ref().update(updates)
  }
}

export async function POST(request) {
  try {
    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json({
        ok: false,
        skipped: true,
        reason: 'firebase_admin_not_configured',
      })
    }

    const authorization = request.headers.get('authorization') || ''
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''

    if (!idToken) {
      return NextResponse.json({ ok: false, error: 'missing_auth_token' }, { status: 401 })
    }

    let body = {}
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
    }

    const toUid = text(body.toUid || body.userId, '', 128)
    const pedidoId = text(body.pedidoId || body.privateRequestId, '', 128)

    if (!toUid || !validFirebaseId(toUid)) {
      return NextResponse.json({ ok: false, error: 'missing_target' }, { status: 400 })
    }
    if (pedidoId && !validFirebaseId(pedidoId)) {
      return NextResponse.json({ ok: false, error: 'invalid_pedido' }, { status: 400 })
    }

    let adminAuth
    let db
    let messaging
    try {
      adminAuth = getFirebaseAdminAuth()
      db = getFirebaseAdminDatabase()
      messaging = getFirebaseAdminMessaging()
    } catch (error) {
      logPushError('[push/send] Firebase Admin init failed', error)
      return NextResponse.json(pushErrorPayload(error, 'firebase_admin_init_failed'), { status: 500 })
    }

    let decoded
    try {
      decoded = await adminAuth.verifyIdToken(idToken)
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_auth_token' }, { status: 401 })
    }

    const actorUid = String(decoded.uid || '')
    const isSelfTest =
      !pedidoId &&
      toUid === actorUid &&
      (body.test === true || body.tipo === 'push_teste' || body.type === 'push_teste')

    if (!isSelfTest) {
      if (!pedidoId) {
        return NextResponse.json({ ok: false, error: 'missing_pedido' }, { status: 400 })
      }

      const pedidoSnap = await db.ref(`pedidos/${pedidoId}`).get()
      let pedido = pedidoSnap.val()

      if (!pedido) {
        const privateRequestSnap = await db.ref(`privateRequests/${pedidoId}`).get()
        pedido = privateRequestSnap.val()
      }

      if (!pedido || !canSendForContext({ actorUid, toUid, pedido })) {
        return NextResponse.json({ ok: false, error: 'forbidden_push_context' }, { status: 403 })
      }
    }

    const userSnap = await db.ref(`users/${toUid}`).get()
    const user = userSnap.val() || {}
    const userPrivateSnap = await db.ref(`userPrivate/${toUid}`).get()
    const userPrivate = userPrivateSnap.val() || {}

    if (user?.profile?.notificacoes === false || user?.notificacoes === false) {
      return NextResponse.json({ ok: false, skipped: true, reason: 'user_notifications_disabled' })
    }

    const pushTokens = userPrivate?.pushTokens || {}
    const tokenEntries = Object.entries(pushTokens)
      .map(([key, value]) => ({ key, token: value?.token, enabled: value?.enabled !== false }))
      .filter((entry) => entry.enabled && typeof entry.token === 'string' && entry.token.length > 20)

    if (!tokenEntries.length) {
      return NextResponse.json({ ok: false, skipped: true, reason: 'no_push_tokens' })
    }

    const push = buildPushPayload({ ...body, toUid, pedidoId: body.pedidoId || pedidoId })
    const data = stringData({
      ...push.data,
      title: push.title,
      body: push.body,
      icon: push.icon,
      badge: push.badge,
      image: push.image,
      tag: push.tag,
      renotify: push.renotify,
      requireInteraction: push.requireInteraction,
      actionLabel: push.action.label,
      actionScreen: push.action.screen,
      actionId: push.action.id,
      actions: push.actions.length ? JSON.stringify(push.actions) : '',
    })

    const link = new URL(push.url || '/', request.url).toString()

    let result
    try {
      result = await messaging.sendEachForMulticast({
        tokens: tokenEntries.map((entry) => entry.token),
        data,
        webpush: {
          headers: {
            Urgency: body.prioridade === 'alta' ? 'high' : 'normal',
            TTL: '86400',
          },
          fcmOptions: {
            link,
          },
        },
      })
    } catch (error) {
      logPushError('[push/send] FCM send failed', error)
      return NextResponse.json(pushErrorPayload(error), { status: 502 })
    }

    await disableInvalidTokens(db, toUid, tokenEntries, result.responses || [])
    const failures = (result.responses || [])
      .map((response) => ({
        code: response?.error?.code,
      }))
      .filter((failure) => failure.code)

    return NextResponse.json({
      ok: result.successCount > 0,
      successCount: result.successCount,
      failureCount: result.failureCount,
      failures: failures.slice(0, 5),
    })
  } catch (error) {
    logPushError('[push/send] Unexpected error', error)
    return NextResponse.json(pushErrorPayload(error), { status: 500 })
  }
}
