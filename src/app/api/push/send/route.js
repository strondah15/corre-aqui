import crypto from 'crypto'
import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  getFirebaseAdminMessaging,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import { readConversationContext } from '@/lib/conversationActivityServer'
import {
  authorizeNotificationEvent,
  buildTrustedNotification,
  consumeNotificationRateLimit,
  normalizeNotificationType,
} from '@/lib/notificationPolicy'
import { buildPushPayload } from '@/lib/pushPayload'
import { consumeFixedWindowLimit } from '@/lib/serverRateLimit'

export const runtime = 'nodejs'

const responseHeaders = { 'Cache-Control': 'private, no-store' }
const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
])

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { ...responseHeaders, ...(init.headers || {}) },
  })
}

function text(value, fallback = '', max = 160) {
  return String(value || fallback || '').trim().slice(0, max)
}

function validFirebaseId(value) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(String(value || ''))
}

function cleanUndefined(value) {
  if (Array.isArray(value)) return value.map(cleanUndefined).filter((item) => item !== undefined)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanUndefined(item)]),
  )
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
      .map(([key, value]) => [key, String(value)]),
  )
}

function pushErrorPayload(error, fallbackReason = 'push_send_failed') {
  const code = String(error?.code || '')
  const reason = code === 'app/invalid-credential' || code === 'app/invalid-app-options'
    ? 'firebase_admin_init_failed'
    : code === 'messaging/mismatched-credential'
      ? 'fcm_project_mismatch'
      : code === 'messaging/third-party-auth-error'
        ? 'fcm_auth_error'
        : fallbackReason
  return { ok: false, reason, code }
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
  if (Object.keys(updates).length) await db.ref().update(updates)
}

function storedEventMatches(value, expected) {
  return Boolean(value)
    && value.schemaVersion === 1
    && value.eventId === expected.eventId
    && value.sourceId === expected.sourceId
    && value.type === expected.type
    && value.fromUid === expected.fromUid
    && value.toUid === expected.toUid
}

async function readNotificationContext(db, sourceId, options) {
  const [pedidoSnapshot, privateSnapshot, responseMarkerSnapshot, messageSnapshot, ratingSnapshot] = await Promise.all([
    db.ref(`pedidos/${sourceId}`).get(),
    db.ref(`privateRequests/${sourceId}`).get(),
    db.ref(`privateRequestResponses/${sourceId}`).get(),
    options.messageId ? db.ref(`chats/${sourceId}/${options.messageId}`).get() : Promise.resolve(null),
    options.needsRating ? db.ref(`avaliacoes/${sourceId}`).get() : Promise.resolve(null),
  ])
  let privateContext = null
  if (privateSnapshot.exists()) {
    privateContext = await readConversationContext(db, sourceId, { kind: 'privateRequest' })
  }
  return {
    pedido: pedidoSnapshot.val(),
    privateRequest: privateSnapshot.val(),
    privateResponseAuthorized: privateContext?.privateResponseAuthorized === true,
    responseMarker: responseMarkerSnapshot.val(),
    message: messageSnapshot?.val?.() || null,
    rating: ratingSnapshot?.val?.() || null,
  }
}

function selectAuthorizedEvent({ context, sourceId, actorUid, toUid, requestedType }) {
  const candidates = []
  if (context.pedido) candidates.push({ kind: 'pedido', record: context.pedido })
  if (context.privateRequest) candidates.push({ kind: 'privateRequest', record: context.privateRequest })
  const authorized = candidates
    .map((candidate) => ({
      ...candidate,
      event: authorizeNotificationEvent({
        ...candidate,
        sourceId,
        actorUid,
        toUid,
        requestedType,
        message: context.message,
        rating: context.rating,
        responseMarker: context.responseMarker,
        privateResponseAuthorized: context.privateResponseAuthorized,
      }),
    }))
    .filter((candidate) => candidate.event.ok)
  if (authorized.length === 1) return authorized[0]
  if (authorized.length > 1) return { error: 'ambiguous_notification_context' }
  return { error: 'notification_event_not_authorized' }
}

async function readEnabledPushTokens(db, toUid) {
  const userPrivateSnapshot = await db.ref(`userPrivate/${toUid}`).get()
  const userPrivate = userPrivateSnapshot.val() || {}
  return Object.entries(userPrivate?.pushTokens || {})
    .map(([key, value]) => ({ key, token: value?.token, enabled: value?.enabled !== false }))
    .filter((entry) => entry.enabled && typeof entry.token === 'string' && entry.token.length > 20)
}

