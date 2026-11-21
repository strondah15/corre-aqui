import {
  PROFESSIONAL_SERVICE_LEGACY_DEFAULT_ID,
  PROFESSIONAL_SERVICE_LIMITS,
  getProfessionalServicePhotoUrls,
  isSafeProfessionalServicePhotoUrl,
  normalizeProfessionalService,
  validateProfessionalService,
} from './professionalServiceModel.js'

export const PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION = 2
export const PUBLIC_PROFESSIONAL_SERVICE_CATALOG_MAX_UIDS = 60
const SERVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/
const FIREBASE_PATH_SEGMENT_PATTERN = /^[^.#$\[\]/\u0000-\u001f\u007f]{1,128}$/

export class ProfessionalServiceCatalogError extends Error {
  constructor(code, status = 409) {
    super(code)
    this.name = 'ProfessionalServiceCatalogError'
    this.code = code
    this.status = status
  }
}

function normalizeProfessionalServiceUid(value) {
  const uid = String(value || '').trim()
  return FIREBASE_PATH_SEGMENT_PATTERN.test(uid) ? uid : ''
}

function normalizeProfessionalServiceId(value) {
  const serviceId = String(value || '').trim()
  return SERVICE_ID_PATTERN.test(serviceId) ? serviceId : ''
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function safeText(value, maxLength = 2_000) {
  return String(value || '').trim().slice(0, maxLength)
}

function firstText(...values) {
  return values.map((value) => safeText(value)).find(Boolean) || ''
}

function firstArrayValue(value) {
  if (Array.isArray(value)) return value.find(Boolean)
  if (isRecord(value)) return Object.values(value).find(Boolean)
  return value
}

function asPositiveInteger(value, fallback = 1) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}

function asTimestamp(value, fallback = 0) {
  const number = Number(value)
  if (Number.isSafeInteger(number) && number > 0) return number
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function stableLegacyHash(value) {
  let hash = 2166136261
  const text = JSON.stringify(value)
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function normalizeLegacyCollection(value) {
  if (Array.isArray(value)) return value.map((item, index) => [`array_${index}`, item])
  if (isRecord(value)) return Object.entries(value)
  return []
}

function profileCategory(profile = {}) {
  const categoryId = firstText(
    profile.primaryCategoryId,
    profile.categoriaId,
    firstArrayValue(profile.profCategorias),
    firstArrayValue(profile.correCategorias),
    'servicos_gerais',
  )
  return {
    id: /^[a-z0-9_]{1,64}$/.test(categoryId) ? categoryId : 'servicos_gerais',
    name: firstText(profile.categoriaNome, profile.profissaoNome, profile.professionName, 'Serviços gerais'),
  }
}

function publicServiceShape(service, { professionalId, source, sourceSchemaVersion }) {
  const photos = getProfessionalServicePhotoUrls(service)
    .filter(isSafeProfessionalServicePhotoUrl)
    .slice(0, PROFESSIONAL_SERVICE_LIMITS.maxPhotos)
  return {
    id: service.id,
    serviceId: service.id,
    schemaVersion: Number(service.schemaVersion) || sourceSchemaVersion,
    sourceSchemaVersion,
    source,
    profissionalId: professionalId,
    professionalId,
    nome: service.nome,
    titulo: service.nome,
    descricao: service.descricao,
    categoriaId: service.categoriaId,
    categoriaNome: service.categoriaNome,
    categoria: service.categoriaNome,
    faixaPreco: service.faixaPreco,
    preco: service.faixaPreco,
    valor: service.faixaPreco,
    tempoMedio: service.tempoMedio,
    regiao: service.regiao,
    atendeDomicilio: service.atendeDomicilio === true,
    urgente: service.urgente === true,
    ativo: service.ativo === true,
    fotos: photos,
    fotoURL: photos[0] || '',
    createdAt: asTimestamp(service.createdAt),
    updatedAt: asTimestamp(service.updatedAt),
    revision: asPositiveInteger(service.revision),
  }
}

function normalizeCanonicalService(value, serviceId, professionalId, now) {
  if (!isRecord(value)) return null
  const service = normalizeProfessionalService(value, { serviceId })
  const validation = validateProfessionalService(service, { serviceId, now })
  if (!validation.ok || service.ativo !== true) return null
  return publicServiceShape(service, {
    professionalId,
    source: 'canonical',
    sourceSchemaVersion: PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION,
  })
}

function legacyServiceId(item, key, professionalId) {
  const candidate = normalizeProfessionalServiceId(firstText(item?.id, item?.serviceId, item?.key, key))
  if (candidate) return candidate
  return `legacy_${stableLegacyHash({ professionalId, key, item })}`.slice(0, 120)
}

function normalizeLegacyService(item, { key, professionalId, profile, index }) {
  if (!isRecord(item) || item.ativo === false || item.active === false) return null
  const nome = firstText(item.nome, item.titulo, item.title)
  if (!nome) return null
  const category = profileCategory(profile)
  const fotos = [
    ...getProfessionalServicePhotoUrls(item),
    item.fotoURL,
    item.photoURL,
    item.imageURL,
    item.imagemURL,
  ].map((value) => safeText(value, PROFESSIONAL_SERVICE_LIMITS.maxPhotoUrlLength))
    .filter(isSafeProfessionalServicePhotoUrl)
  const uniquePhotos = Array.from(new Set(fotos)).slice(0, PROFESSIONAL_SERVICE_LIMITS.maxPhotos)
  const createdAt = asTimestamp(item.createdAt || item.criadoEm)
  const updatedAt = asTimestamp(item.updatedAt || item.atualizadoEm, createdAt)
  const id = legacyServiceId(item, key || `legacy_${index}`, professionalId)
  return {
    id,
    serviceId: id,
    schemaVersion: 1,
    sourceSchemaVersion: 1,
    source: 'legacy',
    profissionalId: professionalId,
    professionalId,
    nome,
    titulo: nome,
    descricao: firstText(item.descricao, item.description).slice(0, PROFESSIONAL_SERVICE_LIMITS.maxDescriptionLength),
    categoriaId: firstText(item.categoriaId, item.categoryId, category.id).slice(0, PROFESSIONAL_SERVICE_LIMITS.maxCategoryIdLength),
    categoriaNome: firstText(item.categoriaNome, item.categoryName, item.categoria, item.category, category.name)
      .slice(0, PROFESSIONAL_SERVICE_LIMITS.maxCategoryNameLength),
    categoria: firstText(item.categoriaNome, item.categoryName, item.categoria, item.category, category.name)
      .slice(0, PROFESSIONAL_SERVICE_LIMITS.maxCategoryNameLength),
    faixaPreco: firstText(item.faixaPreco, item.valor, item.preco, item.priceRange, item.price, 'A combinar')
      .slice(0, PROFESSIONAL_SERVICE_LIMITS.maxPriceLength),
    preco: firstText(item.faixaPreco, item.valor, item.preco, item.priceRange, item.price, 'A combinar')
      .slice(0, PROFESSIONAL_SERVICE_LIMITS.maxPriceLength),
    valor: firstText(item.faixaPreco, item.valor, item.preco, item.priceRange, item.price, 'A combinar')
      .slice(0, PROFESSIONAL_SERVICE_LIMITS.maxPriceLength),
    tempoMedio: firstText(item.tempoMedio, item.tempo, item.duration).slice(0, PROFESSIONAL_SERVICE_LIMITS.maxDurationLength),
    regiao: firstText(item.regiao, item.regiaoAtendimento, item.region, profile.profCidadeAtende, profile.correRegiao, profile.cidade)
      .slice(0, PROFESSIONAL_SERVICE_LIMITS.maxRegionLength),
    atendeDomicilio: item.atendeDomicilio ?? item.domicilio ?? true,
    urgente: item.urgente === true || item.urgent === true,
    ativo: true,
    fotos: uniquePhotos,
    fotoURL: uniquePhotos[0] || '',
    createdAt,
    updatedAt,
    revision: asPositiveInteger(item.revision),
  }
}

function legacyProfileDefault(profile, professionalId) {
  if (!isRecord(profile) || profile.profileVisible === false || profile.visivel === false) return null
  if (profile.isProfissional !== true && profile.isCorre !== true) return null
  const nome = firstText(
    profile.profTitulo,
    profile.professionName,
    profile.profissaoNome,
    profile.correTitulo,
  )
  if (!nome) return null
  const category = profileCategory(profile)
  return normalizeLegacyService({
    id: PROFESSIONAL_SERVICE_LEGACY_DEFAULT_ID,
    nome,
    descricao: firstText(profile.profResumo, profile.correResumo, profile.bio),
    categoriaId: category.id,
    categoriaNome: category.name,
    faixaPreco: firstText(profile.profPrecoBase, 'A combinar'),
    regiao: firstText(profile.profCidadeAtende, profile.correRegiao, profile.regiao, profile.cidade),
    ativo: true,
  }, {
    key: PROFESSIONAL_SERVICE_LEGACY_DEFAULT_ID,
    professionalId,
    profile,
    index: 0,
  })
}

function dedupeServices(services) {
  const byId = new Map()
  services.filter(Boolean).forEach((service) => {
    const current = byId.get(service.id)
    if (!current || service.updatedAt >= current.updatedAt) byId.set(service.id, service)
  })
  return Array.from(byId.values())
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
    .slice(0, PROFESSIONAL_SERVICE_LIMITS.maxServicesPerProfessional)
}

function schemaVersionFrom(...values) {
  return values.some((value) => Number(value) === PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION)
    ? PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION
    : 1
}

async function loadPortfolioState(database, professionalId, now = Date.now()) {
  if (!database || typeof database.ref !== 'function') {
    throw new ProfessionalServiceCatalogError('professional_service_database_unavailable', 503)
  }
  const uid = normalizeProfessionalServiceUid(professionalId)
  if (!uid) throw new ProfessionalServiceCatalogError('professional_service_request_invalid', 400)

  const [markerSnapshot, profileSnapshot, canonicalSnapshot] = await Promise.all([
    database.ref(`users/${uid}/portfolioSchemaVersion`).get(),
    database.ref(`publicProfiles/${uid}`).get(),
    database.ref(`professionalServices/${uid}`).get(),
  ])
  const profile = profileSnapshot.val() || {}
  const canonicalRaw = canonicalSnapshot.val()
  const schemaVersion = schemaVersionFrom(markerSnapshot.val(), profile.portfolioSchemaVersion)

  if (schemaVersion === PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION) {
    const services = Object.entries(isRecord(canonicalRaw) ? canonicalRaw : {})
      .map(([serviceId, value]) => normalizeCanonicalService(value, serviceId, uid, now))
      .filter(Boolean)
      .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
    return {
      professionalId: uid,
      portfolioSchemaVersion: PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION,
      source: 'canonical',
      services,
      profile,
    }
  }

  const legacyPublicSnapshot = await database.ref(`publicPortfolio/${uid}`).get()
  const legacyCollections = [
    legacyPublicSnapshot.val(),
    profile.portfolio,
    profile.profPortfolio,
    profile.profissional?.portfolio,
    profile.profissional?.profPortfolio,
  ]
  let index = 0
  const services = dedupeServices(legacyCollections.flatMap((collection) => (
    normalizeLegacyCollection(collection).map(([key, item]) => {
      const service = normalizeLegacyService(item, { key, professionalId: uid, profile, index })
      index += 1
      return service
    })
  )))
  return {
    professionalId: uid,
    portfolioSchemaVersion: 1,
    source: services.length ? 'legacy' : 'none',
    services,
    profile,
  }
}

export async function listPublicProfessionalServices({ database, professionalId, now = Date.now() }) {
  const state = await loadPortfolioState(database, professionalId, now)
  return {
    professionalId: state.professionalId,
    portfolioSchemaVersion: state.portfolioSchemaVersion,
    source: state.source,
    services: state.services,
  }
}

export async function listPublicProfessionalServiceCatalog({ database, professionalIds, now = Date.now() }) {
  const rawIds = Array.isArray(professionalIds) ? professionalIds : []
  const normalizedIds = rawIds.map(normalizeProfessionalServiceUid)
  if (normalizedIds.some((uid) => !uid)) {
    throw new ProfessionalServiceCatalogError('professional_service_catalog_request_invalid', 400)
  }
  const ids = Array.from(new Set(normalizedIds))
  if (!ids.length || ids.length > PUBLIC_PROFESSIONAL_SERVICE_CATALOG_MAX_UIDS) {
    throw new ProfessionalServiceCatalogError('professional_service_catalog_request_invalid', 400)
  }
  const entries = await Promise.all(ids.map(async (professionalId) => [
    professionalId,
    await listPublicProfessionalServices({ database, professionalId, now }),
  ]))
  return Object.fromEntries(entries)
}

export async function resolveAuthoritativeProfessionalService({
  database,
  professionalId,
  serviceId,
  now = Date.now(),
}) {
  const uid = normalizeProfessionalServiceUid(professionalId)
  const id = normalizeProfessionalServiceId(serviceId)
  if (!uid || !id) throw new ProfessionalServiceCatalogError('professional_service_request_invalid', 400)
  const state = await loadPortfolioState(database, uid, now)
  const service = state.services.find((item) => item.id === id)
  if (service) return service

  if (
    state.portfolioSchemaVersion !== PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION
    && id === PROFESSIONAL_SERVICE_LEGACY_DEFAULT_ID
  ) {
    const fallback = legacyProfileDefault(state.profile, uid)
    if (fallback) return fallback
  }
  throw new ProfessionalServiceCatalogError('professional_service_not_found', 404)
}

export function buildProfessionalServiceContractSnapshot(service, { professionalId, capturedAt = Date.now() } = {}) {
  const uid = normalizeProfessionalServiceUid(professionalId || service?.professionalId || service?.profissionalId)
  const id = normalizeProfessionalServiceId(service?.serviceId || service?.id)
  const now = Number(capturedAt)
  if (!uid || !id || !Number.isSafeInteger(now) || now <= 0 || service?.ativo !== true) {
    throw new ProfessionalServiceCatalogError('professional_service_snapshot_invalid', 500)
  }
  const photos = (Array.isArray(service.fotos) ? service.fotos : [])
    .filter(isSafeProfessionalServicePhotoUrl)
    .slice(0, PROFESSIONAL_SERVICE_LIMITS.maxPhotos)
  return {
    snapshotVersion: 1,
    sourceSchemaVersion: Number(service.sourceSchemaVersion || service.schemaVersion || 1),
    sourceRevision: asPositiveInteger(service.revision),
    source: safeText(service.source, 32) || 'canonical',
    capturedAt: now,
    professionalId: uid,
    profissionalId: uid,
    serviceId: id,
    id,
    nome: safeText(service.nome, PROFESSIONAL_SERVICE_LIMITS.maxNameLength),
    titulo: safeText(service.nome || service.titulo, PROFESSIONAL_SERVICE_LIMITS.maxNameLength),
    descricao: safeText(service.descricao, PROFESSIONAL_SERVICE_LIMITS.maxDescriptionLength),
    categoriaId: safeText(service.categoriaId, PROFESSIONAL_SERVICE_LIMITS.maxCategoryIdLength),
    categoriaNome: safeText(service.categoriaNome, PROFESSIONAL_SERVICE_LIMITS.maxCategoryNameLength),
    faixaPreco: safeText(service.faixaPreco || service.valor, PROFESSIONAL_SERVICE_LIMITS.maxPriceLength),
    valor: safeText(service.faixaPreco || service.valor, PROFESSIONAL_SERVICE_LIMITS.maxPriceLength),
    tempoMedio: safeText(service.tempoMedio, PROFESSIONAL_SERVICE_LIMITS.maxDurationLength),
    regiao: safeText(service.regiao, PROFESSIONAL_SERVICE_LIMITS.maxRegionLength),
    atendeDomicilio: service.atendeDomicilio === true,
    urgente: service.urgente === true,
    fotos: photos,
    fotoURL: photos[0] || '',
  }
}

export async function ensureProfessionalPortfolioSchemaV2({ database, uid }) {
  if (!database || typeof database.ref !== 'function') {
    throw new ProfessionalServiceCatalogError('professional_service_database_unavailable', 503)
  }
  const professionalId = normalizeProfessionalServiceUid(uid)
  if (!professionalId) throw new ProfessionalServiceCatalogError('professional_service_uid_invalid', 400)
  const [userSnapshot, profileSnapshot] = await Promise.all([
    database.ref(`users/${professionalId}`).get(),
    database.ref(`publicProfiles/${professionalId}`).get(),
  ])
  if (!userSnapshot.exists()) {
    throw new ProfessionalServiceCatalogError('professional_service_owner_not_found', 409)
  }
  const updates = {}
  if (Number(userSnapshot.val()?.portfolioSchemaVersion) !== PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION) {
    updates[`users/${professionalId}/portfolioSchemaVersion`] = PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION
  }
  if (
    profileSnapshot.exists()
    && Number(profileSnapshot.val()?.portfolioSchemaVersion) !== PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION
  ) {
    updates[`publicProfiles/${professionalId}/portfolioSchemaVersion`] = PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION
  }
  if (Object.keys(updates).length) await database.ref().update(updates)
  return { portfolioSchemaVersion: PROFESSIONAL_PORTFOLIO_SCHEMA_VERSION }
}
