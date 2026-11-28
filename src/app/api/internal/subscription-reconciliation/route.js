import { getCommercialDatabase } from '@/lib/commercialServer'
import { runScheduledSubscriptionReconciliation } from '@/lib/scheduledSubscriptionReconciliation'
import {
  isAuthorizedSubscriptionSchedule,
  isScheduledSubscriptionStaging,
} from '@/lib/scheduledSubscriptionRuntime'

export const runtime = 'nodejs'
export const maxDuration = 60

const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(request) {
  if (!isScheduledSubscriptionStaging()) {
    return Response.json({ ok: false }, { status: 404, headers })
  }
  if (!isAuthorizedSubscriptionSchedule(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return Response.json({ ok: false }, { status: 401, headers })
  }

  try {
    const database = getCommercialDatabase()
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(55_000)])
    const result = await runScheduledSubscriptionReconciliation({ database, signal })
    return Response.json(result, { headers })
  } catch {
    console.warn(JSON.stringify({ event: 'subscription_reconciliation_schedule_failed' }))
    return Response.json({ ok: false }, { status: 503, headers })
  }
}
