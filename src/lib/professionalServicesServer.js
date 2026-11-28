import crypto from 'node:crypto'
import {
  PROFESSIONAL_SERVICE_LIMITS,
  PROFESSIONAL_SERVICE_SCHEMA,
  PROFESSIONAL_SERVICE_SCHEMA_VERSION,
  normalizeProfessionalService,
  validateProfessionalService,
} from './professionalServiceModel.js'
import {
  ProfessionalServiceCatalogError,
  ensureProfessionalPortfolioSchemaV2,
} from './professionalServiceCatalog.js'

export const PROFESSIONAL_SERVICE_OPERATION_VERSION = 1

const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/
const SERVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/
const FIREBASE_PATH_SEGMENT_PATTERN = /^[^.#$\[\]/\u0000-\u001f\u007f]{1,128}$/
const EDITABLE_FIELDS = Object.freeze([
  'nome',
  'descricao',
  'categoriaId',
  'categoriaNome',
  'faixaPreco',
  'tempoMedio',
  'regiao',
  'atendeDomicilio',
  'urgente',
  'ativo',
  'fotos',
])
const EDITABLE_FIELD_SET = new Set(EDITABLE_FIELDS)
const STORED_FIELD_SET = new Set(Object.keys(PROFESSIONAL_SERVICE_SCHEMA.fields))

export class ProfessionalServiceServerError extends Error {
  constructor(code, status = 409, details = []) {
    super(code)
    this.name = 'ProfessionalServiceServerError'
    this.code = code
    this.status = status
    this.details = Array.isArray(details) ? details : []
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function trustedNow(value = Date.now()) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new ProfessionalServiceServerError('professional_service_server_time_invalid', 503)
  }
  return number
}

function requireDatabase(database) {
  if (!database || typeof database.ref !== 'function') {
    throw new ProfessionalServiceServerError('professional_service_database_unavailable', 503)
  }
  return database
}

async function ensureSchemaV2(database, uid) {
  try {
    return await ensureProfessionalPortfolioSchemaV2({ database, uid })
  } catch (error) {
    if (error instanceof ProfessionalServiceCatalogError) {
      throw new ProfessionalServiceServerError(error.code, error.status)
    }
    throw error
  }
}

export function normalizeProfessionalServiceUid(value) {
  const uid = String(value || '').trim()
  return FIREBASE_PATH_SEGMENT_PATTERN.test(uid) ? uid : ''
}

export function normalizeProfessionalServiceOperationId(value) {
  const operationId = String(value || '').trim()
  return OPERATION_ID_PATTERN.test(operationId) ? operationId : ''
}

export function normalizeProfessionalServiceId(value) {
  const serviceId = String(value || '').trim()
  return SERVICE_ID_PATTERN.test(serviceId) ? serviceId : ''
}

export function deriveProfessionalServiceId(uidValue, operationIdValue) {
  const uid = normalizeProfessionalServiceUid(uidValue)
  const operationId = normalizeProfessionalServiceOperationId(operationIdValue)
  if (!uid || !operationId) return ''
  const digest = crypto.createHash('sha256').update(`${uid}:${operationId}`).digest('hex').slice(0, 40)
  return `svc_${digest}`
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  )
}

function valueHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function editableServiceContent(service = {}) {
  return Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, service[field]]))
}

function contentMatches(left, right) {
  return valueHash(editableServiceContent(left)) === valueHash(editableServiceContent(right))
}

function validateClientServiceInput(input, { partial = false } = {}) {
  if (!isRecord(input)) {
    throw new ProfessionalServiceServerError('professional_service_payload_invalid', 400)
  }
  const keys = Object.keys(input)
  if (partial && keys.length === 0) {
    throw new ProfessionalServiceServerError('professional_service_payload_empty', 400)
  }
  const forbidden = keys.filter((key) => !EDITABLE_FIELD_SET.has(key))
  if (forbidden.length) {
    throw new ProfessionalServiceServerError(
      'professional_service_managed_or_unknown_field',
      422,
      forbidden.map((path) => ({ code: 'professional_service_field_forbidden', path })),
    )
  }
}

function validationDetails(result) {
  return result.errors.map(({ code, path }) => ({ code, path }))
}

function assertValidService(service, options) {
  const result = validateProfessionalService(service, options)
  if (!result.ok) {
    throw new ProfessionalServiceServerError(
      'professional_service_validation_failed',
      422,
      validationDetails(result),
    )
  }
  return service
}

