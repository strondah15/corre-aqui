const PUBLICATION_ORIGIN = 'backend_public_projection'
const PUBLICATION_VERSION = 1

const exists = (value) => value !== null && value !== undefined
const text = (value, max = 128) => String(value || '').trim().slice(0, max)

export function isSafePedidoId(value) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(String(value || '').trim())
}

export function publicationMarkerState(privatePedido, pedidoId) {
  const marker = privatePedido?.publicacao
  const creatorId = text(privatePedido?.criador?.id || privatePedido?.criador?.uid)
  const markerExists = !!marker && typeof marker === 'object' && !Array.isArray(marker)
  const markerValid = Boolean(
    markerExists &&
    creatorId &&
    text(marker.pedidoId) === text(pedidoId) &&
    text(marker.criadorId) === creatorId &&
    marker.origem === PUBLICATION_ORIGIN &&
    Number(marker.versao) === PUBLICATION_VERSION
  )

  return { markerExists, markerValid }
}

export function classifyPublicRequestState({ pedidoId, publicRequest, privatePedido } = {}) {
  const publicExists = exists(publicRequest)
  const privateExists = exists(privatePedido)
  const { markerExists, markerValid } = publicationMarkerState(privatePedido, pedidoId)

  let classification = 'ABSENT'
  if (publicExists && !privateExists) classification = 'ORPHAN_PUBLIC'
  else if (!publicExists && privateExists) classification = 'UNPUBLISHED_PRIVATE'
  else if (publicExists && privateExists && markerValid) classification = 'HEALTHY'
  else if (publicExists && privateExists) classification = 'INVALID_MARKER'

  return {
    pedidoId: text(pedidoId),
    classification,
    publicStatus: publicExists ? text(publicRequest?.status, 40) : '',
    privateExists,
    publicExists,
    publicationMarkerExists: markerExists,
    publicationMarkerValid: markerValid,
  }
}

export function classifyPublicRequestRoots({ publicRequests = {}, pedidos = {} } = {}) {
  const ids = [...new Set([...Object.keys(publicRequests || {}), ...Object.keys(pedidos || {})])]
    .filter(isSafePedidoId)
    .sort()

  return ids.map((pedidoId) => classifyPublicRequestState({
    pedidoId,
    publicRequest: publicRequests?.[pedidoId],
    privatePedido: pedidos?.[pedidoId],
  }))
}

export function summarizeClassifications(rows = []) {
  const counts = {
    HEALTHY: 0,
    ORPHAN_PUBLIC: 0,
    UNPUBLISHED_PRIVATE: 0,
    INVALID_MARKER: 0,
  }
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.classification)) counts[row.classification] += 1
  }
  return counts
}
