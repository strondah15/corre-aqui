import { NextResponse } from 'next/server'
import {
  PROFESSIONAL_FEATURED_PLAN_ID,
  getCommercialProduct,
} from '@/lib/commercialProducts'
import {
  CLIENT_QUARTERLY_PRODUCT_ID,
  PROFESSIONAL_QUARTERLY_PRODUCT_ID,
  isRecurringSubscriptionProduct,
} from '@/lib/subscriptions'
import {
  createMercadoPagoCheckout,
  createMercadoPagoRecurringCheckout,
  getAuthenticatedIdentity,
  getCommercialDatabase,
  getMercadoPagoCheckoutReadiness,
  getProfileRegionKeys,
  isCommercialHighlightsEnabled,
  isProfileEligibleForFeaturedPlan,
  loadPublicProfile,
  safeText,
} from '@/lib/commercialServer'
import { ensureProfessionalTrial } from '@/lib/subscriptionServer'

export const runtime = 'nodejs'

const responseHeaders = { 'Cache-Control': 'private, no-store' }

export async function POST(request) {
  try {
    const checkoutReadiness = getMercadoPagoCheckoutReadiness()
    if (!checkoutReadiness.ready) {
      return NextResponse.json({
        ok: false,
        error: 'checkout_configuration_incomplete',
        message: 'O checkout esta temporariamente indisponivel.',
        checkoutAvailable: false,
      }, { status: 503, headers: responseHeaders })
    }

    const identity = await getAuthenticatedIdentity(request)
    const uid = identity.uid
    const body = await request.json().catch(() => ({}))
    const planId = safeText(body?.planId)

    const supportedPlans = new Set([
      CLIENT_QUARTERLY_PRODUCT_ID,
      PROFESSIONAL_QUARTERLY_PRODUCT_ID,
      PROFESSIONAL_FEATURED_PLAN_ID,
    ])
    if (!supportedPlans.has(planId)) {
      return NextResponse.json({ ok: false, error: 'invalid_plan' }, { status: 400, headers: responseHeaders })
    }

    if (planId === PROFESSIONAL_FEATURED_PLAN_ID && !isCommercialHighlightsEnabled()) {
      return NextResponse.json({
        ok: false,
        error: 'commercial_highlights_disabled',
        checkoutAvailable: false,
      }, { status: 403, headers: responseHeaders })
    }

    const product = getCommercialProduct(planId)
    const database = getCommercialDatabase()
    if (isRecurringSubscriptionProduct(planId) && body?.autoRenewConsent !== true) {
      return NextResponse.json({
        ok: false,
        error: 'auto_renew_consent_required',
        message: 'Confirme a renovacao automatica trimestral para continuar.',
      }, { status: 400, headers: responseHeaders })
    }
    if (isRecurringSubscriptionProduct(planId) && (!identity.email || !identity.emailVerified)) {
      return NextResponse.json({
        ok: false,
        error: 'verified_email_required',
        message: 'Sua conta precisa ter um e-mail verificado para autorizar a assinatura.',
      }, { status: 409, headers: responseHeaders })
    }
    if (planId === PROFESSIONAL_QUARTERLY_PRODUCT_ID) {
      await ensureProfessionalTrial(database, uid)
    }
    const profile = planId === PROFESSIONAL_FEATURED_PLAN_ID
      ? await loadPublicProfile(database, uid)
      : null
    const eligibility = planId === PROFESSIONAL_FEATURED_PLAN_ID
      ? isProfileEligibleForFeaturedPlan(profile)
      : { ok: true }

    if (!eligibility.ok) {
      return NextResponse.json({
        ok: false,
        error: 'profile_not_eligible',
        reason: eligibility.reason,
        checkoutAvailable: false,
      }, { status: 409, headers: responseHeaders })
    }

    const { attempt, checkout } = isRecurringSubscriptionProduct(planId)
      ? await createMercadoPagoRecurringCheckout({
          database,
          userId: uid,
          product,
          payerEmail: identity.email,
        })
      : await createMercadoPagoCheckout({
          database,
          userId: uid,
          product,
          targetId: uid,
          targetType: 'profile',
          targetSummary: {
            nome: safeText(profile?.nome).slice(0, 80),
            regions: getProfileRegionKeys(profile),
          },
        })

    return NextResponse.json({
      ok: true,
      attemptId: attempt.id,
      product: {
        id: product.id,
        name: product.name,
        displayPrice: product.displayPrice,
        billingMode: product.billingMode,
        durationDays: product.durationDays,
        durationMonths: product.durationMonths,
      },
      status: attempt.status,
      ...checkout,
      message: isRecurringSubscriptionProduct(planId)
        ? 'Autorizacao de assinatura criada.'
        : 'Checkout criado.',
    }, { headers: responseHeaders })
  } catch (error) {
    console.error('[planos/checkout] falha ao criar checkout:', {
      code: error?.code,
      message: error?.message,
      status: error?.status,
    })

    return NextResponse.json({
      ok: false,
      error: error?.message || 'checkout_failed',
      ...(error?.userMessage ? { message: error.userMessage } : {}),
    }, { status: error?.status || 500, headers: responseHeaders })
  }
}
