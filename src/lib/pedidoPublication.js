const PUBLICATION_ORIGIN = 'backend_public_projection'
const PUBLICATION_VERSION = 1

function text(value, max = 128) {
  return String(value || '').trim().slice(0, max)
}

function normalizedStatus(value) {
  return text(value, 40).toLowerCase()
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
  const authority = getPedidoAuthority(pedido, pedidoId)
  const actor = text(actorUid)
  return Boolean(
    actor &&
    authority.creatorId &&
    actor !== authority.creatorId &&
    authority.status === 'aberto' &&
    !authority.acceptedId &&
    hasAuthoritativePublication(pedido, authority.pedidoId)
  )
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

export const PEDIDO_PUBLICATION = Object.freeze({
  origin: PUBLICATION_ORIGIN,
  version: PUBLICATION_VERSION,
})
