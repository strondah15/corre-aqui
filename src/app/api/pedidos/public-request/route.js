import { NextResponse } from 'next/server'
import { getFirebaseAdminAuth, getFirebaseAdminDatabase, isFirebaseAdminConfigured } from '@/lib/firebaseAdmin'
import { buildPublicRequest } from '@/lib/publicRequests'
import { canSynchronizePublicRequest, createPublicationStamp, getPedidoAuthority } from '@/lib/pedidoPublication'

export const runtime = 'nodejs'

function jsonError(error, status) {
  return NextResponse.json({ ok: false, error }, { status })
}

function pedidoIdFrom(value) {
  const pedidoId = String(value || '').trim()
  return /^[A-Za-z0-9_-]{1,128}$/.test(pedidoId) ? pedidoId : ''
}

async function authenticate(request) {
  if (!isFirebaseAdminConfigured()) {
    const error = new Error('Serviço de autorização indisponível.')
    error.status = 503
    throw error
  }

  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) {
    const error = new Error('Autenticação necessária.')
    error.status = 401
    throw error
  }

  try {
    return await getFirebaseAdminAuth().verifyIdToken(idToken)
  } catch {
    const error = new Error('Sessão expirada.')
    error.status = 401
    throw error
  }
}

async function readPedido(request) {
  const decoded = await authenticate(request)
  const body = await request.json().catch(() => ({}))
  const pedidoId = pedidoIdFrom(body?.pedidoId)
  if (!pedidoId) {
    const error = new Error('Pedido inválido.')
    error.status = 400
    throw error
  }

  const database = getFirebaseAdminDatabase()
  const snapshot = await database.ref('pedidos/' + pedidoId).get()
  const pedido = snapshot.val()
  if (!pedido || typeof pedido !== 'object') {
    const error = new Error('Pedido indisponível.')
    error.status = 404
    throw error
  }

  return { database, pedidoId, pedido, uid: String(decoded.uid || '') }
}

export async function POST(request) {
  try {
    const { database, pedidoId, pedido, uid } = await readPedido(request)
    if (!canSynchronizePublicRequest({ pedido, pedidoId, actorUid: uid })) {
      return jsonError('Você não pode publicar este pedido.', 403)
    }

    const now = Date.now()
    const projection = buildPublicRequest({ ...pedido, id: pedidoId })
    const stamp = createPublicationStamp({ pedido, pedidoId, now })
    await database.ref().update({
      ['publicRequests/' + pedidoId]: projection,
      ['pedidos/' + pedidoId + '/publicacao']: stamp,
    })

    return NextResponse.json({ ok: true, pedidoId, status: projection.status })
  } catch (error) {
    return jsonError(error?.message || 'Não foi possível publicar este pedido.', error?.status || 500)
  }
}

export async function DELETE(request) {
  try {
    const { database, pedidoId, pedido, uid } = await readPedido(request)
    const authority = getPedidoAuthority(pedido, pedidoId)
    if (!authority.creatorId || uid !== authority.creatorId) {
      return jsonError('Você não pode remover esta publicação.', 403)
    }

    await database.ref().update({
      ['publicRequests/' + pedidoId]: null,
      ['pedidos/' + pedidoId + '/publicacao']: null,
    })
    return NextResponse.json({ ok: true, pedidoId })
  } catch (error) {
    return jsonError(error?.message || 'Não foi possível remover esta publicação.', error?.status || 500)
  }
}
