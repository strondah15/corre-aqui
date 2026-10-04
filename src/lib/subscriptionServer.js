import {
  PROFESSIONAL_TRIAL_MONTHS,
  addCalendarMonths,
  canCreateClientDirectRequest,
  getClientSubscriptionStatus,
  getProfessionalSubscriptionStatus,
  subscriptionTimestamp,
} from '@/lib/subscriptions'

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

export async function ensureClientDirectRequestAccess(database, uid, now = Date.now()) {
  const snapshot = await database.ref(`users/${uid}`).get()
  const account = snapshot.val() || {}
  const access = canCreateClientDirectRequest(account, { now })
  if (!access.allowed) {
    const error = new Error('client_direct_subscription_required')
    error.status = 402
    error.subscription = access.subscription
    throw error
  }
  return { account, subscription: access.subscription }
}

export async function readSubscriptionSummary(database, uid, now = Date.now()) {
  const snapshot = await database.ref(`users/${uid}`).get()
  const user = snapshot.val() || {}
  return {
    client: getClientSubscriptionStatus(user, now),
    professional: getProfessionalSubscriptionStatus(user, now),
  }
}
