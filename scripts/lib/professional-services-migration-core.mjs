import crypto from 'node:crypto'

import {
  PROFESSIONAL_SERVICE_LIMITS,
  PROFESSIONAL_SERVICE_SCHEMA_VERSION,
  isSafeProfessionalServicePhotoUrl,
  normalizeProfessionalService,
  normalizeProfessionalServicePhotos,
  validateProfessionalService,
} from '../../src/lib/professionalServiceModel.js'

export const PROFESSIONAL_SERVICES_MIGRATION_VERSION = 1
export const PROFESSIONAL_SERVICES_MIGRATION_MODE = 'dry-run'
export const PROFESSIONAL_SERVICES_MANUAL_RESOLUTION_VERSION = 1
export const PROFESSIONAL_SERVICES_MANUAL_RESOLUTION_CONFIRMATION = 'OWNER_CONFIRMED_PORTFOLIO_PRICE'
export const PROFESSIONAL_SERVICES_DECISION_VERSION = 1
export const PROFESSIONAL_SERVICES_TEST_EXCLUSION_CONFIRMATION = 'OWNER_CONFIRMED_TEST_SERVICE_EXCLUSION'

const SERVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/
const FIREBASE_PATH_SEGMENT_PATTERN = /^[^.#$\[\]/\u0000-\u001f\u007f]{1,128}$/
const MAX_REPORT_ISSUES_PER_UID = 250

export const LEGACY_PROFESSIONAL_SERVICE_SOURCES = Object.freeze([
  Object.freeze({
    id: 'users_portfolio',
    kind: 'private',
    priority: 10,
    displayPath: 'users/{uid}/portfolio',
    parts: ['users', '{uid}', 'portfolio'],
  }),
  Object.freeze({
    id: 'users_prof_portfolio',
    kind: 'private',
    priority: 20,
    displayPath: 'users/{uid}/profPortfolio',
    parts: ['users', '{uid}', 'profPortfolio'],
  }),
  Object.freeze({
    id: 'users_profile_prof_portfolio',
    kind: 'private',
    priority: 30,
    displayPath: 'users/{uid}/profile/profPortfolio',
    parts: ['users', '{uid}', 'profile', 'profPortfolio'],
  }),
  Object.freeze({
    id: 'users_profile_portfolio',
    kind: 'private',
    priority: 40,
    displayPath: 'users/{uid}/profile/portfolio',
    parts: ['users', '{uid}', 'profile', 'portfolio'],
  }),
  Object.freeze({
    id: 'public_profiles_portfolio',
    kind: 'public_projection',
    priority: 100,
    displayPath: 'publicProfiles/{uid}/portfolio',
    parts: ['publicProfiles', '{uid}', 'portfolio'],
  }),
  Object.freeze({
    id: 'public_portfolio',
    kind: 'public_projection',
    priority: 110,
    displayPath: 'publicPortfolio/{uid}',
    parts: ['publicPortfolio', '{uid}'],
  }),
])

export class ProfessionalServicesMigrationError extends Error {
  constructor(code, message = code) {
    super(message)
    this.name = 'ProfessionalServicesMigrationError'
    this.code = code
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function safeText(value, maxLength = 2_048) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).trim().slice(0, maxLength)
}

function firstText(...values) {
  return values.map((value) => safeText(value)).find(Boolean) || ''
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

export function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex')
}

export function professionalServiceManualResolutionRef(uid, suppliedId, semanticValue = {}) {
  const { faixaPreco: _ignoredPrice, ...semanticWithoutPrice } = isRecord(semanticValue)
    ? semanticValue
    : {}
  return sha256({
    version: PROFESSIONAL_SERVICES_MANUAL_RESOLUTION_VERSION,
    uid: String(uid || ''),
    suppliedId: String(suppliedId || ''),
    semanticWithoutPrice,
  })
}

function validUid(value) {
  return FIREBASE_PATH_SEGMENT_PATTERN.test(String(value || ''))
}

function validServiceId(value) {
  return SERVICE_ID_PATTERN.test(String(value || ''))
}

function atPath(root, parts, uid) {
  return parts.reduce((current, part) => current?.[part === '{uid}' ? uid : part], root)
}

function setAtPath(root, path, value) {
  const parts = String(path || '').split('/').filter(Boolean)
  if (!parts.length) throw new ProfessionalServicesMigrationError('migration_path_invalid')
  let current = root
  for (const part of parts.slice(0, -1)) {
    if (!isRecord(current[part])) current[part] = {}
    current = current[part]
  }
  const leaf = parts.at(-1)
  if (value === undefined) delete current[leaf]
  else current[leaf] = clone(value)
}

function hasLegacyCollection(value) {
  if (Array.isArray(value)) return value.some((entry) => entry != null)
  return isRecord(value) && Object.keys(value).length > 0
}

function looksLikeSingleService(value) {
  if (!isRecord(value)) return false
  return ['id', 'serviceId', 'key', 'nome', 'titulo', 'title', 'categoriaId', 'categoryId']
    .some((field) => Object.prototype.hasOwnProperty.call(value, field))
}

function collectionEntries(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry, index) => ({ entry, key: String(index), keyIsCandidateId: false, position: index }))
      .filter(({ entry }) => entry != null)
  }
  if (!isRecord(value)) return []
  if (looksLikeSingleService(value)) {
    return [{ entry: value, key: 'single', keyIsCandidateId: false, position: 0 }]
  }
  return Object.entries(value)
    .map(([key, entry], position) => ({ entry, key, keyIsCandidateId: true, position }))
    .filter(({ entry }) => entry != null)
}

