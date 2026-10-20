'use client'

import { auth } from './firebase'

const safeId = (value) => String(value || '').trim()
const RETRY_DELAYS_MS = [0, 250, 750]

function debugActivityFailure(payload) {
  if (process.env.NODE_ENV !== 'production') console.warn('[CHAT_CONVERSATION_ACTIVITY]', payload)
}

export function scheduleConversationActivity({ conversationId, messageId, authUid }) {
  const expectedUid = safeId(authUid)
  const id = safeId(conversationId)
  const msgId = safeId(messageId)
  if (!expectedUid || !id || !msgId) return

  void (async () => {
    const currentUser = auth.currentUser
    if (!currentUser?.uid || currentUser.uid !== expectedUid) return
    const idToken = await currentUser.getIdToken()
    if (auth.currentUser?.uid !== expectedUid) return

    let lastFailure = null
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      if (auth.currentUser?.uid !== expectedUid) return
      const delayMs = RETRY_DELAYS_MS[attempt]
      if (delayMs) await new Promise((resolve) => window.setTimeout(resolve, delayMs))
      if (auth.currentUser?.uid !== expectedUid) return

      try {
        const response = await fetch('/api/conversations/activity', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ conversationId: id, messageId: msgId }),
        })
        const result = await response.json().catch(() => ({}))
        if (response.ok && result?.ok === true) return

        lastFailure = {
          HTTP: response.status,
          code: result?.error || 'conversation_activity_failed',
        }
        const retryable = response.status >= 500
          || result?.error === 'conversation_activity_not_committed'
          || result?.error === 'conversation_index_not_ready'
        if (!retryable) break
      } catch (error) {
        lastFailure = { code: error?.code || 'conversation_activity_failed' }
      }
    }

    if (auth.currentUser?.uid === expectedUid) {
      debugActivityFailure({
        operation: 'sync_message_activity',
        path: `conversas/{participant}/${id}`,
        authUid: expectedUid,
        conversationId: id,
        messageId: msgId,
        HTTP: lastFailure?.HTTP || null,
        error: { code: lastFailure?.code || 'conversation_activity_failed' },
      })
    }
  })().catch((error) => {
    if (auth.currentUser?.uid !== expectedUid) return
    debugActivityFailure({
      operation: 'sync_message_activity',
      path: `conversas/{participant}/${id}`,
      authUid: expectedUid,
      conversationId: id,
      messageId: msgId,
      error: { code: error?.code || 'conversation_activity_failed' },
    })
  })
}
