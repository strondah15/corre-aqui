import { NextResponse } from 'next/server'
import {
  getCommercialDatabase,
  processApprovedCommercialPayment,
  safeText,
  verifyMercadoPagoSignature,
  writeCommercialAudit,
} from '@/lib/commercialServer'

export const runtime = 'nodejs'

const responseHeaders = { 'Cache-Control': 'private, no-store' }

async function fetchMercadoPagoPayment(paymentId) {
  const accessToken = safeText(process.env.MERCADO_PAGO_ACCESS_TOKEN)
  if (!accessToken) {
    const error = new Error('missing_mercado_pago_access_token')
    error.status = 503
    throw error
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.message || `mercado_pago_payment_${response.status}`)
    error.status = 502
    error.details = data
    throw error
  }
  return data
}

export async function POST(request) {
  const rawBody = await request.text()
  const database = getCommercialDatabase()
  let body = {}
  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    await writeCommercialAudit(database, {
      eventId: `webhook_invalid_json_${Date.now()}`,
      type: 'webhook_invalid_json',
      statusAfter: 'invalid_json',
    })
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400, headers: responseHeaders })
  }

  const paymentId = safeText(body?.data?.id || body?.id || body?.resource)
  const signatureDataId = safeText(request.nextUrl.searchParams.get('data.id'))

  await writeCommercialAudit(database, {
    eventId: `webhook_received_${paymentId || Date.now()}`,
    type: 'webhook_received',
    paymentReference: paymentId || null,
    statusAfter: safeText(body?.action || body?.type || 'received'),
  })

  if (!process.env.MERCADO_PAGO_WEBHOOK_SECRET || !process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: 'mercado_pago_webhook_not_configured',
    }, { status: 202, headers: responseHeaders })
  }

  const signature = verifyMercadoPagoSignature({
    rawBody,
    dataId: signatureDataId,
    headers: request.headers,
  })
  if (!signature.ok) {
    const signaturePartKeys = new Set(
      safeText(request.headers.get('x-signature'))
        .split(',')
        .map((part) => safeText(part).split('=', 1)[0])
    )
    console.warn({
      event: 'mercado_pago_webhook_signature_rejected',
      reason: signature.reason,
      hasSignatureHeader: Boolean(safeText(request.headers.get('x-signature'))),
      hasRequestIdHeader: Boolean(safeText(request.headers.get('x-request-id'))),
      hasQueryDataId: Boolean(signatureDataId),
      hasTimestamp: signaturePartKeys.has('ts'),
      hasV1: signaturePartKeys.has('v1'),
    })
    await writeCommercialAudit(database, {
      eventId: `webhook_invalid_signature_${paymentId || Date.now()}`,
      type: 'webhook_invalid_signature',
      paymentReference: paymentId || null,
      statusAfter: signature.reason,
    })
    return NextResponse.json({ ok: false, error: 'invalid_signature', reason: signature.reason }, { status: 401, headers: responseHeaders })
  }

  const payment = await fetchMercadoPagoPayment(signature.paymentId)
  const result = await processApprovedCommercialPayment({ database, payment })
  return NextResponse.json(result, { headers: responseHeaders })
}
