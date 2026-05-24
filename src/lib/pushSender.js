'use client'

import { auth } from '@/lib/firebase'

export async function enviarPushParaUsuario(toUid, payload = {}) {
  try {
    if (!toUid) return { ok: false, skipped: true, reason: 'missing_target' }

    const currentUser = auth.currentUser

    if (!currentUser?.getIdToken) {
      return { ok: false, skipped: true, reason: 'not_authenticated' }
    }

    const idToken = await currentUser.getIdToken()
    const response = await fetch('/api/push/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ toUid, ...payload }),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return { ok: false, skipped: true, status: response.status, ...data }
    }

    return data
  } catch (error) {
    console.warn('Push real nao foi enviado:', error)
    return { ok: false, skipped: true, reason: error?.message || 'push_send_failed' }
  }
}
