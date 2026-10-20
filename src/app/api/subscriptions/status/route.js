import { NextResponse } from 'next/server'
import { getAuthenticatedUid, getCommercialDatabase } from '@/lib/commercialServer'
import {
  ensureProfessionalTrial,
  readSubscriptionSummary,
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
    const subscriptions = await readSubscriptionSummary(database, uid)
    return NextResponse.json({ ok: true, subscriptions }, { headers })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error?.message || 'subscription_status_failed',
    }, { status: error?.status || 500, headers })
  }
}
