import { isPrivateAttendanceStatus } from './attendanceState.js'

const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/

const text = (value, maxLength = 160) => String(value || '').trim().slice(0, maxLength)

export function isValidConversationId(value) {
  return typeof value === 'string' && VALID_ID.test(value)
}

function timestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object' && Number.isFinite(value.seconds)) {
    return (value.seconds * 1000) + Math.floor(Number(value.nanoseconds || 0) / 1_000_000)
  }
  return 0
}

function pedidoParticipants(record = {}) {
  return {
    clienteId: text(record?.criador?.id || record?.criador?.uid, 128),
    profissionalId: text(record?.aceite?.id || record?.aceite?.uid, 128),
    clienteNome: text(record?.criador?.nome || 'Cliente', 120),
    profissionalNome: text(record?.aceite?.nome || 'Profissional', 120),
  }
}

function privateRequestParticipants(record = {}) {
  return {
    clienteId: text(record?.clienteId, 128),
    profissionalId: text(record?.profissionalId, 128),
    clienteNome: text(record?.clienteNome || 'Cliente', 120),
    profissionalNome: text(record?.profissionalNome || 'Profissional', 120),
  }
}

export function isPrivateResponseMarkerValid(marker, conversationId, record) {
  const status = text(record?.status, 40).toLowerCase()
  const responseStatus = text(marker?.status, 40).toLowerCase()
  const expectedResponseStatus = text(record?.tipo, 40).toLowerCase() === 'agendamento' ? 'agendado' : 'aceito'
  return Boolean(marker)
    && marker.committed === true
    && text(marker.requestId, 128) === conversationId
    && text(marker.clienteId, 128) === text(record?.clienteId, 128)
    && text(marker.profissionalId, 128) === text(record?.profissionalId, 128)
    && text(marker.respondedBy, 128) === text(record?.profissionalId, 128)
    && text(marker.previousStatus, 40) === 'pendente'
    && responseStatus === expectedResponseStatus
    && isPrivateAttendanceStatus(status)
}

export async function readConversationContext(database, conversationId, { kind } = {}) {
  if (kind !== 'pedido' && kind !== 'privateRequest') {
    return { ok: false, error: 'conversation_context_kind_required' }
  }

  const path = kind === 'pedido' ? `pedidos/${conversationId}` : `privateRequests/${conversationId}`
  const snapshot = await database.ref(path).get()
  if (!snapshot.exists()) {
    return { ok: false, error: 'conversation_context_not_found' }
  }

  const context = { ok: true, kind, record: snapshot.val() }
  if (kind === 'pedido') return context

  const participants = privateRequestParticipants(context.record)
  const [markerSnapshot, clienteConversation, profissionalConversation] = await Promise.all([
    database.ref(`privateRequestResponses/${conversationId}`).get(),
    participants.clienteId
      ? database.ref(`conversas/${participants.clienteId}/${conversationId}`).get()
      : Promise.resolve(null),
    participants.profissionalId
      ? database.ref(`conversas/${participants.profissionalId}/${conversationId}`).get()
      : Promise.resolve(null),
  ])
  const markerValid = isPrivateResponseMarkerValid(markerSnapshot.val(), conversationId, context.record)
  const legacyPairValid = Boolean(
    clienteConversation?.exists()
    && profissionalConversation?.exists()
    && conversationIdentityMatches(clienteConversation.val(), conversationId, participants.profissionalId)
    && conversationIdentityMatches(profissionalConversation.val(), conversationId, participants.clienteId),
  )

  return {
    ...context,
    privateResponseAuthorized: markerValid || legacyPairValid,
    responseMarkerValid: markerValid,
    legacyConversationPairValid: legacyPairValid,
  }
}

export function describeConversationContext(context) {
  const record = context?.record || {}
  const participants = context?.kind === 'pedido'
    ? pedidoParticipants(record)
    : privateRequestParticipants(record)
  const status = text(record?.status, 40).toLowerCase()
  const active = context?.kind === 'pedido'
    ? Boolean(participants.clienteId && participants.profissionalId && status !== 'aberto')
    : Boolean(
        participants.clienteId
        && participants.profissionalId
        && isPrivateAttendanceStatus(status)
        && context?.privateResponseAuthorized === true,
      )

  return {
    ...participants,
    status,
    active,
    title: text(record?.servicoTitulo || record?.titulo || 'Serviço solicitado'),
    categoryName: text(record?.categoriaNome || record?.categoriaLabel, 120),
    value: record?.valor ?? null,
    privateRequest: context?.kind === 'privateRequest',
  }
}

export async function resolveActiveConversationContext(database, conversationId, actorUid) {
  const uid = text(actorUid, 128)
  if (!uid) return { ok: false, error: 'conversation_actor_required' }

  for (const kind of ['pedido', 'privateRequest']) {
    const context = await readConversationContext(database, conversationId, { kind })
    if (!context.ok) continue
    const meta = describeConversationContext(context)
    const participant = uid === meta.clienteId || uid === meta.profissionalId
    if (participant && meta.active) return context
  }

  return { ok: false, error: 'conversation_context_not_authorized' }
}

