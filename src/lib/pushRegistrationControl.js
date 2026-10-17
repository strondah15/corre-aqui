export const PUSH_REGISTRATION_AUTH_COOLDOWN_MS = 5 * 60_000
export const PUSH_REGISTRATION_TRANSIENT_COOLDOWN_MS = 30_000

function limitedText(value, fallback = '', max = 320) {
  return String(value || fallback || '').trim().slice(0, max)
}

function sanitizeDiagnosticMessage(value) {
  return limitedText(value, 'Falha desconhecida ao registrar o dispositivo no FCM.')
    .replace(/AIza[A-Za-z0-9_-]+/g, '[api-key-redacted]')
    .replace(/\b(Bearer|FIS)\s+[^\s)]+/gi, '$1 [credential-redacted]')
    .replace(/\/registrations\/[^\s)]+/gi, '/registrations/[token-redacted]')
    .replace(/\b[A-Za-z0-9._-]{120,}\b/g, '[credential-redacted]')
}

export function describePushRegistrationError(error = {}) {
  const code = limitedText(error?.code, 'push/registration-failed', 100)
  const message = sanitizeDiagnosticMessage(error?.message || error)
  const explicitStatus = Number(error?.httpStatus || error?.status || 0)
  const unauthorized = explicitStatus === 401
    || /\b401\b|missing required authentication credential|unauthenticated|unauthori[sz]ed/i.test(message)
  const tokenSubscriptionFailed = code === 'messaging/token-subscribe-failed'
  const reason = tokenSubscriptionFailed && unauthorized
    ? 'fcm_registration_unauthorized'
    : tokenSubscriptionFailed
      ? 'fcm_registration_rejected'
      : 'fcm_registration_failed'

  return Object.freeze({
    phase: 'token_registration',
    reason,
    code,
    httpStatus: unauthorized ? 401 : explicitStatus || null,
    message,
  })
}

export function pushRegistrationCooldownMs(details = {}) {
  return details.reason === 'fcm_registration_unauthorized'
    ? PUSH_REGISTRATION_AUTH_COOLDOWN_MS
    : PUSH_REGISTRATION_TRANSIENT_COOLDOWN_MS
}

export function createPushRegistrationError(error) {
  if (error?.name === 'PushRegistrationError') return error

  const details = describePushRegistrationError(error)
  const message = details.reason === 'fcm_registration_unauthorized'
    ? 'Nao foi possivel registrar este navegador para notificacoes (HTTP 401). O teste nao chegou a etapa de envio.'
    : 'Nao foi possivel registrar este navegador para notificacoes. O teste nao chegou a etapa de envio.'
  const failure = new Error(message)
  failure.name = 'PushRegistrationError'
  failure.code = details.code
  failure.reason = details.reason
  failure.httpStatus = details.httpStatus
  failure.safeDetails = details
  failure.retryAfterMs = pushRegistrationCooldownMs(details)
  return failure
}

export function createPushRegistrationController({ requestToken, now = () => Date.now(), onFailure } = {}) {
  if (typeof requestToken !== 'function') throw new TypeError('requestToken deve ser uma funcao.')

  let inFlight = null
  let retryAfter = 0
  let lastFailure = null

  const reset = () => {
    retryAfter = 0
    lastFailure = null
  }

  const request = (...args) => {
    const currentTime = Number(now()) || Date.now()
    if (inFlight) return inFlight
    if (lastFailure && currentTime < retryAfter) return Promise.reject(lastFailure)

    inFlight = Promise.resolve()
      .then(() => requestToken(...args))
      .then((token) => {
        reset()
        return token
      })
      .catch((error) => {
        const failure = createPushRegistrationError(error)
        lastFailure = failure
        retryAfter = (Number(now()) || currentTime) + failure.retryAfterMs
        try {
          onFailure?.(failure)
        } catch {}
        throw failure
      })
      .finally(() => {
        inFlight = null
      })

    return inFlight
  }

  return Object.freeze({
    request,
    reset,
    getState: () => Object.freeze({ inFlight: Boolean(inFlight), retryAfter, lastFailure }),
  })
}
