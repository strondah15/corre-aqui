import { NextResponse } from 'next/server'
import {
  getCommercialDatabase,
  mercadoPagoApiRequest,
  processApprovedCommercialPayment,
  processRecurringPreapprovalUpdate,
  safeText,
  verifyMercadoPagoSignature,
  writeCommercialAudit,
} from '@/lib/commercialServer'
import { buildMercadoPagoSignatureDiagnostic } from '@/lib/mercadoPagoWebhookSignature'
import {
  resolveAuthorizedPaymentId,
  resolveInvoicePreapprovalId,
} from '@/lib/recurringSubscriptions'

export const runtime = 'nodejs'

const responseHeaders = { 'Cache-Control': 'private, no-store' }

function webhookType(request, body) {
  const raw = safeText(
    body?.type
      || request.nextUrl.searchParams.get('type')
      || request.nextUrl.searchParams.get('topic'),
  ).toLowerCase()
  if (raw === 'payments') return 'payment'
  return raw
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

  const type = webhookType(request, body)
  const supportedTypes = new Set(['payment', 'subscription_preapproval', 'subscription_authorized_payment'])
  if (!supportedTypes.has(type)) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'unsupported_webhook_type' }, { headers: responseHeaders })
  }

  const database = getCommercialDatabase()
  await writeCommercialAudit(database, {
    eventId: `webhook_received_${type}_${signature.paymentId}`,
    type: 'webhook_received',
    paymentReference: signature.paymentId,
    statusAfter: safeText(body?.action || body?.type || 'received'),
  })

  if (type === 'payment') {
    const payment = await mercadoPagoApiRequest(`/v1/payments/${encodeURIComponent(signature.paymentId)}`)
    const result = await processApprovedCommercialPayment({ database, payment })
    return NextResponse.json(result, { headers: responseHeaders })
  }

  if (type === 'subscription_preapproval') {
    const subscription = await mercadoPagoApiRequest(`/preapproval/${encodeURIComponent(signature.paymentId)}`)
    const result = await processRecurringPreapprovalUpdate({ database, subscription })
    return NextResponse.json(result, { headers: responseHeaders })
  }

  const invoice = await mercadoPagoApiRequest(`/authorized_payments/${encodeURIComponent(signature.paymentId)}`)
  const preapprovalId = resolveInvoicePreapprovalId(invoice)
  const subscriptionResult = preapprovalId
    ? await processRecurringPreapprovalUpdate({
        database,
        subscription: await mercadoPagoApiRequest(`/preapproval/${encodeURIComponent(preapprovalId)}`),
      })
    : { ok: true, updated: false, reason: 'invoice_without_preapproval' }
  const paymentId = resolveAuthorizedPaymentId(invoice)
  if (!paymentId) {
    return NextResponse.json({
      ok: subscriptionResult.ok !== false,
      invoiceProcessed: true,
      paymentProcessed: false,
      subscription: subscriptionResult,
    }, { headers: responseHeaders })
  }
  const payment = await mercadoPagoApiRequest(`/v1/payments/${encodeURIComponent(paymentId)}`)
  const paymentResult = await processApprovedCommercialPayment({ database, payment })
  return NextResponse.json({
    ok: subscriptionResult.ok !== false && paymentResult.ok !== false,
    invoiceProcessed: true,
    paymentProcessed: true,
    subscription: subscriptionResult,
    payment: paymentResult,
  }, { headers: responseHeaders })
}
