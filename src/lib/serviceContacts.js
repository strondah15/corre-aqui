'use client'

import { auth } from '@/lib/firebase'

export async function requestAuthorizedServiceContact(pedidoId) {
  const id = String(pedidoId || '').trim()
  const user = auth.currentUser
  if (!id || !user) return { ok: false, available: false, contact: null }

  const idToken = await user.getIdToken()
  const response = await fetch('/api/service-contact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ pedidoId: id }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.ok) throw new Error(data?.error || 'Não foi possível atualizar o contato do atendimento.')
  return data
}
