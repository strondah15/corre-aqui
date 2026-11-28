const PROFESSIONAL_SERVICES_ENDPOINT = '/api/professional-services'
const PUBLIC_CATALOG_BATCH_SIZE = 60
const PUBLIC_CATALOG_MAX_UIDS = 300

const CLIENT_ERROR_MESSAGES = Object.freeze({
  professional_service_auth_required: 'Entre novamente para acessar seu portfólio.',
  professional_service_auth_invalid: 'Sua sessão expirou. Entre novamente para continuar.',
  professional_service_auth_mismatch: 'A sessão atual não corresponde ao perfil aberto.',
  professional_service_request_aborted: 'A operação foi cancelada porque a sessão mudou.',
  professional_service_network_error: 'Sem conexão com o portfólio. Verifique a internet e tente novamente.',
  professional_service_stale_revision: 'Este serviço foi alterado em outro dispositivo. Reabra-o antes de salvar.',
  professional_service_limit_reached: 'O limite de 12 serviços cadastrados foi atingido.',
  professional_service_not_found: 'Este serviço não existe mais. Atualize o portfólio.',
  professional_service_idempotency_conflict: 'A tentativa anterior usou dados diferentes. Revise e tente novamente.',
  professional_service_feature_disabled: 'O Portfólio 2.0 está em preparação. Seus serviços atuais continuam preservados.',
  professional_service_validation_failed: 'Revise os campos do serviço antes de salvar.',
  professional_service_service_unavailable: 'O portfólio está temporariamente indisponível.',
  professional_service_catalog_request_invalid: 'Não foi possível consultar estes portfólios.',
  professional_service_mutation_in_progress: 'Aguarde a operação atual terminar.',
})

function clientError(code, { status = 0, message = '', retryable = false, details = [], cause } = {}) {
  const error = new Error(message || CLIENT_ERROR_MESSAGES[code] || 'Não foi possível concluir a operação agora.')
  error.name = 'ProfessionalServicesClientError'
  error.code = code
  error.status = status
  error.retryable = retryable
  error.details = Array.isArray(details) ? details : []
  if (cause) error.cause = cause
  return error
}

function sanitizeOperationPart(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48)
}

export function createProfessionalServiceOperationId(prefix = 'portfolio') {
  const safePrefix = sanitizeOperationPart(prefix) || 'portfolio'
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`
  return `${safePrefix}_${sanitizeOperationPart(random)}`.slice(0, 128)
}

export function getProfessionalServicesErrorMessage(error) {
  const code = String(error?.code || '')
  return CLIENT_ERROR_MESSAGES[code] || String(error?.message || '').trim() || 'Não foi possível concluir a operação agora.'
}

async function authenticatedToken(user, expectedUid) {
  const uid = String(user?.uid || '')
  if (!uid) throw clientError('professional_service_auth_required', { status: 401 })
  if (expectedUid && uid !== String(expectedUid)) {
    throw clientError('professional_service_auth_mismatch', { status: 401 })
  }

  try {
    const token = await user.getIdToken()
    if (!token) throw new Error('missing_token')
    if (expectedUid && String(user?.uid || '') !== String(expectedUid)) {
      throw clientError('professional_service_auth_mismatch', { status: 401 })
    }
    return token
  } catch (error) {
    if (error?.code === 'professional_service_auth_mismatch') throw error
    throw clientError('professional_service_auth_invalid', { status: 401, cause: error })
  }
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.ok !== true) {
    const code = String(payload?.error?.code || payload?.reason || 'professional_service_unexpected_error')
    throw clientError(code, {
      status: response.status,
      message: payload?.error?.message || '',
      retryable: payload?.error?.retryable === true,
      details: payload?.error?.details,
    })
  }
  return payload.data
}

export async function requestProfessionalServices({
  user,
  expectedUid,
  method = 'GET',
  body,
  query,
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw clientError('professional_service_network_error')
  }
  const token = await authenticatedToken(user, expectedUid)
  const search = query ? `?${new URLSearchParams(query).toString()}` : ''

  try {
    const response = await fetchImpl(`${PROFESSIONAL_SERVICES_ENDPOINT}${search}`, {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    })
    return await parseResponse(response)
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) {
      throw clientError('professional_service_request_aborted', { cause: error })
    }
    if (error?.name === 'ProfessionalServicesClientError') throw error
    throw clientError('professional_service_network_error', { retryable: true, cause: error })
  }
}

export function listOwnProfessionalServices(options) {
  return requestProfessionalServices({ ...options, method: 'GET' })
}

export function listPublicProfessionalServices({ targetUid, ...options }) {
  return requestProfessionalServices({
    ...options,
    method: 'GET',
    query: { view: 'public', uid: String(targetUid || '') },
  })
}

export async function listPublicProfessionalServiceCatalog({ professionalIds, ...options }) {
  const ids = Array.from(new Set((Array.isArray(professionalIds) ? professionalIds : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)))
    .slice(0, PUBLIC_CATALOG_MAX_UIDS)
  if (!ids.length) return { catalogs: {} }

  const catalogs = {}
  for (let index = 0; index < ids.length; index += PUBLIC_CATALOG_BATCH_SIZE) {
    const batch = ids.slice(index, index + PUBLIC_CATALOG_BATCH_SIZE)
    const result = await requestProfessionalServices({
      ...options,
      method: 'GET',
      query: { view: 'public', uids: batch.join(',') },
    })
    Object.assign(catalogs, result?.catalogs || {})
  }
  return { catalogs }
}

export function createOwnProfessionalService({ operationId, service, ...options }) {
  return requestProfessionalServices({
    ...options,
    method: 'POST',
    body: { operationId, service },
  })
}

export function editOwnProfessionalService({ operationId, serviceId, expectedRevision, service, ...options }) {
  return requestProfessionalServices({
    ...options,
    method: 'PATCH',
    body: { operationId, serviceId, expectedRevision, service },
  })
}

export function deleteOwnProfessionalService({ operationId, serviceId, expectedRevision, ...options }) {
  return requestProfessionalServices({
    ...options,
    method: 'DELETE',
    body: { operationId, serviceId, expectedRevision },
  })
}
