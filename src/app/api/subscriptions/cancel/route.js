import { NextResponse } from 'next/server'
import {
  cancelMercadoPagoRecurringSubscription,
  getAuthenticatedUid,
  getCommercialDatabase,
  getMercadoPagoSubscriptionManagementReadiness,
  safeText,
} from '@/lib/commercialServer'
import { getSubscriptionApiError, getSubscriptionRateLimit } from '@/lib/subscriptionApiPolicy'

export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request) {
  try {
    const readiness = getMercadoPagoSubscriptionManagementReadiness()
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
    const database = getCommercialDatabase()
    const limit = await getSubscriptionRateLimit(database, uid, 'cancel')
    if (limit) {
      return NextResponse.json({
        ok: false,
        error: limit.error,
        message: limit.message,
      }, { status: 429, headers: { ...headers, 'Retry-After': limit.retryAfter } })
    }
    const result = await cancelMercadoPagoRecurringSubscription({
      database,
      userId: uid,
      kind,
    })
    return NextResponse.json({
      ok: true,
      ...result,
      message: 'Renovacao automatica cancelada. O acesso pago permanece ate o fim da vigencia.',
    }, { headers })
  } catch (error) {
    const { code, status, message } = getSubscriptionApiError(error, 'cancel')
    if (status >= 500) console.error('[subscriptions/cancel] cancelamento falhou', { code, status })

    return NextResponse.json({
      ok: false,
      error: code,
      message,
    }, { status, headers })
  }
}
