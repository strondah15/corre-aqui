import { categoryMatches, getCategoryById } from '@/constants/categories'

const safeText = (value) => String(value || '').trim()

const normalizeText = (value) => safeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

const asTimestamp = (value) => {
  if (!value) return 0
  if (typeof value === 'object' && Number.isFinite(Number(value.seconds))) {
    return Number(value.seconds) * 1000
  }
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeStatus = (value) => safeText(value || 'aberto').toLowerCase()

export function formatFeaturedRequestValue(value) {
  if (value == null || value === '') return 'Combinar'
  const numeric = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Combinar'
  return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatFeaturedRequestAge(value, now = Date.now()) {
  const timestamp = asTimestamp(value)
  if (!timestamp) return 'Agora'
  const diff = Math.max(0, now - timestamp)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Agora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  return `${Math.floor(hours / 24)} d`
}

export function normalizeFeaturedRequest(pedido = {}, entitlement = {}, { testMode = false } = {}) {
  const id = safeText(pedido?.id || entitlement?.pedidoId)
  const categoryId = safeText(pedido?.categoriaId || pedido?.categoria || entitlement?.categoryId)
  const category = getCategoryById(categoryId)

  return {
    id,
    pedidoId: id,
    titulo: safeText(pedido?.titulo || 'Pedido em destaque'),
    categoriaId,
    categoriaNome: safeText(pedido?.categoriaNome || pedido?.categoriaLabel || category?.label || categoryId || 'Pedido'),
    categoriaEmoji: category?.emoji || '⚡',
    valor: pedido?.valor ?? null,
    criadoEm: pedido?.criadoEm || pedido?.createdAt || pedido?.atualizadoEm || null,
    status: normalizeStatus(pedido?.status),
    urgencia: pedido?.urgente === true || pedido?.urgencia === true,
    distancia: pedido?.distancia || pedido?.distanciaKm || null,
    boostedUntil: entitlement?.expiresAt || null,
    testMode: testMode || entitlement?.testMode === true,
    criadorId: safeText(pedido?.criador?.id || pedido?.criadorUid || pedido?.clienteId || entitlement?.ownerUid),
  }
}

export function requestMatchesCategory(request, categoryId) {
  const filter = safeText(categoryId)
  if (!filter || filter === 'todas' || filter === 'sem') return true
  return categoryMatches(request?.categoriaId || request?.categoriaNome, filter)
}

export function requestMatchesRegion(request, regionKeys = []) {
  const allowed = (Array.isArray(regionKeys) ? regionKeys : []).map(normalizeText).filter(Boolean)
  if (!allowed.length) return true
  const candidates = [
    request?.regiao,
    request?.cidade,
    request?.bairro,
    request?.local?.cidade,
    request?.local?.bairro,
    request?.endereco?.cidade,
    request?.endereco?.bairro,
  ].map(normalizeText).filter(Boolean)
  if (!candidates.length) return true
  return candidates.some((candidate) => allowed.some((allowedRegion) => (
    candidate.includes(allowedRegion) || allowedRegion.includes(candidate)
  )))
}

export function hasFeaturedRequestBoost(pedido, now = Date.now()) {
  const entitlement = pedido?.featuredBoost || pedido?.featuredRequestEntitlement
  const expiresAt = asTimestamp(entitlement?.expiresAt || pedido?.boost?.until)
  return !!expiresAt && expiresAt > now && (entitlement?.active === true || pedido?.boost?.active === true)
}
