import { ProfessionalServicesActivationError } from './professional-services-activation-core.mjs'

function rootEndpoint(databaseURL) {
  let parsed
  try {
    parsed = new URL(databaseURL)
  } catch {
    throw new ProfessionalServicesActivationError('portfolio2_activation_database_url_invalid')
  }
  parsed.pathname = '/.json'
  parsed.hash = ''
  return parsed
}

function requestHeaders(accessToken, extra = {}) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  }
}

function httpError(code, response) {
  const error = new ProfessionalServicesActivationError(code)
  error.httpStatus = Number(response?.status || 0)
  return error
}

async function responseJson(response, code) {
  try {
    return await response.json()
  } catch {
    throw new ProfessionalServicesActivationError(code)
  }
}

export function createPortfolio2RtdbRestTransport({
  databaseURL,
  accessToken,
  timeoutMs = 20_000,
  fetchImplementation = fetch,
} = {}) {
  if (!accessToken || typeof fetchImplementation !== 'function') {
    throw new ProfessionalServicesActivationError('portfolio2_activation_transport_invalid')
  }
  const endpoint = rootEndpoint(databaseURL)

  return Object.freeze({
    async readRoot() {
      let response
      try {
        response = await fetchImplementation(endpoint, {
          method: 'GET',
          redirect: 'error',
          headers: requestHeaders(accessToken, { 'X-Firebase-ETag': 'true' }),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch {
        throw new ProfessionalServicesActivationError('portfolio2_activation_database_read_failed')
      }
      if (!response.ok) {
        throw httpError('portfolio2_activation_database_read_failed', response)
      }
      const version = response.headers.get('etag')
      if (!version) {
        throw new ProfessionalServicesActivationError('portfolio2_activation_database_etag_missing')
      }
      return {
        value: await responseJson(response, 'portfolio2_activation_database_json_invalid'),
        version,
      }
    },

    async conditionalReplaceRoot(value, version) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || !version) {
        throw new ProfessionalServicesActivationError('portfolio2_activation_conditional_update_invalid')
      }
      let response
      try {
        response = await fetchImplementation(endpoint, {
          method: 'PUT',
          redirect: 'error',
          headers: requestHeaders(accessToken, {
            'Content-Type': 'application/json',
            'if-match': version,
          }),
          body: JSON.stringify(value),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch {
        throw new ProfessionalServicesActivationError('portfolio2_activation_database_write_failed')
      }
      if (response.status === 412) return { committed: false, conflict: true }
      if (!response.ok) {
        throw httpError('portfolio2_activation_database_write_failed', response)
      }
      return { committed: true, conflict: false }
    },
  })
}
