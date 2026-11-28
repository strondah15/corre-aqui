import crypto from 'crypto'

const safeText = (value) => String(value || '').trim()

function parseSignatureParts(signatureHeader) {
  const parts = Object.create(null)
  for (const part of safeText(signatureHeader).split(',')) {
    const separatorIndex = part.indexOf('=')
    if (separatorIndex < 0) continue
    const key = safeText(part.slice(0, separatorIndex)).toLowerCase()
    const value = safeText(part.slice(separatorIndex + 1))
    if (key !== 'ts' && key !== 'v1') continue
    if (Object.hasOwn(parts, key)) return {}
    parts[key] = value
  }
  return parts
}

export function buildMercadoPagoSignatureDiagnostic({
  reason,
  headers,
  queryDataId,
  legacyQueryId,
  legacyQueryTopic,
  body,
}) {
  const signatureHeader = safeText(headers?.get?.('x-signature'))
  const signaturePartKeys = new Set(Object.keys(parseSignatureParts(signatureHeader)))
  const normalizedQueryDataId = safeText(queryDataId)
  const bodyDataId = safeText(body?.data?.id)
  const canCompareDataIds = Boolean(normalizedQueryDataId && bodyDataId)
  const hasLegacyIdQuery = Boolean(safeText(legacyQueryId))
  const hasLegacyTopicQuery = Boolean(safeText(legacyQueryTopic))
  const hasBodyResource = Boolean(body?.resource)

  return {
    event: 'mercado_pago_webhook_signature_rejected',
    reason: safeText(reason) || 'unknown',
    hasSignatureHeader: Boolean(signatureHeader),
    hasRequestIdHeader: Boolean(safeText(headers?.get?.('x-request-id'))),
    hasQueryDataId: Boolean(normalizedQueryDataId),
    hasTimestamp: signaturePartKeys.has('ts'),
    hasV1: signaturePartKeys.has('v1'),
    hasLegacyIdQuery,
    hasLegacyTopicQuery,
    hasBodyDataId: Boolean(bodyDataId),
    hasBodyResource,
    canCompareQueryAndBodyDataId: canCompareDataIds,
    queryDataIdMatchesBodyDataId: canCompareDataIds && normalizedQueryDataId === bodyDataId,
    queryDataIdNeedsLowercase: Boolean(
      normalizedQueryDataId && normalizedQueryDataId !== normalizedQueryDataId.toLowerCase()
    ),
    isPaymentNotification: safeText(body?.type).toLowerCase() === 'payment',
    isTestNotification: body?.live_mode === false,
    looksLegacyIpn: !normalizedQueryDataId && (hasLegacyIdQuery || hasLegacyTopicQuery || hasBodyResource),
  }
}

export function verifyMercadoPagoHmacSignature({ secret, dataId, headers }) {
  const normalizedSecret = safeText(secret)
  if (!normalizedSecret) return { ok: false, reason: 'missing_webhook_secret' }

  const signatureHeader = safeText(headers?.get?.('x-signature'))
  const requestId = safeText(headers?.get?.('x-request-id'))
  if (!signatureHeader || !requestId) return { ok: false, reason: 'missing_signature_headers' }

  const authoritativeDataId = safeText(dataId)
  if (!authoritativeDataId) return { ok: false, reason: 'missing_signature_data_id' }

  const parts = parseSignatureParts(signatureHeader)
  const ts = safeText(parts.ts)
  const received = safeText(parts.v1)
  if (!ts || !received) return { ok: false, reason: 'invalid_signature_payload' }
  if (!/^\d{1,16}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(received)) {
    return { ok: false, reason: 'invalid_signature_format' }
  }

  const manifest = `id:${authoritativeDataId};request-id:${requestId};ts:${ts};`
  const expected = crypto.createHmac('sha256', normalizedSecret).update(manifest).digest()
  const ok = crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected)
  return {
    ok,
    reason: ok ? '' : 'signature_mismatch',
    paymentId: authoritativeDataId,
  }
}
