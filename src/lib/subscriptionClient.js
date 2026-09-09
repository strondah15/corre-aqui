'use client'

import { auth } from '@/lib/firebase'
import {
  PROFESSIONAL_ANNUAL_PRODUCT_ID,
  canReusePendingSubscriptionCheckout,
  isSubscriptionSessionCurrent,
} from '@/lib/subscriptions'

const PENDING_CHECKOUT_KEY = 'correaqui:pending-subscription-checkout:v1'

async function subscriptionRequest(path, body = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Entre na sua conta para continuar.')
  const expectedUid = user.uid
  const token = await user.getIdToken()
  if (!isSubscriptionSessionCurrent(expectedUid, auth.currentUser?.uid)) throw new Error('A sessão mudou durante esta ação. Tente novamente.')
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!isSubscriptionSessionCurrent(expectedUid, auth.currentUser?.uid)) throw new Error('A sessão mudou durante esta ação. Tente novamente.')
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.message || data?.error || 'Não foi possível verificar sua assinatura.')
    error.code = data?.error || 'subscription_request_failed'
    error.details = data
    throw error
  }
  return data
}

export function getSubscriptionStatus() {
  return subscriptionRequest('/api/subscriptions/status')
}

export function activateProfessionalTrial() {
  return subscriptionRequest('/api/subscriptions/status', { activateProfessionalTrial: true })
}

export async function ensureClientDirectRequestAccess() {
  const result = await getSubscriptionStatus()
  if (result?.subscriptions?.client?.active === true) return true
  announceSubscriptionRequired({
    kind: 'client',
    reason: 'client_direct_subscription_required',
  })
  return false
}

export async function startAnnualSubscriptionCheckout(productId) {
  const checkoutUid = auth.currentUser?.uid
  if (!checkoutUid) throw new Error('Entre na sua conta para continuar.')
  let baseline = null
  try {
    const status = await getSubscriptionStatus()
    const kind = productId === PROFESSIONAL_ANNUAL_PRODUCT_ID ? 'professional' : 'client'
    baseline = status?.subscriptions?.[kind] || null
  } catch {}

  if (!isSubscriptionSessionCurrent(checkoutUid, auth.currentUser?.uid)) throw new Error('A sessão mudou durante esta ação. Tente novamente.')
  const result = await subscriptionRequest('/api/planos/checkout', { planId: productId })
  if (!isSubscriptionSessionCurrent(checkoutUid, auth.currentUser?.uid)) throw new Error('A sessão mudou durante esta ação. Tente novamente.')
  if (result?.checkoutUrl && typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
        uid: checkoutUid,
        productId,
        attemptId: result.attemptId || '',
        baselineExpiresAt: Number(baseline?.expiresAt || 0) || null,
        createdAt: Date.now(),
      }))
    } catch {}
  }
  return result
}

export function readPendingSubscriptionCheckout(expectedUid = '') {
  if (typeof window === 'undefined') return null
  try {
    const value = JSON.parse(window.sessionStorage.getItem(PENDING_CHECKOUT_KEY) || 'null')
    if (!canReusePendingSubscriptionCheckout(value, expectedUid)) {
      window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY)
      return null
    }
    return value
  } catch {
    try {
      window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY)
    } catch {}
    return null
  }
}

export function clearPendingSubscriptionCheckout() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY)
  } catch {}
}

export function announceSubscriptionRequired(detail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('correaqui:subscription-required', { detail }))
}
