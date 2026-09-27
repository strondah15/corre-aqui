import crypto from 'crypto'

const safeText = (value) => String(value || '').trim()

export function verifyMercadoPagoHmacSignature({ secret, dataId, headers }) {
  const normalizedSecret = safeText(secret)
  if (!normalizedSecret) return { ok: false, reason: 'missing_webhook_secret' }

  const signatureHeader = safeText(headers?.get?.('x-signature'))
  const requestId = safeText(headers?.get?.('x-request-id'))
  if (!signatureHeader || !requestId) return { ok: false, reason: 'missing_signature_headers' }

  const authoritativeDataId = safeText(dataId)
  if (!authoritativeDataId) return { ok: false, reason: 'missing_signature_data_id' }

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=')
      return [key, rest.join('=')]
    })
  )
  const ts = safeText(parts.ts)
  const received = safeText(parts.v1)
  if (!ts || !received) return { ok: false, reason: 'invalid_signature_payload' }

  const manifest = `id:${authoritativeDataId};request-id:${requestId};ts:${ts};`
  const expected = crypto.createHmac('sha256', normalizedSecret).update(manifest).digest('hex')
  try {
    const receivedBuffer = Buffer.from(received, 'hex')
    const expectedBuffer = Buffer.from(expected, 'hex')
    if (receivedBuffer.length !== expectedBuffer.length) {
      return { ok: false, reason: 'signature_mismatch' }
    }
    const ok = crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    return {
      ok,
      reason: ok ? '' : 'signature_mismatch',
      paymentId: authoritativeDataId,
    }
  } catch {
    return { ok: false, reason: 'invalid_signature_format' }
  }
}
