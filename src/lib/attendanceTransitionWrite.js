const TRANSITION_FIELDS = Object.freeze({
  a_caminho: Object.freeze({
    atendimento: Object.freeze(['aCaminhoEm', 'aCaminhoPor']),
    topLevel: Object.freeze(['aCaminhoEm', 'aCaminhoPor', 'atualizadoEmServer']),
  }),
  em_andamento: Object.freeze({
    atendimento: Object.freeze(['iniciadoEm', 'iniciadoPor']),
    topLevel: Object.freeze(['atendimentoIniciadoEm', 'atualizadoEmServer']),
  }),
  chegou: Object.freeze({
    atendimento: Object.freeze(['chegouEm', 'chegouPor']),
    topLevel: Object.freeze(['chegouEm', 'chegouPor', 'atualizadoEmServer']),
  }),
  aguardando_confirmacao: Object.freeze({
    atendimento: Object.freeze(['finalizacaoSolicitadaEm', 'finalizacaoSolicitadaPor']),
    topLevel: Object.freeze(['finalizacaoSolicitadaEm', 'finalizacaoSolicitadaPor', 'atualizadoEmServer']),
  }),
  finalizado: Object.freeze({
    atendimento: Object.freeze(['finalizadoEm', 'finalizadoPor']),
    topLevel: Object.freeze(['finalizadoEm', 'finalizadoPor', 'avaliacaoPendente', 'atualizadoEmServer']),
  }),
  cancelado: Object.freeze({
    atendimento: Object.freeze(['canceladoEm', 'canceladoPor']),
    topLevel: Object.freeze(['canceladoEm', 'canceladoPor', 'canceladoNaEtapa', 'motivo', 'motivoCodigo', 'atualizadoEmServer']),
  }),
})

function assertAllowedFields(patch, allowedFields, scope) {
  const unexpected = Object.keys(patch || {}).filter((field) => !allowedFields.includes(field))
  if (unexpected.length > 0) {
    throw new Error(`Campos incompatíveis com a transição em ${scope}: ${unexpected.join(', ')}`)
  }
}

export function buildAttendanceTransitionUpdate({
  nextStatus,
  atendimentoPatch = {},
  topLevelPatch = {},
  updatedAt,
}) {
  const fields = TRANSITION_FIELDS[nextStatus]
  if (!fields) throw new Error('Transição de atendimento sem formato de escrita autorizado.')

  assertAllowedFields(atendimentoPatch, fields.atendimento, 'atendimento')
  assertAllowedFields(topLevelPatch, fields.topLevel, 'pedido')

  const updates = {
    status: nextStatus,
    atualizadoEm: updatedAt,
  }

  Object.entries(atendimentoPatch).forEach(([field, value]) => {
    updates[`atendimento/${field}`] = value
  })
  Object.entries(topLevelPatch).forEach(([field, value]) => {
    updates[field] = value
  })

  return updates
}

export function getAttendanceTransitionChangedFields(updatePayload) {
  return Object.keys(updatePayload || {}).sort()
}

function assertPathSegment(value, label) {
  const segment = String(value || '').trim()
  if (!segment || /[.#$\/[\]]/.test(segment)) throw new Error(`${label} inválido para a transição.`)
  return segment
}

export function buildAttendanceTransitionMultipath({
  pedidoId,
  actorUid,
  privateUpdate,
  eventWrite,
}) {
  const orderId = assertPathSegment(pedidoId, 'pedidoId')
  const actor = assertPathSegment(actorUid, 'actorUid')
  const rootUpdate = {}
  Object.entries(privateUpdate || {}).forEach(([path, value]) => {
    rootUpdate[`pedidos/${orderId}/${path}`] = value
  })

  if (!eventWrite) return rootUpdate

  const counterpart = assertPathSegment(eventWrite.counterpartUid, 'counterpartUid')
  if (counterpart === actor) throw new Error('A transição não pode escrever o índice de conversa do próprio ator.')

  const conversation = eventWrite.conversation || {}
  const conversationId = assertPathSegment(conversation.id || orderId, 'conversationId')
  if (conversationId !== orderId) throw new Error('A conversa pública deve usar o mesmo ID do pedido.')

  const conversationBase = `conversas/${counterpart}/${conversationId}`
  const conversationFields = {
    pedidoId: orderId,
    outroId: actor,
    outroNome: String(conversation.actorName || '').slice(0, 80),
    pedidoStatus: conversation.nextStatus,
    lastText: String(conversation.text || '').slice(0, 160),
    mensagemPreview: String(conversation.text || '').slice(0, 160),
    lastAt: conversation.timestamp,
    updatedAt: conversation.timestamp,
    lastById: actor,
    lastByNome: String(conversation.actorName || '').slice(0, 80),
    status: conversation.nextStatus === 'finalizado' ? 'arquivavel' : 'ativa',
  }
  if (conversation.title) conversationFields.titulo = String(conversation.title).slice(0, 140)
  if (conversation.categoryId) conversationFields.categoriaId = String(conversation.categoryId).slice(0, 100)
  if (conversation.categoryName) conversationFields.categoriaNome = String(conversation.categoryName).slice(0, 140)
  if (conversation.value != null) conversationFields.valor = conversation.value

  Object.entries(conversationFields).forEach(([field, value]) => {
    rootUpdate[`${conversationBase}/${field}`] = value
  })

  const notification = eventWrite?.notification || null
  if (notification) {
    const notificationId = assertPathSegment(notification.id, 'notificationId')
    if (
      notification.pedidoId !== orderId ||
      notification.fromUid !== actor ||
      notification.toUid !== counterpart ||
      notification?.autor?.id !== actor ||
      notification.lida !== false
    ) {
      throw new Error('Notificação incompatível com os participantes da transição.')
    }
    rootUpdate[`notifications/${counterpart}/${notificationId}`] = notification
    rootUpdate[`notificacoes/${counterpart}/${notificationId}`] = notification
  }

  return rootUpdate
}
