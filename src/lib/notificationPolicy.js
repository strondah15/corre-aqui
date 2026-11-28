import { consumeFixedWindowLimit } from './serverRateLimit.js'

const VALID_ID = /^[A-Za-z0-9_-]{1,128}$/

const TYPE_ALIASES = Object.freeze({
  corre_aceito: 'pedido_aceito',
  mensagem_chat: 'nova_mensagem',
  pedido_direto_criado: 'solicitacao_privada',
  agendamento_criado: 'agendamento_solicitado',
  atendimento_chegou: 'profissional_chegou',
  atendimento_cancelado: 'pedido_cancelado',
  servico_concluido: 'atendimento_finalizado',
})

const ACTIVE_PUBLIC_STATUSES = new Set([
  'aceito', 'aguardando_inicio', 'em_andamento', 'em_atendimento', 'a_caminho',
  'em_deslocamento', 'chegou', 'em_local', 'chegando', 'aguardando_confirmacao',
  'finalizado', 'concluido', 'avaliado',
])
const ACTIVE_PRIVATE_STATUSES = new Set([
  'aceito', 'agendado', 'em_andamento', 'a_caminho', 'chegou',
  'aguardando_confirmacao', 'finalizado',
])

function clean(value, fallback = '', max = 180) {
  return String(value ?? fallback).trim().slice(0, max)
}

function validId(value) {
  return VALID_ID.test(String(value || ''))
}

function statusOf(record) {
  return clean(record?.status, '', 40).toLowerCase()
}

function participantData(kind, record = {}) {
  if (kind === 'privateRequest') {
    return {
      clientId: clean(record.clienteId, '', 128),
      professionalId: clean(record.profissionalId, '', 128),
      clientName: clean(record.clienteNome, 'Cliente', 80) || 'Cliente',
      professionalName: clean(record.profissionalNome, 'Profissional', 80) || 'Profissional',
      clientPhoto: clean(record.clienteFotoURL, '', 2_000),
      professionalPhoto: clean(record.profissionalFotoURL, '', 2_000),
    }
  }
  return {
    clientId: clean(record?.criador?.id, '', 128),
    professionalId: clean(record?.aceite?.id, '', 128),
    clientName: clean(record?.criador?.nome, 'Cliente', 80) || 'Cliente',
    professionalName: clean(record?.aceite?.nome, 'Profissional', 80) || 'Profissional',
    clientPhoto: clean(record?.criador?.fotoURL, '', 2_000),
    professionalPhoto: clean(record?.aceite?.fotoURL, '', 2_000),
  }
}

function actorPairMatches(participants, actorUid, toUid, actorRole) {
  if (!validId(actorUid) || !validId(toUid) || actorUid === toUid) return false
  if (actorRole === 'client') return actorUid === participants.clientId && toUid === participants.professionalId
  if (actorRole === 'professional') return actorUid === participants.professionalId && toUid === participants.clientId
  return (actorUid === participants.clientId && toUid === participants.professionalId)
    || (actorUid === participants.professionalId && toUid === participants.clientId)
}

function actorName(participants, actorUid) {
  return actorUid === participants.clientId ? participants.clientName : participants.professionalName
}

function titleOf(record) {
  return clean(record?.servicoTitulo || record?.titulo || record?.categoriaNome || 'serviço solicitado', 'serviço solicitado', 120)
}

function auditActor(record, field) {
  return clean(record?.[field]?.id || record?.atendimento?.[field]?.id, '', 128)
}

function privateResponseMatches(marker, record, sourceId, status) {
  return Boolean(marker)
    && marker.committed === true
    && clean(marker.requestId, '', 128) === clean(sourceId, '', 128)
    && clean(marker.clienteId, '', 128) === clean(record?.clienteId, '', 128)
    && clean(marker.profissionalId, '', 128) === clean(record?.profissionalId, '', 128)
    && clean(marker.respondedBy, '', 128) === clean(record?.profissionalId, '', 128)
    && clean(marker.status, '', 40).toLowerCase() === status
    && statusOf(record) === status
}

function eventResult(type, details = {}) {
  return { ok: true, type, ...details }
}

function eventError(error = 'notification_event_not_authorized') {
  return { ok: false, error }
}

export function normalizeNotificationType(value) {
  const type = clean(value, '', 80).toLowerCase()
  return TYPE_ALIASES[type] || type
}

