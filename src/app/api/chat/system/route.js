import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const SYSTEM_MESSAGES = Object.freeze({
  atendimento_intro: 'Este chat é exclusivo deste atendimento. Combine detalhes importantes por aqui.',
  pedido_aceito: '✓ Pedido aceito.',
  atendimento_iniciado: '✓ Atendimento iniciado.',
  atendimento_chegou: '✓ Profissional informou que chegou ao local.',
  finalizacao_solicitada: '✓ Profissional solicitou a finalização do atendimento.',
  atendimento_finalizado: '✓ Atendimento finalizado com sucesso.',
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
  if (eventType === 'atendimento_chegou') return actorUid === professionalId && status === 'chegou'
  if (eventType === 'finalizacao_solicitada') return actorUid === professionalId && status === 'aguardando_confirmacao'
  if (eventType === 'atendimento_finalizado') {
    return (actorUid === creatorId && status === 'finalizado') || (actorUid === professionalId && status === 'concluido')
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

  return false
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

async function readChatContext(db, pedidoId) {
  const pedido = (await db.ref(`pedidos/${pedidoId}`).get()).val()
  if (pedido) return { kind: 'pedido', record: pedido, conversaId: pedidoId }

  const privateRequest = (await db.ref(`privateRequests/${pedidoId}`).get()).val()
  if (privateRequest) return { kind: 'privateRequest', record: privateRequest, conversaId: pedidoId }

  return null
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
  if (!validId(pedidoId) || !Object.hasOwn(SYSTEM_MESSAGES, eventType)) {
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
  const context = await readChatContext(db, pedidoId)
  if (!context) return NextResponse.json({ ok: false, error: 'chat_context_not_found' }, { status: 404 })

  const authorized = context.kind === 'pedido'
    ? canCreatePublicSystemMessage({ eventType, record: context.record, actorUid })
    : canCreatePrivateSystemMessage({ eventType, record: context.record, actorUid })
  if (!authorized) return NextResponse.json({ ok: false, error: 'system_event_not_authorized' }, { status: 403 })

  const now = Date.now()
  const eventId = `system:${context.conversaId}:${eventType}`
  const message = {
    tipo: 'sistema',
    texto: SYSTEM_MESSAGES[eventType],
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

  return NextResponse.json({ ok: true, messageId, eventId, idempotent })
}
