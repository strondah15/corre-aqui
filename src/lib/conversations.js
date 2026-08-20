const CONVERSATION_TIMESTAMP_FIELDS = [
  'lastAt',
  'updatedAt',
  'lastMessageAt',
  'atualizadoEm',
  'criadoEm',
  'createdAt',
]

export function conversationTimestampMs(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  if (!value || typeof value !== 'object') return 0
  if (typeof value.toMillis === 'function') {
    const milliseconds = Number(value.toMillis())
    return Number.isFinite(milliseconds) ? milliseconds : 0
  }

  const seconds = Number(value.seconds ?? value._seconds)
  const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds ?? 0)
  if (!Number.isFinite(seconds)) return 0
  return (seconds * 1000) + (Number.isFinite(nanoseconds) ? Math.floor(nanoseconds / 1e6) : 0)
}

export function getConversationTimestamp(conversation = {}) {
  return CONVERSATION_TIMESTAMP_FIELDS.reduce(
    (latest, field) => Math.max(latest, conversationTimestampMs(conversation?.[field])),
    0,
  )
}

export function getCanonicalConversationId(entryKey, conversation = {}) {
  const candidates = [
    conversation?.pedidoId,
    conversation?.privateRequestId,
    conversation?.conversaId,
    entryKey,
  ]
  return candidates.map((value) => String(value || '').trim()).find(Boolean) || ''
}

function compareConversationIds(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (left === right) return 0
  return left < right ? -1 : 1
}

export function normalizeAndSortConversations(raw = {}, limit = 60) {
  const grouped = new Map()

  Object.entries(raw || {}).forEach(([entryKey, rawConversation]) => {
    const conversation = rawConversation && typeof rawConversation === 'object' ? rawConversation : {}
    const pedidoId = getCanonicalConversationId(entryKey, conversation)
    if (!pedidoId) return

    const timestamp = getConversationTimestamp(conversation)
    const candidate = {
      ...conversation,
      pedidoId,
      _entryKey: entryKey,
      _timestampMs: timestamp,
    }
    const current = grouped.get(pedidoId)
    if (!current) {
      grouped.set(pedidoId, candidate)
      return
    }

    const candidateIsNewer = timestamp > current._timestampMs
      || (timestamp === current._timestampMs && compareConversationIds(entryKey, current._entryKey) < 0)
    const older = candidateIsNewer ? current : candidate
    const newer = candidateIsNewer ? candidate : current

    grouped.set(pedidoId, {
      ...older,
      ...newer,
      pedidoId,
      unread: newer.unread === true,
      unreadCount: Number.isFinite(Number(newer.unreadCount)) ? Math.max(0, Number(newer.unreadCount)) : 0,
      _timestampMs: Math.max(current._timestampMs, candidate._timestampMs),
    })
  })

  const sorted = Array.from(grouped.values()).sort((a, b) => {
    const byNewest = b._timestampMs - a._timestampMs
    return byNewest || compareConversationIds(a.pedidoId, b.pedidoId)
  })

  const safeLimit = Math.max(1, Math.trunc(Number(limit) || 60))
  return sorted.slice(0, safeLimit)
}
