export const AI_USAGE_LIMITS = Object.freeze({
  rateWindowMs: 60_000,
  maxRequestsPerWindow: 5,
  maxRequestsPerUserPerDay: 30,
  maxRequestsGlobalPerDay: 1_000,
  requestTimeoutMs: 20_000,
})

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : fallback
}

export function aiUsageDayKey(now = Date.now()) {
  const date = new Date(Number(now))
  if (Number.isNaN(date.getTime())) throw new Error('invalid_ai_usage_timestamp')
  return date.toISOString().slice(0, 10)
}

export function evaluateAiUsage(current, {
  uid,
  now = Date.now(),
  limits = AI_USAGE_LIMITS,
} = {}) {
  const actorUid = String(uid || '').trim()
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(actorUid)) {
    return { allowed: false, reason: 'invalid_user', retryAfterMs: 0, value: current }
  }

  const timestamp = Number(now)
  const day = aiUsageDayKey(timestamp)
  const value = current && typeof current === 'object' ? current : {}
  const users = value.users && typeof value.users === 'object' ? value.users : {}
  const user = users[actorUid] && typeof users[actorUid] === 'object' ? users[actorUid] : {}
  const windowMs = positiveInteger(limits.rateWindowMs, AI_USAGE_LIMITS.rateWindowMs)
  const maxWindow = positiveInteger(limits.maxRequestsPerWindow, AI_USAGE_LIMITS.maxRequestsPerWindow)
  const maxUserDaily = positiveInteger(limits.maxRequestsPerUserPerDay, AI_USAGE_LIMITS.maxRequestsPerUserPerDay)
  const maxGlobalDaily = positiveInteger(limits.maxRequestsGlobalPerDay, AI_USAGE_LIMITS.maxRequestsGlobalPerDay)
  const globalCount = positiveInteger(value.total, 0)
  const userDailyCount = positiveInteger(user.total, 0)
  const previousWindowStart = positiveInteger(user.windowStartedAt, 0)
  const windowExpired = !previousWindowStart || timestamp < previousWindowStart || timestamp - previousWindowStart >= windowMs
  const windowStartedAt = windowExpired ? timestamp : previousWindowStart
  const windowCount = windowExpired ? 0 : positiveInteger(user.windowCount, 0)

  if (globalCount >= maxGlobalDaily) {
    return { allowed: false, reason: 'global_daily_quota', retryAfterMs: 60_000, value }
  }
  if (userDailyCount >= maxUserDaily) {
    return { allowed: false, reason: 'user_daily_quota', retryAfterMs: 60_000, value }
  }
  if (windowCount >= maxWindow) {
    return {
      allowed: false,
      reason: 'user_rate_limit',
      retryAfterMs: Math.max(1, windowMs - (timestamp - windowStartedAt)),
      value,
    }
  }

  return {
    allowed: true,
    reason: 'allowed',
    retryAfterMs: 0,
    day,
    value: {
      ...value,
      day,
      total: globalCount + 1,
      updatedAt: timestamp,
      users: {
        ...users,
        [actorUid]: {
          total: userDailyCount + 1,
          windowStartedAt,
          windowCount: windowCount + 1,
          lastRequestAt: timestamp,
          updatedAt: timestamp,
        },
      },
    },
  }
}

export async function reserveAiUsage({
  database,
  uid,
  now = Date.now(),
  limits = AI_USAGE_LIMITS,
} = {}) {
  if (!database) throw new Error('ai_usage_storage_unavailable')
  const day = aiUsageDayKey(now)
  let decision = null
  const result = await database.ref(`serverUsage/ai/${day}`).transaction((current) => {
    decision = evaluateAiUsage(current, { uid, now, limits })
    return decision.allowed ? decision.value : undefined
  })

  if (!result.committed) {
    return decision?.allowed === false
      ? decision
      : { allowed: false, reason: 'ai_usage_conflict', retryAfterMs: 1_000 }
  }
  return decision || { allowed: true, reason: 'allowed', retryAfterMs: 0 }
}
