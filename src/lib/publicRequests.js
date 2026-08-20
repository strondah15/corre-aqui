const GRID_SCALE = 100

const asText = (value, max) => String(value || '').trim().slice(0, max)

export function sanitizePublicRequestText(value, max = 500) {
  return asText(value, max)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[contato removido]')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '[link removido]')
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}/g, '[telefone removido]')
    .replace(/-?\d{1,2}\.\d{4,}\s*[,;/]\s*-?\d{1,3}\.\d{4,}/g, '[local removido]')
}

export function toPublicRequestGrid(local) {
  const lat = Number(local?.lat ?? local?.latitude)
  const lng = Number(local?.lng ?? local?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {}
  return {
    gridLat: Math.round(lat * GRID_SCALE),
    gridLng: Math.round(lng * GRID_SCALE),
  }
}

export function fromPublicRequestGrid(request) {
  const gridLat = Number(request?.gridLat)
  const gridLng = Number(request?.gridLng)
  if (!Number.isInteger(gridLat) || !Number.isInteger(gridLng)) return null
  return { lat: gridLat / GRID_SCALE, lng: gridLng / GRID_SCALE, approximate: true }
}

const compactActor = (actor) => {
  const id = asText(actor?.id || actor?.uid, 128)
  if (!id) return null
  return { id, nome: asText(actor?.nome || actor?.displayName || 'Usuário', 80) }
}

export function buildPublicRequest(privateRequest = {}) {
  const criador = compactActor(privateRequest.criador)
  if (!criador) throw new Error('Pedido público sem criador válido.')

  const publicRequest = {
    id: asText(privateRequest.id, 128),
    titulo: sanitizePublicRequestText(privateRequest.titulo || privateRequest.texto || 'Pedido', 100),
    descricao: sanitizePublicRequestText(privateRequest.descricao || privateRequest.texto || '', 500),
    tipo: asText(privateRequest.tipo || 'outro', 80).toLowerCase(),
    status: asText(privateRequest.status || 'aberto', 40).toLowerCase(),
    criador,
  }

  const optionalText = ['modoPedido', 'categoriaId', 'categoriaLabel', 'urgencia', 'prioridade']
  for (const key of optionalText) {
    if (privateRequest[key] != null && String(privateRequest[key]).trim()) publicRequest[key] = asText(privateRequest[key], 100)
  }
  for (const key of ['valor', 'criadoEm', 'atualizadoEm', 'aceitoEm', 'finalizadoEm', 'concluidoEm']) {
    if (privateRequest[key] != null) publicRequest[key] = privateRequest[key]
  }
  for (const key of ['emergencia', 'destaque']) {
    if (typeof privateRequest[key] === 'boolean') publicRequest[key] = privateRequest[key]
  }

  Object.assign(publicRequest, toPublicRequestGrid(privateRequest.local))
  const aceite = compactActor(privateRequest.aceite)
  if (aceite) publicRequest.aceite = { ...aceite, ...(privateRequest.aceite?.aceitoEm != null ? { aceitoEm: privateRequest.aceite.aceitoEm } : {}) }
  return publicRequest
}

export function normalizePublicRequest(id, request = {}) {
  return { id, ...request, local: fromPublicRequestGrid(request), publicDiscovery: true }
}
