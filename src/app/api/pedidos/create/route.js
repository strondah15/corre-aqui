import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { getAuthenticatedUid, getCommercialDatabase, safeText } from '@/lib/commercialServer'
import { createPublicationStamp } from '@/lib/pedidoPublication'
import { buildPublicRequest } from '@/lib/publicRequests'
import {
  canCreateClientOrder,
  getClientSubscriptionStatus,
  isTerminalOrderStatus,
} from '@/lib/subscriptions'
import { defaultClientSubscription } from '@/lib/subscriptionServer'

export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store' }
const LOCK_TTL_MS = 30_000

function limitedText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function safeLocation(value) {
  const lat = safeNumber(value?.lat ?? value?.latitude)
  const lng = safeNumber(value?.lng ?? value?.longitude)
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function orderPayload({ input, id, uid, name, now }) {
  const titulo = limitedText(input?.titulo || '(sem título)', 100) || '(sem título)'
  const descricao = limitedText(input?.descricao, 500)
  return {
    id,
    tipo: limitedText(input?.tipo || 'pedido', 80).toLowerCase(),
    modoPedido: limitedText(input?.modoPedido || 'geral', 100),
    titulo,
    descricao,
    destino: limitedText(input?.destino, 160),
    forma: limitedText(input?.forma, 80).toLowerCase(),
    valor: safeNumber(input?.valor),
    categoriaId: limitedText(input?.categoriaId || 'servicos_gerais', 100),
    categoriaLabel: limitedText(input?.categoriaLabel || 'Serviços gerais', 100),
    status: 'aberto',
    local: safeLocation(input?.local),
    criador: { id: uid, nome: limitedText(name || 'Cliente', 80) || 'Cliente' },
    urgencia: limitedText(input?.urgencia || 'normal', 100).toLowerCase(),
    emergencia: input?.emergencia === true,
    destaque: false,
    prioridade: limitedText(input?.prioridade || 'normal', 100).toLowerCase(),
    boost: null,
    criadoEm: now,
    atualizadoEm: now,
    criadoEmServer: now,
    atualizadoEmServer: now,
  }
}

async function acquireLock(database, uid, requestId, now) {
  const lockRef = database.ref(`clientOrderCreationLocks/${uid}`)
  const result = await lockRef.transaction((current) => {
    if (current?.status === 'processing' && Number(current.createdAt || 0) > now - LOCK_TTL_MS) return undefined
    return { requestId, status: 'processing', createdAt: now, updatedAt: now }
  })
  if (!result.committed || result.snapshot.val()?.requestId !== requestId) {
    const error = new Error('order_creation_in_progress')
    error.status = 409
    throw error
  }
  return lockRef
}

export async function POST(request) {
  const requestId = crypto.randomUUID()
  let lockRef = null
  try {
    const uid = await getAuthenticatedUid(request)
    const body = await request.json().catch(() => ({}))
    const database = getCommercialDatabase()
    const now = Date.now()
    lockRef = await acquireLock(database, uid, requestId, now)

    const [accountSnapshot, ordersSnapshot] = await Promise.all([
      database.ref(`users/${uid}`).get(),
      database.ref('pedidos').orderByChild('criador/id').equalTo(uid).get(),
    ])
    const account = accountSnapshot.val() || {}
    const orders = Object.values(ordersSnapshot.val() || {}).filter(Boolean)
    const hasOpenOrder = orders.some((order) => !isTerminalOrderStatus(order?.status))
    const access = canCreateClientOrder(account, {
      now,
      hasExistingOrder: orders.length > 0,
      hasOpenOrder,
    })
    if (!access.allowed) {
      await database.ref().update({
        [`users/${uid}/clientFreeOrderUsed`]: true,
        [`users/${uid}/subscriptions/client`]: defaultClientSubscription(account?.subscriptions?.client || {}),
        [`clientOrderCreationLocks/${uid}`]: {
          requestId,
          status: 'denied',
          reason: access.reason,
          updatedAt: Date.now(),
        },
      })
      const status = access.reason === 'free_order_in_progress' ? 409 : 402
      return NextResponse.json({
        ok: false,
        error: access.reason,
        reason: access.reason,
        message: access.reason === 'free_order_in_progress'
          ? 'Seu primeiro pedido ainda está aberto. Finalize-o antes de criar outro sem assinatura.'
          : 'Seu primeiro pedido grátis já foi utilizado. Assine o plano anual para continuar criando pedidos.',
        subscription: access.subscription,
      }, { status, headers })
    }

    const id = database.ref('pedidos').push().key
    const name = safeText(account?.profile?.nome || account?.nome || account?.displayName || 'Cliente')
    const payload = orderPayload({ input: body?.order || {}, id, uid, name, now })
    const publication = buildPublicRequest(payload)
    const stamp = createPublicationStamp({ pedido: payload, pedidoId: id, now })
    payload.publicacao = stamp

    const clientPlan = defaultClientSubscription(account?.subscriptions?.client || {})
    const updates = {
      [`pedidos/${id}`]: payload,
      [`publicRequests/${id}`]: publication,
      [`users/${uid}/clientFreeOrderUsed`]: true,
      [`users/${uid}/subscriptions/client`]: clientPlan,
      [`clientOrderCreationLocks/${uid}`]: {
        requestId,
        status: 'completed',
        pedidoId: id,
        accessReason: access.reason,
        updatedAt: now,
      },
    }
    await database.ref().update(updates)

    return NextResponse.json({
      ok: true,
      order: payload,
      accessReason: access.reason,
      subscription: getClientSubscriptionStatus({ ...account, clientFreeOrderUsed: true }),
    }, { headers })
  } catch (error) {
    if (lockRef) {
      await lockRef.set({ requestId, status: 'failed', reason: error?.message || 'unknown', updatedAt: Date.now() }).catch(() => {})
    }
    return NextResponse.json({
      ok: false,
      error: error?.message || 'order_creation_failed',
    }, { status: error?.status || 500, headers })
  }
}
