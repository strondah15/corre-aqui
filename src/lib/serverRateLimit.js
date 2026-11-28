function finiteInteger(value, fallback, minimum = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.trunc(parsed))
}

function safeTimestamp(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function evaluateFixedWindowLimit(current, {
  now = Date.now(),
  windowMs,
  maxRequests,
  minIntervalMs = 0,
} = {}) {
  const timestamp = safeTimestamp(now) || Date.now()
  const duration = finiteInteger(windowMs, 60_000)
  const maximum = finiteInteger(maxRequests, 1)
  const minimumInterval = finiteInteger(minIntervalMs, 0, 0)
  const value = current && typeof current === 'object' ? current : {}
  const previousRequestAt = safeTimestamp(value.lastRequestAt)

  if (minimumInterval > 0 && previousRequestAt > 0 && timestamp - previousRequestAt < minimumInterval) {
    return {
      allowed: false,
      reason: 'minimum_interval',
      retryAfterMs: minimumInterval - (timestamp - previousRequestAt),
      value,
    }
  }

  const previousWindowStart = safeTimestamp(value.windowStartedAt)
  const windowExpired = !previousWindowStart || timestamp - previousWindowStart >= duration || timestamp < previousWindowStart
  const windowStartedAt = windowExpired ? timestamp : previousWindowStart
  const count = windowExpired ? 0 : finiteInteger(value.count, 0, 0)

  if (count >= maximum) {
    return {
      allowed: false,
      reason: 'window_limit',
      retryAfterMs: Math.max(1, duration - (timestamp - windowStartedAt)),
      value,
    }
  }

  return {
    allowed: true,
    reason: 'allowed',
    retryAfterMs: 0,
    value: {
      windowStartedAt,
      count: count + 1,
      lastRequestAt: timestamp,
      updatedAt: timestamp,
    },
  }
}

export async function consumeFixedWindowLimit({
  database,
  path,
  now = Date.now(),
  windowMs,
  maxRequests,
  minIntervalMs = 0,
} = {}) {
  if (!database || !path) throw new Error('rate_limit_storage_unavailable')

  let decision = null
  const result = await database.ref(path).transaction((current) => {
    decision = evaluateFixedWindowLimit(current, { now, windowMs, maxRequests, minIntervalMs })
    return decision.allowed ? decision.value : undefined
  })

  if (!result.committed) {
    return decision?.allowed === false
      ? decision
      : { allowed: false, reason: 'rate_limit_conflict', retryAfterMs: 1_000 }
  }

  return decision || { allowed: true, reason: 'allowed', retryAfterMs: 0 }
}
