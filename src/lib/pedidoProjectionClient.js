'use client'

import { auth } from './firebase'

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
  if (!response.ok || !data?.ok) throw new Error(data?.error || 'Não foi possível concluir esta ação.')
  return data
}

export function synchronizePublicRequest(pedidoId) {
  return requestPedidoAuthority('/api/pedidos/public-request', {
    method: 'POST',
    body: JSON.stringify({ pedidoId }),
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
