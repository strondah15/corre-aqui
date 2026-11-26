import { NextResponse } from 'next/server'
import { getAuthenticatedUid, getCommercialDatabase } from '@/lib/commercialServer'
import { canCheckStagingPreapproval, checkStagingPreapproval } from '@/lib/stagingPreapprovalCheck'
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
    if (body?.checkStagingPreapproval === true && !canCheckStagingPreapproval(uid)) {
      return NextResponse.json({ ok: false, error: 'staging_check_unavailable' }, { status: 404, headers })
    }
    const database = getCommercialDatabase()
    if (body?.checkStagingPreapproval === true) {
      try {
        const result = await checkStagingPreapproval(database, uid)
        if (result.error) {
          return NextResponse.json({ ok: false, error: result.error }, { status: result.status, headers })
        }
        return NextResponse.json({ ok: true, stagingPreapproval: result }, { headers })
      } catch {
        return NextResponse.json({ ok: false, error: 'staging_check_read_failed' }, { status: 502, headers })
      }
    }
    if (body?.activateProfessionalTrial === true) {
      await ensureProfessionalTrial(database, uid)
    }
    const summary = await readSubscriptionAccessSummary(database, uid)
    return NextResponse.json({
      ok: true,
      subscriptions: summary.subscriptions,
      capabilities: summary.capabilities,
      ...(canCheckStagingPreapproval(uid) ? { stagingPreapprovalCheckAvailable: true } : {}),
    }, { headers })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error?.message || 'subscription_status_failed',
    }, { status: error?.status || 500, headers })
  }
}
