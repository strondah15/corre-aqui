import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function importSource(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const usagePolicy = await importSource('../src/lib/aiUsagePolicy.js')
const rateLimit = await importSource('../src/lib/serverRateLimit.js')

const baseTime = Date.UTC(2026, 9, 12, 12, 0, 0)
assert.equal(usagePolicy.aiUsageDayKey(baseTime), '2026-10-12')
assert.equal(usagePolicy.evaluateAiUsage(null, { uid: '../invalid', now: baseTime }).allowed, false)

let usage = null
for (let index = 0; index < usagePolicy.AI_USAGE_LIMITS.maxRequestsPerWindow; index += 1) {
  const decision = usagePolicy.evaluateAiUsage(usage, { uid: 'user-A', now: baseTime + index })
  assert.equal(decision.allowed, true)
  usage = decision.value
}
const rateDenied = usagePolicy.evaluateAiUsage(usage, { uid: 'user-A', now: baseTime + 100 })
assert.equal(rateDenied.allowed, false)
assert.equal(rateDenied.reason, 'user_rate_limit')
const afterWindow = usagePolicy.evaluateAiUsage(usage, {
  uid: 'user-A',
  now: baseTime + usagePolicy.AI_USAGE_LIMITS.rateWindowMs,
})
assert.equal(afterWindow.allowed, true, 'janela curta expira sem apagar quota diária')
assert.equal(afterWindow.value.users['user-A'].total, usagePolicy.AI_USAGE_LIMITS.maxRequestsPerWindow + 1)

const dailyUser = {
  day: '2026-10-12',
  total: 30,
  users: {
    'user-A': {
      total: usagePolicy.AI_USAGE_LIMITS.maxRequestsPerUserPerDay,
      windowStartedAt: baseTime - 120_000,
      windowCount: 0,
    },
  },
}
assert.equal(usagePolicy.evaluateAiUsage(dailyUser, { uid: 'user-A', now: baseTime }).reason, 'user_daily_quota')
const otherUser = usagePolicy.evaluateAiUsage(dailyUser, { uid: 'user-B', now: baseTime })
assert.equal(otherUser.allowed, true, 'quota por usuário não bloqueia outro UID')
assert.equal(otherUser.value.total, 31)

const globalUsage = {
  day: '2026-10-12',
  total: usagePolicy.AI_USAGE_LIMITS.maxRequestsGlobalPerDay,
  users: {},
}
assert.equal(usagePolicy.evaluateAiUsage(globalUsage, { uid: 'user-B', now: baseTime }).reason, 'global_daily_quota')

let fixed = null
for (let index = 0; index < 3; index += 1) {
  const decision = rateLimit.evaluateFixedWindowLimit(fixed, {
    now: baseTime + (index * 2_000),
    windowMs: 60_000,
    maxRequests: 3,
  })
  assert.equal(decision.allowed, true)
  fixed = decision.value
}
assert.equal(rateLimit.evaluateFixedWindowLimit(fixed, {
  now: baseTime + 10_000,
  windowMs: 60_000,
  maxRequests: 3,
}).allowed, false)
assert.equal(rateLimit.evaluateFixedWindowLimit(null, {
  now: baseTime,
  windowMs: 60_000,
  maxRequests: 3,
  minIntervalMs: 5_000,
}).allowed, true)
const firstInterval = rateLimit.evaluateFixedWindowLimit(null, {
  now: baseTime,
  windowMs: 60_000,
  maxRequests: 3,
  minIntervalMs: 5_000,
}).value
assert.equal(rateLimit.evaluateFixedWindowLimit(firstInterval, {
  now: baseTime + 1_000,
  windowMs: 60_000,
  maxRequests: 3,
  minIntervalMs: 5_000,
}).reason, 'minimum_interval')

const [routeSource, policySource] = await Promise.all([
  readFile(new URL('../src/app/api/chatgpt/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/aiUsagePolicy.js', import.meta.url), 'utf8'),
])
assert.ok(routeSource.indexOf('verifyIdToken(idToken)') < routeSource.indexOf('req.json()'), 'token é validado antes do corpo')
assert.ok(routeSource.indexOf('reserveAiUsage') < routeSource.indexOf("fetch('https://api.openai.com"), 'quota é reservada antes da chamada cobrada')
assert.match(routeSource, /AbortController/)
assert.match(routeSource, /AI_USAGE_LIMITS\.requestTimeoutMs/)
assert.ok(routeSource.indexOf('resposta.json()') < routeSource.indexOf('clearTimeout(timeoutHandle)'), 'timeout cobre também a leitura do corpo')
assert.match(routeSource, /max_tokens:\s*600/, 'cada resposta possui teto explícito de tokens')
assert.match(routeSource, /Cache-Control': 'private, no-store/)
assert.match(routeSource, /process\.env\.OPENAI_API_KEY/)
assert.doesNotMatch(routeSource, /NEXT_PUBLIC_[A-Z0-9_]*OPENAI/)
assert.match(policySource, /serverUsage\/ai\/\$\{day\}/)
assert.match(policySource, /\.transaction\(/, 'rate e quotas são reservados atomicamente no servidor')

console.log('Segurança da IA: autenticação, rate limit, quotas, timeout e armazenamento server-side OK')
