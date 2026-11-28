export const PROFESSIONAL_SERVICE_SCHEMA_VERSION = 2
export const PROFESSIONAL_SERVICE_LEGACY_DEFAULT_ID = 'legacy_profile_default'

export const PROFESSIONAL_SERVICE_LIMITS = Object.freeze({
  maxServicesPerProfessional: 12,
  maxPhotos: 5,
  maxIdLength: 120,
  maxNameLength: 140,
  maxCategoryIdLength: 64,
  maxCategoryNameLength: 120,
  maxPriceLength: 120,
  maxDescriptionLength: 2_000,
  maxDurationLength: 120,
  maxRegionLength: 160,
  maxPhotoUrlLength: 2_048,
  maxTimestamp: 4_102_444_800_000,
  maxFutureSkewMs: 5 * 60 * 1_000,
})

export const PROFESSIONAL_SERVICE_SCHEMA = Object.freeze({
  version: PROFESSIONAL_SERVICE_SCHEMA_VERSION,
  path: 'professionalServices/{uid}/{serviceId}',
  fields: Object.freeze({
    schemaVersion: 'integer',
    id: 'string',
    nome: 'string',
    descricao: 'string',
    categoriaId: 'string',
    categoriaNome: 'string',
    faixaPreco: 'string',
    tempoMedio: 'string',
    regiao: 'string',
    atendeDomicilio: 'boolean',
    urgente: 'boolean',
    ativo: 'boolean',
    fotos: 'indexed_https_url_map',
    createdAt: 'timestamp_ms',
    updatedAt: 'timestamp_ms',
    revision: 'positive_integer',
  }),
})

const CANONICAL_FIELDS = new Set(Object.keys(PROFESSIONAL_SERVICE_SCHEMA.fields))
const SERVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/
const CATEGORY_ID_PATTERN = /^[a-z0-9_]{1,64}$/
const PHOTO_INDEX_PATTERN = /^(0|[1-4])$/

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null)
}

function firstText(...values) {
  return values
    .map((value) => (
      typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : ''
    ))
    .find(Boolean) || ''
}

function normalizeBoolean(value, fallback) {
  return value === undefined || value === null ? fallback : value
}

function normalizeRevision(value, fallback) {
  const candidate = value === undefined || value === null || value === '' ? fallback : value
  const numeric = Number(candidate)
  return Number.isFinite(numeric) ? numeric : candidate
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === '') return null

  if (isRecord(value) && Number.isFinite(Number(value.seconds))) {
    const milliseconds = (Number(value.seconds) * 1_000) + Math.floor(Number(value.nanoseconds || 0) / 1_000_000)
    return Number.isSafeInteger(milliseconds) ? milliseconds : null
  }

  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1_000 : numeric
    return Number.isSafeInteger(milliseconds) ? milliseconds : null
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
  }

  return null
}

function photoValue(value) {
  if (typeof value === 'string') return value.trim()
  if (!isRecord(value)) return ''
  return firstText(value.url, value.fotoURL, value.photoURL, value.imageURL, value.imagemURL)
}

function photoCollectionValues(value) {
  if (Array.isArray(value)) return value.map(photoValue)
  if (!isRecord(value)) return []

  return Object.entries(value)
    .sort(([left], [right]) => {
      const leftNumber = Number(left)
      const rightNumber = Number(right)
      if (Number.isInteger(leftNumber) && Number.isInteger(rightNumber)) return leftNumber - rightNumber
      return left.localeCompare(right)
    })
    .map(([, entry]) => photoValue(entry))
}

export function normalizeProfessionalServicePhotos(input = {}) {
  const source = isRecord(input) ? input : {}
  const candidates = [
    ...photoCollectionValues(source.fotos),
    ...photoCollectionValues(source.photos),
    ...photoCollectionValues(source.imagens),
    photoValue(source.fotoURL),
    photoValue(source.photoURL),
    photoValue(source.imageURL),
    photoValue(source.imagemURL),
  ]
  const unique = Array.from(new Set(candidates.filter(Boolean)))

  return Object.fromEntries(unique.map((url, index) => [String(index), url]))
}

export function getProfessionalServicePhotoUrls(service = {}) {
  const photos = isRecord(service?.fotos) || Array.isArray(service?.fotos)
    ? service.fotos
    : normalizeProfessionalServicePhotos(service)

  return photoCollectionValues(photos).filter(Boolean)
}

export function isSafeProfessionalServicePhotoUrl(value) {
  if (typeof value !== 'string') return false
  const url = value.trim()
  if (!url || url.length > PROFESSIONAL_SERVICE_LIMITS.maxPhotoUrlLength || /\s/.test(url)) return false

  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
    const ipv4Parts = hostname.split('.').map(Number)
    const isIpv4 = ipv4Parts.length === 4 && ipv4Parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    const isPrivateIpv4 = isIpv4 && (
      ipv4Parts[0] === 10
      || (ipv4Parts[0] === 127)
      || (ipv4Parts[0] === 169 && ipv4Parts[1] === 254)
      || (ipv4Parts[0] === 172 && ipv4Parts[1] >= 16 && ipv4Parts[1] <= 31)
      || (ipv4Parts[0] === 192 && ipv4Parts[1] === 168)
      || ipv4Parts.every((part) => part === 0)
    )

    return parsed.protocol === 'https:'
      && Boolean(parsed.hostname)
      && !parsed.port
      && !parsed.username
      && !parsed.password
      && /^[a-z0-9.-]+$/i.test(hostname)
      && hostname !== 'localhost'
      && hostname !== 'host.docker.internal'
      && !hostname.endsWith('.local')
      && !isPrivateIpv4
  } catch {
    return false
  }
}

