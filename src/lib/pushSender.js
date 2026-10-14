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
        toUid,
        type: normalized.type,
        pedidoId: payload.pedidoId || '',
        privateRequestId: payload.privateRequestId || '',
        conversaId: payload.conversaId || '',
        messageId: payload.messageId || '',
        notificationId: payload.notificationId || '',
        eventId: payload.eventId || '',
        test: payload.test === true,
      }),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return { ok: false, skipped: true, status: response.status, ...data }
    }

    return data
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Push real nao foi enviado:', error)
    }
    return { ok: false, skipped: true, reason: error?.message || 'push_send_failed' }
  }
}
