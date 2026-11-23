const PUBLIC_MESSAGES = Object.freeze({
  push_device_auth_required: 'Entre novamente para gerenciar as notificações.',
  push_device_auth_invalid: 'Sua sessão expirou. Entre novamente.',
  push_device_feature_disabled: 'Notificações 2.0 ainda não estão disponíveis.',
  push_device_token_invalid: 'O navegador não forneceu um token de notificação válido.',
  push_device_id_invalid: 'O registro deste dispositivo é inválido.',
  push_device_network_error: 'Não foi possível acessar o servidor de notificações.',
  push_device_session_changed: 'A conta ativa mudou. Tente novamente na conta atual.',
  push_device_service_unavailable: 'O serviço de notificações está temporariamente indisponível.',
})

export class PushDeviceApiError extends Error {
  constructor(code, status = 0) {
    super(PUBLIC_MESSAGES[code] || 'Não foi possível atualizar as notificações agora.')
    this.name = 'PushDeviceApiError'
    this.code = code
    this.status = status
  }
}

function currentSession(getCurrentUser, expectedUid) {
  const user = getCurrentUser?.()
  if (!user?.uid || user.uid !== expectedUid || typeof user.getIdToken !== 'function') {
    throw new PushDeviceApiError('push_device_session_changed', 401)
  }
  return user
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.ok !== true) {
    throw new PushDeviceApiError(
      String(payload?.error?.code || payload?.reason || (response.status === 401
        ? 'push_device_auth_invalid'
        : 'push_device_service_unavailable')),
      response.status,
    )
  }
  return payload.data || {}
}

export function createPushDeviceApiClient({ getCurrentUser, fetchImpl = globalThis.fetch } = {}) {
  if (typeof getCurrentUser !== 'function' || typeof fetchImpl !== 'function') {
    throw new TypeError('Push device API client requires auth and fetch providers.')
  }

  const request = async (expectedUid, { method = 'GET', query = '', body } = {}) => {
    const user = currentSession(getCurrentUser, expectedUid)
    let idToken = ''
    try {
      idToken = await user.getIdToken()
    } catch {
      throw new PushDeviceApiError('push_device_auth_invalid', 401)
    }
    if (!idToken || user !== getCurrentUser() || currentSession(getCurrentUser, expectedUid) !== user) {
      throw new PushDeviceApiError('push_device_session_changed', 401)
    }

    let response
    try {
      response = await fetchImpl(`/api/push/devices${query}`, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${idToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch {
      throw new PushDeviceApiError('push_device_network_error', 0)
    }

    const data = await parseResponse(response)
    if (user !== getCurrentUser() || currentSession(getCurrentUser, expectedUid) !== user) {
      throw new PushDeviceApiError('push_device_session_changed', 401)
    }
    return data
  }

  return Object.freeze({
    register(expectedUid, { token, device }) {
      return request(expectedUid, { method: 'POST', body: { token, device } })
    },
    status(expectedUid, deviceId = '') {
      const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : ''
      return request(expectedUid, { query })
    },
    disable(expectedUid, deviceId) {
      return request(expectedUid, { method: 'DELETE', body: { deviceId } })
    },
  })
}