function parseTimestamp(value) {
  if (value === undefined || value === null || value === '') return null
  if (isRecord(value) && Number.isFinite(Number(value.seconds))) {
    const parsed = (Number(value.seconds) * 1_000) + Math.floor(Number(value.nanoseconds || 0) / 1_000_000)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
  }
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    const parsed = numeric < 10_000_000_000 ? numeric * 1_000 : numeric
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

function explicitBoolean(source, aliases) {
  for (const alias of aliases) {
    if (!Object.prototype.hasOwnProperty.call(source, alias)) continue
    return typeof source[alias] === 'boolean'
      ? { found: true, valid: true, value: source[alias], alias }
      : { found: true, valid: false, value: source[alias], alias }
  }
  return { found: false, valid: false, value: undefined, alias: '' }
}

function rawPhotoValues(source) {
  const values = []
  const append = (value) => {
    if (typeof value === 'string') {
      if (value.trim()) values.push(value.trim())
      return
    }
    if (!isRecord(value)) return
    const nested = firstText(value.url, value.fotoURL, value.photoURL, value.imageURL, value.imagemURL)
    if (nested) values.push(nested)
  }
  const appendCollection = (value) => {
    if (Array.isArray(value)) value.forEach(append)
    else if (isRecord(value)) Object.values(value).forEach(append)
  }
  appendCollection(source.fotos)
  appendCollection(source.photos)
  appendCollection(source.imagens)
  append(source.fotoURL)
  append(source.photoURL)
  append(source.imageURL)
  append(source.imagemURL)
  return Array.from(new Set(values))
}

function sourceTimestamp(source, aliases) {
  for (const alias of aliases) {
    if (!Object.prototype.hasOwnProperty.call(source, alias)) continue
    return { provided: true, alias, value: parseTimestamp(source[alias]) }
  }
  return { provided: false, alias: '', value: null }
}

function serviceSemanticValue(source) {
  const home = explicitBoolean(source, ['atendeDomicilio', 'domicilio', 'homeService'])
  const urgent = explicitBoolean(source, ['urgente', 'urgent'])
  const active = explicitBoolean(source, ['ativo', 'active'])
  return {
    nome: firstText(source.nome, source.titulo, source.title),
    descricao: firstText(source.descricao, source.description),
    categoriaId: firstText(source.categoriaId, source.categoryId),
    categoriaNome: firstText(source.categoriaNome, source.categoryName, source.categoria, source.category),
    faixaPreco: firstText(source.faixaPreco, source.valor, source.preco, source.priceRange, source.price),
    tempoMedio: firstText(source.tempoMedio, source.tempo, source.duration),
    regiao: firstText(source.regiao, source.regiaoAtendimento, source.region),
    atendeDomicilio: home.valid ? home.value : null,
    urgente: urgent.valid ? urgent.value : null,
    ativo: active.valid ? active.value : null,
    fotos: rawPhotoValues(source).sort(),
  }
}

function deterministicLegacyServiceId(uid, semanticValue) {
  return `legacy_${sha256({ uid, service: semanticValue }).slice(0, 40)}`
}

function issue(code, { blocking = true, source = '', path = '', serviceId = '', detail = '' } = {}) {
  return {
    code,
    blocking,
    ...(source ? { source } : {}),
    ...(path ? { path } : {}),
    ...(serviceId ? { serviceId } : {}),
    ...(detail ? { detail } : {}),
  }
}

function candidateFromEntry({
  uid,
  source,
  entry,
  key,
  keyIsCandidateId,
  position,
  plannedAt,
  resolutionContext,
  decisionContext,
}) {
  const issues = []
  const resolvedSourcePath = source.displayPath.replace('{uid}', uid)
  if (!isRecord(entry)) {
    return {
      valid: false,
      issues: [issue('migration_service_record_invalid', {
        source: source.id,
        path: `${resolvedSourcePath}/${key}`,
      })],
      source,
      sourcePath: `${resolvedSourcePath}/${key}`,
      serviceId: '',
      semanticHash: sha256({ invalid: entry }),
    }
  }

  const rawSemantic = serviceSemanticValue(entry)
  const explicitIdFields = ['id', 'serviceId', 'key'].filter((field) => (
    Object.prototype.hasOwnProperty.call(entry, field) && safeText(entry[field])
  ))
  const explicitId = explicitIdFields.length ? safeText(entry[explicitIdFields[0]]) : ''
  const keyedId = !explicitId && keyIsCandidateId ? safeText(key) : ''
  const suppliedId = explicitId || keyedId
  const resolutionRef = professionalServiceManualResolutionRef(uid, suppliedId, rawSemantic)
  const manualPriceResolution = resolutionContext?.byRef.get(resolutionRef) || null
  const exclusionDecision = decisionContext?.byRef.get(resolutionRef) || null
  let serviceId = suppliedId
  let idOrigin = explicitId ? `field:${explicitIdFields[0]}` : keyedId ? 'collection_key' : 'deterministic'

  if (manualPriceResolution && exclusionDecision) {
    throw new ProfessionalServicesMigrationError('migration_decision_conflicts_with_resolution')
  }
  if (exclusionDecision) {
    decisionContext.used.add(resolutionRef)
    decisionContext.matchedRecords.set(
      resolutionRef,
      (decisionContext.matchedRecords.get(resolutionRef) || 0) + 1,
    )
    if (!serviceId) serviceId = deterministicLegacyServiceId(uid, rawSemantic)
    return {
      uid,
      source,
      sourcePath: `${resolvedSourcePath}/${key}`,
      sourcePosition: position,
      serviceId,
      idOrigin,
      generatedId: idOrigin === 'deterministic',
      resolutionRef,
      excludedByDecision: {
        serviceRef: resolutionRef,
        action: exclusionDecision.action,
        reasonCode: exclusionDecision.reasonCode,
      },
      semanticHash: sha256(rawSemantic),
      recordHash: '',
      service: null,
      issues: [],
      valid: false,
      technicalMetadata: {
        excludedFromV2: true,
        exclusionReasonCode: exclusionDecision.reasonCode,
      },
    }
  }

  let semantic = rawSemantic
  let appliedResolution = null

  if (manualPriceResolution) {
    resolutionContext.used.add(resolutionRef)
    if (rawSemantic.faixaPreco) {
      issues.push(issue('migration_resolution_would_override_existing_value', {
        source: source.id,
        path: 'faixaPreco',
        serviceId: suppliedId,
      }))
    } else {
      semantic = { ...rawSemantic, faixaPreco: manualPriceResolution.value }
      appliedResolution = {
        resolutionRef,
        field: 'faixaPreco',
        valueHash: sha256(manualPriceResolution.value),
      }
    }
  }

  const semanticHash = sha256(semantic)

  if (suppliedId && !validServiceId(suppliedId)) {
    issues.push(issue('migration_service_id_invalid', {
      source: source.id,
      path: `${resolvedSourcePath}/${key}`,
      detail: idOrigin,
    }))
    serviceId = ''
  } else if (!serviceId) {
    serviceId = deterministicLegacyServiceId(uid, semantic)
  }

  const required = [
    ['nome', semantic.nome],
    ['categoriaId', semantic.categoriaId],
    ['categoriaNome', semantic.categoriaNome],
    ['faixaPreco', semantic.faixaPreco],
  ]
  required.forEach(([field, value]) => {
    if (!value) {
      issues.push(issue('migration_required_field_missing', {
        source: source.id,
        path: field,
        serviceId,
      }))
    }
  })

  const booleans = [
    ['atendeDomicilio', ['atendeDomicilio', 'domicilio', 'homeService']],
    ['urgente', ['urgente', 'urgent']],
    ['ativo', ['ativo', 'active']],
  ]
  const booleanValues = {}
  booleans.forEach(([field, aliases]) => {
    const parsed = explicitBoolean(entry, aliases)
    if (!parsed.found) {
      issues.push(issue('migration_required_field_missing', {
        source: source.id,
        path: field,
        serviceId,
      }))
      return
    }
    if (!parsed.valid) {
      issues.push(issue('migration_boolean_invalid', {
        source: source.id,
        path: parsed.alias || field,
        serviceId,
      }))
      return
    }
    booleanValues[field] = parsed.value
  })

  const photos = rawPhotoValues(entry)
  if (photos.length > PROFESSIONAL_SERVICE_LIMITS.maxPhotos) {
    issues.push(issue('migration_photo_limit_exceeded', {
      source: source.id,
      path: 'fotos',
      serviceId,
      detail: String(photos.length),
    }))
  }
  photos.forEach((url, index) => {
    if (!isSafeProfessionalServicePhotoUrl(url)) {
      issues.push(issue('migration_photo_url_invalid', {
        source: source.id,
        path: `fotos.${index}`,
        serviceId,
      }))
    }
  })

  const created = sourceTimestamp(entry, ['createdAt', 'criadoEm'])
  const updated = sourceTimestamp(entry, ['updatedAt', 'atualizadoEm'])
  if (created.provided && !created.value) {
    issues.push(issue('migration_timestamp_invalid', {
      source: source.id,
      path: created.alias,
      serviceId,
    }))
  }
  if (updated.provided && !updated.value) {
    issues.push(issue('migration_timestamp_invalid', {
      source: source.id,
      path: updated.alias,
      serviceId,
    }))
  }

  const createdAt = created.value || plannedAt
  const updatedAt = updated.value || createdAt
  if (updatedAt < createdAt) {
    issues.push(issue('migration_timestamp_order_invalid', {
      source: source.id,
      path: 'updatedAt',
      serviceId,
    }))
  }

  const service = serviceId ? {
    schemaVersion: PROFESSIONAL_SERVICE_SCHEMA_VERSION,
    id: serviceId,
    nome: semantic.nome,
    descricao: semantic.descricao,
    categoriaId: semantic.categoriaId,
    categoriaNome: semantic.categoriaNome,
    faixaPreco: semantic.faixaPreco,
    tempoMedio: semantic.tempoMedio,
    regiao: semantic.regiao,
    atendeDomicilio: booleanValues.atendeDomicilio,
    urgente: booleanValues.urgente,
    ativo: booleanValues.ativo,
    fotos: normalizeProfessionalServicePhotos(entry),
    createdAt,
    updatedAt,
    revision: 1,
  } : null

  if (service) {
    const validation = validateProfessionalService(service, {
      serviceId,
      now: plannedAt,
      maxFutureSkewMs: 0,
      previous: null,
      expectedRevision: 0,
    })
    validation.errors.forEach(({ code, path }) => {
      issues.push(issue(code, { source: source.id, path, serviceId }))
    })
  }

  return {
    uid,
    source,
    sourcePath: `${resolvedSourcePath}/${key}`,
    sourcePosition: position,
    serviceId,
    idOrigin,
    generatedId: idOrigin === 'deterministic',
    resolutionRef,
    appliedResolution,
    semanticHash,
    recordHash: service ? sha256(service) : '',
    service,
    issues,
    valid: Boolean(service) && !issues.some(({ blocking }) => blocking),
    technicalMetadata: {
      createdAtSource: created.value ? created.alias : 'migration_plan',
      updatedAtSource: updated.value ? updated.alias : created.value ? created.alias : 'migration_plan',
      schemaVersionSource: 'migration_plan',
      revisionSource: 'migration_plan',
    },
  }
}

function sourceCandidates(snapshot, uid, plannedAt, resolutionContext, decisionContext) {
  const candidates = []
  const inventory = []
  for (const source of LEGACY_PROFESSIONAL_SERVICE_SOURCES) {
    const collection = atPath(snapshot, source.parts, uid)
    const entries = collectionEntries(collection)
    inventory.push({
      source: source.id,
      kind: source.kind,
      path: source.displayPath.replace('{uid}', uid),
      count: entries.length,
      sourceHash: sha256(collection ?? null),
    })
    entries.forEach(({ entry, key, keyIsCandidateId, position }) => {
      candidates.push(candidateFromEntry({
        uid,
        source,
        entry,
        key,
        keyIsCandidateId,
        position,
        plannedAt,
        resolutionContext,
        decisionContext,
      }))
    })
  }
  return { candidates, inventory }
}

function canonicalServiceState(snapshot, uid, plannedAt) {
  const collection = snapshot?.professionalServices?.[uid]
  if (collection == null) return { records: new Map(), issues: [], count: 0 }
  if (!isRecord(collection)) {
    return {
      records: new Map(),
      count: 0,
      issues: [issue('migration_existing_v2_collection_invalid', {
        path: `professionalServices/${uid}`,
      })],
    }
  }
  const records = new Map()
  const issues = []
  Object.entries(collection).forEach(([serviceId, service]) => {
    if (!validServiceId(serviceId)) {
      issues.push(issue('migration_existing_v2_id_invalid', {
        path: `professionalServices/${uid}/${serviceId}`,
      }))
      return
    }
    const normalized = normalizeProfessionalService({
      ...service,
      fotos: service?.fotos ?? {},
    }, { serviceId })
    const validation = validateProfessionalService(normalized, { serviceId, now: plannedAt })
    if (!validation.ok) {
      validation.errors.forEach(({ code, path }) => {
        issues.push(issue('migration_existing_v2_record_invalid', {
          path: `professionalServices/${uid}/${serviceId}/${path}`,
          serviceId,
          detail: code,
        }))
      })
      return
    }
    records.set(serviceId, {
      service: clone(normalized),
      recordHash: sha256(service),
      semanticHash: sha256(serviceSemanticValue(normalized)),
    })
  })
  return { records, issues, count: Object.keys(collection).length }
}

function selectLegacyCandidates(candidates) {
  const ordered = [...candidates].sort((left, right) => (
    left.source.priority - right.source.priority
    || left.sourcePosition - right.sourcePosition
    || left.sourcePath.localeCompare(right.sourcePath)
  ))
  const selectedById = new Map()
  const selectedBySemantic = new Map()
  const duplicates = []
  const conflicts = []
  const issues = []

  for (const candidate of ordered) {
    issues.push(...candidate.issues)
    if (!candidate.serviceId) continue

    const sameId = selectedById.get(candidate.serviceId)
    if (sameId) {
      if (sameId.semanticHash === candidate.semanticHash) {
        duplicates.push({
          code: 'migration_duplicate_same_id',
          serviceId: candidate.serviceId,
          keptSource: sameId.source.id,
          skippedSource: candidate.source.id,
        })
      } else {
        conflicts.push({
          code: 'migration_conflicting_service_id',
          serviceId: candidate.serviceId,
          authoritativeSource: sameId.source.id,
          conflictingSource: candidate.source.id,
          privateSourcePreserved: sameId.source.kind === 'private',
        })
        issues.push(issue('migration_conflicting_service_id', {
          source: candidate.source.id,
          serviceId: candidate.serviceId,
          detail: `${sameId.source.id}:${candidate.source.id}`,
        }))
      }
      continue
    }

    const sameSemantic = selectedBySemantic.get(candidate.semanticHash)
    if (sameSemantic) {
      duplicates.push({
        code: 'migration_duplicate_equivalent_service',
        serviceId: candidate.serviceId,
        keptServiceId: sameSemantic.serviceId,
        keptSource: sameSemantic.source.id,
        skippedSource: candidate.source.id,
      })
      continue
    }

    selectedById.set(candidate.serviceId, candidate)
    selectedBySemantic.set(candidate.semanticHash, candidate)
  }

  return {
    selected: Array.from(selectedById.values()),
    duplicates,
    conflicts,
    issues,
  }
}

function candidateAgainstExisting(candidate, existing) {
  const sameId = existing.records.get(candidate.serviceId)
  if (sameId) {
    if (sameId.semanticHash === candidate.semanticHash) {
      return { action: 'already_present', existingServiceId: candidate.serviceId }
    }
    return { action: 'conflict', reason: 'migration_existing_v2_id_conflict' }
  }
  for (const [existingServiceId, record] of existing.records.entries()) {
    if (record.semanticHash === candidate.semanticHash) {
      return { action: 'already_present', existingServiceId }
    }
  }
  return { action: 'create' }
}

function currentMarker(snapshot, root, uid) {
  const value = snapshot?.[root]?.[uid]?.portfolioSchemaVersion
  return value === undefined ? null : value
}

function migrationPathsForUid(uid) {
  return LEGACY_PROFESSIONAL_SERVICE_SOURCES.map(({ displayPath }) => displayPath.replace('{uid}', uid))
}

function isManualPriceResolutionIssue(issueValue) {
  return (
    issueValue?.code === 'migration_required_field_missing'
      && issueValue?.path === 'faixaPreco'
  ) || (
    issueValue?.code === 'professional_service_price_required'
      && issueValue?.path === 'price'
  )
}

function buildUidReport(snapshot, uid, plannedAt, resolutionContext, decisionContext) {
  const ownerExists = isRecord(snapshot?.users?.[uid])
  const publicProfileExists = isRecord(snapshot?.publicProfiles?.[uid])
  const userMarker = currentMarker(snapshot, 'users', uid)
  const publicMarker = currentMarker(snapshot, 'publicProfiles', uid)
  const markedV2 = Number(userMarker) === 2 || Number(publicMarker) === 2
  const { candidates, inventory } = sourceCandidates(
    snapshot,
    uid,
    plannedAt,
    resolutionContext,
    decisionContext,
  )
  const existing = canonicalServiceState(snapshot, uid, plannedAt)
  const selection = selectLegacyCandidates(candidates)
  const issues = [...existing.issues, ...selection.issues]
  if (!ownerExists) {
    issues.push(issue('migration_owner_user_missing', { path: `users/${uid}` }))
  }
  const userMarkedV2 = Number(userMarker) === 2
  const publicProfileMarkedV2 = Number(publicMarker) === 2
  if (userMarkedV2 !== publicProfileMarkedV2 && publicProfileExists) {
    issues.push(issue('migration_schema_marker_mismatch', {
      path: `users/${uid}/portfolioSchemaVersion`,
    }))
  }

  const alreadyPresent = []
  const pending = []
  const explicitlyDispensed = []
  selection.selected.forEach((candidate) => {
    if (candidate.excludedByDecision) {
      explicitlyDispensed.push({
        serviceRef: candidate.excludedByDecision.serviceRef,
        action: candidate.excludedByDecision.action,
        reasonCode: candidate.excludedByDecision.reasonCode,
      })
      return
    }
    if (!candidate.valid) return
    const comparison = candidateAgainstExisting(candidate, existing)
    if (comparison.action === 'already_present') {
      alreadyPresent.push({
        serviceId: candidate.serviceId,
        existingServiceId: comparison.existingServiceId,
        source: candidate.source.id,
      })
      return
    }
    if (comparison.action === 'conflict') {
      issues.push(issue(comparison.reason, {
        serviceId: candidate.serviceId,
        source: candidate.source.id,
        path: `professionalServices/${uid}/${candidate.serviceId}`,
      }))
      return
    }
    pending.push(candidate)
  })

  if (existing.count > PROFESSIONAL_SERVICE_LIMITS.maxServicesPerProfessional) {
    issues.push(issue('migration_existing_v2_limit_exceeded', {
      path: `professionalServices/${uid}`,
      detail: String(existing.count),
    }))
  }
  if (existing.count + pending.length > PROFESSIONAL_SERVICE_LIMITS.maxServicesPerProfessional) {
    issues.push(issue('migration_service_limit_exceeded', {
      path: `professionalServices/${uid}`,
      detail: `${existing.count}+${pending.length}`,
    }))
  }
  if (markedV2 && pending.length) {
    issues.push(issue('migration_marker_v2_has_unmigrated_legacy', {
      path: `users/${uid}/portfolioSchemaVersion`,
      detail: String(pending.length),
    }))
  }

  const blockingIssues = issues.filter(({ blocking }) => blocking)
  const legacyCount = candidates.length
  const manualResolutionRequirements = selection.selected
    .filter((candidate) => (
      !candidate.valid
      && candidate.issues.length > 0
      && candidate.issues.every(isManualPriceResolutionIssue)
    ))
    .map((candidate) => ({
      resolutionRef: candidate.resolutionRef,
      field: 'faixaPreco',
      currentValuePresent: false,
    }))
  const canPlan = blockingIssues.length === 0
  const createOperations = canPlan ? pending.map((candidate) => ({
    action: 'create_if_absent',
    path: `professionalServices/${uid}/${candidate.serviceId}`,
    serviceId: candidate.serviceId,
    expected: { exists: false },
    value: candidate.service,
    valueHash: candidate.recordHash,
    semanticHash: candidate.semanticHash,
    source: candidate.source.id,
    sourcePath: candidate.sourcePath.replace('{uid}', uid),
  })) : []
  const finalServiceHashes = Object.fromEntries([
    ...Array.from(existing.records.entries()).map(([serviceId, record]) => [serviceId, record.recordHash]),
    ...createOperations.map(({ serviceId, valueHash }) => [serviceId, valueHash]),
  ].sort(([left], [right]) => left.localeCompare(right)))
  const markerOperations = canPlan && (legacyCount > 0 || existing.count > 0) ? [
    {
      action: 'set_after_full_verification',
      path: `users/${uid}/portfolioSchemaVersion`,
      expectedValue: userMarker,
      value: 2,
    },
    ...(publicProfileExists ? [{
      action: 'set_after_full_verification',
      path: `publicProfiles/${uid}/portfolioSchemaVersion`,
      expectedValue: publicMarker,
      value: 2,
    }] : []),
  ].filter(({ expectedValue }) => Number(expectedValue) !== 2) : []

  const planCore = {
    version: PROFESSIONAL_SERVICES_MIGRATION_VERSION,
    uid,
    dryRun: true,
    preserveLegacyPaths: migrationPathsForUid(uid),
    preconditions: {
      ownerExists,
      expectedExistingServiceHashes: Object.fromEntries(
        Array.from(existing.records.entries()).map(([serviceId, record]) => [serviceId, record.recordHash]),
      ),
      expectedUserMarker: userMarker,
      expectedPublicProfileMarker: publicMarker,
    },
    explicitDecisions: explicitlyDispensed,
    createOperations,
    verification: {
      expectedFinalServiceCount: Object.keys(finalServiceHashes).length,
      expectedFinalServiceHashes: finalServiceHashes,
    },
    markerOperations,
    rollback: {
      deleteOnlyIfHashMatches: createOperations.map(({ path, valueHash }) => ({ path, valueHash })),
      abortIfAnyCreatedRecordHashChanged: true,
      abortIfCanonicalCollectionChanged: true,
      expectedCanonicalServiceCount: Object.keys(finalServiceHashes).length,
      expectedCanonicalServiceHashes: finalServiceHashes,
      restoreMarkersOnlyAfterAllCreatedRecordsReverted: true,
      restoreMarkers: markerOperations.map(({ path, expectedValue }) => ({
        action: expectedValue === null ? 'delete_marker_if_current_is_2' : 'restore_marker_if_current_is_2',
        path,
        value: expectedValue,
      })),
      legacyPathsRemainUntouched: true,
    },
  }
  const planHash = sha256(planCore)
  const status = blockingIssues.length
    ? 'blocked'
    : markedV2 && !pending.length
      ? 'already_migrated'
      : legacyCount || existing.count
        ? 'ready'
        : 'nothing_to_migrate'

  return {
    uid,
    status,
    portfolioSchemaVersion: {
      users: userMarker,
      publicProfiles: publicMarker,
      markedV2,
    },
    inventory,
    counts: {
      legacyRecords: legacyCount,
      selectedRecords: selection.selected.length,
      existingV2Records: existing.count,
      alreadyPresent: alreadyPresent.length,
      pendingCreates: createOperations.length,
      duplicates: selection.duplicates.length,
      conflicts: selection.conflicts.length,
      blockingIssues: blockingIssues.length,
      explicitlyDispensed: explicitlyDispensed.length,
      dispensedLegacyRecords: candidates.filter(({ excludedByDecision }) => excludedByDecision).length,
    },
    duplicates: selection.duplicates,
    conflicts: selection.conflicts,
    alreadyPresent,
    generatedIds: selection.selected
      .filter(({ generatedId }) => generatedId)
      .map(({ serviceId, source }) => ({ serviceId, source: source.id })),
    manualResolutionRequirements,
    explicitDecisions: explicitlyDispensed,
    technicalMetadata: selection.selected.map(({ serviceId, technicalMetadata }) => ({
      serviceId,
      ...technicalMetadata,
      ...(selection.selected.find((candidate) => candidate.serviceId === serviceId)?.appliedResolution
        ? { manualResolution: selection.selected.find((candidate) => candidate.serviceId === serviceId).appliedResolution }
        : {}),
    })),
    issues: issues.slice(0, MAX_REPORT_ISSUES_PER_UID),
    issuesTruncated: issues.length > MAX_REPORT_ISSUES_PER_UID,
    sourceHash: sha256({
      inventory: inventory.map(({ source, sourceHash }) => ({ source, sourceHash })),
      existing: Object.fromEntries(
        Array.from(existing.records.entries()).map(([serviceId, record]) => [serviceId, record.recordHash]),
      ),
      userMarker,
      publicMarker,
    }),
    plan: canPlan ? { ...planCore, planHash } : null,
    planHash: canPlan ? planHash : null,
  }
}

function collectRelevantUids(snapshot) {
  const ids = new Set()
  const invalid = []
  const consider = (uid) => {
    if (validUid(uid)) ids.add(uid)
    else invalid.push(uid)
  }

  Object.entries(isRecord(snapshot?.users) ? snapshot.users : {}).forEach(([uid, user]) => {
    const relevant = Number(user?.portfolioSchemaVersion) === 2
      || LEGACY_PROFESSIONAL_SERVICE_SOURCES
        .filter(({ parts }) => parts[0] === 'users')
        .some(({ parts }) => hasLegacyCollection(atPath(snapshot, parts, uid)))
    if (relevant) consider(uid)
  })
  Object.entries(isRecord(snapshot?.publicProfiles) ? snapshot.publicProfiles : {}).forEach(([uid, profile]) => {
    if (Number(profile?.portfolioSchemaVersion) === 2 || hasLegacyCollection(profile?.portfolio)) consider(uid)
  })
  Object.keys(isRecord(snapshot?.publicPortfolio) ? snapshot.publicPortfolio : {}).forEach(consider)
  Object.keys(isRecord(snapshot?.professionalServices) ? snapshot.professionalServices : {}).forEach(consider)
  return { ids: Array.from(ids).sort(), invalid: Array.from(new Set(invalid)).sort() }
}

function assertOfflineSnapshot(snapshot) {
  if (!isRecord(snapshot)) throw new ProfessionalServicesMigrationError('migration_snapshot_invalid')
  if (
    Object.prototype.hasOwnProperty.call(snapshot, 'private_key')
    || Object.prototype.hasOwnProperty.call(snapshot, 'privateKey')
    || Object.prototype.hasOwnProperty.call(snapshot, 'client_email')
  ) {
    throw new ProfessionalServicesMigrationError(
      'migration_snapshot_looks_like_credentials',
      'O arquivo informado parece conter credenciais, não uma exportação RTDB.',
    )
  }
}

function normalizeManualResolutions(snapshot, manualResolutions, plannedAt) {
  const inputHash = sha256(snapshot)
  const context = {
    provided: manualResolutions !== undefined && manualResolutions !== null,
    inputHash,
    confirmedAt: null,
    byRef: new Map(),
    used: new Set(),
  }
  if (!context.provided) return context
  if (!isRecord(manualResolutions)) {
    throw new ProfessionalServicesMigrationError('migration_resolutions_invalid')
  }
  const allowedDocumentFields = new Set([
    'version',
    'inputHash',
    'confirmation',
    'confirmedAt',
    'resolutions',
  ])
  if (Object.keys(manualResolutions).some((field) => !allowedDocumentFields.has(field))) {
    throw new ProfessionalServicesMigrationError('migration_resolutions_unknown_field')
  }
  if (manualResolutions.version !== PROFESSIONAL_SERVICES_MANUAL_RESOLUTION_VERSION) {
    throw new ProfessionalServicesMigrationError('migration_resolution_version_invalid')
  }
  if (manualResolutions.inputHash !== inputHash) {
    throw new ProfessionalServicesMigrationError('migration_resolution_input_hash_mismatch')
  }
  if (manualResolutions.confirmation !== PROFESSIONAL_SERVICES_MANUAL_RESOLUTION_CONFIRMATION) {
    throw new ProfessionalServicesMigrationError('migration_resolution_owner_confirmation_required')
  }

  const confirmedAt = Number(manualResolutions.confirmedAt)
  if (
    !Number.isSafeInteger(confirmedAt)
    || confirmedAt <= 0
    || confirmedAt > plannedAt + PROFESSIONAL_SERVICE_LIMITS.maxFutureSkewMs
  ) {
    throw new ProfessionalServicesMigrationError('migration_resolution_confirmation_timestamp_invalid')
  }
  if (!Array.isArray(manualResolutions.resolutions) || manualResolutions.resolutions.length === 0) {
    throw new ProfessionalServicesMigrationError('migration_resolutions_empty')
  }

  for (const resolution of manualResolutions.resolutions) {
    if (!isRecord(resolution)) {
      throw new ProfessionalServicesMigrationError('migration_resolution_record_invalid')
    }
    const allowedFields = new Set(['resolutionRef', 'field', 'value'])
    if (Object.keys(resolution).some((field) => !allowedFields.has(field))) {
      throw new ProfessionalServicesMigrationError('migration_resolution_unknown_field')
    }
    if (!/^[a-f0-9]{64}$/.test(String(resolution.resolutionRef || ''))) {
      throw new ProfessionalServicesMigrationError('migration_resolution_ref_invalid')
    }
    if (resolution.field !== 'faixaPreco') {
      throw new ProfessionalServicesMigrationError('migration_resolution_field_not_allowed')
    }
    if (
      typeof resolution.value !== 'string'
      || !resolution.value.trim()
      || resolution.value !== resolution.value.trim()
      || resolution.value.length > PROFESSIONAL_SERVICE_LIMITS.maxPriceLength
    ) {
      throw new ProfessionalServicesMigrationError('migration_resolution_value_invalid')
    }
    if (context.byRef.has(resolution.resolutionRef)) {
      throw new ProfessionalServicesMigrationError('migration_resolution_duplicate_ref')
    }
    context.byRef.set(resolution.resolutionRef, {
      field: resolution.field,
      value: resolution.value,
      valueHash: sha256(resolution.value),
    })
  }
  context.confirmedAt = confirmedAt
  return context
}

function normalizeMigrationDecisions(snapshot, migrationDecisions, plannedAt) {
  const inputHash = sha256(snapshot)
  const context = {
    provided: migrationDecisions !== undefined && migrationDecisions !== null,
    inputHash,
    confirmedAt: null,
    byRef: new Map(),
    used: new Set(),
    matchedRecords: new Map(),
  }
  if (!context.provided) return context
  if (!isRecord(migrationDecisions)) {
    throw new ProfessionalServicesMigrationError('migration_decisions_invalid')
  }
  const allowedDocumentFields = new Set([
    'version',
    'inputHash',
    'confirmation',
    'confirmedAt',
    'decisions',
  ])
  if (Object.keys(migrationDecisions).some((field) => !allowedDocumentFields.has(field))) {
    throw new ProfessionalServicesMigrationError('migration_decisions_unknown_field')
  }
  if (migrationDecisions.version !== PROFESSIONAL_SERVICES_DECISION_VERSION) {
    throw new ProfessionalServicesMigrationError('migration_decision_version_invalid')
  }
  if (migrationDecisions.inputHash !== inputHash) {
    throw new ProfessionalServicesMigrationError('migration_decision_input_hash_mismatch')
  }
  if (migrationDecisions.confirmation !== PROFESSIONAL_SERVICES_TEST_EXCLUSION_CONFIRMATION) {
    throw new ProfessionalServicesMigrationError('migration_decision_owner_confirmation_required')
  }

  const confirmedAt = Number(migrationDecisions.confirmedAt)
  if (
    !Number.isSafeInteger(confirmedAt)
    || confirmedAt <= 0
    || confirmedAt > plannedAt + PROFESSIONAL_SERVICE_LIMITS.maxFutureSkewMs
  ) {
    throw new ProfessionalServicesMigrationError('migration_decision_confirmation_timestamp_invalid')
  }
  if (!Array.isArray(migrationDecisions.decisions) || migrationDecisions.decisions.length === 0) {
    throw new ProfessionalServicesMigrationError('migration_decisions_empty')
  }

  for (const decision of migrationDecisions.decisions) {
    if (!isRecord(decision)) {
      throw new ProfessionalServicesMigrationError('migration_decision_record_invalid')
    }
    const allowedFields = new Set(['serviceRef', 'action', 'reasonCode'])
    if (Object.keys(decision).some((field) => !allowedFields.has(field))) {
      throw new ProfessionalServicesMigrationError('migration_decision_unknown_field')
    }
    if (!/^[a-f0-9]{64}$/.test(String(decision.serviceRef || ''))) {
      throw new ProfessionalServicesMigrationError('migration_decision_ref_invalid')
    }
    if (decision.action !== 'exclude_from_v2') {
      throw new ProfessionalServicesMigrationError('migration_decision_action_not_allowed')
    }
    if (decision.reasonCode !== 'owner_confirmed_test_service') {
      throw new ProfessionalServicesMigrationError('migration_decision_reason_not_allowed')
    }
    if (context.byRef.has(decision.serviceRef)) {
      throw new ProfessionalServicesMigrationError('migration_decision_duplicate_ref')
    }
    context.byRef.set(decision.serviceRef, {
      action: decision.action,
      reasonCode: decision.reasonCode,
    })
  }
  context.confirmedAt = confirmedAt
  return context
}

export function buildProfessionalServicesMigrationReport(snapshot, {
  plannedAt = Date.now(),
  sourceLabel = 'explicit-local-json',
  manualResolutions = null,
  migrationDecisions = null,
} = {}) {
  assertOfflineSnapshot(snapshot)
  const timestamp = Number(plannedAt)
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new ProfessionalServicesMigrationError('migration_planned_at_invalid')
  }
  const resolutionContext = normalizeManualResolutions(snapshot, manualResolutions, timestamp)
  const decisionContext = normalizeMigrationDecisions(snapshot, migrationDecisions, timestamp)
  const { ids, invalid } = collectRelevantUids(snapshot)
  const uidReports = ids.map((uid) => buildUidReport(
    snapshot,
    uid,
    timestamp,
    resolutionContext,
    decisionContext,
  ))
  if (resolutionContext.used.size !== resolutionContext.byRef.size) {
    throw new ProfessionalServicesMigrationError('migration_resolution_target_not_found')
  }
  if (decisionContext.used.size !== decisionContext.byRef.size) {
    throw new ProfessionalServicesMigrationError('migration_decision_target_not_found')
  }
  const counts = uidReports.reduce((result, uidReport) => {
    result.uids += 1
    result[uidReport.status] = (result[uidReport.status] || 0) + 1
    result.legacyRecords += uidReport.counts.legacyRecords
    result.existingV2Records += uidReport.counts.existingV2Records
    result.pendingCreates += uidReport.counts.pendingCreates
    result.duplicates += uidReport.counts.duplicates
    result.conflicts += uidReport.counts.conflicts
    result.blockingIssues += uidReport.counts.blockingIssues
    result.explicitlyDispensed += uidReport.counts.explicitlyDispensed
    result.dispensedLegacyRecords += uidReport.counts.dispensedLegacyRecords
    return result
  }, {
    uids: 0,
    ready: 0,
    blocked: 0,
    already_migrated: 0,
    nothing_to_migrate: 0,
    legacyRecords: 0,
    existingV2Records: 0,
    pendingCreates: 0,
    duplicates: 0,
    conflicts: 0,
    blockingIssues: invalid.length,
    explicitlyDispensed: 0,
    dispensedLegacyRecords: 0,
  })
  const reportCore = {
    migrationVersion: PROFESSIONAL_SERVICES_MIGRATION_VERSION,
    mode: PROFESSIONAL_SERVICES_MIGRATION_MODE,
    remoteAccess: false,
    writesPerformed: false,
    sourceLabel: safeText(sourceLabel, 120) || 'explicit-local-json',
    plannedAt: timestamp,
    inputHash: sha256(snapshot),
    manualResolutions: {
      provided: resolutionContext.provided,
      count: resolutionContext.byRef.size,
      used: resolutionContext.used.size,
      confirmedAt: resolutionContext.confirmedAt,
      entries: Array.from(resolutionContext.byRef.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([resolutionRef, resolution]) => ({
          resolutionRef,
          field: resolution.field,
          valueHash: resolution.valueHash,
        })),
    },
    migrationDecisions: {
      provided: decisionContext.provided,
      count: decisionContext.byRef.size,
      used: decisionContext.used.size,
      confirmedAt: decisionContext.confirmedAt,
      entries: Array.from(decisionContext.byRef.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([serviceRef, decision]) => ({
          serviceRef,
          action: decision.action,
          reasonCode: decision.reasonCode,
          matchedLegacyRecords: decisionContext.matchedRecords.get(serviceRef) || 0,
        })),
    },
    invalidUidKeys: invalid.map((uid) => ({ uidHash: sha256(uid).slice(0, 16) })),
    counts,
    uids: uidReports,
    applicationOrder: [
      'verify_project_and_instance_outside_this_offline_tool',
      'create_fresh_backup',
      'verify_source_hash_and_preconditions',
      'create_services_if_absent',
      'verify_all_service_hashes_and_limit',
      'set_schema_markers_only_after_full_uid_verification',
      'smoke_test_reads_before_any_legacy_cleanup',
    ],
    backupRequirements: {
      requiredBeforeApply: true,
      roots: [
        'users',
        'publicProfiles',
        'publicPortfolio',
        'professionalServices',
      ],
      includeRulesExport: true,
      verifyJsonAndSha256: true,
      storeOutsideRepository: true,
    },
    safeguards: {
      applyImplemented: false,
      legacyDeletionPlanned: false,
      publicProjectionMayOverridePrivate: false,
      markersRequireFullUidValidation: true,
      existingV2OverwriteAllowed: false,
      explicitExclusionsDeleteLegacy: false,
      explicitExclusionsCreateV2Records: false,
      rollbackAbortsWhenCanonicalCollectionChanges: true,
    },
  }
  return { ...reportCore, reportHash: sha256(reportCore) }
}