export function authorizeNotificationEvent({
  kind,
  record,
  sourceId,
  actorUid,
  toUid,
  requestedType,
  message = null,
  rating = null,
  responseMarker = null,
  privateResponseAuthorized = false,
} = {}) {
  if ((kind !== 'pedido' && kind !== 'privateRequest') || !record || typeof record !== 'object') {
    return eventError('notification_context_not_found')
  }

  const type = normalizeNotificationType(requestedType)
  const status = statusOf(record)
  const participants = participantData(kind, record)
  if (!validId(participants.clientId) || !validId(participants.professionalId) || participants.clientId === participants.professionalId) {
    return eventError('notification_participants_invalid')
  }
  const name = actorName(participants, actorUid)
  const serviceTitle = titleOf(record)
  const active = kind === 'pedido'
    ? ACTIVE_PUBLIC_STATUSES.has(status)
    : ACTIVE_PRIVATE_STATUSES.has(status) && privateResponseAuthorized === true

  if (type === 'nova_mensagem') {
    if (!active || !actorPairMatches(participants, actorUid, toUid, 'either')) return eventError()
    if (!message || clean(message.userId, '', 128) !== actorUid) return eventError('notification_message_unverified')
    return eventResult(type, {
      title: `Nova mensagem de ${name}`,
      body: 'Você recebeu uma nova mensagem no Corre Aqui.',
      priority: 'normal',
      action: { label: 'Abrir conversa', screen: 'chat' },
      actorName: name,
    })
  }

  if (type === 'chamar_atencao_chat') {
    if (!active || !actorPairMatches(participants, actorUid, toUid, 'either')) return eventError()
    if (!message || clean(message.userId, '', 128) !== actorUid) return eventError('notification_message_unverified')
    return eventResult(type, {
      title: `${name} chamou sua atenção`,
      body: `${name} está aguardando você na conversa sobre ${serviceTitle}.`,
      priority: 'high',
      action: { label: 'Abrir conversa', screen: 'chat' },
      actorName: name,
    })
  }

  if (kind === 'pedido' && type === 'pedido_aceito') {
    if (!actorPairMatches(participants, actorUid, toUid, 'professional') || status !== 'aceito') return eventError()
    return eventResult(type, {
      title: 'Seu pedido foi aceito!',
      body: `${participants.professionalName} aceitou seu pedido: ${serviceTitle}.`,
      priority: 'high',
      action: { label: 'Conversar agora', screen: 'chat' },
      actorName: participants.professionalName,
      essentialType: 'PEDIDO_ACEITO',
      essentialStatus: 'aceito',
    })
  }

  if (kind === 'privateRequest' && type === 'solicitacao_privada') {
    if (clean(record.tipo, '', 40) !== 'pedido_direto' || status !== 'pendente'
      || !actorPairMatches(participants, actorUid, toUid, 'client')) return eventError()
    return eventResult(type, {
      title: 'Você recebeu uma solicitação',
      body: `${participants.clientName} solicitou seu serviço.`,
      priority: 'high',
      action: { label: 'Ver pedido', screen: 'privateRequestDetails' },
      actorName: participants.clientName,
    })
  }

  if (kind === 'privateRequest' && type === 'agendamento_solicitado') {
    if (clean(record.tipo, '', 40) !== 'agendamento' || status !== 'pendente'
      || !actorPairMatches(participants, actorUid, toUid, 'client')) return eventError()
    return eventResult(type, {
      title: 'Nova solicitação de agendamento',
      body: `${participants.clientName} quer agendar ${serviceTitle}.`,
      priority: 'high',
      action: { label: 'Ver solicitação', screen: 'agenda' },
      actorName: participants.clientName,
      essentialType: 'AGENDAMENTO_SOLICITADO',
      essentialStatus: 'pendente',
    })
  }

  if (kind === 'privateRequest' && type === 'pedido_direto_aceito') {
    if (clean(record.tipo, '', 40) !== 'pedido_direto'
      || !actorPairMatches(participants, actorUid, toUid, 'professional')
      || !privateResponseMatches(responseMarker, record, sourceId, 'aceito')) return eventError()
    return eventResult(type, {
      title: 'Seu pedido foi aceito!',
      body: `${participants.professionalName} aceitou seu pedido: ${serviceTitle}.`,
      priority: 'high',
      action: { label: 'Abrir conversa', screen: 'chat' },
      actorName: participants.professionalName,
      essentialType: 'PEDIDO_ACEITO',
      essentialStatus: 'aceito',
    })
  }

  if (kind === 'privateRequest' && type === 'pedido_direto_recusado') {
    if (clean(record.tipo, '', 40) !== 'pedido_direto'
      || !actorPairMatches(participants, actorUid, toUid, 'professional')
      || !privateResponseMatches(responseMarker, record, sourceId, 'recusado')) return eventError()
    return eventResult(type, {
      title: 'Pedido recusado',
      body: `${participants.professionalName} recusou seu pedido.`,
      priority: 'high',
      action: { label: 'Procurar outro profissional', screen: 'portfolio' },
      actorName: participants.professionalName,
    })
  }

  if (kind === 'privateRequest' && (type === 'agendamento_aceito' || type === 'agendamento_recusado')) {
    const expected = type === 'agendamento_aceito' ? 'agendado' : 'recusado'
    if (clean(record.tipo, '', 40) !== 'agendamento'
      || !actorPairMatches(participants, actorUid, toUid, 'professional')
      || !privateResponseMatches(responseMarker, record, sourceId, expected)) return eventError()
    return eventResult(type, {
      title: expected === 'agendado' ? 'Agendamento confirmado' : 'Atualização do agendamento',
      body: expected === 'agendado'
        ? `Seu agendamento com ${participants.professionalName} foi confirmado.`
        : `${participants.professionalName} não poderá atender nesse horário.`,
      priority: 'high',
      action: expected === 'agendado'
        ? { label: 'Abrir conversa', screen: 'chat' }
        : { label: 'Escolher outro horário', screen: 'portfolio' },
      actorName: participants.professionalName,
      ...(expected === 'agendado' ? { essentialType: 'AGENDAMENTO_ACEITO', essentialStatus: expected } : {}),
    })
  }

  if (type === 'atendimento_a_caminho') {
    if (!active || status !== 'a_caminho' || !actorPairMatches(participants, actorUid, toUid, 'professional')
      || auditActor(record, 'aCaminhoPor') !== actorUid) return eventError()
    return eventResult(type, {
      title: 'Profissional a caminho',
      body: `${participants.professionalName} informou que está indo até você.`,
      priority: 'high',
      action: { label: 'Abrir atendimento', screen: 'chat' },
      actorName: participants.professionalName,
    })
  }

  if (type === 'profissional_chegou') {
    if (!active || status !== 'chegou' || !actorPairMatches(participants, actorUid, toUid, 'professional')
      || auditActor(record, 'chegouPor') !== actorUid) return eventError()
    return eventResult(type, {
      title: 'Seu profissional chegou',
      body: `${participants.professionalName} informou que chegou ao local.`,
      priority: 'high',
      action: { label: 'Abrir atendimento', screen: 'chat' },
      actorName: participants.professionalName,
    })
  }

  if (type === 'finalizacao_solicitada') {
    if (!active || status !== 'aguardando_confirmacao' || !actorPairMatches(participants, actorUid, toUid, 'professional')
      || auditActor(record, 'finalizacaoSolicitadaPor') !== actorUid) return eventError()
    return eventResult(type, {
      title: 'Confirme a conclusão',
      body: `${participants.professionalName} solicitou a finalização do atendimento.`,
      priority: 'high',
      action: { label: 'Abrir atendimento', screen: 'chat' },
      actorName: participants.professionalName,
    })
  }

  if (type === 'atendimento_finalizado') {
    if (!active || !['finalizado', 'concluido', 'avaliado'].includes(status)
      || !actorPairMatches(participants, actorUid, toUid, 'client')
      || auditActor(record, 'finalizadoPor') !== actorUid) return eventError()
    return eventResult(type, {
      title: 'Serviço concluído',
      body: 'O cliente confirmou a conclusão do atendimento.',
      priority: 'high',
      action: { label: 'Ver histórico', screen: 'ver_historico' },
      actorName: participants.clientName,
    })
  }

  if (type === 'pedido_cancelado') {
    if (status !== 'cancelado' || !actorPairMatches(participants, actorUid, toUid, 'either')
      || auditActor(record, 'canceladoPor') !== actorUid) return eventError()
    const role = actorUid === participants.clientId ? 'cliente' : 'profissional'
    return eventResult(type, {
      title: 'Atendimento cancelado',
      body: `Atendimento cancelado pelo ${role}.`,
      priority: 'high',
      action: { label: 'Ver conversa', screen: 'chat' },
      actorName: name,
    })
  }

  if (type === 'avaliacao_recebida') {
    if (!['finalizado', 'concluido', 'avaliado'].includes(status)
      || !actorPairMatches(participants, actorUid, toUid, 'client')
      || clean(rating?.pedidoId, '', 128) !== clean(sourceId, '', 128)
      || clean(rating?.cliente?.id, '', 128) !== actorUid
      || clean(rating?.avaliado?.id, '', 128) !== toUid) return eventError('notification_rating_unverified')
    return eventResult(type, {
      title: 'Você recebeu uma avaliação',
      body: 'Veja como foi seu atendimento.',
      priority: 'normal',
      action: { label: 'Ver avaliações', screen: 'avaliacoes' },
      actorName: participants.clientName,
    })
  }

  return eventError('notification_type_not_allowed')
}

