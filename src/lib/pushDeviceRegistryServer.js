import { createHash } from 'node:crypto'

const TOKEN_PATTERN = /^[^\s\u0000-\u001F\u007F]+$/
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,180}$/

export class PushDeviceRegistryError extends Error {
  constructor(code, status = 400) {
    super(code)
    this.name = 'PushDeviceRegistryError'
    this.code = code
    this.status = status
  }
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value, max = 240) {
  return String(value || '').trim().slice(0, max)
}

function safeOrigin(value) {
  const candidate = text(value, 320)
  if (!candidate) return ''
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' ? url.origin : ''
  } catch {
    return ''
  }
}

function safeDeviceMetadata(value = {}) {
  const input = record(value)
  return Object.freeze({
    userAgent: text(input.userAgent, 240),
    language: text(input.language, 32),
    origin: safeOrigin(input.origin),
    standalone: input.standalone === true,
  })
}

export function validatePushToken(value) {
  const token = String(value || '').trim()
  if (token.length < 20 || token.length > 4096 || !TOKEN_PATTERN.test(token)) {
    throw new PushDeviceRegistryError('push_device_token_invalid', 400)
  }
  return token
}

export function validatePushDeviceId(value) {
  const deviceId = String(value || '').trim()
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    throw new PushDeviceRegistryError('push_device_id_invalid', 400)
  }
  return deviceId
}

export function pushDeviceIdForToken(value) {
  return createHash('sha256').update(validatePushToken(value)).digest('hex')
}

function enabledTokenCount(tokens) {
  return Object.values(record(tokens)).filter((entry) => {
    const value = record(entry)
    return typeof value.token === 'string' && value.token.length >= 20
      && value.enabled !== false && value.active !== false
  }).length
}

function existingDeviceId(tokens, token) {
  return Object.entries(record(tokens)).find(([, value]) => record(value).token === token)?.[0] || ''
}

function storageKeyForDevice(tokens, deviceId) {
  return Object.entries(record(tokens)).find(([key, value]) => {
    const entry = record(value)
    if (key === deviceId || entry.deviceId === deviceId) return true
    try {
      return entry.token && pushDeviceIdForToken(entry.token) === deviceId
    } catch {
      return false
    }
  })?.[0] || ''
}

function publicState({ deviceId = '', registered = false, activeDeviceCount = 0, idempotent = false } = {}) {
  return Object.freeze({
    deviceId,
    registered,
    activeDeviceCount,
    idempotent,
  })
}

export async function registerPushDevice({ database, uid, token, device = {}, now = Date.now() } = {}) {
  const safeUid = text(uid, 128)
  if (!safeUid) throw new PushDeviceRegistryError('push_device_auth_required', 401)
  if (!database?.ref) throw new PushDeviceRegistryError('push_device_service_unavailable', 503)

  const safeToken = validatePushToken(token)
  const metadata = safeDeviceMetadata(device)
  const timestamp = Number(now)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new PushDeviceRegistryError('push_device_timestamp_invalid', 500)
  }

  const canonicalDeviceId = pushDeviceIdForToken(safeToken)
  let selectedStorageKey = canonicalDeviceId
  let wasAlreadyActive = false
  const privateRef = database.ref(`userPrivate/${safeUid}`)
  const result = await privateRef.transaction((currentValue) => {
    const current = record(currentValue)
    const tokens = { ...record(current.pushTokens) }
    const legacyDeviceId = existingDeviceId(tokens, safeToken)
    selectedStorageKey = legacyDeviceId || canonicalDeviceId
    const previous = record(tokens[selectedStorageKey])
    wasAlreadyActive = previous.token === safeToken
      && previous.enabled !== false
      && previous.active !== false

    const { lastError, lastErrorAt, disabledAt, ...preserved } = previous
    void lastError
    void lastErrorAt
    void disabledAt
    tokens[selectedStorageKey] = {
      ...preserved,
      schemaVersion: 2,
      deviceId: canonicalDeviceId,
      token: safeToken,
      enabled: true,
      active: true,
      permission: 'granted',
      provider: 'firebase_messaging',
      createdAt: Number(previous.createdAt) > 0 ? previous.createdAt : timestamp,
      updatedAt: timestamp,
      lastSeenAt: timestamp,
      ...metadata,
    }

    return {
      ...current,
      pushTokens: tokens,
      push: {
        ...record(current.push),
        schemaVersion: 2,
        enabled: true,
        permission: 'granted',
        provider: 'firebase_messaging',
        currentDeviceId: canonicalDeviceId,
        activeDeviceCount: enabledTokenCount(tokens),
        updatedAt: timestamp,
      },
    }
  })

  if (!result.committed) {
    throw new PushDeviceRegistryError('push_device_transaction_failed', 503)
  }

  const stored = record(result.snapshot.val())
  const activeDeviceCount = enabledTokenCount(stored.pushTokens)
  await database.ref().update({
    [`users/${safeUid}/notificacoes`]: true,
    [`users/${safeUid}/push/enabled`]: true,
    [`users/${safeUid}/push/permission`]: 'granted',
    [`users/${safeUid}/push/provider`]: 'firebase_messaging',
    [`users/${safeUid}/push/tokenKey`]: canonicalDeviceId,
    [`users/${safeUid}/push/updatedAt`]: timestamp,
    [`users/${safeUid}/profile/notificacoes`]: true,
    [`users/${safeUid}/profile/pushNotifications/enabled`]: true,
    [`users/${safeUid}/profile/pushNotifications/permission`]: 'granted',
    [`users/${safeUid}/profile/pushNotifications/provider`]: 'firebase_messaging',
    [`users/${safeUid}/profile/pushNotifications/tokenKey`]: canonicalDeviceId,
    [`users/${safeUid}/profile/pushNotifications/updatedAt`]: timestamp,
  })

  return publicState({
    deviceId: canonicalDeviceId,
    registered: true,
    activeDeviceCount,
    idempotent: wasAlreadyActive,
  })
}

