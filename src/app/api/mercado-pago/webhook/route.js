import { NextResponse } from 'next/server'
import {
  getCommercialDatabase,
  processApprovedCommercialPayment,
  safeText,
  verifyMercadoPagoSignature,
  writeCommercialAudit,
} from '@/lib/commercialServer'
import { buildMercadoPagoSignatureDiagnostic } from '@/lib/mercadoPagoWebhookSignature'

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
  if (!safeText(process.env.MERCADO_PAGO_WEBHOOK_SECRET) || !safeText(process.env.MERCADO_PAGO_ACCESS_TOKEN)) {
    return NextResponse.json({
      ok: false,
      error: 'mercado_pago_webhook_unavailable',
    }, { status: 503, headers: responseHeaders })
  }

  const rawBody = await request.text()
  const signatureDataId = safeText(request.nextUrl.searchParams.get('data.id'))

  const signature = verifyMercadoPagoSignature({
    rawBody,
    dataId: signatureDataId,
    headers: request.headers,
  })
  if (!signature.ok) {
    const signatureDiagnostic = buildMercadoPagoSignatureDiagnostic({
      reason: signature.reason,
      headers: request.headers,
      queryDataId: signatureDataId,
      legacyQueryId: request.nextUrl.searchParams.get('id'),
      legacyQueryTopic: request.nextUrl.searchParams.get('topic'),
    })
    console.warn(JSON.stringify(signatureDiagnostic))
    return NextResponse.json({
      ok: false,
      error: 'invalid_signature',
      reason: signature.reason,
      source: 'corre_aqui_webhook_signature',
    }, {
      status: 401,
      headers: {
        ...responseHeaders,
        'X-Corre-Aqui-Webhook': 'signature-rejected',
      },
    })
  }

  let body = {}
  try {
    body = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400, headers: responseHeaders })
  }

  const database = getCommercialDatabase()
  await writeCommercialAudit(database, {
    eventId: `webhook_received_${signature.paymentId}`,
    type: 'webhook_received',
    paymentReference: signature.paymentId,
    statusAfter: safeText(body?.action || body?.type || 'received'),
  })

  const payment = await fetchMercadoPagoPayment(signature.paymentId)
  const result = await processApprovedCommercialPayment({ database, payment })
  return NextResponse.json(result, { headers: responseHeaders })
}
