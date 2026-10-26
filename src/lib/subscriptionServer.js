import {
  PROFESSIONAL_TRIAL_MONTHS,
  addCalendarMonths,
  canCreateClientDirectRequest,
  getClientSubscriptionStatus,
  getProfessionalSubscriptionStatus,
  subscriptionTimestamp,
} from './subscriptions.js'
import {
  assessStagingSubscriptionFixtureRuntime,
  resolveClientDirectRequestAccessWithFixture,
} from './stagingSubscriptionFixtures.js'

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
  return {
    status: current.status || 'free',
    plan: 'annual',
    startedAt: current.startedAt || null,
    expiresAt: current.expiresAt || null,
    ...(current.paymentId ? { paymentId: current.paymentId } : {}),
    ...(current.paymentReference ? { paymentReference: current.paymentReference } : {}),
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
      plan: 'annual',
      trialStartedAt: now,
      trialEndsAt: addCalendarMonths(now, PROFESSIONAL_TRIAL_MONTHS),
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
  const client = getClientSubscriptionStatus(user, now)
  const professional = getProfessionalSubscriptionStatus(user, now)
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
