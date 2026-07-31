import { NextResponse } from 'next/server'
import {
  PROFESSIONAL_FEATURED_PLAN_ID,
  getCommercialProduct,
} from '@/lib/commercialProducts'
import {
  createCommercialCheckoutAttempt,
  getAuthenticatedUid,
  getCommercialDatabase,
  getProfileRegionKeys,
  isCommercialHighlightsEnabled,
  isProfileEligibleForFeaturedPlan,
  loadPublicProfile,
  maybeCreateMercadoPagoPreference,
  safeText,
} from '@/lib/commercialServer'

export const runtime = 'nodejs'

const responseHeaders = { 'Cache-Control': 'private, no-store' }

export async function POST(request) {
  try {
    const uid = await getAuthenticatedUid(request)
    const body = await request.json().catch(() => ({}))
    const planId = safeText(body?.planId)

    if (planId !== PROFESSIONAL_FEATURED_PLAN_ID) {
      return NextResponse.json({ ok: false, error: 'invalid_plan' }, { status: 400, headers: responseHeaders })
    }

    if (!isCommercialHighlightsEnabled()) {
      return NextResponse.json({
        ok: false,
        error: 'commercial_highlights_disabled',
        checkoutAvailable: false,
      }, { status: 403, headers: responseHeaders })
    }

    const product = getCommercialProduct(planId)
    const database = getCommercialDatabase()
    const profile = await loadPublicProfile(database, uid)
    const eligibility = isProfileEligibleForFeaturedPlan(profile)

    if (!eligibility.ok) {
      return NextResponse.json({
        ok: false,
        error: 'profile_not_eligible',
        reason: eligibility.reason,
        checkoutAvailable: false,
      }, { status: 409, headers: responseHeaders })
    }

    const attempt = await createCommercialCheckoutAttempt({
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

    const checkout = await maybeCreateMercadoPagoPreference({ product, attempt })
    if (checkout.preferenceId || checkout.checkoutUrl) {
      await database.ref(`commercialCheckoutAttempts/${attempt.id}`).update({
        preferenceId: checkout.preferenceId || null,
        checkoutUrl: checkout.checkoutUrl || null,
        updatedAt: Date.now(),
      })
    }

    return NextResponse.json({
      ok: true,
      attemptId: attempt.id,
      product: {
        id: product.id,
        name: product.name,
        displayPrice: product.displayPrice,
        billingMode: product.billingMode,
        durationDays: product.durationDays,
      },
      status: attempt.status,
      ...checkout,
      message: checkout.checkoutAvailable
        ? 'Checkout criado.'
        : 'Checkout seguro preparado; Mercado Pago nao configurado neste ambiente.',
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
