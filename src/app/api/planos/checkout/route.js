import { NextResponse } from 'next/server'
import {
  PROFESSIONAL_FEATURED_PLAN_ID,
  getCommercialProduct,
} from '@/lib/commercialProducts'
import {
  CLIENT_ANNUAL_PRODUCT_ID,
  PROFESSIONAL_ANNUAL_PRODUCT_ID,
} from '@/lib/subscriptions'
import {
  createMercadoPagoCheckout,
  getAuthenticatedUid,
  getCommercialDatabase,
  getMercadoPagoCheckoutReadiness,
  getProfileRegionKeys,
  isCommercialHighlightsEnabled,
  isProfileEligibleForFeaturedPlan,
  loadPublicProfile,
  safeText,
} from '@/lib/commercialServer'

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

    const uid = await getAuthenticatedUid(request)
    const body = await request.json().catch(() => ({}))
    const planId = safeText(body?.planId)

    const supportedPlans = new Set([
      CLIENT_ANNUAL_PRODUCT_ID,
      PROFESSIONAL_ANNUAL_PRODUCT_ID,
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

    const { attempt, checkout } = await createMercadoPagoCheckout({
      database,
      userId: uid,
      product,
      targetId: uid,
      targetType: planId === PROFESSIONAL_FEATURED_PLAN_ID ? 'profile' : 'subscription',
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
      message: 'Checkout criado.',
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
    }, { status: error?.status || 500, headers: responseHeaders })
  }
}