async function reserveNotificationEvent(db, trusted, now) {
  const eventPath = `serverNotificationEvents/${trusted.id}`
  const nonce = crypto.randomUUID()
  const identity = {
    schemaVersion: 1,
    eventId: trusted.id,
    sourceId: trusted.pedidoId,
    type: trusted.tipo,
    fromUid: trusted.fromUid,
    toUid: trusted.toUid,
  }
  const result = await db.ref(eventPath).transaction((current) => {
    if (current) return storedEventMatches(current, identity) ? current : undefined
    return { ...identity, claim: nonce, createdAt: now, notification: trusted }
  })
  const stored = result.snapshot.val()
  if (!result.committed || !storedEventMatches(stored, identity)) {
    return { ok: false, error: 'notification_event_conflict' }
  }
  return {
    ok: true,
    eventPath,
    owner: stored.claim === nonce,
    pushAttempted: Number(stored.pushAttemptedAt || 0) > 0,
    notification: cleanUndefined(stored.notification || trusted),
  }
}

async function materializeNotification(db, trusted) {
  const paths = [
    `notifications/${trusted.toUid}/${trusted.id}`,
    `notificacoes/${trusted.toUid}/${trusted.id}`,
  ]
  const snapshots = await Promise.all(paths.map((path) => db.ref(path).get()))
  for (const snapshot of snapshots) {
    const current = snapshot.val()
    if (current && (!current.serverGenerated || current.eventId !== trusted.eventId
      || current.fromUid !== trusted.fromUid || current.toUid !== trusted.toUid)) {
      throw Object.assign(new Error('notification_materialization_conflict'), { status: 409 })
    }
  }
  await db.ref().update(Object.fromEntries(paths.map((path) => [path, trusted])))
}

async function deliverSelfTest({ db, messaging, actorUid, tokenEntries, request }) {
  const decision = await consumeFixedWindowLimit({
    database: db,
    path: `serverUsage/notifications/${actorUid}/selfTest`,
    windowMs: 10 * 60_000,
    maxRequests: 3,
    minIntervalMs: 60_000,
  })
  if (!decision.allowed) {
    return json({ ok: false, error: 'notification_rate_limited' }, {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil(decision.retryAfterMs / 1_000))) },
    })
  }
  if (!tokenEntries.length) return json({ ok: true, skipped: true, reason: 'no_push_tokens' })
  const push = buildPushPayload({
    type: 'push_teste',
    title: 'Corre Aqui',
    body: 'As notificações estão funcionando.',
    toUid: actorUid,
    action: { label: 'Abrir notificações', screen: 'notifications', id: actorUid },
  })
  const data = stringData({ ...push.data, title: push.title, body: push.body, icon: push.icon, badge: push.badge })
  const result = await messaging.sendEachForMulticast({
    tokens: tokenEntries.map((entry) => entry.token),
    data,
    webpush: { fcmOptions: { link: new URL(push.url || '/', request.url).toString() } },
  })
  await disableInvalidTokens(db, actorUid, tokenEntries, result.responses || [])
  return json({ ok: result.successCount > 0, successCount: result.successCount, failureCount: result.failureCount })
}

