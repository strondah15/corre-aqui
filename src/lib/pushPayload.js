export const PUSH_DEFAULT_ICON = '/corre-aqui-icon-192.png'
export const PUSH_DEFAULT_BADGE = '/corre-aqui-icon-192.png'

const ROUTE_BY_SCREEN = {
  agenda: '/corre/agenda',
  myorders: '/pedidos',
  pedido: '/pedido',
  pedido_details: '/pedido',
  privaterequestdetails: '/pedido',
  private_request_details: '/pedido',
  chat: '/chat',
  portfolio: '/cliente',
  ver_historico: '/pedidos',
  notifications: '/',
}

const TYPE_ALIASES = {
  corre_aceito: 'pedido_aceito',
  mensagem_chat: 'nova_mensagem',
  servico_concluido: 'atendimento_finalizado',
  pedido_direto_criado: 'solicitacao_privada',
  agendamento_criado: 'agendamento_solicitado',
  atendimento_chegou: 'profissional_chegou',
}

const SCREEN_BY_TYPE = {
  pedido_aceito: 'pedido',
  nova_mensagem: 'chat',
  solicitacao_privada: 'agenda',
  agendamento_solicitado: 'agenda',
  agendamento_aceito: 'myorders',
  agendamento_recusado: 'portfolio',
  atendimento_iniciado: 'chat',
  profissional_chegou: 'chat',
  finalizacao_solicitada: 'chat',
  atendimento_finalizado: 'chat',
  pedido_cancelado: 'myorders',
  avaliacao_recebida: 'myorders',
  servico_portfolio_solicitado: 'agenda',
  denuncia_atualizada: 'notifications',
  plano_ativado: 'notifications',
}

const ACTION_LABELS = {
  agenda: 'Ver agenda',
  myorders: 'Ver pedidos',
  pedido: 'Ver pedido',
  pedido_details: 'Ver pedido',
  privaterequestdetails: 'Ver pedido',
  private_request_details: 'Ver pedido',
  chat: 'Abrir conversa',
  portfolio: 'Ver profissionais',
  ver_historico: 'Ver historico',
  notifications: 'Abrir notificacoes',
}

const ACTION_LABELS_BY_TYPE = {
  pedido_aceito: 'Ver pedido',
  nova_mensagem: 'Abrir conversa',
  solicitacao_privada: 'Ver pedido',
  agendamento_solicitado: 'Ver agenda',
  agendamento_aceito: 'Ver pedido',
  agendamento_recusado: 'Procurar outro profissional',
  atendimento_iniciado: 'Abrir atendimento',
  profissional_chegou: 'Abrir atendimento',
  finalizacao_solicitada: 'Abrir atendimento',
  atendimento_finalizado: 'Ver atendimento',
  pedido_cancelado: 'Ver pedido',
  avaliacao_recebida: 'Ver historico',
  servico_portfolio_solicitado: 'Ver agenda',
}

function clean(value, fallback = '', max = 180) {
  const text = String(value ?? fallback).trim()
  return text.slice(0, max)
}

function normalizeType(value) {
  const type = clean(value, 'notification', 80).toLowerCase()
  return TYPE_ALIASES[type] || type
}

function safePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return ''
  try {
    const url = new URL(value, 'https://corre-aqui.invalid')
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return ''
  }
}

function idFrom(input = {}) {
  return clean(input.pedidoId || input.privateRequestId || input.conversaId || input.action?.id, '')
}

function inferScreen(input = {}, type = normalizeType(input.type || input.tipo)) {
  const action = clean(input.acao || input.actionType, '').toLowerCase()
  if (action === 'abrir_chat') return 'chat'
  if (action === 'abrir_pedido') return 'pedido'
  if (action === 'avaliar_pedido' || action === 'ver_historico') return 'ver_historico'
  if (action === 'ver_agenda') return 'agenda'
  if (action === 'ver_portfolio') return 'portfolio'
  return SCREEN_BY_TYPE[type] || 'notifications'
}