function safeSegment(value) {
  return clean(value, '', 180).replace(/[^A-Za-z0-9_-]/g, '_')
}

export function trustedNotificationId({ type, sourceId, toUid, messageId = '', now = Date.now() } = {}) {
  const canonicalType = normalizeNotificationType(type)
  const discriminator = canonicalType === 'nova_mensagem'
    ? safeSegment(messageId)
    : canonicalType === 'chamar_atencao_chat'
      ? String(Math.floor(Number(now) / 120_000))
      : 'state'
  return ['server', safeSegment(canonicalType), safeSegment(sourceId), safeSegment(toUid), discriminator]
    .filter(Boolean)
    .join('_')
    .slice(0, 180)
}

export function buildTrustedNotification({
  event,
  kind,
  record,
  sourceId,
  actorUid,
  toUid,
  messageId = '',
  now = Date.now(),
} = {}) {
  if (!event?.ok) throw new Error('notification_event_not_authorized')
  const participants = participantData(kind, record)
  const id = trustedNotificationId({ type: event.type, sourceId, toUid, messageId, now })
  const privateRequest = kind === 'privateRequest'
  const actorIsClient = actorUid === participants.clientId
  const actorPhoto = actorIsClient ? participants.clientPhoto : participants.professionalPhoto
  const action = { ...event.action, id: sourceId }
  const payload = {
    id,
    eventId: id,
    schemaVersion: 1,
    serverGenerated: true,
    tipo: event.type,
    titulo: clean(event.title, 'Corre Aqui', 80),
    mensagem: clean(event.body, 'Você tem uma nova atualização.', 220),
    pedidoId: sourceId,
    conversaId: sourceId,
    ...(privateRequest ? { privateRequest: true, privateRequestId: sourceId, origem: 'privateRequest' } : { origem: 'pedido' }),
    ...(record?.servicoId ? { servicoId: clean(record.servicoId, '', 128) } : {}),
    fromUid: actorUid,
    toUid,
    autor: {
      id: actorUid,
      nome: clean(event.actorName, actorName(participants, actorUid), 80),
      ...(actorPhoto ? { fotoURL: actorPhoto } : {}),
    },
    action,
    acao: action.screen,
    prioridade: event.priority === 'high' ? 'alta' : 'normal',
    lida: false,
    read: false,
    criadoEm: Number(now),
    createdAt: Number(now),
  }

  if (event.essentialType) {
    Object.assign(payload, {
      tipoEvento: event.essentialType,
      eventoStatus: event.essentialStatus,
      criadorUid: participants.clientId,
      destinatarioUid: toUid,
      atorNome: clean(event.actorName, actorName(participants, actorUid), 80),
      ...(actorPhoto ? { atorFotoURL: actorPhoto } : {}),
      servicoTitulo: titleOf(record),
      statusAtual: statusOf(record),
      ...(privateRequest ? { solicitacaoId: sourceId } : {}),
      ...(clean(record?.tipo, '', 40) === 'agendamento' ? {
        agendamentoId: sourceId,
        dataAgendamento: clean(record?.data, '', 32),
        horaAgendamento: clean(record?.hora, '', 32),
      } : {}),
      ...(actorIsClient
        ? { clienteNome: participants.clientName, clienteFotoURL: participants.clientPhoto || undefined }
        : { profissionalNome: participants.professionalName, profissionalFotoURL: participants.professionalPhoto || undefined }),
    })
  }

  return payload
}

