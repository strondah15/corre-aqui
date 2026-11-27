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
import { assessFirebaseEnvironment, CORRE_AQUI_ENVIRONMENTS } from '@/lib/commercialRuntimeConfig'
import { buildMercadoPagoSignatureDiagnostic } from '@/lib/mercadoPagoWebhookSignature'
import {
  resolveAuthorizedPaymentId,
  resolveInvoicePreapprovalId,
} from '@/lib/recurringSubscriptions'

export const runtime = 'nodejs'

const responseHeaders = { 'Cache-Control': 'private, no-store' }
const supportedTypes = new Set(['payment', 'subscription_preapproval', 'subscription_authorized_payment'])
const RESOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/
const MAX_BODY_BYTES = 64 * 1024

function webhookEnvironmentReady(env) {
  const firebase = assessFirebaseEnvironment(env)
  const policy = CORRE_AQUI_ENVIRONMENTS[firebase.environment]
  const target = safeText(env.VERCEL_ENV)
  const correctTarget = !target || target === (firebase.environment === 'staging' ? 'preview' : 'production')
  return firebase.valid && correctTarget
    && safeText(env.MERCADO_PAGO_CREDENTIAL_ENV) === policy?.mercadoPagoCredentialEnvironment
}

function normalizeWebhookType(value) {
  const raw = safeText(value).toLowerCase()
  if (raw === 'payments') return 'payment'
  return raw
}

function webhookType(query, body) {
  const types = [body.type, ...query.getAll('type'), ...query.getAll('topic')]
    .map(normalizeWebhookType)
    .filter(Boolean)
  return types.every((type) => type === types[0]) ? types[0] || '' : null
}

function resourceId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  return typeof value === 'string' && RESOURCE_ID.test(value) ? value : ''
}

