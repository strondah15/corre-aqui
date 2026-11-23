export const PUSH_PROMPT_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000

const PUSH_ERROR_MESSAGES = Object.freeze({
  'push/session-changed': 'Sua sessao mudou ou expirou. Entre novamente e tente ativar as notificacoes.',
  'push/browser-permission-denied': 'As notificacoes estao bloqueadas no navegador. Voce pode libera-las nas configuracoes do site.',
  'push/browser-permission-default': 'A permissao de notificacoes nao foi concluida. Tente novamente quando estiver pronto.',
  'push/storage-permission-denied': 'Nao foi possivel salvar a configuracao porque sua sessao mudou ou expirou. Entre novamente e tente de novo.',
  'push/token-registration-failed': 'Nao foi possivel registrar este navegador para notificacoes. Tente novamente em instantes.',
  'push/activation-failed': 'Nao foi possivel ativar as notificacoes agora. Tente novamente em instantes.',
})

function normalizedUid(value) {
  return String(value || '').trim()
}

function safeStage(value) {
  const stage = String(value || 'unknown').trim().toLowerCase()
  return /^[a-z0-9_-]{1,80}$/.test(stage) ? stage : 'unknown'
}

export function pushPromptStorageKey(uid) {
  const safeUid = normalizedUid(uid)
  return safeUid ? `correAqui:pushPromptDismissed:${safeUid}` : ''
}

export function isPushSessionCurrent(expectedUid, authenticatedUid) {
  const expected = normalizedUid(expectedUid)
  return Boolean(expected && expected === normalizedUid(authenticatedUid))
}

export function shouldOfferPushPrompt({
  uid,
  authenticatedUid,
  supported,
  permission,
  dismissedAt = 0,
  now = Date.now(),
} = {}) {
  if (!isPushSessionCurrent(uid, authenticatedUid)) return false
  if (supported !== true || permission !== 'default') return false

  const lastDismissedAt = Number(dismissedAt) || 0
  const currentTime = Number(now) || Date.now()
  return currentTime - lastDismissedAt >= PUSH_PROMPT_COOLDOWN_MS
}

export function shouldRemoveRemotePushToken(expectedUid, authenticatedUid) {
  return isPushSessionCurrent(expectedUid, authenticatedUid)
}

export function describePushFlowError(error = {}, fallbackStage = 'unknown') {
  if (error?.name === 'PushFlowError') {
    return Object.freeze({
      code: String(error.code || 'push/activation-failed'),
      stage: safeStage(error.stage || fallbackStage),
      message: String(error.message || PUSH_ERROR_MESSAGES['push/activation-failed']),
    })
  }

  if (error?.name === 'PushRegistrationError') {
    return Object.freeze({
      code: String(error.reason || error.code || 'push/token-registration-failed').slice(0, 100),
      stage: 'token_registration',
      message: String(error.message || PUSH_ERROR_MESSAGES['push/token-registration-failed']),
    })
  }

  const rawCode = String(error?.code || '').toLowerCase()
  const rawMessage = String(error?.message || error || '').toLowerCase()
  const combined = `${rawCode} ${rawMessage}`

  if (combined.includes('permission_denied') || combined.includes('database/permission-denied')) {
    return Object.freeze({
      code: 'push/storage-permission-denied',
      stage: safeStage(fallbackStage),
      message: PUSH_ERROR_MESSAGES['push/storage-permission-denied'],
    })
  }

  if (rawCode.startsWith('messaging/') || rawCode.startsWith('fcm_')) {
    return Object.freeze({
      code: 'push/token-registration-failed',
      stage: safeStage(fallbackStage || 'token_registration'),
      message: PUSH_ERROR_MESSAGES['push/token-registration-failed'],
    })
  }

  return Object.freeze({
    code: 'push/activation-failed',
    stage: safeStage(fallbackStage),
    message: PUSH_ERROR_MESSAGES['push/activation-failed'],
  })
}

export function createPushFlowError(code, stage, cause) {
  const normalizedCode = PUSH_ERROR_MESSAGES[code] ? code : 'push/activation-failed'
  const error = new Error(PUSH_ERROR_MESSAGES[normalizedCode])
  error.name = 'PushFlowError'
  error.code = normalizedCode
  error.stage = safeStage(stage)
  if (cause !== undefined) error.cause = cause
  return error
}