export function notificationRateProfile(type) {
  const canonicalType = normalizeNotificationType(type)
  if (canonicalType === 'chamar_atencao_chat') {
    return { windowMs: 10 * 60_000, maxRequests: 3, minIntervalMs: 120_000 }
  }
  if (canonicalType === 'nova_mensagem') {
    return { windowMs: 60_000, maxRequests: 20, minIntervalMs: 0 }
  }
  return { windowMs: 10 * 60_000, maxRequests: 6, minIntervalMs: 5_000 }
}

export async function consumeNotificationRateLimit({ database, actorUid, type, sourceId, now = Date.now() } = {}) {
  if (!validId(actorUid) || !validId(sourceId)) throw new Error('notification_rate_limit_identity_invalid')
  const canonicalType = normalizeNotificationType(type)
  const profile = notificationRateProfile(canonicalType)
  const key = `${safeSegment(canonicalType)}_${safeSegment(sourceId)}`.slice(0, 240)
  const globalDecision = await consumeFixedWindowLimit({
    database,
    path: `serverUsage/notifications/${actorUid}/global`,
    now,
    windowMs: 60_000,
    maxRequests: 30,
  })
  if (!globalDecision.allowed) return globalDecision
  return consumeFixedWindowLimit({
    database,
    path: `serverUsage/notifications/${actorUid}/events/${key}`,
    now,
    ...profile,
  })
}
