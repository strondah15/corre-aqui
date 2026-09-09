'use client'

import { auth } from '@/lib/firebase'

export async function transitionPrivateAttendance({ requestId, expectedStatus, nextStatus, reasonCode = '', reason = '' }) {
  const id = String(requestId || '').trim()
  const currentUser = auth.currentUser
  if (!id || !currentUser?.uid || typeof currentUser.getIdToken !== 'function') {
    throw new Error('Sessão indisponível para atualizar este atendimento.')
  }

  const idToken = await currentUser.getIdToken()
  if (auth.currentUser?.uid !== currentUser.uid) {
    throw new Error('A sessão mudou durante a atualização.')
  }

  const response = await fetch('/api/private-requests/transition', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestId: id, expectedStatus, nextStatus, reasonCode, reason }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.transitionConfirmed !== true || result?.requestId !== id) {
    const error = new Error(result?.message || 'Não foi possível atualizar esta etapa. Tente novamente.')
    error.code = result?.reason || result?.error || 'private_attendance_transition_failed'
    throw error
  }
  return result
}
