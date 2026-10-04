const PUBLICATION_ORIGIN = 'backend_public_projection'
const PUBLICATION_VERSION = 1

function text(value, max = 128) {
  return String(value || '').trim().slice(0, max)
}

function normalizedStatus(value) {
  return text(value, 40).toLowerCase()
}

function uidDiagnostic(value) {
  const present = typeof value === 'string' && value.trim().length > 0
  return {
    present,
    valid: present && value.trim().length <= 128,
  }
}

function privateLocation(value) {
  const lat = Number(value?.lat ?? value?.latitude)
  const lng = Number(value?.lng ?? value?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

export function getPedidoAuthority(pedido = {}, pedidoId) {
  return {
    pedidoId: text(pedidoId || pedido?.id),
    creatorId: text(pedido?.criador?.id || pedido?.criador?.uid),
    acceptedId: text(pedido?.aceite?.id || pedido?.aceite?.uid),
    status: normalizedStatus(pedido?.status || 'aberto'),
  }
}

export function createPublicationStamp({ pedido, pedidoId, now = Date.now() } = {}) {
  const authority = getPedidoAuthority(pedido, pedidoId)
  if (!authority.pedidoId || !authority.creatorId) throw new Error('Pedido sem criador autoritativo.')

  const previous = pedido?.publicacao
  const previousCreatedAt = Number(previous?.criadoEm)
  return {
    pedidoId: authority.pedidoId,
    criadorId: authority.creatorId,
    origem: PUBLICATION_ORIGIN,
    versao: PUBLICATION_VERSION,
    criadoEm: Number.isFinite(previousCreatedAt) ? previousCreatedAt : now,
    atualizadoEm: now,
  }
}

export function hasAuthoritativePublication(pedido, pedidoId) {
  const authority = getPedidoAuthority(pedido, pedidoId)
  const stamp = pedido?.publicacao
  return Boolean(
    authority.pedidoId &&
    authority.creatorId &&
    stamp &&
    text(stamp.pedidoId) === authority.pedidoId &&
    text(stamp.criadorId) === authority.creatorId &&
    stamp.origem === PUBLICATION_ORIGIN &&
    Number(stamp.versao) === PUBLICATION_VERSION
  )
}

export function canSynchronizePublicRequest({ pedido, pedidoId, actorUid } = {}) {
  const authority = getPedidoAuthority(pedido, pedidoId)
  const actor = text(actorUid)
  if (!authority.pedidoId || !authority.creatorId || !actor) return false
  if (actor === authority.creatorId) return true
  return hasAuthoritativePublication(pedido, authority.pedidoId) && actor === authority.acceptedId
}

export function canStartAuthoritativeClaim({ pedido, pedidoId, actorUid } = {}) {
  return getAuthoritativeClaimBlockReason({ pedido, pedidoId, actorUid }) === ''
}

export function getAuthoritativeClaimBlockReason({ pedido, pedidoId, actorUid } = {}) {
  return assessAuthoritativeClaim({ pedido, pedidoId, actorUid }).abortReason
}

export function assessAuthoritativeClaim(options = {}) {
  const { pedido, pedidoId, actorUid } = options
  const publicProjectionWasProvided = Object.prototype.hasOwnProperty.call(options, 'publicRequest')
  const publicRequest = options.publicRequest
  const privateExists = !!pedido && typeof pedido === 'object'
  const authority = getPedidoAuthority(pedido || {}, pedidoId)
  const actor = text(actorUid)
  const acceptedUid = pedido?.aceite?.id ?? pedido?.aceite?.uid
  const accepted = uidDiagnostic(acceptedUid)
  const marker = pedido?.publicacao
  const markerExists = !!marker && typeof marker === 'object'
  const markerDiagnostic = {
    exists: markerExists,
    pedidoIdMatches: markerExists && text(marker.pedidoId) === authority.pedidoId,
    creatorMatches: markerExists && text(marker.criadorId) === authority.creatorId,
    originMatches: markerExists && marker.origem === PUBLICATION_ORIGIN,
    versionMatches: markerExists && Number(marker.versao) === PUBLICATION_VERSION,
  }
  const markerValid = Object.values(markerDiagnostic).every(Boolean)
  const publicationExists = !!publicRequest && typeof publicRequest === 'object'
  const publicationStatus = normalizedStatus(publicRequest?.status)
  const publicCreatorId = text(publicRequest?.criador?.id || publicRequest?.criador?.uid)
  const publicIdMatches = publicationExists && text(publicRequest?.id) === authority.pedidoId
  const publicCreatorMatches = publicationExists && publicCreatorId === authority.creatorId
  const publicAccepted = uidDiagnostic(publicRequest?.aceite?.id ?? publicRequest?.aceite?.uid)
  const publicProjectionValid = publicationExists && publicIdMatches && publicCreatorMatches && publicationStatus === 'aberto' && !publicAccepted.present
  const publicationValid = markerValid && (!publicProjectionWasProvided || publicProjectionValid)

  let abortReason = ''
  if (!actor) abortReason = 'authentication_required'
  else if (!privateExists) abortReason = 'private_request_missing'
  else if (!authority.pedidoId || !authority.creatorId) abortReason = 'creator_mismatch'
  else if (actor === authority.creatorId) abortReason = 'own_request'
  else if (accepted.valid) abortReason = 'already_accepted'
  else if (accepted.present) abortReason = 'claim_conflict'
  else if (authority.status !== 'aberto') abortReason = 'status_not_open'
  else if (!markerExists) abortReason = 'publication_missing'
  else if (!markerValid) abortReason = 'publication_invalid'
  else if (publicProjectionWasProvided && !publicationExists) abortReason = 'publication_missing'
  else if (publicProjectionWasProvided && !publicCreatorMatches) abortReason = 'creator_mismatch'
  else if (publicProjectionWasProvided && !publicProjectionValid) abortReason = 'publication_invalid'

  return {
    pedidoId: authority.pedidoId || text(pedidoId),
    authUid: actor,
    privateExists,
    privateStatus: authority.status,
    creatorMatchesAuth: !!actor && !!authority.creatorId && actor === authority.creatorId,
    hasAcceptedUid: accepted.present,
    acceptedUidValid: accepted.valid,
    publicationExists,
    publicationValid,
    publicationStatus,
    publicationMarker: markerDiagnostic,
    abortReason,
  }
}

export function hasDiscoverablePublicProjection({ pedido, pedidoId, publicRequest } = {}) {
  const authority = getPedidoAuthority(pedido, pedidoId)
  return Boolean(
    authority.pedidoId &&
    authority.creatorId &&
    text(publicRequest?.id) === authority.pedidoId &&
    text(publicRequest?.criador?.id || publicRequest?.criador?.uid) === authority.creatorId &&
    normalizedStatus(publicRequest?.status) === 'aberto' &&
    !text(publicRequest?.aceite?.id || publicRequest?.aceite?.uid)
  )
}

export function buildAuthoritativeClaim({ pedido, pedidoId, actorUid, actorName, actorLocation, now = Date.now() } = {}) {
  if (!canStartAuthoritativeClaim({ pedido, pedidoId, actorUid })) return null

  const authority = getPedidoAuthority(pedido, pedidoId)
  const actor = text(actorUid)
  const name = text(actorName || 'Profissional', 80) || 'Profissional'
  const location = privateLocation(actorLocation)
  const acceptance = {
    id: actor,
    nome: name,
    aceitoEm: now,
    ...(location ? { local: location } : {}),
  }

  return {
    ...pedido,
    status: 'aceito',
    aceite: acceptance,
    conversaId: authority.pedidoId,
    aceitoEm: now,
    atualizadoEm: now,
    atendimento: {
      ...(pedido?.atendimento || {}),
      aceitoEm: now,
      aceitoPor: { id: actor, nome: name },
    },
  }
}

export function buildAuthoritativeClaimTransactionValue(options = {}) {
  // RTDB pode invocar o callback inicialmente com o cache local vazio, mesmo
  // quando o registro existe no servidor. Retornar undefined nesse primeiro
  // passe abortaria a transacao antes da leitura autoritativa. Manter null faz
  // o servidor comparar o estado e reenviar o valor atual quando ele existe.
  if (options?.pedido == null) return null
  return buildAuthoritativeClaim(options) || undefined
}

export const PEDIDO_PUBLICATION = Object.freeze({
  origin: PUBLICATION_ORIGIN,
  version: PUBLICATION_VERSION,
})
