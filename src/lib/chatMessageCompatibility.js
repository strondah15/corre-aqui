const TRUSTED_EVENT_TYPES = new Set([
  'atendimento_intro',
  'pedido_aceito',
  'atendimento_iniciado',
  'atendimento_a_caminho',
  'atendimento_chegou',
  'finalizacao_solicitada',
  'atendimento_finalizado',
  'atendimento_cancelado',
  'agendamento_solicitado',
  'agendamento_aceito',
  'agendamento_recusado',
])

const LEGACY_EVENT_PATTERNS = [
  ['pedido_aceito', /^(?:✓\s*)?(?:pedido aceito|.+ aceitou (?:o|seu) pedido)[.!]?$/i],
  ['atendimento_iniciado', /^(?:✓\s*)?(?:atendimento iniciado|.+ iniciou (?:o )?atendimento)[.!]?$/i],
  ['atendimento_a_caminho', /^(?:✓\s*)?(?:profissional )?informou que est[aá] a caminho[.!]?$/i],
  ['atendimento_chegou', /^(?:✓\s*)?(?:.+ )?(?:informou que )?chegou ao local[.!]?$/i],
  ['finalizacao_solicitada', /^(?:✓\s*)?(?:.+ )?solicitou (?:a )?finaliza(?:cao|ção)(?: do atendimento)?[.!]?$/i],
  ['atendimento_finalizado', /^(?:✓\s*)?(?:servico concluido|serviço concluído|atendimento finalizado(?: com sucesso)?)[.!]?$/i],
  ['atendimento_cancelado', /^atendimento cancelado pelo (?:cliente|profissional)[.!]?$/i],
  ['agendamento_aceito', /^(?:✓\s*)?agendamento (?:confirmado|aceito)[.!]?$/i],
]

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '')
const text = (value) => String(value ?? '').trim()
const FIREBASE_PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'

export function chatTimestampMs(value) {
  if (!value) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value === 'object') {
    const seconds = Number(firstValue(value.seconds, value._seconds))
    const nanoseconds = Number(firstValue(value.nanoseconds, value._nanoseconds, 0))
    if (Number.isFinite(seconds) && seconds > 0) {
      return (seconds * 1000) + (Number.isFinite(nanoseconds) ? Math.floor(nanoseconds / 1_000_000) : 0)
    }
  }
  return 0
}

function firebasePushTimestamp(id) {
  const value = text(id)
  if (value.length < 8) return 0

  let timestamp = 0
  for (let index = 0; index < 8; index += 1) {
    const digit = FIREBASE_PUSH_CHARS.indexOf(value[index])
    if (digit < 0) return 0
    timestamp = (timestamp * 64) + digit
  }
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : 0
}

function messageTimestamp(message = {}, id = '') {
  const candidates = [
    message.criadoEmServer,
    message.criadoEm,
    message.hora,
    message.createdAt,
    message.timestamp,
    message.sentAt,
    message.enviadoEm,
  ]

  for (const value of candidates) {
    const timestampMs = chatTimestampMs(value)
    if (timestampMs > 0) return { value, timestampMs }
  }

  const timestampMs = firebasePushTimestamp(id)
  return { value: timestampMs || null, timestampMs }
}

function hasSystemMarker(message = {}) {
  const systemAuthor = text(message.autorId).toLowerCase() === 'sistema'
    || text(message.userId).toLowerCase() === 'sistema'
  const structuredSystem = message.sistema === true && text(message.tipo).toLowerCase() === 'sistema'
  return systemAuthor || structuredSystem
}

function normalizeComparableText(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function getLegacyChatEventType(message = {}) {
  if (!hasSystemMarker(message)) return ''

  const explicit = text(firstValue(message.evento, message.eventType, message.tipoEvento)).toLowerCase()
  if (TRUSTED_EVENT_TYPES.has(explicit)) return explicit

  const comparable = normalizeComparableText(firstValue(message.texto, message.mensagem, message.message, message.text))
  return LEGACY_EVENT_PATTERNS.find(([, pattern]) => pattern.test(comparable))?.[0] || ''
}

function normalizeLegacyAttachment(message = {}) {
  const candidate = firstValue(message.anexo, message.attachment, message.arquivo)
  if (candidate && typeof candidate === 'object') return candidate
  if (typeof candidate === 'string') {
    return { tipo: 'arquivo', url: candidate, nome: 'Anexo antigo' }
  }
  return null
}

export function normalizeChatMessage(message = {}, { id = '', source = 'chats', sequence = 0 } = {}) {
  const normalizedId = text(id || message.id) || `${source}-${sequence}`
  const rawAuthor = message.autor
  const authorObject = rawAuthor && typeof rawAuthor === 'object' ? rawAuthor : null
  const authorName = text(firstValue(
    authorObject?.nome,
    typeof rawAuthor === 'string' ? rawAuthor : '',
    message.autorNome,
    message.senderName,
    message.remetenteNome,
  ))
  const userId = text(firstValue(
    message.userId,
    authorObject?.id,
    message.autorId,
    message.senderId,
    message.remetenteId,
  ))
  const { value: timestampValue, timestampMs } = messageTimestamp(message, normalizedId)
  const eventType = getLegacyChatEventType(message)
  const content = String(firstValue(message.texto, message.mensagem, message.message, message.text, message.content) ?? '')
  const renderKind = eventType ? 'event' : 'message'

  return {
    ...message,
    id: normalizedId,
    type: renderKind === 'event' ? 'system_event' : text(message.tipo || message.type) || 'message',
    timestamp: timestampMs,
    senderId: userId,
    content,
    texto: content,
    userId,
    autorId: text(firstValue(message.autorId, userId)),
    autor: authorName,
    hora: timestampValue || null,
    timestampMs,
    anexo: normalizeLegacyAttachment(message),
    audio: typeof message.audio === 'string' ? message.audio : '',
    eventType,
    renderKind,
    legacySource: source === 'mensagens',
  }
}

export function compareChatTimelineItems(a = {}, b = {}) {
  const timestampDifference = Number(a.timestampMs || 0) - Number(b.timestampMs || 0)
  if (timestampDifference !== 0) return timestampDifference

  const aId = text(a.id)
  const bId = text(b.id)
  if (aId < bId) return -1
  if (aId > bId) return 1
  return 0
}

export function normalizeAndMergeChatMessages(chats = {}, mensagens = {}, limit = 80) {
  const merged = new Map()
  let sequence = 0

  for (const [source, records] of [['mensagens', mensagens], ['chats', chats]]) {
    for (const [id, message] of Object.entries(records || {})) {
      if (!message || typeof message !== 'object') continue
      merged.set(id, normalizeChatMessage(message, { id, source, sequence }))
      sequence += 1
    }
  }

  const seenEvents = new Set()
  const sorted = [...merged.values()]
    .sort(compareChatTimelineItems)
    .filter((message) => {
      const eventId = text(message.eventId)
      if (!eventId || message.renderKind !== 'event') return true
      if (seenEvents.has(eventId)) return false
      seenEvents.add(eventId)
      return true
    })

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 80))
  return sorted.slice(-safeLimit)
}