export async function POST(request) {
  try {
    if (!isFirebaseAdminConfigured()) {
      return json({ ok: false, error: 'firebase_admin_not_configured' }, { status: 503 })
    }
    const authorization = request.headers.get('authorization') || ''
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!idToken) return json({ ok: false, error: 'missing_auth_token' }, { status: 401 })

    let adminAuth
    let db
    let messaging
    try {
      adminAuth = getFirebaseAdminAuth()
      db = getFirebaseAdminDatabase()
      messaging = getFirebaseAdminMessaging()
    } catch (error) {
      logPushError('[push/send] Firebase Admin init failed', error)
      return json(pushErrorPayload(error, 'firebase_admin_init_failed'), { status: 503 })
    }
    let decoded
    try {
      decoded = await adminAuth.verifyIdToken(idToken)
    } catch {
      return json({ ok: false, error: 'invalid_auth_token' }, { status: 401 })
    }
    const actorUid = text(decoded.uid, '', 128)

    const requestRate = await consumeFixedWindowLimit({
      database: db,
      path: `serverUsage/notifications/${actorUid}/requests`,
      windowMs: 60_000,
      maxRequests: 60,
    })
    if (!requestRate.allowed) {
      return json({ ok: false, error: 'notification_request_rate_limited' }, {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, Math.ceil(requestRate.retryAfterMs / 1_000))) },
      })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid_json' }, { status: 400 })
    const toUid = text(body.toUid || body.userId, '', 128)
    const sourceId = text(body.pedidoId || body.privateRequestId, '', 128)
    const messageId = text(body.messageId, '', 128)
    const requestedType = normalizeNotificationType(body.type || body.tipo)
    if (!validFirebaseId(toUid)) return json({ ok: false, error: 'missing_target' }, { status: 400 })

    const selfTest = !sourceId && toUid === actorUid && body.test === true && requestedType === 'push_teste'
    if (selfTest) {
      const tokenEntries = await readEnabledPushTokens(db, toUid)
      return deliverSelfTest({ db, messaging, actorUid, tokenEntries, request })
    }
    if (!validFirebaseId(sourceId) || !requestedType) {
      return json({ ok: false, error: 'invalid_notification_request' }, { status: 400 })
    }
    if (messageId && !validFirebaseId(messageId)) {
      return json({ ok: false, error: 'invalid_message' }, { status: 400 })
    }

    const context = await readNotificationContext(db, sourceId, {
      messageId,
      needsRating: requestedType === 'avaliacao_recebida',
    })
    const selected = selectAuthorizedEvent({ context, sourceId, actorUid, toUid, requestedType })
    if (selected.error) return json({ ok: false, error: selected.error }, { status: 403 })

    const now = Date.now()
    const trustedBase = buildTrustedNotification({
      event: selected.event,
      kind: selected.kind,
      record: selected.record,
      sourceId,
      actorUid,
      toUid,
      messageId,
      now,
    })
    const push = buildPushPayload({
      type: trustedBase.tipo,
      title: trustedBase.titulo,
      body: trustedBase.mensagem,
      pedidoId: sourceId,
      privateRequestId: selected.kind === 'privateRequest' ? sourceId : '',
      conversaId: sourceId,
      toUid,
      action: trustedBase.action,
      eventId: trustedBase.eventId,
      prioridade: trustedBase.prioridade,
      criadoEm: now,
    })
    const trusted = cleanUndefined({ ...trustedBase, url: push.url, tag: push.tag })
    const eventRef = db.ref(`serverNotificationEvents/${trusted.id}`)
    const existingEvent = await eventRef.get()
    const expectedIdentity = {
      schemaVersion: 1,
      eventId: trusted.id,
      sourceId,
      type: trusted.tipo,
      fromUid: actorUid,
      toUid,
    }
    if (!existingEvent.exists()) {
      const rate = await consumeNotificationRateLimit({ database: db, actorUid, type: trusted.tipo, sourceId, now })
      if (!rate.allowed) {
        return json({ ok: false, error: 'notification_rate_limited' }, {
          status: 429,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfterMs / 1_000))) },
        })
      }
    } else if (!storedEventMatches(existingEvent.val(), expectedIdentity)) {
      return json({ ok: false, error: 'notification_event_conflict' }, { status: 409 })
    }

    const reservation = await reserveNotificationEvent(db, trusted, now)
    if (!reservation.ok) return json({ ok: false, error: reservation.error }, { status: 409 })
    await materializeNotification(db, reservation.notification)
    await db.ref(reservation.eventPath).update({ materializedAt: Date.now() })
    if (reservation.pushAttempted || !reservation.owner) {
      return json({ ok: true, stored: true, idempotent: true, notificationId: trusted.id })
    }

    const userSnapshot = await db.ref(`users/${toUid}`).get()
    const user = userSnapshot.val() || {}
    if (user?.profile?.notificacoes === false || user?.notificacoes === false) {
      await db.ref(reservation.eventPath).update({ pushAttemptedAt: Date.now(), pushStatus: 'disabled' })
      return json({ ok: true, stored: true, skipped: true, reason: 'user_notifications_disabled', notificationId: trusted.id })
    }
    const tokenEntries = await readEnabledPushTokens(db, toUid)
    if (!tokenEntries.length) {
      await db.ref(reservation.eventPath).update({ pushAttemptedAt: Date.now(), pushStatus: 'no_tokens' })
      return json({ ok: true, stored: true, skipped: true, reason: 'no_push_tokens', notificationId: trusted.id })
    }

    await db.ref(reservation.eventPath).update({ pushAttemptedAt: Date.now(), pushStatus: 'sending' })
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
    const result = await messaging.sendEachForMulticast({
      tokens: tokenEntries.map((entry) => entry.token),
      data,
      webpush: {
        headers: { Urgency: trusted.prioridade === 'alta' ? 'high' : 'normal', TTL: '86400' },
        fcmOptions: { link: new URL(push.url || '/', request.url).toString() },
      },
    })
    await disableInvalidTokens(db, toUid, tokenEntries, result.responses || [])
    await db.ref(reservation.eventPath).update({
      pushStatus: result.successCount > 0 ? 'sent' : 'failed',
      pushSuccessCount: result.successCount,
      pushFailureCount: result.failureCount,
      pushCompletedAt: Date.now(),
    })
    const failures = (result.responses || [])
      .map((response) => ({ code: response?.error?.code }))
      .filter((failure) => failure.code)
    return json({
      ok: result.successCount > 0,
      stored: true,
      notificationId: trusted.id,
      successCount: result.successCount,
      failureCount: result.failureCount,
      failures: failures.slice(0, 5),
    })
  } catch (error) {
    logPushError('[push/send] Unexpected error', error)
    return json(pushErrorPayload(error), { status: error?.status || 500 })
  }
}
