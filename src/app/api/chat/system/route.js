import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import {
  applyConversationActivity,
  readConversationContext,
} from '@/lib/conversationActivityServer'

export const runtime = 'nodejs'

const SYSTEM_MESSAGES = Object.freeze({
  atendimento_intro: 'Este chat é exclusivo deste atendimento. Combine detalhes importantes por aqui.',
  pedido_aceito: '✓ Pedido aceito.',
  atendimento_iniciado: '✓ Atendimento iniciado.',
  atendimento_a_caminho: '✓ Profissional informou que está a caminho.',
  atendimento_chegou: '✓ Profissional informou que chegou ao local.',
  finalizacao_solicitada: '✓ Profissional solicitou a finalização do atendimento.',
  atendimento_finalizado: '✓ Atendimento finalizado com sucesso.',
  atendimento_cancelado: 'Atendimento cancelado.',
  agendamento_solicitado: '📅 Solicitação de agendamento enviada.',
  agendamento_aceito: '✓ Agendamento confirmado.',
  agendamento_recusado: 'Agendamento recusado.',
})
const SYSTEM_MESSAGE_FIELDS = new Set([
  'tipo', 'texto', 'sistema', 'evento', 'eventId', 'criadoEm', 'hora', 'autorId', 'autorNome',
])

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[.#$\[\]/]/.test(value)
}

function text(value) {
  return String(value || '').trim()
}

function publicParticipants(record = {}) {
  return {
    creatorId: text(record?.criador?.id),
    professionalId: text(record?.aceite?.id),
  }
}

function privateParticipants(record = {}) {
  return {
    creatorId: text(record?.clienteId),
    professionalId: text(record?.profissionalId),
  }
}

function canCreatePublicSystemMessage({ eventType, record, actorUid }) {
  const { creatorId, professionalId } = publicParticipants(record)
  const status = text(record?.status).toLowerCase()
  const hasPair = Boolean(creatorId && professionalId)

  if (!hasPair) return false
  if (eventType === 'atendimento_intro') return actorUid === creatorId || actorUid === professionalId
  if (eventType === 'pedido_aceito') return actorUid === professionalId && status === 'aceito'
  if (eventType === 'atendimento_iniciado') return actorUid === professionalId && status === 'em_andamento'
  if (eventType === 'atendimento_a_caminho') return actorUid === professionalId && status === 'a_caminho'
  if (eventType === 'atendimento_chegou') return actorUid === professionalId && status === 'chegou'
  if (eventType === 'finalizacao_solicitada') return actorUid === professionalId && status === 'aguardando_confirmacao'
  if (eventType === 'atendimento_finalizado') {
    return (actorUid === creatorId && status === 'finalizado') || (actorUid === professionalId && status === 'concluido')
  }
  if (eventType === 'atendimento_cancelado') {
    return status === 'cancelado'
      && (actorUid === creatorId || actorUid === professionalId)
      && text(record?.canceladoPor?.id) === actorUid
  }

  return false
}

function canCreatePrivateSystemMessage({ eventType, record, actorUid }) {
  const { creatorId, professionalId } = privateParticipants(record)
  const type = text(record?.tipo).toLowerCase()
  const status = text(record?.status).toLowerCase()
  const hasPair = Boolean(creatorId && professionalId)

  if (!hasPair) return false
  if (eventType === 'atendimento_intro') return (status === 'aceito' || status === 'agendado') && (actorUid === creatorId || actorUid === professionalId)
  if (eventType === 'pedido_aceito') return type === 'pedido_direto' && actorUid === professionalId && status === 'aceito'
  if (eventType === 'agendamento_solicitado') return type === 'agendamento' && actorUid === creatorId && status === 'pendente'
  if (eventType === 'agendamento_aceito') return type === 'agendamento' && actorUid === professionalId && status === 'agendado'
  if (eventType === 'agendamento_recusado') return type === 'agendamento' && actorUid === professionalId && status === 'recusado'
  if (eventType === 'atendimento_iniciado') return actorUid === professionalId && status === 'em_andamento'
  if (eventType === 'atendimento_a_caminho') return actorUid === professionalId && status === 'a_caminho'
  if (eventType === 'atendimento_chegou') return actorUid === professionalId && status === 'chegou'
  if (eventType === 'finalizacao_solicitada') return actorUid === professionalId && status === 'aguardando_confirmacao'
  if (eventType === 'atendimento_finalizado') return actorUid === creatorId && status === 'finalizado'
  if (eventType === 'atendimento_cancelado') {
    return status === 'cancelado'
      && (actorUid === creatorId || actorUid === professionalId)
      && text(record?.canceladoPor?.id) === actorUid
  }

  return false
}