export function summarizeProfessionalServicesMigrationReport(report) {
  return {
    migrationVersion: report.migrationVersion,
    mode: report.mode,
    remoteAccess: report.remoteAccess,
    writesPerformed: report.writesPerformed,
    plannedAt: report.plannedAt,
    inputHash: report.inputHash,
    reportHash: report.reportHash,
    manualResolutions: report.manualResolutions,
    migrationDecisions: report.migrationDecisions,
    counts: report.counts,
    uids: report.uids.map((uidReport) => ({
      uid: uidReport.uid,
      status: uidReport.status,
      counts: uidReport.counts,
      sourceHash: uidReport.sourceHash,
      planHash: uidReport.planHash,
      manualResolutionRequirements: uidReport.manualResolutionRequirements,
      explicitDecisions: uidReport.explicitDecisions,
      issueCodes: Array.from(new Set(uidReport.issues.map(({ code }) => code))).sort(),
    })),
  }
}

function valueAtPath(root, path) {
  return String(path || '').split('/').filter(Boolean).reduce((current, key) => current?.[key], root)
}

export function evaluateProfessionalServicesMigrationRollback(snapshot, report) {
  assertOfflineSnapshot(snapshot)
  if (!isRecord(report) || !Array.isArray(report.uids)) {
    throw new ProfessionalServicesMigrationError('migration_rollback_report_invalid')
  }
  const uids = report.uids
    .filter(({ plan }) => Boolean(plan))
    .map((uidReport) => {
      const rollback = uidReport.plan?.rollback
      const expected = isRecord(rollback?.expectedCanonicalServiceHashes)
        ? rollback.expectedCanonicalServiceHashes
        : {}
      const currentCollection = isRecord(snapshot?.professionalServices?.[uidReport.uid])
        ? snapshot.professionalServices[uidReport.uid]
        : {}
      const expectedIds = Object.keys(expected).sort()
      const currentIds = Object.keys(currentCollection).sort()
      const sameIds = stableJson(expectedIds) === stableJson(currentIds)
      const sameHashes = sameIds && expectedIds.every((serviceId) => (
        sha256(currentCollection[serviceId]) === expected[serviceId]
      ))
      const markersStillV2 = uidReport.plan.rollback.restoreMarkers.every(({ path }) => (
        Number(valueAtPath(snapshot, path)) === 2
      ))
      const safe = sameHashes && markersStillV2
      return {
        uidHash: sha256(uidReport.uid).slice(0, 16),
        safe,
        canonicalCollectionUnchanged: sameHashes,
        markersStillV2,
        expectedCanonicalServiceCount: expectedIds.length,
        currentCanonicalServiceCount: currentIds.length,
      }
    })
  return {
    safe: uids.every(({ safe }) => safe),
    writesPerformed: false,
    uids,
  }
}

