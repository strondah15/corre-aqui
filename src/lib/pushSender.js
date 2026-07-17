'use client'

import { auth } from '@/lib/firebase'
import { buildPushPayload } from '@/lib/pushPayload'

export async function enviarPushParaUsuario(toUid, payload = {}) {
  try {
    if (!toUid) return { ok: false, skipped: true, reason: 'missing_target' }

    const currentUser = auth.currentUser

    if (!currentUser?.getIdToken) {
      return { ok: false, skipped: true, reason: 'not_authenticated' }
    }

    const idToken = await currentUser.getIdToken()
    const normalized = buildPushPayload({ ...payload, toUid })
    const response = await fetch('/api/push/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        ...normalized,
        toUid,
        type: normalized.type,
        title: normalized.title,
        body: normalized.body,
        url: normalized.url,
        action: normalized.action,
        actions: normalized.actions,
      }),
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
