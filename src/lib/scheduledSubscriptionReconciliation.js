import { randomUUID } from 'node:crypto'
import { asTimestamp } from '@/lib/commercialServer'
import { isTerminalRecurringCancellation } from '@/lib/recurringSubscriptions'
import { subscriptionKindForProduct, isRecurringSubscriptionProduct } from '@/lib/subscriptions'
import {
  hasDueRecurringInvoices,
  readRecurringReconciliationContext,
  reconcilePaidInstallment,
  reconcileRecurringInvoicePage,
  reconcileRecurringProviderState,
} from '@/lib/subscriptionReconciliation'

const rootPath = 'subscriptionReconciliationSchedule'
const minute = 60_000
const hour = 60 * minute
const day = 24 * hour
const pageSize = 24
const batchSize = 8
const invoicePageSize = 4
const attemptKey = /^[A-Za-z0-9_-]{1,128}$/

async function enqueue(jobs, id, now) {
  if (typeof id !== 'string' || !attemptKey.test(id)) return
  const job = jobs.child(id)
  if (!(await job.get()).exists()) await job.setWithPriority({ queuedAt: now }, now)
}

async function discoverJobs(database, root, jobs, now, signal) {
  const inbox = root.child('inbox')
  const pending = await inbox.orderByKey().limitToFirst(pageSize).get()
  const keys = []
  pending.forEach((entry) => { keys.push(entry.key) })
  for (const id of keys) {
    signal.throwIfAborted()
    await enqueue(jobs, id, now)
    await inbox.child(id).remove()
  }

  // One bounded pass over the existing recurring reverse index, never users.
  const bootstrap = root.child('bootstrap')
  const state = (await bootstrap.get()).val() || {}
  if (state.done) return
  const index = database.ref('commercialCheckoutAttemptsBySubscription')
  const query = index.orderByKey()
  const page = await (state.cursor ? query.startAfter(state.cursor) : query).limitToFirst(pageSize).get()
  const entries = []
  page.forEach((entry) => { entries.push(entry) })
  for (const entry of entries) {
    signal.throwIfAborted()
    await enqueue(jobs, entry.val(), now)
  }
  await bootstrap.set({ cursor: entries.at(-1)?.key || state.cursor || null, done: entries.length < pageSize })
}

function nextCheck(plan, provider, knownStatus, now) {
  const dueAt = asTimestamp(provider.next_payment_date) || asTimestamp(plan.nextPaymentDate)
    || (plan.paymentId ? asTimestamp(plan.expiresAt) : asTimestamp(plan.firstChargeAt))
  if (isTerminalRecurringCancellation(knownStatus)) {
    const paidUntil = plan.paymentId ? asTimestamp(plan.expiresAt) : 0
    const canceledAt = asTimestamp(plan.canceledAt) || asTimestamp(provider.last_modified)
      || asTimestamp(plan.providerLastModifiedAt)
    return Math.max(paidUntil, canceledAt + 7 * day) > now ? now + day : null
  }
  if (knownStatus === 'paused') return now + 6 * hour
  if (knownStatus === 'pending') return now + 2 * hour
  if (!dueAt || dueAt <= now) return now + 30 * minute
  return Math.min(now + day, Math.max(now + 30 * minute, dueAt - hour))
}