export function normalizeProfessionalService(input = {}, options = {}) {
  const source = isRecord(input) ? input : {}
  const fallbackRevision = options.defaultRevision ?? 1
  const sourceSchemaVersion = source.schemaVersion === undefined || source.schemaVersion === null
    ? PROFESSIONAL_SERVICE_SCHEMA_VERSION
    : Number(source.schemaVersion)
  const id = firstText(options.serviceId, source.id, source.serviceId, source.key)
  const createdAt = normalizeTimestamp(firstDefined(source.createdAt, source.criadoEm, options.createdAt))
  const updatedAt = normalizeTimestamp(firstDefined(
    source.updatedAt,
    source.atualizadoEm,
    options.updatedAt,
    source.createdAt,
    source.criadoEm,
    options.createdAt,
  ))

  return {
    schemaVersion: sourceSchemaVersion === 1 ? PROFESSIONAL_SERVICE_SCHEMA_VERSION : sourceSchemaVersion,
    id,
    nome: firstText(source.nome, source.titulo, source.title),
    descricao: firstText(source.descricao, source.description),
    categoriaId: firstText(source.categoriaId, source.categoryId),
    categoriaNome: firstText(source.categoriaNome, source.categoryName, source.categoria, source.category),
    faixaPreco: firstText(source.faixaPreco, source.valor, source.preco, source.priceRange, source.price),
    tempoMedio: firstText(source.tempoMedio, source.tempo, source.duration),
    regiao: firstText(source.regiao, source.regiaoAtendimento, source.region),
    atendeDomicilio: normalizeBoolean(firstDefined(source.atendeDomicilio, source.domicilio, source.homeService), true),
    urgente: normalizeBoolean(firstDefined(source.urgente, source.urgent), false),
    ativo: normalizeBoolean(firstDefined(source.ativo, source.active), true),
    fotos: normalizeProfessionalServicePhotos(source),
    createdAt,
    updatedAt,
    revision: normalizeRevision(source.revision, fallbackRevision),
  }
}

function addError(errors, code, path) {
  errors.push({ code, path })
}

function validateRequiredText(errors, value, path, maxLength) {
  if (typeof value !== 'string' || !value.trim()) {
    addError(errors, `professional_service_${path}_required`, path)
    return
  }
  if (value !== value.trim()) addError(errors, `professional_service_${path}_not_trimmed`, path)
  if (value.length > maxLength) addError(errors, `professional_service_${path}_too_long`, path)
}

function validateOptionalText(errors, value, path, maxLength) {
  if (typeof value !== 'string') {
    addError(errors, `professional_service_${path}_invalid`, path)
    return
  }
  if (value !== value.trim()) addError(errors, `professional_service_${path}_not_trimmed`, path)
  if (value.length > maxLength) addError(errors, `professional_service_${path}_too_long`, path)
}

function validateTimestamp(errors, value, path, now, maxFutureSkewMs) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > PROFESSIONAL_SERVICE_LIMITS.maxTimestamp) {
    addError(errors, `professional_service_${path}_invalid`, path)
    return
  }
  if (Number.isSafeInteger(now) && value > now + maxFutureSkewMs) {
    addError(errors, `professional_service_${path}_in_future`, path)
  }
}

function validatePhotos(errors, photos) {
  if (!isRecord(photos)) {
    addError(errors, 'professional_service_photos_invalid', 'fotos')
    return
  }

  const entries = Object.entries(photos)
  if (entries.length > PROFESSIONAL_SERVICE_LIMITS.maxPhotos) {
    addError(errors, 'professional_service_photos_limit_exceeded', 'fotos')
  }

  entries.forEach(([index, url], position) => {
    if (!PHOTO_INDEX_PATTERN.test(index) || Number(index) !== position) {
      addError(errors, 'professional_service_photo_index_invalid', `fotos.${index}`)
    }
    if (!isSafeProfessionalServicePhotoUrl(url)) {
      addError(errors, 'professional_service_photo_url_invalid', `fotos.${index}`)
    }
  })
}

export function validateProfessionalServiceRevision({
  currentRevision = 0,
  expectedRevision = currentRevision,
  nextRevision,
} = {}) {
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 0) {
    return { ok: false, reason: 'professional_service_current_revision_invalid' }
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { ok: false, reason: 'professional_service_expected_revision_invalid' }
  }
  if (expectedRevision !== currentRevision) {
    return { ok: false, reason: 'professional_service_stale_revision' }
  }
  if (!Number.isSafeInteger(nextRevision) || nextRevision !== currentRevision + 1) {
    return { ok: false, reason: 'professional_service_next_revision_invalid' }
  }
  return { ok: true, reason: '' }
}

