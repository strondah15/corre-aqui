import { NextResponse } from 'next/server'
import { getFirebaseAdminAuth, getFirebaseAdminDatabase, isFirebaseAdminConfigured } from '@/lib/firebaseAdmin'
import { buildPublicRequest } from '@/lib/publicRequests'
import { buildAuthoritativeClaim, canStartAuthoritativeClaim, hasDiscoverablePublicProjection } from '@/lib/pedidoPublication'

export const runtime = 'nodejs'

function jsonError(error, status) {
  return NextResponse.json({ ok: false, error }, { status })
}

function pedidoIdFrom(value) {
  const pedidoId = String(value || '').trim()
  return /^[A-Za-z0-9_-]{1,128}$/.test(pedidoId) ? pedidoId : ''
}

function displayName(account, decoded) {
  return String(account?.profile?.nome || account?.nome || account?.displayName || decoded?.name || 'Profissional').trim().slice(0, 80) || 'Profissional'
}

export async function POST(request) {
  try {
    if (!isFirebaseAdminConfigured()) return jsonError('Serviço de autorização indisponível.', 503)

    const authorization = request.headers.get('authorization') || ''
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!idToken) return jsonError('Autenticação necessária.', 401)

    let decoded
    try {
      decoded = await getFirebaseAdminAuth().verifyIdToken(idToken)
    } catch {
      return jsonError('Sessão expirada.', 401)
    }

    const body = await request.json().catch(() => ({}))
    const pedidoId = pedidoIdFrom(body?.pedidoId)
    if (!pedidoId) return jsonError('Pedido inválido.', 400)

    const uid = String(decoded.uid || '')
    const database = getFirebaseAdminDatabase()
    const [pedidoSnapshot, publicSnapshot, accountSnapshot] = await Promise.all([
      database.ref('pedidos/' + pedidoId).get(),
      database.ref('publicRequests/' + pedidoId).get(),
      database.ref('users/' + uid).get(),
    ])
    const pedido = pedidoSnapshot.val()
    const publicRequest = publicSnapshot.val()
    if (!canStartAuthoritativeClaim({ pedido, pedidoId, actorUid: uid })) {
      return jsonError('Esse pedido não está disponível para aceite.', 409)
    }
    if (!hasDiscoverablePublicProjection({ pedido, pedidoId, publicRequest })) {
      return jsonError('Esse pedido não possui publicação confiável.', 409)
    }

    const now = Date.now()
    const actorName = displayName(accountSnapshot.val(), decoded)
    const result = await database.ref('pedidos/' + pedidoId).transaction((current) => {
      return buildAuthoritativeClaim({
        pedido: current,
        pedidoId,
        actorUid: uid,
        actorName,
        actorLocation: body?.local,
        now,
      }) || undefined
    })
    if (!result.committed) return jsonError('Esse pedido já foi aceito ou não está mais disponível.', 409)

    const claimedPedido = result.snapshot.val()
    await database.ref('publicRequests/' + pedidoId).set(buildPublicRequest({ ...claimedPedido, id: pedidoId }))
    return NextResponse.json({ ok: true, pedido: claimedPedido })
  } catch (error) {
    return jsonError(error?.message || 'Não foi possível aceitar este pedido.', error?.status || 500)
  }
}
