import 'server-only'

import { createHash } from 'node:crypto'
import { commercialAuditKey } from '@/lib/commercialAuditKey'
import {
  getMercadoPagoCheckoutReadiness,
  mercadoPagoApiRequest,
  referenceKey,
} from '@/lib/commercialServer'
import { resolveMercadoPagoRecurringBuyer } from '@/lib/commercialRuntimeConfig'
import { PROFESSIONAL_QUARTERLY_PRODUCT_ID } from '@/lib/subscriptions'

// One staging authorization. This deadline also closes immutable Preview builds.
const EXPIRES_AT = Date.parse('2026-11-27T00:30:00Z')
const PREAPPROVAL_ID = 'cb0db8e03082449fafaaa2b3c46bd766'
const OWNER_HASH = 'f739b0aed8af2f05fe8bea3cf58979500c9b9cdf1dd9d18ff78b4e7494f75d59'
const BUYER_HASH = '9061673ba7df031ffbe5df406ab1277a14aa8d62e728188a776c244c66f76b2a'
const SELLER_HASH = 'cc7437f9b78308deeb77e291df54d521f979f0654bbcec9748a1cf9fce8b3f6c'
const REFERENCE_HASH = '673c5d9e713511d6209f8fcf813fc19171c114c6ab21466d088e8ecf50fd0c01'
const APPLICATION_HASH = '72d3b7cd2228a71137c7cb9fc7e34472446a66d0de260c2ba0cfa9a619f2b280'
const CHECKOUT_URL_HASH = 'bd173a07fa9354d9078169d0075f269ab5b174a4f0b8b2c7bd5e26fa4d9c6bf0'
const EXPECTED_TRIAL_END = 1800230031814
const PROVIDER_STATES = new Set(['pending', 'authorized', 'paused', 'canceled', 'cancelled'])

function hash(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex')
}

export function canCheckStagingPreapproval(uid) {
  if (Date.now() >= EXPIRES_AT || hash(uid) !== OWNER_HASH) return false
  const checkout = getMercadoPagoCheckoutReadiness()
  return checkout.expectedFirebaseProjectId === 'corre-aqui-staging'
    && checkout.environment === 'staging'
    && Boolean(resolveMercadoPagoRecurringBuyer(process.env, checkout))
}

async function read(database, path) {
  return (await database.ref(path).get()).val()
}

export async function checkStagingPreapproval(database, uid) {
  if (!canCheckStagingPreapproval(uid)) return { error: 'staging_check_unavailable', status: 404 }
  const [attemptId, plan, history] = await Promise.all([
    read(database, `commercialCheckoutAttemptsBySubscription/${referenceKey(PREAPPROVAL_ID)}`),
    read(database, `users/${uid}/subscriptions/professional`),
    read(database, `subscriptionPaymentHistory/${uid}/professional`),
  ])
  if (
    typeof attemptId !== 'string'
    || !/^[A-Za-z0-9_-]{1,160}$/.test(attemptId)
    || plan?.preapprovalId !== PREAPPROVAL_ID
    || plan?.recurringProductId !== PROFESSIONAL_QUARTERLY_PRODUCT_ID
  ) return { error: 'staging_check_local_plan_mismatch', status: 409 }
  const attempt = await read(database, `commercialCheckoutAttempts/${attemptId}`)
  if (
    attempt?.id !== attemptId
    || attempt?.userId !== uid
    || attempt?.targetId !== uid
    || attempt?.preapprovalId !== PREAPPROVAL_ID
    || attempt?.productId !== PROFESSIONAL_QUARTERLY_PRODUCT_ID
    || hash(attempt?.externalReference) !== REFERENCE_HASH
    || !canCheckStagingPreapproval(uid)
  ) return { error: 'staging_check_local_attempt_mismatch', status: 409 }

  let provider
  try {
    provider = await mercadoPagoApiRequest(`/preapproval/${PREAPPROVAL_ID}`)
  } catch (error) {
    const allowedStatuses = [400, 401, 403, 404, 429, 500, 503]
    const status = allowedStatuses.includes(error?.status) ? error.status : null
    return { error: status ? `staging_check_provider_http_${status}` : 'staging_check_provider_failed', status: 502 }
  }

  const recurring = provider?.auto_recurring
  const startAt = Date.parse(recurring?.start_date)
  const nextChargeAt = Date.parse(provider?.next_payment_date)
  const buyerMatchesTestAccount = hash(provider?.payer_id) === BUYER_HASH
  const sellerMatchesTestAccount = hash(provider?.collector_id) === SELLER_HASH
  const applicationMatches = hash(provider?.application_id) === APPLICATION_HASH
  const checkoutUrlMatches = hash(provider?.init_point) === CHECKOUT_URL_HASH
  const status = PROVIDER_STATES.has(provider?.status) ? provider.status : null
  const sandboxConfirmed = buyerMatchesTestAccount && sellerMatchesTestAccount && applicationMatches
  const referenceMatchesUid = provider?.id === PREAPPROVAL_ID
    && provider?.external_reference === attempt.externalReference
  const billingMatches = recurring?.transaction_amount === 49.9
    && recurring?.currency_id === 'BRL'
    && recurring?.frequency === 3 && recurring?.frequency_type === 'months'
    && startAt === EXPECTED_TRIAL_END && Number(plan.trialEndsAt) === EXPECTED_TRIAL_END
    && (!provider.next_payment_date || nextChargeAt >= EXPECTED_TRIAL_END)
  const webhookKey = commercialAuditKey(`webhook_received_subscription_preapproval_${PREAPPROVAL_ID}`)
  const statusKey = commercialAuditKey(`subscription_status_${attemptId}_${referenceKey(`${status}:${provider?.last_modified || ''}`)}`)
  const [webhook, update] = await Promise.all([
    read(database, `commercialAuditLogs/${webhookKey}`),
    read(database, `commercialAuditLogs/${statusKey}`),
  ])

  return {
    sandboxConfirmed,
    buyerMatchesTestAccount,
    sellerMatchesTestAccount,
    applicationMatches,
    checkoutUrlMatches,
    referenceMatchesUid,
    billingMatches,
    canUseExistingCheckout: sandboxConfirmed && checkoutUrlMatches && referenceMatchesUid && billingMatches && status === 'pending',
    providerStatus: status,
    amountInCents: Number.isFinite(recurring?.transaction_amount) ? Math.round(recurring.transaction_amount * 100) : null,
    currency: recurring?.currency_id === 'BRL' ? 'BRL' : null,
    frequency: Number.isSafeInteger(recurring?.frequency) ? recurring.frequency : null,
    frequencyType: recurring?.frequency_type === 'months' ? 'months' : null,
    startAt: Number.isFinite(startAt) ? startAt : null,
    nextChargeAt: Number.isFinite(nextChargeAt) ? nextChargeAt : null,
    trialEndMatches: Number(plan.trialEndsAt) === EXPECTED_TRIAL_END,
    firebaseProviderStatus: PROVIDER_STATES.has(plan.providerStatus) ? plan.providerStatus : null,
    autoRenew: plan.autoRenew === true,
    paymentHistoryCount: Object.keys(history || {}).length,
    signedWebhookAt: webhook?.type === 'webhook_received' ? Number(webhook.createdAt) || null : null,
    processedProviderStatusAt: update?.type === 'subscription_status_updated'
      && update.userId === uid && update.statusAfter === status ? Number(update.createdAt) || null : null,
  }
}