function buildCreateService({ input, serviceId, now }) {
  validateClientServiceInput(input)
  const service = normalizeProfessionalService({
    ...input,
    schemaVersion: PROFESSIONAL_SERVICE_SCHEMA_VERSION,
    id: serviceId,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  }, {
    serviceId,
    createdAt: now,
    updatedAt: now,
    defaultRevision: 1,
  })
  return assertValidService(service, {
    serviceId,
    previous: null,
    expectedRevision: 0,
    now,
    maxFutureSkewMs: 0,
  })
}

function normalizeStoredService(value, serviceId, now) {
  if (!isRecord(value)) {
    throw new ProfessionalServiceServerError('professional_service_record_invalid', 409)
  }
  if (value.id !== serviceId || Object.keys(value).some((field) => !STORED_FIELD_SET.has(field))) {
    throw new ProfessionalServiceServerError('professional_service_record_invalid', 409)
  }
  const service = normalizeProfessionalService(value, { serviceId })
  return assertValidService(service, { serviceId, now })
}

function buildEditedService({ current, patch, serviceId, expectedRevision, now }) {
  validateClientServiceInput(patch, { partial: true })
  const normalizedCurrent = normalizeStoredService(current, serviceId, now)
  const service = normalizeProfessionalService({
    ...normalizedCurrent,
    ...patch,
    schemaVersion: PROFESSIONAL_SERVICE_SCHEMA_VERSION,
    id: serviceId,
    createdAt: normalizedCurrent.createdAt,
    updatedAt: now,
    revision: expectedRevision + 1,
  }, {
    serviceId,
    createdAt: normalizedCurrent.createdAt,
    updatedAt: now,
    defaultRevision: expectedRevision + 1,
  })
  return assertValidService(service, {
    serviceId,
    previous: normalizedCurrent,
    expectedRevision,
    now,
    maxFutureSkewMs: 0,
  })
}

function normalizeExpectedRevision(value) {
  const revision = Number(value)
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new ProfessionalServiceServerError('professional_service_expected_revision_invalid', 400)
  }
  return revision
}

function operationFingerprint({ action, serviceId, expectedRevision = null, input = null }) {
  return valueHash({ action, serviceId, expectedRevision, input: stableValue(input) })
}

function operationIdentityMatches(value, expected) {
  return isRecord(value)
    && value.version === PROFESSIONAL_SERVICE_OPERATION_VERSION
    && value.uid === expected.uid
    && value.operationId === expected.operationId
    && value.action === expected.action
    && value.serviceId === expected.serviceId
    && value.requestHash === expected.requestHash
}

function errorFromRejectedOperation(operation) {
  return new ProfessionalServiceServerError(
    String(operation?.errorCode || 'professional_service_operation_rejected'),
    Number(operation?.errorStatus || 409),
  )
}

async function beginOperation({ database, uid, operationId, action, serviceId, requestHash, expectedRevision, now }) {
  const operationRef = database.ref(`professionalServiceOperations/${uid}/${operationId}`)
  const expected = {
    version: PROFESSIONAL_SERVICE_OPERATION_VERSION,
    uid,
    operationId,
    action,
    serviceId,
    requestHash,
    expectedRevision: expectedRevision ?? null,
    status: 'processing',
    createdAt: now,
    updatedAt: now,
  }
  let sawExisting = false
  let mismatch = false
  const transaction = await operationRef.transaction((current) => {
    if (current == null) return expected
    sawExisting = true
    if (!operationIdentityMatches(current, expected)) {
      mismatch = true
      return undefined
    }
    return current
  }, undefined, false)
  const operation = transaction.snapshot.val()
  if (mismatch || !operationIdentityMatches(operation, expected)) {
    throw new ProfessionalServiceServerError('professional_service_idempotency_conflict', 409)
  }
  if (operation.status === 'rejected') throw errorFromRejectedOperation(operation)
  if (!transaction.committed && operation.status !== 'completed') {
    throw new ProfessionalServiceServerError('professional_service_operation_unavailable', 503)
  }
  return {
    ref: operationRef,
    operation,
    resumed: sawExisting,
    completed: operation.status === 'completed',
    result: operation.status === 'completed' ? operation.result : null,
  }
}

async function completeOperation(operationState, result, now) {
  const transaction = await operationState.ref.transaction((current) => {
    if (current == null) return null
    if (!operationIdentityMatches(current, operationState.operation)) return undefined
    if (current.status === 'completed') return current
    if (current.status !== 'processing') return undefined
    return {
      ...current,
      status: 'completed',
      result,
      completedAt: now,
      updatedAt: now,
    }
  }, undefined, false)
  const saved = transaction.snapshot.val()
  if (!transaction.committed || !operationIdentityMatches(saved, operationState.operation)
    || saved.status !== 'completed') {
    throw new ProfessionalServiceServerError('professional_service_operation_finalize_failed', 500)
  }
  return saved.result
}

