import { NextResponse } from 'next/server'
import {
  cancelMercadoPagoRecurringSubscription,
  getAuthenticatedUid,
  getCommercialDatabase,
  getMercadoPagoCheckoutReadiness,
  safeText,
} from '@/lib/commercialServer'

export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request) {
  try {
    const readiness = getMercadoPagoCheckoutReadiness()
    if (!readiness.ready) {
      return NextResponse.json({
        ok: false,
        error: 'checkout_configuration_incomplete',
        message: 'O gerenciamento da assinatura esta temporariamente indisponivel.',
      }, { status: 503, headers })
    }
    const uid = await getAuthenticatedUid(request)
    const body = await request.json().catch(() => ({}))
    const kind = safeText(body?.kind).toLowerCase()
    if (!['client', 'professional'].includes(kind)) {
      return NextResponse.json({ ok: false, error: 'invalid_subscription_kind' }, { status: 400, headers })
    }
    const result = await cancelMercadoPagoRecurringSubscription({
      database: getCommercialDatabase(),
      userId: uid,
      kind,
    })
    return NextResponse.json({
      ok: true,
      ...result,
      message: 'Renovacao automatica cancelada. O acesso pago permanece ate o fim da vigencia.',
    }, { headers })
  } catch (error) {
    console.error('[subscriptions/cancel] cancelamento falhou:', {
      code: error?.code,
      message: error?.message,
      status: error?.status,
    })
    return NextResponse.json({
      ok: false,
      error: error?.message || 'subscription_cancellation_failed',
    }, { status: error?.status || 500, headers })
  }
}
