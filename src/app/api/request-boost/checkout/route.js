import { NextResponse } from 'next/server'
import {
  REQUEST_BOOST_PRODUCT_ID,
  getCommercialProduct,
} from '@/lib/commercialProducts'
import {
  createCommercialCheckoutAttempt,
  getAuthenticatedUid,
  getCommercialDatabase,
  getPedidoCategoryId,
  getPedidoOwnerUid,
  getPedidoRegionKeys,
  isCommercialHighlightsEnabled,
  isPedidoEligibleForBoost,
  maybeCreateMercadoPagoPreference,
  safeText,
} from '@/lib/commercialServer'

export const runtime = 'nodejs'

const responseHeaders = { 'Cache-Control': 'private, no-store' }

export async function POST(request) {
  try {
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

    const attempt = await createCommercialCheckoutAttempt({
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
        durationHours: product.durationHours,
      },
      pedidoId,
      status: attempt.status,
      ...checkout,
      message: checkout.checkoutAvailable
        ? 'Checkout criado.'
        : 'Checkout seguro preparado; Mercado Pago nao configurado neste ambiente.',
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