function messagePreview(message = {}) {
  const messageText = text(message?.texto, 96)
  if (messageText) return messageText
  const attachmentType = text(message?.anexo?.tipo || message?.tipo, 24).toLowerCase()
  if (attachmentType === 'imagem') return 'Imagem'
  if (attachmentType === 'audio') return 'Áudio'
  return 'Nova mensagem'
}

function activityTimestamp(message = {}) {
  return timestampMs(message?.criadoEm) || timestampMs(message?.hora)
}

function conversationIdentityMatches(value, conversationId, otherUid) {
  return Boolean(value)
    && text(value?.pedidoId, 128) === conversationId
    && text(value?.outroId, 128) === otherUid
}

export function isConversationActivityNewer(current, activityAt, messageId) {
  if (!current || typeof current !== 'object') return true
  const currentMessageId = text(current.lastMessageId, 128)
  if (currentMessageId && currentMessageId === messageId) return false

  const currentAt = timestampMs(current.lastAt) || timestampMs(current.updatedAt)
  if (activityAt > currentAt) return true
  if (activityAt < currentAt) return false
  return !currentMessageId || messageId > currentMessageId
}

function buildConversationActivity({
  current,
  conversationId,
  messageId,
  activityAt,
  preview,
  meta,
  actorUid,
  otherUid,
  unread,
}) {
  const actorName = actorUid === meta.clienteId ? meta.clienteNome : meta.profissionalNome
  const otherName = otherUid === meta.clienteId ? meta.clienteNome : meta.profissionalNome

  return {
    ...(current && typeof current === 'object' ? current : {}),
    pedidoId: conversationId,
    ...(meta.privateRequest ? { privateRequestId: conversationId, privateRequest: true } : {}),
    titulo: meta.title,
    outroId: otherUid,
    outroNome: otherName,
    unread,
    lastText: preview,
    mensagemPreview: preview,
    lastAt: activityAt,
    updatedAt: activityAt,
    lastMessageId: messageId,
    lastById: actorUid,
    lastByNome: actorName,
    status: 'ativa',
    pedidoStatus: meta.status,
    ...(meta.categoryName ? { categoriaNome: meta.categoryName } : {}),
    ...(meta.value !== null && meta.value !== undefined ? { valor: meta.value } : {}),
  }
}

export async function applyConversationActivity({
  database,
  context,
  conversationId,
  messageId,
  message,
  actorUid,
}) {
  const meta = describeConversationContext(context)
  if (!meta.active) return { ok: false, error: 'conversation_not_active' }
  if (actorUid !== meta.clienteId && actorUid !== meta.profissionalId) {
    return { ok: false, error: 'conversation_actor_not_participant' }
  }

  const counterpartUid = actorUid === meta.clienteId ? meta.profissionalId : meta.clienteId
  const activityAt = activityTimestamp(message)
  if (!activityAt) return { ok: false, error: 'conversation_message_timestamp_invalid' }
  const preview = messagePreview(message)
  const actorPath = `conversas/${actorUid}/${conversationId}`
  const counterpartPath = `conversas/${counterpartUid}/${conversationId}`
  const [actorSnapshot, counterpartSnapshot] = await Promise.all([
    database.ref(actorPath).get(),
    database.ref(counterpartPath).get(),
  ])

  if ((actorSnapshot.exists() && !conversationIdentityMatches(actorSnapshot.val(), conversationId, counterpartUid))
    || (counterpartSnapshot.exists() && !conversationIdentityMatches(counterpartSnapshot.val(), conversationId, actorUid))) {
    return { ok: false, error: 'conversation_identity_conflict' }
  }

  const writeActivity = ({ path, otherUid, unread }) => database.ref(path).transaction((current) => {
    if (current && !conversationIdentityMatches(current, conversationId, otherUid)) return undefined
    if (!isConversationActivityNewer(current, activityAt, messageId)) return current
    return buildConversationActivity({
      current,
      conversationId,
      messageId,
      activityAt,
      preview,
      meta,
      actorUid,
      otherUid,
      unread,
    })
  })

  let actorResult = null
  let counterpartResult = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const results = await Promise.allSettled([
      writeActivity({ path: actorPath, otherUid: counterpartUid, unread: false }),
      writeActivity({ path: counterpartPath, otherUid: actorUid, unread: true }),
    ])
    actorResult = results[0].status === 'fulfilled' ? results[0].value : null
    counterpartResult = results[1].status === 'fulfilled' ? results[1].value : null
    if (actorResult?.committed && counterpartResult?.committed) break
  }
  if (!actorResult?.committed || !counterpartResult?.committed) {
    return { ok: false, error: 'conversation_activity_not_committed' }
  }

  return {
    ok: true,
    conversationId,
    messageId,
    actorUid,
    counterpartUid,
  }
}
