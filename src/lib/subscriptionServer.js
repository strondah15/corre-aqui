import {
  PROFESSIONAL_QUARTERLY_PRODUCT_ID,
  PROFESSIONAL_TRIAL_MS,
  canCreateClientDirectRequest,
  getClientSubscriptionStatus,
  getProfessionalSubscriptionStatus,
  subscriptionTimestamp,
} from './subscriptions.js'
import {
  assessStagingSubscriptionFixtureRuntime,
  resolveClientDirectRequestAccessWithFixture,
} from './stagingSubscriptionFixtures.js'
import { publicPaymentHistoryEntry, recurringCheckoutAmountInCents } from './recurringSubscriptions.js'

async function readPaymentHistory(database, uid, kind) {
  const snapshot = await database.ref(`subscriptionPaymentHistory/${uid}/${kind}`).get()
  const value = snapshot.val()
  if (!value || typeof value !== 'object') return []
  return Object.values(value)
    .map((entry) => publicPaymentHistoryEntry(entry))
    .filter((entry) => entry.id && entry.amountInCents > 0 && entry.currency === 'BRL')
    .sort((left, right) => Number(right.updatedAt || right.paidAt || 0) - Number(left.updatedAt || left.paidAt || 0))
    .slice(0, 10)
}

async function readProfessionalRecurringAmount(database, uid, plan) {
  const attemptId = plan?.checkoutAttemptId
  if (
    plan?.recurringProductId !== PROFESSIONAL_QUARTERLY_PRODUCT_ID
    || !plan.preapprovalId
    || typeof attemptId !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(attemptId)
  ) return null

  const snapshot = await database.ref(`commercialCheckoutAttempts/${attemptId}`).get()
  const attempt = snapshot.val()
  if (attempt?.id !== attemptId || attempt.userId !== uid || attempt.preapprovalId !== plan.preapprovalId) return null
  return recurringCheckoutAmountInCents(attempt, PROFESSIONAL_QUARTERLY_PRODUCT_ID)
}

async function resolveClientDirectRequestAccess(database, account, uid, now, env = process.env) {
  const commercialAccess = canCreateClientDirectRequest(account, { now })
  if (commercialAccess.allowed) {
    return resolveClientDirectRequestAccessWithFixture({
      commercialAccess,
      uid,
      now,
      env,
    })
  }

  const runtime = assessStagingSubscriptionFixtureRuntime(env)
  if (!runtime.enabled) {
    return resolveClientDirectRequestAccessWithFixture({
      commercialAccess,
      fixture: null,
      uid,
      now,
      env,
      runtime,
    })
  }

  let fixture = null
  try {
    const fixtureSnapshot = await database.ref(`stagingSubscriptionFixtures/${uid}/client`).get()
    fixture = fixtureSnapshot.val()
  } catch {
    fixture = null
  }

  return resolveClientDirectRequestAccessWithFixture({
    commercialAccess,
    fixture,
    uid,
    now,
    env,
    runtime,
  })
}

function clientDirectSubscriptionError(subscription) {
  const error = new Error('client_direct_subscription_required')
  error.status = 402
  error.subscription = subscription
  return error
}

export function defaultClientSubscription(current = {}) {
  const plan = current && typeof current === 'object' && !Array.isArray(current) ? current : {}
  return {
    ...plan,
    status: plan.status || 'free',
    plan: plan.plan || 'quarterly',
    startedAt: plan.startedAt || null,
    expiresAt: plan.expiresAt || null,
  }
}

export async function ensureProfessionalTrial(database, uid, now = Date.now()) {
  const trialRef = database.ref(`users/${uid}/subscriptions/professional`)
  const result = await trialRef.transaction((current) => {
    const plan = current && typeof current === 'object' ? current : {}
    const status = getProfessionalSubscriptionStatus({ subscriptions: { professional: plan } }, now)
    const hasPaidSubscriptionHistory = Boolean(
      subscriptionTimestamp(plan.startedAt)
      || subscriptionTimestamp(plan.expiresAt)
      || plan.paymentId
      || plan.paymentReference
    )
    if (status.active || status.trialStartedAt || hasPaidSubscriptionHistory) return plan
    return {
      ...plan,
      status: 'trial',
      plan: plan.plan || 'quarterly',
      trialStartedAt: now,
      trialEndsAt: now + PROFESSIONAL_TRIAL_MS,
      startedAt: plan.startedAt || null,
      expiresAt: plan.expiresAt || null,
      updatedAt: now,
    }
  })
  const plan = result.snapshot.val() || {}
  return getProfessionalSubscriptionStatus({ subscriptions: { professional: plan } }, now)
}

export async function ensureProfessionalFeatureAccess(database, uid, now = Date.now()) {
  const status = await ensureProfessionalTrial(database, uid, now)
  if (!status.canUseProfessionalFeatures) {
    const error = new Error('professional_subscription_required')
    error.status = 402
    error.subscription = status
    throw error
  }
  return status
}

export async function ensureClientDirectRequestAccess(database, uid, now = Date.now(), env = process.env) {
  const snapshot = await database.ref(`users/${uid}`).get()
  const account = snapshot.val() || {}
  if (!snapshot.exists()) {
    const commercialAccess = canCreateClientDirectRequest(account, { now })
    throw clientDirectSubscriptionError(commercialAccess.subscription)
  }
  const access = await resolveClientDirectRequestAccess(database, account, uid, now, env)
  if (!access.allowed) {
    throw clientDirectSubscriptionError(access.subscription)
  }
  return {
    account,
    subscription: access.subscription,
    accessSource: access.accessSource,
  }
}

export async function readSubscriptionSummary(database, uid, now = Date.now()) {
  const snapshot = await database.ref(`users/${uid}`).get()
  const user = snapshot.val() || {}
  return {
    client: getClientSubscriptionStatus(user, now),
    professional: getProfessionalSubscriptionStatus(user, now),
  }
}

export async function readSubscriptionAccessSummary(database, uid, now = Date.now(), env = process.env) {
  const snapshot = await database.ref(`users/${uid}`).get()
  const user = snapshot.val() || {}
  const [clientHistory, professionalHistory, recurringAmountInCents] = await Promise.all([
    readPaymentHistory(database, uid, 'client'),
    readPaymentHistory(database, uid, 'professional'),
    readProfessionalRecurringAmount(database, uid, user.subscriptions?.professional),
  ])
  const client = {
    ...getClientSubscriptionStatus(user, now),
    checkoutAttemptId: user.subscriptions?.client?.checkoutAttemptId || null,
    paymentHistory: clientHistory,
  }
  const professional = {
    ...getProfessionalSubscriptionStatus(user, now),
    checkoutAttemptId: user.subscriptions?.professional?.checkoutAttemptId || null,
    paymentHistory: professionalHistory,
    recurringAmountInCents,
  }
  const access = snapshot.exists()
    ? await resolveClientDirectRequestAccess(database, user, uid, now, env)
    : { allowed: false }

  return {
    subscriptions: { client, professional },
    capabilities: {
      clientDirectRequests: access.allowed === true,
    },
  }
}