function systemMessageText(eventType, record, actorUid, kind) {
  if (eventType !== 'atendimento_cancelado') return SYSTEM_MESSAGES[eventType]
  const participants = kind === 'pedido' ? publicParticipants(record) : privateParticipants(record)
  return actorUid === participants.creatorId
    ? 'Atendimento cancelado pelo cliente.'
    : 'Atendimento cancelado pelo profissional.'
}

function isTrustedSystemMessage(value, expected) {
  return Boolean(value) &&
    Object.keys(value).every((field) => SYSTEM_MESSAGE_FIELDS.has(field)) &&
    value.tipo === 'sistema' &&
    value.texto === expected.texto &&
    value.sistema === true &&
    value.evento === expected.evento &&
    value.eventId === expected.eventId &&
    value.autorId === 'sistema' &&
    value.autorNome === 'Sistema' &&
    typeof value.criadoEm === 'number' &&
    value.hora === value.criadoEm
}

export async function POST(request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ ok: false, error: 'firebase_admin_not_configured' }, { status: 503 })
  }

  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) return NextResponse.json({ ok: false, error: 'missing_auth_token' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const pedidoId = text(body?.pedidoId)
  const eventType = text(body?.eventType)
  const contextKind = text(body?.contextKind)
  if (!validId(pedidoId)
    || !Object.hasOwn(SYSTEM_MESSAGES, eventType)
    || (contextKind !== 'pedido' && contextKind !== 'privateRequest')) {
    return NextResponse.json({ ok: false, error: 'invalid_system_event' }, { status: 400 })
  }

  let adminAuth
  let db
  try {
    adminAuth = getFirebaseAdminAuth()
    db = getFirebaseAdminDatabase()
  } catch {
    return NextResponse.json({ ok: false, error: 'firebase_admin_init_failed' }, { status: 503 })
  }

  let decoded
  try {
    decoded = await adminAuth.verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_auth_token' }, { status: 401 })
  }

  const actorUid = text(decoded?.uid)
  const contextResult = await readConversationContext(db, pedidoId, { kind: contextKind })
  if (!contextResult.ok) {
    const status = contextResult.error === 'conversation_context_not_found' ? 404 : 409
    return NextResponse.json({ ok: false, error: contextResult.error }, { status })
  }
  const context = { ...contextResult, conversaId: pedidoId }

  const authorized = context.kind === 'pedido'
    ? canCreatePublicSystemMessage({ eventType, record: context.record, actorUid })
    : canCreatePrivateSystemMessage({ eventType, record: context.record, actorUid })
  if (!authorized) return NextResponse.json({ ok: false, error: 'system_event_not_authorized' }, { status: 403 })
  if (context.kind === 'privateRequest'
    && eventType !== 'agendamento_solicitado'
    && context.privateResponseAuthorized !== true) {
    return NextResponse.json({ ok: false, error: 'private_request_response_unverified' }, { status: 403 })
  }

  const now = Date.now()
  const eventId = `system:${context.conversaId}:${eventType}`
  const message = {
    tipo: 'sistema',
    texto: systemMessageText(eventType, context.record, actorUid, context.kind),
    sistema: true,
    evento: eventType,
    eventId,
    criadoEm: now,
    hora: now,
    autorId: 'sistema',
    autorNome: 'Sistema',
  }
  const messageId = `msg_${eventType}`
  const chatRef = db.ref(`chats/${context.conversaId}/${messageId}`)
  const existing = (await chatRef.get()).val()
  const idempotent = isTrustedSystemMessage(existing, message)

  const result = idempotent
    ? { snapshot: { val: () => existing } }
    : await chatRef.transaction((current) => (isTrustedSystemMessage(current, message) ? current : message))
  const stored = result.snapshot.val()
  await db.ref(`mensagens/${context.conversaId}/${messageId}`).transaction((current) => (
    isTrustedSystemMessage(current, stored) ? current : stored
  ))

  const shouldPrepareConversation = context.kind === 'pedido'
    || eventType === 'pedido_aceito'
    || eventType === 'agendamento_aceito'
    || eventType === 'atendimento_intro'
    || eventType === 'atendimento_iniciado'
    || eventType === 'atendimento_a_caminho'
    || eventType === 'atendimento_chegou'
    || eventType === 'finalizacao_solicitada'
    || eventType === 'atendimento_finalizado'
    || eventType === 'atendimento_cancelado'
  let conversationReady = false
  if (shouldPrepareConversation) {
    const activity = await applyConversationActivity({
      database: db,
      context,
      conversationId: context.conversaId,
      messageId,
      message: stored,
      actorUid,
    })
    if (!activity.ok) {
      const status = activity.error === 'conversation_actor_not_participant' || activity.error === 'conversation_not_active'
        ? 403
        : activity.error === 'conversation_identity_conflict'
          ? 409
          : 500
      return NextResponse.json({ ok: false, error: activity.error }, { status })
    }
    conversationReady = true
  }

  return NextResponse.json({ ok: true, messageId, eventId, idempotent, conversationReady })
}