export async function getPushDeviceState({ database, uid, deviceId = '' } = {}) {
  const safeUid = text(uid, 128)
  if (!safeUid) throw new PushDeviceRegistryError('push_device_auth_required', 401)
  if (!database?.ref) throw new PushDeviceRegistryError('push_device_service_unavailable', 503)
  const safeDeviceId = deviceId ? validatePushDeviceId(deviceId) : ''
  const snapshot = await database.ref(`userPrivate/${safeUid}/pushTokens`).get()
  const tokens = record(snapshot.val())
  const selectedStorageKey = safeDeviceId ? storageKeyForDevice(tokens, safeDeviceId) : ''
  const selected = selectedStorageKey ? record(tokens[selectedStorageKey]) : {}
  const registered = Boolean(
    safeDeviceId
    && typeof selected.token === 'string'
    && selected.token.length >= 20
    && selected.enabled !== false
    && selected.active !== false,
  )
  return publicState({
    deviceId: selected.token ? (selected.deviceId || pushDeviceIdForToken(selected.token)) : safeDeviceId,
    registered,
    activeDeviceCount: enabledTokenCount(tokens),
  })
}

export async function disablePushDevice({ database, uid, deviceId, now = Date.now() } = {}) {
  const safeUid = text(uid, 128)
  if (!safeUid) throw new PushDeviceRegistryError('push_device_auth_required', 401)
  if (!database?.ref) throw new PushDeviceRegistryError('push_device_service_unavailable', 503)
  const safeDeviceId = validatePushDeviceId(deviceId)
  const timestamp = Number(now)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new PushDeviceRegistryError('push_device_timestamp_invalid', 500)
  }

  let found = false
  let alreadyDisabled = false
  const privateRef = database.ref(`userPrivate/${safeUid}`)
  const result = await privateRef.transaction((currentValue) => {
    const current = record(currentValue)
    const tokens = { ...record(current.pushTokens) }
    const selectedStorageKey = storageKeyForDevice(tokens, safeDeviceId)
    const previous = selectedStorageKey ? record(tokens[selectedStorageKey]) : {}
    if (!previous.token) return current

    found = true
    alreadyDisabled = previous.enabled === false || previous.active === false
    const canonicalDeviceId = previous.deviceId || pushDeviceIdForToken(previous.token)
    tokens[selectedStorageKey] = {
      ...previous,
      schemaVersion: 2,
      deviceId: canonicalDeviceId,
      enabled: false,
      active: false,
      disabledAt: Number(previous.disabledAt) > 0 ? previous.disabledAt : timestamp,
      updatedAt: timestamp,
    }
    const activeDeviceCount = enabledTokenCount(tokens)
    return {
      ...current,
      pushTokens: tokens,
      push: {
        ...record(current.push),
        schemaVersion: 2,
        enabled: activeDeviceCount > 0,
        activeDeviceCount,
        updatedAt: timestamp,
      },
    }
  })

  if (!result.committed) {
    throw new PushDeviceRegistryError('push_device_transaction_failed', 503)
  }
  const stored = record(result.snapshot.val())
  const selectedStorageKey = storageKeyForDevice(stored.pushTokens, safeDeviceId)
  const selected = selectedStorageKey ? record(stored.pushTokens[selectedStorageKey]) : {}
  return publicState({
    deviceId: selected.token ? (selected.deviceId || pushDeviceIdForToken(selected.token)) : safeDeviceId,
    registered: false,
    activeDeviceCount: enabledTokenCount(stored.pushTokens),
    idempotent: !found || alreadyDisabled,
  })
}