async function processJob({ database, id, job, signal, now }) {
  const attempt = (await database.ref(`commercialCheckoutAttempts/${id}`).get()).val()
  if (attempt?.id !== id || !isRecurringSubscriptionProduct(attempt.productId)) return { dueAt: null }
  const kind = subscriptionKindForProduct(attempt.productId)
  const uid = attempt.userId
  const preapprovalId = attempt.preapprovalId
  if (typeof uid !== 'string' || !uid || /[.#$\[\]/]/.test(uid) || attempt.targetId !== uid
    || typeof preapprovalId !== 'string' || !attemptKey.test(preapprovalId)
    || !attempt.externalReference || !attempt.collectorId || !attempt.applicationId) return { dueAt: null }
  const currentPlan = (await database.ref(`users/${uid}/subscriptions/${kind}`).get()).val() || {}
  const context = await readRecurringReconciliationContext({ database, uid, kind, expectedAttemptId: id, currentPlan })
  if (!context) {
    // A new authorization can coexist with a paid term from an earlier one.
    if (currentPlan.preapprovalId !== preapprovalId && currentPlan.paymentReference === attempt.externalReference
      && asTimestamp(currentPlan.expiresAt) > now) {
      const checked = await reconcilePaidInstallment({ database, context: { plan: currentPlan, attempt, preapprovalId }, signal })
      return { dueAt: checked ? now + day : null }
    }
    // Checkout persists its reverse index before it commits the user's plan.
    return { dueAt: now - job.queuedAt < 2 * hour ? now + 30 * minute : null }
  }
  const { plan } = context
  const { provider, state } = await reconcileRecurringProviderState({ database, context, signal })
  const knownStatus = state.ignoredOutOfOrder ? plan.providerStatus : state.providerStatus
  let invoiceOffset = 0
  const checkedPaymentId = await reconcilePaidInstallment({ database, context, signal })
  if (!state.ignoredOutOfOrder && (state.payerBindingPending || hasDueRecurringInvoices(plan, provider, now))) {
    invoiceOffset = await reconcileRecurringInvoicePage({
      database,
      preapprovalId,
      subscription: state.payerBindingPending ? provider : null,
      signal,
      offset: job.invoiceOffset || 0,
      limit: job.failures ? 1 : invoicePageSize,
      checkedPaymentId,
    })
  }

  const dueAt = nextCheck(plan, provider, knownStatus, now)
  return { dueAt: invoiceOffset ? now + 30 * minute : dueAt, invoiceOffset }
}

function retryJob(error, count, now) {
  const status = error?.providerHttpStatus
  const reason = status === 429 ? 'provider_rate_limited'
    : status >= 500 ? 'provider_unavailable'
      : status >= 400 ? 'provider_request_rejected'
        : ['AbortError', 'TimeoutError'].includes(error?.name) ? 'deadline_exceeded'
          : error?.message === 'payment_subscription_identity_mismatch' ? 'approved_payment_identity_review'
            : 'reconciliation_failed'
  const backoff = Math.min(12 * hour, 30 * minute * 2 ** Math.min(count - 1, 5))
  const providerResumeAt = Math.min(now + day, Number(error?.retryAfterAt) || 0)
  return { dueAt: Math.max(now + backoff, providerResumeAt), reason }
}

export async function runScheduledSubscriptionReconciliation({
  database, signal, now = Date.now, log = console.info,
}) {
  const deadline = AbortSignal.timeout(40_000)
  const runSignal = signal ? AbortSignal.any([signal, deadline]) : deadline
  const startedAt = now()
  const owner = randomUUID()
  const root = database.ref(rootPath)
  const lease = root.child('lease')
  const lock = await lease.transaction((current) => {
    if (current?.expiresAt > startedAt) return undefined
    // Longer than the Vercel function's 60s wall-clock limit.
    return { owner, expiresAt: startedAt + 2 * minute }
  })
  if (!lock.committed || lock.snapshot.val()?.owner !== owner) return { status: 'busy' }
  const summary = { status: 'complete', checked: 0, deferred: 0, retired: 0, failures: {} }
  try {
    const cooldown = root.child('providerResumeAt')
    if ((await cooldown.get()).val() > startedAt) {
      summary.status = 'provider_cooldown'
      return summary
    }
    const jobs = root.child('jobs')
    await discoverJobs(database, root, jobs, startedAt, runSignal)
    // RTDB priorities have a built-in index. No rules or database index changes.
    const due = await jobs.orderByPriority().endAt(startedAt).limitToFirst(batchSize).get()
    const entries = []
    due.forEach((entry) => { entries.push(entry) })
    for (const entry of entries) {
      if (runSignal.aborted) break
      const job = entry.val()
      const currentTime = now()
      const jobTimeout = AbortSignal.timeout(job.failures ? 37_000 : 20_000)
      const jobSignal = AbortSignal.any([jobTimeout, runSignal])
      summary.checked++
      try {
        const { dueAt, invoiceOffset } = await processJob({
          database, id: entry.key, job, signal: jobSignal, now: currentTime,
        })
        if (dueAt === null) {
          await jobs.child(entry.key).remove()
          summary.retired++
        } else {
          await jobs.child(entry.key).setWithPriority({
            queuedAt: job.queuedAt,
            invoiceOffset: invoiceOffset || 0,
          }, dueAt)
        }
      } catch (error) {
        const failures = Number(job.failures || 0) + 1
        const retry = retryJob(error, failures, currentTime)
        summary.deferred++
        summary.failures[retry.reason] = (summary.failures[retry.reason] || 0) + 1
        await jobs.child(entry.key).setWithPriority({ ...job, failures }, retry.dueAt)
        if (retry.reason === 'provider_rate_limited') {
          await cooldown.set(retry.dueAt)
          break
        }
      }
    }
    if (runSignal.aborted) summary.status = 'budget_exhausted'
    return summary
  } finally {
    log(JSON.stringify({ event: 'scheduled_subscription_reconciliation', ...summary }))
    // An uncached transaction can start with null and rerun on the server value.
    await lease.transaction((current) => current === null || current.owner === owner ? null : undefined)
  }
}
