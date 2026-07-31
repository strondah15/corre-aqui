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

const asCoordinate = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const normalizeLocation = (value) => {
  const lat = asCoordinate(value?.lat ?? value?.latitude)
  const lng = asCoordinate(value?.lng ?? value?.longitude)
  return lat === null || lng === null ? null : { lat, lng }
}

const distanceKmBetween = (from, to) => {
  const origin = normalizeLocation(from)
  const destination = normalizeLocation(to)
  if (!origin || !destination) return null

  const radians = (degrees) => (degrees * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = radians(destination.lat - origin.lat)
  const dLng = radians(destination.lng - origin.lng)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(origin.lat))
    * Math.cos(radians(destination.lat))
    * Math.sin(dLng / 2) ** 2

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const stableHash = (value) => {
  let hash = 2166136261
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const providerCategories = (provider) => Array.from(new Set([
  ...(Array.isArray(provider?.profCategorias) ? provider.profCategorias : []),
  ...(Array.isArray(provider?.correCategorias) ? provider.correCategorias : []),
].map(safeText).filter(Boolean)))

const hasActivePortfolioService = (provider) => {
  const portfolio = Array.isArray(provider?.portfolio)
    ? provider.portfolio
    : provider?.portfolio && typeof provider.portfolio === 'object'
      ? Object.values(provider.portfolio)
      : []

  return portfolio.some((service) => service && service.ativo !== false && service.active !== false)
}

const entitlementIsCurrent = (entitlement, now) => {
  if (!entitlement || entitlement.verifiedByServer !== true) return false
  if (entitlement.active !== true || entitlement.profileReleased !== true) return false
  if (entitlement.accountSuspended === true) return false
  if (safeText(entitlement.status).toLowerCase() !== 'active') return false

  const startsAt = asTimestamp(entitlement.startsAt)
  const expiresAt = asTimestamp(entitlement.expiresAt)
  if (startsAt && startsAt > now) return false
  if (!expiresAt || expiresAt <= now) return false
  return true
}

const isInsideApplicableArea = ({ provider, entitlement, viewerLocation, viewerRegion, distanceKm }) => {
  const radiusKm = Number(entitlement?.radiusKm)
  if (Number.isFinite(radiusKm) && radiusKm > 0) {
    return Number.isFinite(distanceKm) && distanceKm <= radiusKm
  }

  const allowedRegions = Array.isArray(entitlement?.regions)
    ? entitlement.regions.map(normalizeText).filter(Boolean)
    : []
  const normalizedViewerRegion = normalizeText(viewerRegion)
  if (allowedRegions.length) {
    return !!normalizedViewerRegion && allowedRegions.some((region) => (
      normalizedViewerRegion.includes(region) || region.includes(normalizedViewerRegion)
    ))
  }

  const providerRegion = normalizeText(
    provider?.profCidadeAtende || provider?.correRegiao || provider?.regiao
  )
  if (normalizedViewerRegion && providerRegion) {
    return normalizedViewerRegion.includes(providerRegion) || providerRegion.includes(normalizedViewerRegion)
  }

  return !viewerLocation || !provider?.local
}

const profileCompletenessScore = (provider) => {
  const checks = [
    safeText(provider?.nome),
    safeText(provider?.fotoURL) || safeText(provider?.avatarEmoji),
    providerCategories(provider).length,
    safeText(provider?.profResumo || provider?.correResumo || provider?.correTitulo),
    safeText(provider?.profCidadeAtende || provider?.correRegiao || provider?.regiao),
    hasActivePortfolioService(provider),
  ]
  return checks.filter(Boolean).length
}

const categoryMatchesSelection = (provider, categoryId) => {
  if (!categoryId) return true
  const categories = providerCategories(provider)
  if (!categories.length && provider?.isCorre && categoryId === 'servicos_gerais') return true
  return categories.some((category) => categoryMatches(category, categoryId))
}

export function getEligibleFeaturedProfessionals({
  providers = [],
  entitlements = [],
  categoryId = '',
  viewerLocation = null,
  viewerRegion = '',
  now = Date.now(),
  debug = false,
} = {}) {
  const exclusions = {
    noEntitlement: 0,
    hiddenProfile: 0,
    noOffering: 0,
    regionMismatch: 0,
  }
  const entitlementByUid = new Map(
    (Array.isArray(entitlements) ? entitlements : [])
      .filter((entitlement) => entitlementIsCurrent(entitlement, now))
      .map((entitlement) => [safeText(entitlement.uid), entitlement])
      .filter(([uid]) => uid)
  )

  const eligible = (Array.isArray(providers) ? providers : []).flatMap((provider) => {
    const uid = safeText(provider?.uid || provider?.id)
    const entitlement = entitlementByUid.get(uid)
    if (!uid || !entitlement) {
      exclusions.noEntitlement += 1
      return []
    }
    if (
      !safeText(provider?.nome)
      || provider?.profileVisible === false
      || (!provider?.isCorre && !provider?.isProfissional)
    ) {
      exclusions.hiddenProfile += 1
      return []
    }

    const categories = providerCategories(provider)
    if (!categories.length && !hasActivePortfolioService(provider)) {
      exclusions.noOffering += 1
      return []
    }

    const distanceKm = distanceKmBetween(viewerLocation, provider?.local)
    if (!isInsideApplicableArea({ provider, entitlement, viewerLocation, viewerRegion, distanceKm })) {
      exclusions.regionMismatch += 1
      return []
    }

    return [{
      ...provider,
      featuredEntitlement: entitlement,
      featuredDistanceKm: distanceKm,
      featuredCategoryMatch: categoryMatchesSelection(provider, categoryId),
      featuredCompleteness: profileCompletenessScore(provider),
    }]
  })

  if (debug && typeof console !== 'undefined') {
    if (exclusions.regionMismatch > 0) {
      console.info('[FEATURED] excluído: região incompatível', {
        count: exclusions.regionMismatch,
      })
    }
    console.info('[FEATURED] perfis elegíveis', {
      count: eligible.length,
      exclusions,
    })
  }

  return eligible
}

export function selectFeaturedProfessionals({
  professionals = [],
  limit = 12,
  now = Date.now(),
  debug = false,
} = {}) {
  const safeLimit = Math.max(0, Math.min(12, Number(limit) || 0))
  if (!safeLimit) return []

  const rotationBucket = Math.floor(now / (6 * 60 * 60 * 1000))
  const selected = [...(Array.isArray(professionals) ? professionals : [])]
    .map((provider) => {
      const distance = Number(provider?.featuredDistanceKm)
      const proximityScore = Number.isFinite(distance) ? Math.max(0, 18 - Math.min(distance, 18)) : 0
      const availabilityScore = provider?.online === true ? 12 : 0
      const categoryScore = provider?.featuredCategoryMatch === true ? 20 : 0
      const completenessScore = Math.min(12, Number(provider?.featuredCompleteness || 0) * 2)
      const lastShownAt = asTimestamp(provider?.featuredEntitlement?.lastShownAt)
      const hoursSinceLastShown = lastShownAt ? Math.max(0, (now - lastShownAt) / 3_600_000) : 168
      const exposureScore = Math.min(18, hoursSinceLastShown / 12)
      const rotationScore = stableHash(`${provider?.uid}:${rotationBucket}`) % 25

      return {
        provider,
        score: proximityScore + availabilityScore + categoryScore + completenessScore + exposureScore + rotationScore,
        rotationScore,
      }
    })
    .sort((left, right) => (
      right.score - left.score
      || right.rotationScore - left.rotationScore
      || safeText(left.provider?.uid).localeCompare(safeText(right.provider?.uid))
    ))
    .slice(0, safeLimit)
    .map(({ provider }) => provider)

  if (debug && typeof console !== 'undefined') {
    console.info('[FEATURED] resultado final', {
      count: selected.length,
    })
  }

  return selected
}

export function getFeaturedProfessionLabel(provider) {
  const categoryId = providerCategories(provider)[0]
  const category = getCategoryById(categoryId)
  if (category?.label) return category.label

  return safeText(
    provider?.profissional?.titulo
      || provider?.profTitulo
      || provider?.correTitulo
      || provider?.profResumo
      || provider?.correResumo
  )
}

export function formatFeaturedDistance(distanceKm) {
  const distance = Number(distanceKm)
  if (!Number.isFinite(distance) || distance < 0) return null
  if (distance < 1) return `${Math.max(50, Math.round(distance * 1000 / 50) * 50)} m`
  return `${distance.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}
