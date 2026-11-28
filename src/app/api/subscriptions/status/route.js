import { NextResponse } from 'next/server'
import { getAuthenticatedUid, getCommercialDatabase, getMercadoPagoSubscriptionManagementReadiness } from '@/lib/commercialServer'
import { reconcileOwnedSubscriptions } from '@/lib/subscriptionReconciliation'
import {
  ensureProfessionalTrial,
  readSubscriptionAccessSummary,
} from '@/lib/subscriptionServer'

export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request) {
  try {
    const uid = await getAuthenticatedUid(request)
    const body = await request.json().catch(() => ({}))
    const database = getCommercialDatabase()
    if (body?.activateProfessionalTrial === true) {
      await ensureProfessionalTrial(database, uid)
    }
    if (body?.reconcile === true && getMercadoPagoSubscriptionManagementReadiness().ready) {
      await reconcileOwnedSubscriptions({
        database, uid, kind: body.kind, signal: request.signal,
      })
    }
    const summary = await readSubscriptionAccessSummary(database, uid)
    return NextResponse.json({
      ok: true,
      subscriptions: summary.subscriptions,
      capabilities: summary.capabilities,
    }, { headers })
  } catch (error) {
    const unauthorized = error?.status === 401 || ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token'].includes(error?.code)
    const status = unauthorized ? 401 : 503
    if (!unauthorized) console.warn('[subscriptions] status_unavailable')
    return NextResponse.json({
      ok: false,
      error: unauthorized ? 'subscription_session_required' : 'subscription_status_failed',
      message: unauthorized ? 'Entre na sua conta para consultar a assinatura.' : 'Não foi possível consultar a assinatura agora.',
    }, { status, headers })
  }
}
