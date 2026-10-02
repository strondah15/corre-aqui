import crypto from 'crypto'

const INVALID_FIREBASE_KEY = /[\[\].#$\/\u0000-\u001F\u007F]/
const MAX_FIREBASE_KEY_BYTES = 768

export function commercialAuditKey(eventId) {
  const normalizedEventId = String(eventId || '').trim()
  if (!normalizedEventId) return ''

  const isValidFirebaseKey = !INVALID_FIREBASE_KEY.test(normalizedEventId)
    && Buffer.byteLength(normalizedEventId, 'utf8') <= MAX_FIREBASE_KEY_BYTES

  if (isValidFirebaseKey) return normalizedEventId

  const digest = crypto
    .createHash('sha256')
    .update(normalizedEventId, 'utf8')
    .digest('hex')

  return `audit_${digest}`
}
