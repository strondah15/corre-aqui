'use client'

import { auth } from './firebase'
import { announceSubscriptionRequired } from './subscriptionClient'

function pedidoIdFromRequestBody(body) {
  try {
    return String(JSON.parse(body || '{}')?.pedidoId || '')
  } catch {
    return ''
  }
}

async function requestPedidoAuthority(path, options = {}) {
  const user = auth.currentUser
  if (!user) throw new Error('Entre novamente para concluir esta ação.')

  const idToken = await user.getIdToken()
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (process.env.NODE_ENV !== 'production' && path === '/api/pedidos/claim') {
    console.info('[REQUEST_CLAIM]', JSON.stringify({
      stage: 'http_response',
      pedidoId: String(data?.pedido?.id || pedidoIdFromRequestBody(options?.body) || ''),
      authUid: String(user.uid || ''),
      HTTP: response.status,
      reason: String(data?.reason || (response.ok && data?.ok ? 'success' : 'other_reason')),
    }))
  }
  if (process.env.NODE_ENV !== 'production' && path === '/api/pedidos/public-request' && data?.integrity) {
    console.info('[REQUEST_CREATE]', JSON.stringify(data.integrity))
  }
  if (!response.ok || !data?.ok) {
    if (response.status === 402 || data?.reason === 'professional_subscription_required') {
      announceSubscriptionRequired({ kind: 'professional', reason: data?.reason || data?.error })
    }
    const error = new Error(data?.error || 'Não foi possível concluir esta ação.')
    error.reason = data?.reason || 'other_reason'
    throw error
  }
  return data
}

export function synchronizePublicRequest(pedidoId, { operation = 'sync' } = {}) {
  return requestPedidoAuthority('/api/pedidos/public-request', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, operation }),
  })
}

export function deletePublicRequest(pedidoId) {
  return requestPedidoAuthority('/api/pedidos/public-request', {
    method: 'DELETE',
    body: JSON.stringify({ pedidoId }),
  })
}

export function claimPedidoAuthority({ pedidoId, local } = {}) {
  return requestPedidoAuthority('/api/pedidos/claim', {
    method: 'POST',
    body: JSON.stringify({ pedidoId, local }),
  })
}
