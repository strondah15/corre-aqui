'use client'

import { auth } from '@/lib/firebase'

function validPedidoId(value) {
  const pedidoId = String(value || '').trim()
  return /^[A-Za-z0-9_-]{1,128}$/.test(pedidoId) ? pedidoId : ''
}

export async function contabilizarAtendimentoFinalizado({ pedidoId, expectedUid }) {
  const id = validPedidoId(pedidoId)
  const currentUser = auth.currentUser
  if (!id || !currentUser?.uid || typeof currentUser.getIdToken !== 'function') {
    throw new Error('Sessão indisponível para contabilizar as recompensas.')
  }
  if (expectedUid && String(expectedUid) !== currentUser.uid) {
    throw new Error('A sessão mudou durante a contabilização das recompensas.')
  }

  const authenticatedUid = currentUser.uid
  const idToken = await currentUser.getIdToken()
  if (auth.currentUser?.uid !== authenticatedUid) {
    throw new Error('A sessão mudou durante a contabilização das recompensas.')
  }

  const response = await fetch('/api/atendimento/rewards', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pedidoId: id }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.ok !== true || result?.contabilizado !== true || result?.pedidoId !== id) {
    const error = new Error(result?.error || 'Não foi possível contabilizar as recompensas agora.')
    error.code = result?.reason || 'reward_request_failed'
    throw error
  }

  return result
}
