import { NextResponse } from 'next/server'
import {
  REQUEST_BOOST_PRODUCT_ID,
  getCommercialProduct,
} from '@/lib/commercialProducts'
import {
  createMercadoPagoCheckout,
  getAuthenticatedUid,
  getCommercialDatabase,
  getMercadoPagoCheckoutReadiness,
  getPedidoCategoryId,
  getPedidoOwnerUid,
  getPedidoRegionKeys,
  isCommercialHighlightsEnabled,
  isPedidoEligibleForBoost,
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
    const productId = safeText(body?.productId)
    const pedidoId = safeText(body?.pedidoId)

    if (productId !== REQUEST_BOOST_PRODUCT_ID) {
      return NextResponse.json({ ok: false, error: 'invalid_product' }, { status: 400, headers: responseHeaders })
    }
    if (!pedidoId) {
      return NextResponse.json({ ok: false, error: 'missing_pedido_id' }, { status: 400, headers: responseHeaders })
    }

    if (!isCommercialHighlightsEnabled()) {
      return NextResponse.json({
        ok: false,
        error: 'commercial_highlights_disabled',
        checkoutAvailable: false,
      }, { status: 403, headers: responseHeaders })
    }

    const product = getCommercialProduct(productId)
    const database = getCommercialDatabase()
    const [pedidoSnapshot, entitlementSnapshot] = await Promise.all([
      database.ref(`pedidos/${pedidoId}`).get(),
      database.ref(`featuredRequestEntitlements/${pedidoId}`).get(),
    ])
    const pedido = pedidoSnapshot.val()
    const entitlement = entitlementSnapshot.val() || null
    const eligibility = isPedidoEligibleForBoost({ pedido, uid, entitlement })

    if (!eligibility.ok) {
      return NextResponse.json({
        ok: false,
        error: 'request_not_eligible',
        reason: eligibility.reason,
        checkoutAvailable: false,
      }, { status: 409, headers: responseHeaders })
    }

    const { attempt, checkout } = await createMercadoPagoCheckout({
      database,
      userId: uid,
      product,
      targetId: pedidoId,
      targetType: 'pedido',
      targetSummary: {
        ownerUid: getPedidoOwnerUid(pedido),
        title: safeText(pedido?.titulo).slice(0, 100),
        categoryId: getPedidoCategoryId(pedido),
        regionKeys: getPedidoRegionKeys(pedido),
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
        durationHours: product.durationHours,
      },
      pedidoId,
      status: attempt.status,
      ...checkout,
      message: 'Checkout criado.',
    }, { headers: responseHeaders })
  } catch (error) {
    console.error('[request-boost/checkout] falha ao criar checkout:', {
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