async function rejectOperation(operationState, error, now) {
  if (!(error instanceof ProfessionalServiceServerError) || error.status >= 500) return
  await operationState.ref.transaction((current) => {
    if (current == null) return null
    if (!operationIdentityMatches(current, operationState.operation)) return undefined
    if (current.status === 'completed' || current.status === 'rejected') return current
    return {
      ...current,
      status: 'rejected',
      errorCode: error.code,
      errorStatus: error.status,
      rejectedAt: now,
      updatedAt: now,
    }
  }, undefined, false).catch(() => {})
}

function completedOperationResult(operationState, now) {
  if (!isRecord(operationState.result)) {
    throw new ProfessionalServiceServerError('professional_service_operation_result_invalid', 500)
  }
  const result = { ...operationState.result, idempotent: true }
  if (result.service != null) {
    result.service = normalizeStoredService(result.service, result.serviceId, now)
  }
  return result
}

function countServices(value) {
  if (value == null) return 0
  if (!isRecord(value)) {
    throw new ProfessionalServiceServerError('professional_service_collection_invalid', 500)
  }
  return Object.values(value).filter(isRecord).length
}

function assertMutationIdentity({ uid, operationId, serviceId = null }) {
  const safeUid = normalizeProfessionalServiceUid(uid)
  const safeOperationId = normalizeProfessionalServiceOperationId(operationId)
  const safeServiceId = serviceId == null ? null : normalizeProfessionalServiceId(serviceId)
  if (!safeUid) throw new ProfessionalServiceServerError('professional_service_uid_invalid', 400)
  if (!safeOperationId) throw new ProfessionalServiceServerError('professional_service_operation_id_invalid', 400)
  if (serviceId != null && !safeServiceId) {
    throw new ProfessionalServiceServerError('professional_service_id_invalid', 400)
  }
  return { uid: safeUid, operationId: safeOperationId, serviceId: safeServiceId }
}

export async function createProfessionalService({ database, uid, operationId, input, now = Date.now() }) {
  requireDatabase(database)
  const identity = assertMutationIdentity({ uid, operationId })
  const serverNow = trustedNow(now)
  const serviceId = deriveProfessionalServiceId(identity.uid, identity.operationId)
  const service = buildCreateService({ input, serviceId, now: serverNow })
  const requestHash = operationFingerprint({
    action: 'create',
    serviceId,
    input: editableServiceContent(service),
  })
  const operation = await beginOperation({
    database,
    uid: identity.uid,
    operationId: identity.operationId,
    action: 'create',
    serviceId,
    requestHash,
    expectedRevision: null,
    now: serverNow,
  })
  if (operation.completed) {
    await ensureSchemaV2(database, identity.uid)
    return completedOperationResult(operation, serverNow)
  }

  let outcome = 'unknown'
  const servicesRef = database.ref(`professionalServices/${identity.uid}`)
  try {
    const transaction = await servicesRef.transaction((current) => {
      const collection = current == null ? {} : current
      if (!isRecord(collection)) {
        outcome = 'invalid_collection'
        return undefined
      }
      const existing = collection[serviceId]
      if (existing != null) {
        try {
          const normalized = normalizeStoredService(existing, serviceId, serverNow)
          if (!contentMatches(normalized, service)) {
            outcome = 'idempotency_conflict'
            return undefined
          }
        } catch {
          outcome = 'idempotency_conflict'
          return undefined
        }
        outcome = 'existing_match'
        return collection
      }
      if (countServices(collection) >= PROFESSIONAL_SERVICE_LIMITS.maxServicesPerProfessional) {
        outcome = 'limit_reached'
        return undefined
      }
      outcome = 'created'
      return { ...collection, [serviceId]: service }
    }, undefined, false)

    if (!transaction.committed) {
      if (outcome === 'limit_reached') {
        throw new ProfessionalServiceServerError('professional_service_limit_reached', 409)
      }
      if (outcome === 'idempotency_conflict') {
        throw new ProfessionalServiceServerError('professional_service_idempotency_conflict', 409)
      }
      if (outcome === 'invalid_collection') {
        throw new ProfessionalServiceServerError('professional_service_collection_invalid', 500)
      }
      throw new ProfessionalServiceServerError('professional_service_create_failed', 500)
    }

    const saved = normalizeStoredService(transaction.snapshot.child(serviceId).val(), serviceId, serverNow)
    await ensureSchemaV2(database, identity.uid)
    const result = {
      action: 'create',
      serviceId,
      service: saved,
      revision: saved.revision,
      deleted: false,
      idempotent: outcome === 'existing_match' || operation.resumed,
    }
    await completeOperation(operation, result, serverNow)
    return result
  } catch (error) {
    await rejectOperation(operation, error, serverNow)
    throw error
  }
}