export function resolvePushRoute(input = {}) {
  const explicit = safePath(input.url)
  if (explicit) return explicit

  const id = idFrom(input)
  const screen = clean(input.action?.screen || input.screen, '').toLowerCase()
  const action = clean(input.acao || input.actionType, '').toLowerCase()
  const selectedScreen = screen || (action === 'abrir_chat' ? 'chat' : inferScreen(input))
  const base = ROUTE_BY_SCREEN[selectedScreen] || '/'

  if (!id) return base
  if (selectedScreen === 'chat') return `${base}/${encodeURIComponent(id)}`
  if (selectedScreen === 'agenda') return `${base}?requestId=${encodeURIComponent(id)}`
  if (selectedScreen === 'pedido' || selectedScreen === 'pedido_details' || selectedScreen === 'privaterequestdetails' || selectedScreen === 'private_request_details') {
    return `${base}/${encodeURIComponent(id)}`
  }
  if (selectedScreen === 'myorders' || selectedScreen === 'ver_historico') return `${base}?pedidoId=${encodeURIComponent(id)}`
  if (selectedScreen === 'portfolio') return `${base}?screen=portfolio&servicoId=${encodeURIComponent(input.servicoId || id)}`
  return base
}

export function defaultPushAction(input = {}) {
  const type = normalizeType(input.type || input.tipo)
  const inferredScreen = inferScreen(input, type)
  const screen = clean(input.action?.screen || input.screen, inferredScreen).toLowerCase()
  return {
    label: clean(input.action?.label || input.actionLabel, ACTION_LABELS_BY_TYPE[type] || ACTION_LABELS[screen] || 'Abrir notificacao', 40),
    screen,
    id: idFrom(input),
  }
}

function safeTag(value) {
  return clean(value, '', 120).replace(/[^a-zA-Z0-9:_-]/g, '_')
}

function normalizeActions(input, action, url) {
  const source = Array.isArray(input.actions) ? input.actions : []
  const actions = source
    .map((item, index) => ({
      action: safeTag(item?.action || item?.id || `open_${index}`),
      title: clean(item?.title || item?.label, '', 36),
      url: safePath(item?.url) || url,
    }))
    .filter((item) => item.action && item.title)
    .slice(0, 2)

  if (actions.length) return actions
  if (!action?.label) return []
  return [{ action: 'open', title: action.label, url }]
}

export function buildPushPayload(input = {}) {
  const type = normalizeType(input.type || input.tipo)
  const title = clean(input.title || input.titulo, 'Corre Aqui', 80)
  const body = clean(input.body || input.mensagem || input.message, 'Voce tem uma nova atualizacao.', 220)
  const pedidoId = clean(input.pedidoId || input.privateRequestId, '', 128)
  const conversaId = clean(input.conversaId || pedidoId, '', 128)
  const action = defaultPushAction(input)
  const url = resolvePushRoute({ ...input, action })
  const eventId = clean(input.eventId || input.notificationId || input.id, '', 160)
  const seed = eventId || clean(input.tag, '') || `${type}|${pedidoId}|${conversaId}|${body}`
  const tag = safeTag(`corre-aqui-${seed}`) || `corre-aqui-${type}`
  const actions = normalizeActions(input, action, url)
  const timestamp = Number(input.timestamp || input.criadoEm || Date.now()) || Date.now()

  return {
    type,
    title,
    body,
    icon: safePath(input.icon) || PUSH_DEFAULT_ICON,
    badge: safePath(input.badge) || PUSH_DEFAULT_BADGE,
    image: safePath(input.image) || '',
    tag,
    renotify: input.renotify !== false,
    requireInteraction: input.requireInteraction === true || input.prioridade === 'alta',
    timestamp,
    url,
    pedidoId,
    conversaId,
    fromUid: clean(input.fromUid, '', 128),
    toUid: clean(input.toUid, '', 128),
    action,
    actions,
    data: {
      url,
      type,
      pedidoId,
      conversaId,
      fromUid: clean(input.fromUid, '', 128),
      toUid: clean(input.toUid, '', 128),
      timestamp,
      origem: 'push',
      eventId,
      tag,
      actionLabel: action.label,
      actionScreen: action.screen,
      actionId: action.id,
    },
  }
}
