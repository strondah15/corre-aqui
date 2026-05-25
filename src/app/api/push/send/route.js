import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  getFirebaseAdminMessaging,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
])

function text(value, fallback = '', max = 160) {
  const normalized = String(value || fallback || '').trim()
  return normalized.slice(0, max)
}

function stringData(payload) {
  return Object.fromEntries(
    Object.entries(payload || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)])
  )
}

function resolveClickUrl(body) {
  if (typeof body?.url === 'string' && body.url.startsWith('/')) return body.url
  if (body?.acao === 'abrir_chat' && body?.conversaId) {
    return `/chat/${encodeURIComponent(String(body.conversaId))}`
  }
  if (body?.acao === 'ver_notificacoes') return '/'
  return '/'
}

function getPedidoIds(pedido) {
  return {
    criadorId: pedido?.criador?.id ? String(pedido.criador.id) : '',
    aceiteId: pedido?.aceite?.id ? String(pedido.aceite.id) : '',
  }
}

function canSendForPedido({ actorUid, toUid, pedido }) {
  const { criadorId, aceiteId } = getPedidoIds(pedido)
  const actorIsParticipant = actorUid === criadorId || actorUid === aceiteId
  const targetIsParticipant = toUid === criadorId || toUid === aceiteId
  return actorIsParticipant && targetIsParticipant && actorUid !== toUid
}

async function disableInvalidTokens(db, toUid, tokenEntries, responses) {
  const updates = {}
  const now = Date.now()

  responses.forEach((response, index) => {
    const code = response?.error?.code
    const entry = tokenEntries[index]

    if (entry?.key && code && INVALID_TOKEN_CODES.has(code)) {
      updates[`users/${toUid}/pushTokens/${entry.key}/enabled`] = false
      updates[`users/${toUid}/pushTokens/${entry.key}/lastError`] = code
      updates[`users/${toUid}/pushTokens/${entry.key}/lastErrorAt`] = now
    }
  })

  if (Object.keys(updates).length) {
    await db.ref().update(updates)
  }
}

export async function POST(request) {
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
  const pedidoId = text(body.pedidoId, '', 128)

  if (!toUid) {
    return NextResponse.json({ ok: false, error: 'missing_target' }, { status: 400 })
  }

  const auth = getFirebaseAdminAuth()
  const db = getFirebaseAdminDatabase()
  const messaging = getFirebaseAdminMessaging()

  let decoded
  try {
    decoded = await auth.verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_auth_token' }, { status: 401 })
  }

  const actorUid = String(decoded.uid || '')
  const isSelfTest = !pedidoId && toUid === actorUid && (body.test === true || body.tipo === 'push_teste' || body.type === 'push_teste')

  if (!isSelfTest) {
    if (!pedidoId) {
      return NextResponse.json({ ok: false, error: 'missing_pedido' }, { status: 400 })
    }

    const pedidoSnap = await db.ref(`pedidos/${pedidoId}`).get()
    const pedido = pedidoSnap.val()

    if (!pedido || !canSendForPedido({ actorUid, toUid, pedido })) {
      return NextResponse.json({ ok: false, error: 'forbidden_push_context' }, { status: 403 })
    }
  }

  const userSnap = await db.ref(`users/${toUid}`).get()
  const user = userSnap.val() || {}

  if (user?.profile?.notificacoes === false || user?.notificacoes === false || user?.push?.enabled === false) {
    return NextResponse.json({ ok: false, skipped: true, reason: 'user_notifications_disabled' })
  }

  const pushTokens = user?.pushTokens || {}
  const tokenEntries = Object.entries(pushTokens)
    .map(([key, value]) => ({ key, token: value?.token, enabled: value?.enabled !== false }))
    .filter((entry) => entry.enabled && typeof entry.token === 'string' && entry.token.length > 20)

  if (!tokenEntries.length) {
    return NextResponse.json({ ok: false, skipped: true, reason: 'no_push_tokens' })
  }

  const title = text(body.titulo || body.title, 'Corre Aqui', 80)
  const message = text(body.mensagem || body.body || body.message, 'Voce tem uma nova atualizacao.', 180)
  const url = resolveClickUrl(body)
  const tag = text(body.tag, `corre-aqui-${pedidoId || `teste-${actorUid}`}-${body.tipo || body.type || 'push'}`, 120)
  const data = stringData({
    tipo: body.tipo || body.type || 'notificacao',
    pedidoId,
    conversaId: body.conversaId || pedidoId,
    acao: body.acao || 'ver_notificacoes',
    url,
    title,
    body: message,
    icon: '/corre-aqui-icon-192.png',
    badge: '/corre-aqui-icon-192.png',
    tag,
    requireInteraction: body.prioridade === 'alta',
  })

  const result = await messaging.sendEachForMulticast({
    tokens: tokenEntries.map((entry) => entry.token),
    data,
    webpush: {
      fcmOptions: {
        link: url,
      },
    },
  })

  await disableInvalidTokens(db, toUid, tokenEntries, result.responses || [])

  return NextResponse.json({
    ok: result.successCount > 0,
    successCount: result.successCount,
    failureCount: result.failureCount,
  })
}