export async function editProfessionalService({
  database,
  uid,
  serviceId,
  operationId,
  expectedRevision,
  input,
  now = Date.now(),
}) {
  requireDatabase(database)
  const identity = assertMutationIdentity({ uid, operationId, serviceId })
  const revision = normalizeExpectedRevision(expectedRevision)
  validateClientServiceInput(input, { partial: true })
  const serverNow = trustedNow(now)
  const requestHash = operationFingerprint({
    action: 'edit',
    serviceId: identity.serviceId,
    expectedRevision: revision,
    input,
  })
  const operation = await beginOperation({
    database,
    uid: identity.uid,
    operationId: identity.operationId,
    action: 'edit',
    serviceId: identity.serviceId,
    requestHash,
    expectedRevision: revision,
    now: serverNow,
  })
  if (operation.completed) {
    await ensureSchemaV2(database, identity.uid)
    return completedOperationResult(operation, serverNow)
  }

  const serviceRef = database.ref(`professionalServices/${identity.uid}/${identity.serviceId}`)
  const preloaded = (await serviceRef.get()).val()
  if (preloaded != null) await ensureSchemaV2(database, identity.uid)
  let outcome = 'unknown'
  try {
    const transaction = await serviceRef.transaction((current) => {
      if (current == null && preloaded != null) {
        outcome = 'awaiting_authoritative_value'
        return null
      }
      if (current == null) {
        outcome = 'not_found'
        return undefined
      }
      let normalizedCurrent
      try {
        normalizedCurrent = normalizeStoredService(current, identity.serviceId, serverNow)
      } catch {
        outcome = 'invalid_record'
        return undefined
      }

      if (operation.resumed && normalizedCurrent.revision === revision + 1) {
        let desiredContent
        try {
          desiredContent = normalizeProfessionalService({
            ...normalizedCurrent,
            ...input,
            schemaVersion: PROFESSIONAL_SERVICE_SCHEMA_VERSION,
            id: identity.serviceId,
            createdAt: normalizedCurrent.createdAt,
            updatedAt: normalizedCurrent.updatedAt,
            revision: normalizedCurrent.revision,
          }, { serviceId: identity.serviceId })
        } catch {
          desiredContent = null
        }
        if (desiredContent && contentMatches(normalizedCurrent, desiredContent)) {
          outcome = 'existing_match'
          return current
        }
      }

      if (normalizedCurrent.revision !== revision) {
        outcome = 'stale_revision'
        return undefined
      }
      try {
        const next = buildEditedService({
          current: normalizedCurrent,
          patch: input,
          serviceId: identity.serviceId,
          expectedRevision: revision,
          now: serverNow,
        })
        outcome = 'edited'
        return next
      } catch (error) {
        outcome = error
        return undefined
      }
    }, undefined, false)

    if (!transaction.committed) {
      if (outcome instanceof ProfessionalServiceServerError) throw outcome
      if (outcome === 'not_found') throw new ProfessionalServiceServerError('professional_service_not_found', 404)
      if (outcome === 'stale_revision') throw new ProfessionalServiceServerError('professional_service_stale_revision', 409)
      if (outcome === 'invalid_record') throw new ProfessionalServiceServerError('professional_service_record_invalid', 409)
      throw new ProfessionalServiceServerError('professional_service_edit_failed', 500)
    }
    if (transaction.snapshot.val() == null) {
      throw new ProfessionalServiceServerError('professional_service_not_found', 404)
    }

    const saved = normalizeStoredService(transaction.snapshot.val(), identity.serviceId, serverNow)
    const result = {
      action: 'edit',
      serviceId: identity.serviceId,
      service: saved,
      revision: saved.revision,
      deleted: false,
      idempotent: outcome === 'existing_match' || operation.resumed,
    }
    await completeOperation(operation, result, serverNow)
    return result
  } catch (error) {
    await rejectOperation(operation, error, serverNow)
    throw error
  }
}

