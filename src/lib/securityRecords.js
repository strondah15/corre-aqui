'use client'

import { onValue, ref } from './firebaseDebug'

function toEntries(snapshot) {
  const value = snapshot.val() || {}
  return Object.entries(value)
    .map(([registroId, item]) => ({ registroId, ...(item || {}) }))
    .filter((item) => item.registroId)
}

// The per-user index contains only an id, status and timestamp. The sensitive
// report itself is always fetched from its protected individual path.
export function subscribeSecurityRecords({ database, uid, onChange, onError }) {
  if (!database || !uid) {
    onChange?.([])
    return () => {}
  }

  const records = new Map()
  const recordUnsubscribers = new Map()

  const emit = () => {
    onChange?.(
      Array.from(records.values()).sort((a, b) => Number(b?.criadoEm || 0) - Number(a?.criadoEm || 0))
    )
  }

  const stopRecord = (registroId) => {
    recordUnsubscribers.get(registroId)?.()
    recordUnsubscribers.delete(registroId)
    records.delete(registroId)
  }

  const offIndex = onValue(
    ref(database, `registrosSegurancaPorUsuario/${uid}`),
    (snapshot) => {
      const indexed = new Set(toEntries(snapshot).map((item) => item.registroId))

      for (const registroId of recordUnsubscribers.keys()) {
        if (!indexed.has(registroId)) stopRecord(registroId)
      }

      for (const registroId of indexed) {
        if (recordUnsubscribers.has(registroId)) continue

        const offRecord = onValue(
          ref(database, `problemasServico/${registroId}`),
          (recordSnapshot) => {
            if (recordSnapshot.exists()) {
              records.set(registroId, { id: registroId, ...(recordSnapshot.val() || {}) })
            } else {
              records.delete(registroId)
            }
            emit()
          },
          onError
        )
        recordUnsubscribers.set(registroId, offRecord)
      }

      emit()
    },
    onError
  )

  return () => {
    offIndex()
    for (const offRecord of recordUnsubscribers.values()) offRecord()
    recordUnsubscribers.clear()
    records.clear()
  }
}
