import { NextResponse } from 'next/server'
import { getFirebaseAdminAuth, getFirebaseAdminDatabase, isFirebaseAdminConfigured } from '@/lib/firebaseAdmin'
import { buildPublicRequest } from '@/lib/publicRequests'
import { assessAuthoritativeClaim, buildAuthoritativeClaimTransactionValue } from '@/lib/pedidoPublication'
import { ensureProfessionalFeatureAccess } from '@/lib/subscriptionServer'

export const runtime = 'nodejs'

function jsonError(error, status, reason = '') {
  return NextResponse.json({ ok: false, error, ...(reason ? { reason } : {}) }, { status })
}

function pedidoIdFrom(value) {
  const pedidoId = String(value || '').trim()
  return /^[A-Za-z0-9_-]{1,128}$/.test(pedidoId) ? pedidoId : ''
}

function displayName(account, decoded) {
  return String(account?.profile?.nome || account?.nome || account?.displayName || decoded?.name || 'Profissional').trim().slice(0, 80) || 'Profissional'
}

function claimError(reason) {
  if (reason === 'already_accepted') return 'Esse pedido já foi aceito por outro profissional.'
  if (reason === 'own_request') return 'Você não pode aceitar o próprio pedido.'
  if (reason === 'status_not_open') return 'Esse pedido não está mais aberto.'
  if (reason === 'publication_missing') return 'A publicação pública desse pedido não foi encontrada.'
  if (reason === 'publication_invalid') return 'A publicação pública desse pedido é inválida.'
  if (reason === 'private_request_missing') return 'O pedido privado não foi encontrado.'
  if (reason === 'creator_mismatch') return 'A identidade do criador do pedido é inconsistente.'
  if (reason === 'claim_conflict') return 'O pedido mudou durante a tentativa de aceite.'
  return 'Esse pedido não está disponível para aceite.'
}

function buildClaimDiagnostic({ assessment, pedido, publicRequest, privateRequest } = {}) {
  const privateCreatorId = String(pedido?.criador?.id || pedido?.criador?.uid || '').trim()
  const publicCreatorId = String(publicRequest?.criador?.id || publicRequest?.criador?.uid || '').trim()
  const marker = assessment?.publicationMarker || {}
  const publicationMarkerValid = marker.exists === true &&
    marker.pedidoIdMatches === true &&
    marker.creatorMatches === true &&
    marker.originMatches === true &&
    marker.versionMatches === true

  return {
    ...assessment,
    publicRequestExists: !!publicRequest && typeof publicRequest === 'object',
    privatePedidoExists: !!pedido && typeof pedido === 'object',
    privateRequestExists: !!privateRequest && typeof privateRequest === 'object',
    publicStatus: String(publicRequest?.status || ''),
    privateStatus: String(pedido?.status || ''),
    creatorIdMatches: !!privateCreatorId && !!publicCreatorId && privateCreatorId === publicCreatorId,
    publicationMarkerExists: marker.exists === true,
    publicationMarkerValid,
    publicRequestIdMatchesPath: !!publicRequest && String(publicRequest?.id || '').trim() === String(assessment?.pedidoId || ''),
    privatePedidoIdMatchesPath: !!pedido && String(pedido?.id || '').trim() === String(assessment?.pedidoId || ''),
    privateRequestIdMatchesPath: !!privateRequest && String(privateRequest?.id || privateRequest?.requestId || '').trim() === String(assessment?.pedidoId || ''),
    reason: assessment?.abortReason || '',
  }
}

export async function POST(request) {
  let lastDiagnostic = null
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
    try {
      await ensureProfessionalFeatureAccess(database, uid)
    } catch (subscriptionError) {
      return jsonError('Assine o plano anual para aceitar novos pedidos.', subscriptionError?.status || 402, 'professional_subscription_required')
    }
    const [pedidoSnapshot, publicSnapshot, privateRequestSnapshot, accountSnapshot] = await Promise.all([
      database.ref('pedidos/' + pedidoId).get(),
      database.ref('publicRequests/' + pedidoId).get(),
      database.ref('privateRequests/' + pedidoId).get(),
      database.ref('users/' + uid).get(),
    ])
    const pedido = pedidoSnapshot.val()
    const publicRequest = publicSnapshot.val()
    const privateRequest = privateRequestSnapshot.val()
    lastDiagnostic = buildClaimDiagnostic({
      assessment: assessAuthoritativeClaim({ pedido, pedidoId, actorUid: uid, publicRequest }),
      pedido,
      publicRequest,
      privateRequest,
    })
    if (lastDiagnostic.abortReason) {
      return jsonError(claimError(lastDiagnostic.abortReason), 409, lastDiagnostic.abortReason)
    }

    const now = Date.now()
    const actorName = displayName(accountSnapshot.val(), decoded)
    const result = await database.ref('pedidos/' + pedidoId).transaction((current) => {
      return buildAuthoritativeClaimTransactionValue({
        pedido: current,
        pedidoId,
        actorUid: uid,
        actorName,
        actorLocation: body?.local,
        now,
      })
    })
    const claimedPedido = result.snapshot.val()
    if (!result.committed || !claimedPedido || typeof claimedPedido !== 'object') {
      lastDiagnostic = buildClaimDiagnostic({
        assessment: assessAuthoritativeClaim({
          pedido: claimedPedido,
          pedidoId,
          actorUid: uid,
          publicRequest,
        }),
        pedido: claimedPedido,
        publicRequest,
        privateRequest,
      })
      if (!lastDiagnostic.abortReason) {
        lastDiagnostic.abortReason = 'claim_conflict'
        lastDiagnostic.reason = 'claim_conflict'
      }
      return jsonError(claimError(lastDiagnostic.abortReason), 409, lastDiagnostic.abortReason)
    }

    await database.ref('publicRequests/' + pedidoId).set(buildPublicRequest({ ...claimedPedido, id: pedidoId }))
    return NextResponse.json({ ok: true, reason: 'success', pedido: claimedPedido })
  } catch (error) {
    return jsonError(error?.message || 'Não foi possível aceitar este pedido.', error?.status || 500, 'other_reason')
  }
}
