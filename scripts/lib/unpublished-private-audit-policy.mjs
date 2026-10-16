import { publicationMarkerState } from './public-request-audit-policy.mjs'

const text = (value, max = 128) => String(value ?? '').trim().slice(0, max)

const STATUS_ALIASES = Object.freeze({
  aguardando_inicio: 'aceito',
  em_atendimento: 'em_andamento',
  a_caminho: 'em_andamento',
  em_deslocamento: 'em_andamento',
  em_local: 'chegou',
  chegando: 'chegou',
  concluido: 'finalizado',
  avaliado: 'finalizado',
  recusado: 'cancelado',
  recusada: 'cancelado',
  cancelada: 'cancelado',
  expirado: 'cancelado',
  expirada: 'cancelado',
})

const ACCEPTED_STATUSES = new Set(['aceito', 'em_andamento', 'chegou', 'aguardando_confirmacao'])
const FINAL_STATUSES = new Set(['finalizado'])
const CANCELED_STATUSES = new Set(['cancelado'])
const PUBLIC_MODES = new Set(['geral', 'corre', 'profissional', 'publico', 'public', 'descoberta', 'discovery'])
const PRIVATE_MODES = new Set(['direto', 'direct', 'privado', 'private', 'pedido_direto', 'agendamento'])

export const UNPUBLISHED_CLASSIFICATIONS = Object.freeze([
  'ABERTO_PUBLICAVEL',
  'ACEITO_PRIVADO',
  'FINALIZADO',
  'CANCELADO',
  'DIRETO/PRIVADO',
  'LEGADO_INCOMPLETO',
  'OUTRO',
])

export function normalizeAuditStatus(value) {
  const normalized = text(value, 40)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
  return STATUS_ALIASES[normalized] || normalized
}

function actorId(actor) {
  return text(actor?.id || actor?.uid)
}

function explicitPrivateSignal(pedido = {}) {
  const mode = text(pedido.modoPedido, 100).toLowerCase()
  const type = text(pedido.tipo, 100).toLowerCase()
  return PRIVATE_MODES.has(mode) || PRIVATE_MODES.has(type) || pedido.privado === true || pedido.publico === false || Boolean(text(pedido.privateRequestId))
}

export function classifyUnpublishedPrivate({ pedidoId, privatePedido, publicRequest } = {}) {
  const pedido = privatePedido && typeof privatePedido === 'object' ? privatePedido : {}
  const status = normalizeAuditStatus(pedido.status)
  const modoPedido = text(pedido.modoPedido, 100).toLowerCase()
  const hasCreator = Boolean(actorId(pedido.criador))
  const hasAcceptance = Boolean(actorId(pedido.aceite))
  const { markerExists } = publicationMarkerState(pedido, pedidoId)
  const publicProjectionExists = publicRequest !== null && publicRequest !== undefined
  const isExplicitPrivate = explicitPrivateSignal(pedido)

  let classification = 'OUTRO'
  let reason = 'unrecognized_structural_state'

  if (isExplicitPrivate) {
    classification = 'DIRETO/PRIVADO'
    reason = 'explicit_private_or_direct_signal'
  } else if (FINAL_STATUSES.has(status)) {
    classification = 'FINALIZADO'
    reason = 'terminal_final_status'
  } else if (CANCELED_STATUSES.has(status)) {
    classification = 'CANCELADO'
    reason = 'terminal_canceled_status'
  } else if (hasAcceptance || ACCEPTED_STATUSES.has(status)) {
    classification = 'ACEITO_PRIVADO'
    reason = hasAcceptance ? 'acceptance_present' : 'accepted_or_active_status'
  } else if (status === 'aberto' && hasCreator && (PUBLIC_MODES.has(modoPedido) || !modoPedido)) {
    classification = 'ABERTO_PUBLICAVEL'
    reason = modoPedido ? 'open_public_mode' : 'open_legacy_public_root'
  } else if (!hasCreator || !status || (status === 'aberto' && modoPedido && !PUBLIC_MODES.has(modoPedido))) {
    classification = 'LEGADO_INCOMPLETO'
    reason = !hasCreator ? 'creator_missing' : !status ? 'status_missing' : 'open_mode_not_proven_public'
  }

  return {
    pedidoId: text(pedidoId),
    classification,
    status,
    modoPedido,
    hasCreator,
    hasAcceptance,
    hasPublicationMarker: markerExists,
    publicProjectionExists,
    eligibleForProjection: classification === 'ABERTO_PUBLICAVEL' && !publicProjectionExists,
    reason,
  }
}

export function summarizeUnpublishedClassifications(rows = []) {
  const counts = Object.fromEntries(UNPUBLISHED_CLASSIFICATIONS.map((classification) => [classification, 0]))
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.classification)) counts[row.classification] += 1
  }
  return counts
}

const FIREBASE_PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'

export function firebasePushIdTimestamp(pedidoId) {
  const id = text(pedidoId)
  if (id.length < 8) return null
  let timestamp = 0
  for (const character of id.slice(0, 8)) {
    const index = FIREBASE_PUSH_CHARS.indexOf(character)
    if (index < 0) return null
    timestamp = timestamp * 64 + index
  }
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : null
}

export function pedidoCreatedAtMs(pedido = {}, pedidoId = '') {
  for (const value of [pedido.criadoEmServer, pedido.criadoEm, pedido.createdAt, pedido.timestamp]) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric) || numeric <= 0) continue
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric
  }
  return firebasePushIdTimestamp(pedidoId)
}
