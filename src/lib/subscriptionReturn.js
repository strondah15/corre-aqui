import {
  CLIENT_ANNUAL_PRODUCT_ID,
  PROFESSIONAL_ANNUAL_PRODUCT_ID,
} from './subscriptions.js'

export const SUBSCRIPTION_CONFIRMATION_TIMEOUT_MS = 30_000
export const SUBSCRIPTION_CONFIRMATION_POLL_INTERVAL_MS = 2_500
export const SUBSCRIPTION_STATUS_REQUEST_TIMEOUT_MS = 8_000

const defaultWait = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

function verificationError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function isCancelled(signal, shouldContinue) {
  return signal?.aborted || !shouldContinue()
}

async function readStatusWithTimeout({ readStatus, timeoutMs, signal }) {
  if (signal?.aborted) throw verificationError('verification_cancelled', 'Verificação cancelada.')

  const controller = new AbortController()
  let timeoutId
  let removeAbortListener = () => {}
  let timedOut = false

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(verificationError('status_timeout', 'A consulta de status excedeu o tempo limite.'))
    }, timeoutMs)
  })

  const cancelled = new Promise((_, reject) => {
    if (!signal) return
    const onAbort = () => {
      controller.abort()
      reject(verificationError('verification_cancelled', 'Verificação cancelada.'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    removeAbortListener = () => signal.removeEventListener('abort', onAbort)
  })

  try {
    return await Promise.race([
      Promise.resolve().then(() => readStatus({ signal: controller.signal })),
      timeout,
      cancelled,
    ])
  } catch (error) {
    if (timedOut) throw verificationError('status_timeout', 'A consulta de status excedeu o tempo limite.')
    throw error
  } finally {
    clearTimeout(timeoutId)
    removeAbortListener()
  }
}

export function subscriptionKindFromProduct(productId) {
  if (productId === PROFESSIONAL_ANNUAL_PRODUCT_ID) return 'professional'
  if (productId === CLIENT_ANNUAL_PRODUCT_ID) return 'client'
  return ''
}

export function resolveAuthoritativeSubscriptionActivation({
  result,
  expectedKind,
  baselineExpiresAt = 0,
  checkoutCreatedAt = 0,
}) {
  const plan = expectedKind ? result?.subscriptions?.[expectedKind] : null
  const previousExpiry = Number(baselineExpiresAt || 0)
  const currentExpiry = Number(plan?.expiresAt || 0)
  const activationStartedAt = Number(plan?.startedAt || 0)
  const hasFreshActivation = Number(checkoutCreatedAt) > 0
    && activationStartedAt >= Number(checkoutCreatedAt) - 60_000
  const expiryWasExtended = previousExpiry > 0 && currentExpiry > previousExpiry
  const approved = plan?.active === true && (expiryWasExtended || hasFreshActivation)

  return {
    approved,
    expiresAt: approved ? (plan?.expiresAt || null) : null,
  }
}

export async function verifyAuthoritativeSubscriptionReturn({
  readStatus,
  expectedKind,
  baselineExpiresAt = 0,
  checkoutCreatedAt = 0,
  automatic = false,
  shouldContinue = () => true,
  signal,
  timeoutMs = SUBSCRIPTION_CONFIRMATION_TIMEOUT_MS,
  intervalMs = SUBSCRIPTION_CONFIRMATION_POLL_INTERVAL_MS,
  requestTimeoutMs = SUBSCRIPTION_STATUS_REQUEST_TIMEOUT_MS,
  now = Date.now,
  wait = defaultWait,
}) {
  if (typeof readStatus !== 'function' || !expectedKind) {
    return { state: 'pending', reason: 'invalid_verification_context', attempts: 0 }
  }

  const startedAt = now()
  let attempts = 0

  while (true) {
    if (isCancelled(signal, shouldContinue)) {
      return { state: 'cancelled', reason: 'verification_cancelled', attempts }
    }
    if (automatic && attempts > 0 && now() - startedAt >= timeoutMs) {
      return { state: 'pending', reason: 'confirmation_timeout', timedOut: true, attempts }
    }

    attempts += 1
    let result
    try {
      const elapsedBeforeRequest = now() - startedAt
      const effectiveRequestTimeout = automatic
        ? Math.max(1, Math.min(requestTimeoutMs, timeoutMs - elapsedBeforeRequest))
        : requestTimeoutMs
      result = await readStatusWithTimeout({ readStatus, timeoutMs: effectiveRequestTimeout, signal })
    } catch (error) {
      if (isCancelled(signal, shouldContinue) || error?.code === 'verification_cancelled') {
        return { state: 'cancelled', reason: 'verification_cancelled', attempts }
      }
      return {
        state: 'pending',
        reason: error?.code === 'status_timeout' ? 'status_timeout' : 'status_error',
        attempts,
      }
    }

    if (isCancelled(signal, shouldContinue)) {
      return { state: 'cancelled', reason: 'verification_cancelled', attempts }
    }

    const activation = resolveAuthoritativeSubscriptionActivation({
      result,
      expectedKind,
      baselineExpiresAt,
      checkoutCreatedAt,
    })
    if (activation.approved) {
      return {
        state: 'approved',
        reason: 'backend_confirmed',
        expiresAt: activation.expiresAt,
        attempts,
      }
    }
    if (!automatic) {
      return { state: 'pending', reason: 'backend_not_active', attempts }
    }

    const remaining = timeoutMs - (now() - startedAt)
    if (remaining <= 0) {
      return { state: 'pending', reason: 'confirmation_timeout', timedOut: true, attempts }
    }
    await wait(Math.min(intervalMs, remaining))
  }
}