function verifyUidFinalState(snapshot, uidReport) {
  const expected = uidReport.plan.verification.expectedFinalServiceHashes
  const collection = snapshot?.professionalServices?.[uidReport.uid] || {}
  if (Object.keys(collection).length !== uidReport.plan.verification.expectedFinalServiceCount) return false
  return Object.entries(expected).every(([serviceId, expectedHash]) => (
    sha256(collection[serviceId]) === expectedHash
  ))
}

export function simulateProfessionalServicesMigrationPlan(snapshot, report, {
  confirmation = '',
  failAfterCreates = Number.POSITIVE_INFINITY,
} = {}) {
  if (confirmation !== 'LOCAL_SNAPSHOT_SIMULATION_ONLY') {
    throw new ProfessionalServicesMigrationError('migration_local_simulation_confirmation_required')
  }
  assertOfflineSnapshot(snapshot)
  const result = clone(snapshot)
  let createsApplied = 0
  const events = []

  for (const uidReport of report.uids) {
    if (!uidReport.plan || uidReport.status === 'blocked') continue
    for (const operation of uidReport.plan.createOperations) {
      const current = valueAtPath(result, operation.path)
      if (current !== undefined && current !== null) {
        if (sha256(current) !== operation.valueHash) {
          throw new ProfessionalServicesMigrationError('migration_local_simulation_precondition_failed')
        }
        events.push({ action: 'already_present', path: operation.path })
        continue
      }
      if (createsApplied >= failAfterCreates) {
        return { snapshot: result, events, interrupted: true, createsApplied }
      }
      setAtPath(result, operation.path, operation.value)
      createsApplied += 1
      events.push({ action: 'created', path: operation.path })
    }
    if (!verifyUidFinalState(result, uidReport)) {
      throw new ProfessionalServicesMigrationError('migration_local_simulation_verification_failed')
    }
    uidReport.plan.markerOperations.forEach((operation) => {
      const current = valueAtPath(result, operation.path)
      const expected = operation.expectedValue === null ? undefined : operation.expectedValue
      if (current !== expected && Number(current) !== 2) {
        throw new ProfessionalServicesMigrationError('migration_local_simulation_marker_precondition_failed')
      }
      setAtPath(result, operation.path, 2)
      events.push({ action: 'marker_set', path: operation.path })
    })
  }
  return { snapshot: result, events, interrupted: false, createsApplied }
}