export function validateProfessionalService(service, options = {}) {
  const errors = []
  const value = isRecord(service) ? service : {}
  const hasPrevious = Object.prototype.hasOwnProperty.call(options, 'previous')
  const previous = isRecord(options.previous) ? options.previous : null
  const now = Number(options.now)
  const maxFutureSkewMs = Number.isFinite(Number(options.maxFutureSkewMs))
    ? Math.max(0, Number(options.maxFutureSkewMs))
    : PROFESSIONAL_SERVICE_LIMITS.maxFutureSkewMs

  if (!isRecord(service)) addError(errors, 'professional_service_record_invalid', '')

  Object.keys(value).forEach((field) => {
    if (!CANONICAL_FIELDS.has(field)) addError(errors, 'professional_service_unknown_field', field)
  })
  CANONICAL_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      addError(errors, 'professional_service_field_missing', field)
    }
  })

  if (value.schemaVersion !== PROFESSIONAL_SERVICE_SCHEMA_VERSION) {
    addError(errors, 'professional_service_schema_version_invalid', 'schemaVersion')
  }
  if (typeof value.id !== 'string' || !SERVICE_ID_PATTERN.test(value.id)) {
    addError(errors, 'professional_service_id_invalid', 'id')
  }
  if (options.serviceId !== undefined && value.id !== String(options.serviceId)) {
    addError(errors, 'professional_service_id_mismatch', 'id')
  }

  validateRequiredText(errors, value.nome, 'name', PROFESSIONAL_SERVICE_LIMITS.maxNameLength)
  validateOptionalText(errors, value.descricao, 'description', PROFESSIONAL_SERVICE_LIMITS.maxDescriptionLength)
  validateRequiredText(errors, value.categoriaId, 'category_id', PROFESSIONAL_SERVICE_LIMITS.maxCategoryIdLength)
  if (typeof value.categoriaId === 'string' && value.categoriaId && !CATEGORY_ID_PATTERN.test(value.categoriaId)) {
    addError(errors, 'professional_service_category_id_invalid', 'categoriaId')
  }
  validateRequiredText(errors, value.categoriaNome, 'category_name', PROFESSIONAL_SERVICE_LIMITS.maxCategoryNameLength)
  validateRequiredText(errors, value.faixaPreco, 'price', PROFESSIONAL_SERVICE_LIMITS.maxPriceLength)
  validateOptionalText(errors, value.tempoMedio, 'duration', PROFESSIONAL_SERVICE_LIMITS.maxDurationLength)
  validateOptionalText(errors, value.regiao, 'region', PROFESSIONAL_SERVICE_LIMITS.maxRegionLength)

  for (const [field, code] of [
    ['atendeDomicilio', 'home_service'],
    ['urgente', 'urgent'],
    ['ativo', 'active'],
  ]) {
    if (typeof value[field] !== 'boolean') addError(errors, `professional_service_${code}_invalid`, field)
  }

  validatePhotos(errors, value.fotos)
  validateTimestamp(errors, value.createdAt, 'created_at', now, maxFutureSkewMs)
  validateTimestamp(errors, value.updatedAt, 'updated_at', now, maxFutureSkewMs)

  if (Number.isSafeInteger(value.createdAt) && Number.isSafeInteger(value.updatedAt) && value.updatedAt < value.createdAt) {
    addError(errors, 'professional_service_timestamp_order_invalid', 'updatedAt')
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) {
    addError(errors, 'professional_service_revision_invalid', 'revision')
  }

  if (hasPrevious) {
    const currentRevision = previous?.revision ?? 0
    const revisionResult = validateProfessionalServiceRevision({
      currentRevision,
      expectedRevision: options.expectedRevision ?? currentRevision,
      nextRevision: value.revision,
    })
    if (!revisionResult.ok) addError(errors, revisionResult.reason, 'revision')

    if (previous) {
      if (value.id !== previous.id) addError(errors, 'professional_service_id_immutable', 'id')
      if (value.createdAt !== previous.createdAt) addError(errors, 'professional_service_created_at_immutable', 'createdAt')
      if (
        Number.isSafeInteger(previous.updatedAt)
        && Number.isSafeInteger(value.updatedAt)
        && value.updatedAt < previous.updatedAt
      ) {
        addError(errors, 'professional_service_updated_at_not_monotonic', 'updatedAt')
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    errorCodes: errors.map(({ code }) => code),
    value: service,
  }
}

export class ProfessionalServiceValidationError extends Error {
  constructor(errors) {
    super('professional_service_invalid')
    this.name = 'ProfessionalServiceValidationError'
    this.code = 'professional_service_invalid'
    this.errors = Array.isArray(errors) ? errors : []
  }
}

export function assertProfessionalService(service, options = {}) {
  const result = validateProfessionalService(service, options)
  if (!result.ok) throw new ProfessionalServiceValidationError(result.errors)
  return service
}

export function parseProfessionalService(input, options = {}) {
  const normalized = normalizeProfessionalService(input, options)
  return assertProfessionalService(normalized, options)
}