export async function deleteProfessionalService({
  database,
  uid,
  serviceId,
  operationId,
  expectedRevision,
  now = Date.now(),
}) {
  requireDatabase(database)
  const identity = assertMutationIdentity({ uid, operationId, serviceId })
  const revision = normalizeExpectedRevision(expectedRevision)
  const serverNow = trustedNow(now)
  const requestHash = operationFingerprint({
    action: 'delete',
    serviceId: identity.serviceId,
    expectedRevision: revision,
  })
  const operation = await beginOperation({
    database,
    uid: identity.uid,
    operationId: identity.operationId,
    action: 'delete',
    serviceId: identity.serviceId,
    requestHash,
    expectedRevision: revision,
    now: serverNow,
  })
  if (operation.completed) {
    await ensureSchemaV2(database, identity.uid)
    return completedOperationResult(operation, serverNow)
  }

  const serviceRef = database.ref(`professionalServices/${identity.uid}/${identity.serviceId}`)
  const preloaded = (await serviceRef.get()).val()
  if (preloaded != null) await ensureSchemaV2(database, identity.uid)
  let outcome = 'unknown'
  try {
    const transaction = await serviceRef.transaction((current) => {
      if (current == null && preloaded != null) {
        outcome = 'awaiting_authoritative_value'
        return null
      }
      if (current == null) {
        outcome = operation.resumed ? 'already_deleted' : 'not_found'
        return operation.resumed ? null : undefined
      }
      let normalized
      try {
        normalized = normalizeStoredService(current, identity.serviceId, serverNow)
      } catch {
        outcome = 'invalid_record'
        return undefined
      }
      if (normalized.revision !== revision) {
        outcome = 'stale_revision'
        return undefined
      }
      outcome = 'deleted'
      return null
    }, undefined, false)

    if (!transaction.committed) {
      if (outcome === 'not_found') throw new ProfessionalServiceServerError('professional_service_not_found', 404)
      if (outcome === 'stale_revision') throw new ProfessionalServiceServerError('professional_service_stale_revision', 409)
      if (outcome === 'invalid_record') throw new ProfessionalServiceServerError('professional_service_record_invalid', 409)
      throw new ProfessionalServiceServerError('professional_service_delete_failed', 500)
    }
    if (transaction.snapshot.val() != null) {
      throw new ProfessionalServiceServerError('professional_service_delete_failed', 500)
    }
    if (outcome === 'awaiting_authoritative_value' && !operation.resumed) {
      throw new ProfessionalServiceServerError('professional_service_stale_revision', 409)
    }

    const result = {
      action: 'delete',
      serviceId: identity.serviceId,
      revision,
      deleted: true,
      idempotent: outcome === 'already_deleted' || operation.resumed,
    }
    await completeOperation(operation, result, serverNow)
    return result
  } catch (error) {
    await rejectOperation(operation, error, serverNow)
    throw error
  }
}

export async function getProfessionalService({ database, actorUid, targetUid, serviceId, now = Date.now() }) {
  requireDatabase(database)
  const actor = normalizeProfessionalServiceUid(actorUid)
  const target = normalizeProfessionalServiceUid(targetUid || actorUid)
  const id = normalizeProfessionalServiceId(serviceId)
  if (!actor || !target || !id) throw new ProfessionalServiceServerError('professional_service_request_invalid', 400)
  const snapshot = await database.ref(`professionalServices/${target}/${id}`).get()
  if (!snapshot.exists()) throw new ProfessionalServiceServerError('professional_service_not_found', 404)
  const service = normalizeStoredService(snapshot.val(), id, trustedNow(now))
  if (actor !== target && service.ativo !== true) {
    throw new ProfessionalServiceServerError('professional_service_not_found', 404)
  }
  return { service, owner: actor === target }
}

export async function listProfessionalServices({ database, actorUid, targetUid, now = Date.now() }) {
  requireDatabase(database)
  const actor = normalizeProfessionalServiceUid(actorUid)
  const target = normalizeProfessionalServiceUid(targetUid || actorUid)
  if (!actor || !target) throw new ProfessionalServiceServerError('professional_service_request_invalid', 400)
  const owner = actor === target
  const baseRef = database.ref(`professionalServices/${target}`)
  const snapshot = owner
    ? await baseRef.get()
    : await baseRef.orderByChild('ativo').equalTo(true).limitToFirst(
      PROFESSIONAL_SERVICE_LIMITS.maxServicesPerProfessional,
    ).get()
  const serverNow = trustedNow(now)
  const services = []
  snapshot.forEach((child) => {
    try {
      const service = normalizeStoredService(child.val(), child.key, serverNow)
      if (owner || service.ativo === true) services.push(service)
    } catch {
      // Registros inválidos falham fechados e não são expostos pela listagem.
    }
  })
  services.sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id))
  return { services, owner }
}