async function readWebhookBody(request) {
  if (!request.body) return ''
  const chunks = []
  const reader = request.body.getReader()
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return Buffer.concat(chunks, size).toString('utf8')
      size += value.byteLength
      if (size > MAX_BODY_BYTES) return null
      chunks.push(value)
    }
  } finally {
    void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

async function readProviderResource(endpoint, id, signal) {
  const record = await mercadoPagoApiRequest(`${endpoint}/${encodeURIComponent(id)}`, { signal })
  if (resourceId(record?.id) !== id) throw new Error('webhook_provider_resource_id_mismatch')
  return record
}

function webhookRetry(type, stage, status = null) {
  console.warn(JSON.stringify({ event: 'mercado_pago_webhook_retry', type, stage, status }))
  return NextResponse.json({
    ok: false,
    error: 'mercado_pago_webhook_retry',
  }, { status: 503, headers: responseHeaders })
}

function rejectMalformedWebhook(reason, signatureVerified = false) {
  if (process.env.CORRE_AQUI_ENV === 'staging' && process.env.VERCEL_ENV === 'preview') {
    console.warn(JSON.stringify({
      event: 'mercado_pago_webhook_malformed',
      reason,
      signatureVerified,
    }))
  }
  return NextResponse.json({ ok: false, error: reason }, { status: 400, headers: responseHeaders })
}

export async function POST(request) {
  if (!safeText(process.env.MERCADO_PAGO_WEBHOOK_SECRET)
    || !safeText(process.env.MERCADO_PAGO_ACCESS_TOKEN) || !webhookEnvironmentReady(process.env)) {
    return NextResponse.json({
      ok: false,
      error: 'mercado_pago_webhook_unavailable',
    }, { status: 503, headers: responseHeaders })
  }

  const query = request.nextUrl.searchParams
  const signatureDataId = query.get('data.id') || ''
  if (signatureDataId && (!RESOURCE_ID.test(signatureDataId) || query.getAll('data.id').length !== 1)) {
    return rejectMalformedWebhook('invalid_signed_resource_id')
  }

  // The provider signs the query ID and headers. Read the bounded body after authentication.
  const signature = verifyMercadoPagoSignature({
    rawBody: '',
    dataId: signatureDataId,
    headers: request.headers,
  })
  if (!signature.ok) {
    const signatureDiagnostic = buildMercadoPagoSignatureDiagnostic({
      reason: signature.reason,
      headers: request.headers,
      queryDataId: signatureDataId,
      legacyQueryId: query.get('id'),
      legacyQueryTopic: query.get('topic'),
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
    const rawBody = await readWebhookBody(request)
    if (rawBody === null) {
      return NextResponse.json({ ok: false, error: 'webhook_body_too_large' }, { status: 413, headers: responseHeaders })
    }
    body = rawBody ? JSON.parse(rawBody) : {}
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_json')
  } catch {
    return rejectMalformedWebhook('invalid_json', true)
  }

  const type = webhookType(query, body)
  if (type === null) {
    return rejectMalformedWebhook('inconsistent_webhook_topic', true)
  }
  if (Object.hasOwn(body.data || {}, 'id') && resourceId(body.data.id) !== signature.paymentId) {
    return rejectMalformedWebhook('inconsistent_webhook_resource', true)
  }
  if (!supportedTypes.has(type)) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'unsupported_webhook_type' }, { headers: responseHeaders })
  }

  let stage = 'audit_received'
  const signal = AbortSignal.timeout(15_000)
  try {
    const database = getCommercialDatabase()
    await writeCommercialAudit(database, {
      eventId: `webhook_received_${type}_${signature.paymentId}`,
      type: 'webhook_received',
      paymentReference: signature.paymentId,
      statusAfter: 'received',
    })

    if (type === 'payment') {
      stage = 'read_payment'
      const payment = await readProviderResource('/v1/payments', signature.paymentId, signal)
      stage = 'apply_payment'
      const result = await processApprovedCommercialPayment({ database, payment })
      if (result.retryable) return webhookRetry(type, stage)
      return NextResponse.json(result, { headers: responseHeaders })
    }

    const invoiceRequested = type === 'subscription_authorized_payment'
    let preapprovalId = signature.paymentId
    let paymentId = ''
    if (invoiceRequested) {
      stage = 'read_invoice'
      const invoice = await readProviderResource('/authorized_payments', signature.paymentId, signal)
      preapprovalId = resourceId(resolveInvoicePreapprovalId(invoice))
      paymentId = resourceId(resolveAuthorizedPaymentId(invoice))
      if (!preapprovalId) {
        return NextResponse.json({
          ok: true,
          ignored: true,
          reason: 'invoice_without_preapproval',
        }, { headers: responseHeaders })
      }
    }

    stage = 'read_subscription'
    const subscription = await readProviderResource('/preapproval', preapprovalId, signal)
    stage = 'apply_subscription'
    const subscriptionResult = await processRecurringPreapprovalUpdate({ database, subscription })
    if (subscriptionResult.retryable) return webhookRetry(type, stage)
    if (!invoiceRequested) return NextResponse.json(subscriptionResult, { headers: responseHeaders })

    if (!paymentId || subscriptionResult.ok !== true) {
      return NextResponse.json({
        ok: subscriptionResult.ok === true,
        invoiceProcessed: true,
        paymentProcessed: false,
        subscription: subscriptionResult,
      }, { headers: responseHeaders })
    }
    stage = 'read_invoice_payment'
    const payment = await readProviderResource('/v1/payments', paymentId, signal)
    stage = 'apply_invoice_payment'
    const paymentResult = await processApprovedCommercialPayment({
      database,
      payment,
      recurringInvoicePreapprovalId: preapprovalId,
    })
    if (paymentResult.retryable) return webhookRetry(type, stage)
    return NextResponse.json({
      ok: paymentResult.ok !== false,
      invoiceProcessed: true,
      paymentProcessed: true,
      subscription: subscriptionResult,
      payment: paymentResult,
    }, { headers: responseHeaders })
  } catch (error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
      ? error.status : null
    return webhookRetry(type, stage, status)
  }
}
