'use client'

import { get, ref, remove, update } from './firebaseDebug'
import { auth } from './firebase'
import { enviarPushParaUsuario } from './pushSender'
import { buildPushPayload } from './pushPayload'
import { createEventNotificationId, EVENT_NOTIFICATION_TYPES, formatEventSchedule } from './eventNotifications'
import { registrarMensagemSistemaConfiavel } from './trustedSystemChat'
import { announceSubscriptionRequired } from './subscriptionClient'

const DEBUG_PRIVATE_REQUESTS = process.env.NODE_ENV !== 'production'
const PRIVATE_REQUEST_USER_ERROR = 'Não foi possível enviar a solicitação. Tente novamente.'

function debugPrivateRequests(...args) {
  if (DEBUG_PRIVATE_REQUESTS) console.log(...args)
}

function createAgendaInternalError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function createPrivateRequestUserError(cause) {
  const error = new Error(PRIVATE_REQUEST_USER_ERROR)
  error.code = cause?.code || 'agenda/create-failed'
  return error
}

function requireAgendaSession(expectedUid) {
  if (!expectedUid || auth.currentUser?.uid !== expectedUid) {
    throw createAgendaInternalError('agenda/session-changed', 'A sessão mudou durante esta ação. Tente novamente.')
  }
}

async function ensurePrivateRequestConversation(requestId, expectedUid) {
  requireAgendaSession(expectedUid)
  const currentUser = auth.currentUser
  if (!currentUser?.uid) throw createAgendaInternalError('agenda/auth-required', 'Sessão indisponível para preparar a conversa.')

  const idToken = await currentUser.getIdToken()
  requireAgendaSession(expectedUid)
  const response = await fetch('/api/private-requests/conversation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ requestId }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.conversationReady !== true || safeStr(result?.conversationId) !== requestId) {
    throw createAgendaInternalError(
      safeStr(result?.error) || 'agenda/conversation-not-ready',
      'A solicitação foi aceita, mas a conversa ainda não ficou disponível.',
    )
  }
  return result
}

async function confirmPrivateRequestResponse(requestId, decision, expectedUid) {
  requireAgendaSession(expectedUid)
  const currentUser = auth.currentUser
  if (!currentUser?.uid || typeof currentUser.getIdToken !== 'function') {
    throw createAgendaInternalError('agenda/auth-required', 'Sessão indisponível para responder à solicitação.')
  }

  const idToken = await currentUser.getIdToken()
  requireAgendaSession(expectedUid)
  const response = await fetch('/api/private-requests/respond', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ requestId, decision }),
  })
  const result = await response.json().catch(() => ({}))
  requireAgendaSession(expectedUid)

  const responseReason = safeStr(result?.reason || result?.error)
  if (response.status === 402 || responseReason === 'professional_subscription_required') {
    announceSubscriptionRequired({ kind: 'professional', reason: responseReason })
  }
  if (!response.ok && ['request_missing', 'already_responded', 'invalid_current_status'].includes(responseReason)) {
    return {
      ok: false,
      stale: true,
      reason: responseReason,
      status: safeStr(result?.currentStatus),
    }
  }

  if (!response.ok
    || result?.responseConfirmed !== true
    || safeStr(result?.requestId) !== requestId) {
    throw createAgendaInternalError(
      responseReason || 'agenda/response-not-confirmed',
      'Não foi possível responder à solicitação. Tente novamente.',
    )
  }

  return result
}

function safeStr(value) {
  return String(value || '').trim()
}

function pickText(...values) {
  return values.map((value) => safeStr(value)).find(Boolean) || ''
}

function safeId(value) {
  return safeStr(value).replace(/[.#$\[\]/]/g, '_')
}

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(removeUndefined).filter((entry) => entry !== undefined)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, removeUndefined(entry)]),
    )
  }
  return value
}

function getServicoId(source = {}) {
  return safeStr(
    pickText(
      source.servicoId,
      source.serviceId,
      source.portfolioServicoId,
      source.itemId,
      source.servico?.id,
      source.service?.id,
    ),
  )
}

function getUid(entity = {}) {
  return safeStr(entity.uid || entity.id || entity.userId || entity.clienteId || entity.profissionalId)
}

function getNome(entity = {}, fallback = 'Corre Aqui') {
  return pickText(entity.nome, entity.displayName, entity.profile?.nome, entity.profissionalNome, entity.clienteNome, fallback)
}

function agendaWriteMetadata(updates, context = {}, error = null) {
  const payload = updates || {}
  const paths = Object.keys(payload)
  const fieldNamesByPath = Object.fromEntries(
    paths.map((path) => {
      const value = payload[path]
      let fieldNames = []
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        fieldNames = Object.keys(value).sort()
      } else {
        const requestFieldPrefix = context.requestId
          ? `privateRequests/${context.requestId}/`
          : ''
        if (requestFieldPrefix && path.startsWith(requestFieldPrefix)) {
          fieldNames = [path.slice(requestFieldPrefix.length).split('/')[0]].filter(Boolean)
        }
      }
      return [path, fieldNames]
    }),
  )

  return {
    operation: context.operation || 'update',
    authUid: auth.currentUser?.uid || context.authUid || context.uid || null,
    requestId: context.requestId || null,
    paths,
    fieldNamesByPath,
    status: context.status || null,
    tipo: context.tipo || null,
    error: {
      code: error?.code || null,
      message: error?.message || null,
    },
  }
}

async function updateWithTrace(database, updates, { context = {} } = {}) {
  const payload = updates || {}

  try {
    await update(ref(database), payload)
    debugPrivateRequests('[AGENDA_WRITE]', agendaWriteMetadata(payload, context))
  } catch (error) {
    if (DEBUG_PRIVATE_REQUESTS) {
      console.error('[AGENDA_WRITE]', agendaWriteMetadata(payload, context, error))
    } else {
      console.error('[AGENDA] operacao recusada', {
        raiz: String(Object.keys(payload)[0] || '').split('/').filter(Boolean)[0] || 'desconhecida',
        operation: context?.operation || 'update',
        code: error?.code || null,
        message: error?.message || String(error),
      })
    }
    throw error
  }
}

function normalizeService(service = {}, provider = {}) {
  const categoriaId = pickText(service.categoriaId, service.categoryId, provider.profCategorias?.[0], provider.correCategorias?.[0], 'servicos_gerais')
  const titulo = pickText(service.nome, service.titulo, service.title, provider.profTitulo, provider.correTitulo, 'Serviço solicitado')
  const valor = pickText(service.valor, service.faixaPreco, service.preco, service.priceRange, service.price)

  return {
    id: safeId(pickText(service.id, service.serviceId, service.key, `service_${Date.now()}`)),
    titulo,
    nome: titulo,
    categoriaId,
    categoriaNome: pickText(service.categoriaNome, service.categoryName, service.categoria, service.category),
    descricao: pickText(service.descricao, service.description),
    valor,
    faixaPreco: pickText(service.faixaPreco, service.valor, service.priceRange, service.preco),
    tempoMedio: pickText(service.tempoMedio, service.tempo, service.duration),
    regiao: pickText(service.regiao, service.region, provider.profCidadeAtende, provider.correRegiao, provider.cidade),
    fotos: Array.isArray(service.fotos) ? service.fotos.slice(0, 5) : [],
  }
}

function makeNotification({
  id,
  tipo,
  titulo,
  mensagem,
  pedidoId = '',
  servicoId = '',
  fromUid = '',
  toUid = '',
  action,
  extra = {},
}) {
  const criadoEm = Date.now()
  return {
    id,
    eventId: extra.eventId || id,
    tipo,
    titulo,
    mensagem,
    pedidoId,
    servicoId,
    fromUid,
    toUid,
    lida: false,
    criadoEm,
    action: action || { label: 'Abrir', screen: 'notifications', id: pedidoId || servicoId || id },
    acao: action?.screen || extra.acao || '',
    conversaId: extra.conversaId || pedidoId || '',
    autor: extra.autor || { id: fromUid, nome: extra.fromNome || '' },
    ...extra,
  }
}

export async function createBilateralNotification(database, options) {
  const notificationOptions = options || {}
  const toUid = safeStr(notificationOptions.toUid)
  if (!database || !toUid) return null

  const id = safeId(notificationOptions.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
  const payload = makeNotification({ ...notificationOptions, id, toUid })
  const push = buildPushPayload({
    type: payload.tipo,
    title: payload.titulo,
    body: payload.mensagem,
    pedidoId: payload.pedidoId,
    privateRequestId: payload.privateRequestId,
    servicoId: payload.servicoId,
    fromUid: payload.fromUid,
    toUid: payload.toUid,
    action: payload.action,
    notificationId: id,
    eventId: payload.eventId || id,
    criadoEm: payload.criadoEm,
  })
  const storedPayload = removeUndefined({
    ...payload,
    url: push.url,
    tag: push.tag,
    createdAt: payload.criadoEm,
    read: false,
  })
  const updates = {
    [`notifications/${toUid}/${id}`]: storedPayload,
    [`notificacoes/${toUid}/${id}`]: storedPayload,
  }

  await updateWithTrace(database, updates, {
    context: {
      operation: 'createBilateralNotification',
      uid: auth.currentUser?.uid || null,
      tipo: payload.tipo,
      pedidoId: payload.pedidoId,
      authUid: auth.currentUser?.uid || null,
      destinatarioUid: toUid,
    },
  })
  return storedPayload
}

function requestSummary(request) {
  return removeUndefined({
    id: request.id,
    privateRequestId: request.id,
    privateRequest: true,
    tipo: request.tipo,
    status: request.status,
    clienteId: request.clienteId,
    clienteNome: request.clienteNome,
    profissionalId: request.profissionalId,
    profissionalNome: request.profissionalNome,
    servicoId: getServicoId(request) || undefined,
    servicoTitulo: request.servicoTitulo,
    titulo: request.servicoTitulo,
    descricao: request.descricao,
    valor: request.valor,
    data: request.data || '',
    hora: request.hora || '',
    duracao: request.duracao || '',
    criadoEm: request.criadoEm,
    atualizadoEm: request.atualizadoEm,
    actionScreen: request.tipo === 'agendamento' ? 'agenda' : 'privateRequestDetails',
  })
}

export async function reconcilePrivateRequestInbox({ database, uid, entries = [] } = {}) {
  const currentUid = safeStr(uid || auth.currentUser?.uid)
  const list = Array.isArray(entries) ? entries : []

  if (!database || !currentUid) {
    return { valid: list, orphanIds: [], removedIds: [] }
  }

  const results = await Promise.all(
    list.map(async (item) => {
      const requestId = safeStr(item?.privateRequestId || item?.id)
      if (!requestId) {
        return { item, valid: false, orphan: true, removed: false, requestId: '' }
      }

      const primaryPath = `privateRequests/${requestId}`
      try {
        const primarySnapshot = await get(ref(database, primaryPath))
        if (primarySnapshot.exists()) {
          return { item, valid: true, orphan: false, removed: false, requestId }
        }

        const inboxPath = `privateRequestInbox/${currentUid}/${requestId}`
        const inboxSnapshot = await get(ref(database, inboxPath))
        const inboxItem = inboxSnapshot.val()
        const ownsIndex = inboxSnapshot.exists() && (
          inboxItem?.clienteId === currentUid || inboxItem?.profissionalId === currentUid
        )
        let removed = false

        if (ownsIndex) {
          try {
            await remove(ref(database, inboxPath))
            removed = true
          } catch (error) {
            if (DEBUG_PRIVATE_REQUESTS) {
              console.error('[AGENDA] limpeza de inbox orfao falhou', {
                path: inboxPath,
                requestId,
                uid: currentUid,
                error,
              })
            }
          }
        }

        if (DEBUG_PRIVATE_REQUESTS) {
          console.warn('[AGENDA] inbox orfao ocultado', {
            requestId,
            primaryPath,
            inboxPath,
            uid: currentUid,
            ownsIndex,
            removed,
          })
        }
        return { item, valid: false, orphan: true, removed, requestId }
      } catch (error) {
        if (DEBUG_PRIVATE_REQUESTS) {
          console.error('[AGENDA] verificacao de inbox falhou', {
            requestId,
            primaryPath,
            uid: currentUid,
            error,
          })
        }
        // A transient read failure must not hide a valid request from the agenda.
        return { item, valid: true, orphan: false, removed: false, requestId }
      }
    }),
  )

  return {
    valid: results.filter((result) => result.valid).map((result) => result.item),
    orphanIds: results.filter((result) => result.orphan).map((result) => result.requestId),
    removedIds: results.filter((result) => result.orphan && result.removed).map((result) => result.requestId),
  }
}

export async function createPrivateRequest({
  database,
  cliente = {},
  profissional = {},
  servico = {},
  tipo = 'pedido_direto',
  agendamento = {},
}) {
  const clienteId = getUid(cliente)
  const profissionalId = getUid(profissional)
  const authUid = safeStr(auth.currentUser?.uid)
  if (!database || !clienteId || !profissionalId) {
    throw new Error('Dados insuficientes para criar a solicitação.')
  }
  if (!authUid || authUid !== clienteId) {
    throw new Error('A sessão autenticada não corresponde ao cliente da solicitação.')
  }
  if (clienteId === profissionalId) {
    throw new Error('Você não pode solicitar um serviço para o próprio perfil.')
  }

  const service = normalizeService(servico, profissional)
  const currentUser = auth.currentUser
  let result = null
  try {
    const idToken = await currentUser.getIdToken()
    requireAgendaSession(authUid)
    const response = await fetch('/api/private-requests/create', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profissionalId,
        tipo,
        servico: service,
        agendamento: {
          data: safeStr(agendamento.data),
          hora: safeStr(agendamento.hora),
          duracao: safeStr(agendamento.duracao),
          descricao: pickText(agendamento.descricao, servico.descricao, service.descricao),
          valor: pickText(agendamento.valor, service.valor),
        },
      }),
    })
    result = await response.json().catch(() => ({}))
    requireAgendaSession(authUid)
    const reason = safeStr(result?.reason || result?.error)
    if (response.status === 402 || reason === 'client_direct_subscription_required') {
      announceSubscriptionRequired({ kind: 'client', reason: 'client_direct_subscription_required' })
    }
    if (!response.ok || result?.ok !== true || !result?.request?.id) {
      const error = new Error(result?.message || PRIVATE_REQUEST_USER_ERROR)
      error.code = reason || 'agenda/create-failed'
      throw error
    }
  } catch (error) {
    throw createPrivateRequestUserError(error)
  }

  const request = result.request
  const requestId = request.id
  const isAgenda = request.tipo === 'agendamento'
  if (isAgenda) {
    try {
      await registrarMensagemSistemaConfiavel({
        pedidoId: requestId,
        eventType: 'agendamento_solicitado',
        contextKind: 'privateRequest',
      })
    } catch (error) {
      if (DEBUG_PRIVATE_REQUESTS) {
        console.warn('[AGENDA_SIDE_EFFECT]', {
          operation: 'system_message',
          requestId,
          authUid: auth.currentUser?.uid || null,
          error: { code: error?.code || null },
        })
      }
    }
  }
  const requestEventType = isAgenda ? EVENT_NOTIFICATION_TYPES.AGENDAMENTO_SOLICITADO : 'PEDIDO_DIRETO_CRIADO'
  const requestEventId = createEventNotificationId({
    type: requestEventType,
    sourceId: requestId,
    toUid: profissionalId,
    state: 'pendente',
  })
  const scheduleText = formatEventSchedule(request.data, request.hora)
  try {
    requireAgendaSession(authUid)
    const notification = await createBilateralNotification(database, {
      id: requestEventId,
      tipo: isAgenda ? 'agendamento_criado' : 'pedido_direto_criado',
      titulo: isAgenda ? 'Nova solicitação de agendamento 📅' : 'Você recebeu uma solicitação',
      mensagem: isAgenda
        ? `${request.clienteNome} quer agendar ${request.servicoTitulo}${scheduleText ? ` para ${scheduleText}` : ''}.`
        : `${request.clienteNome} solicitou seu serviço.`,
      pedidoId: requestId,
      servicoId: request.servicoId,
      fromUid: clienteId,
      toUid: profissionalId,
      action: {
        label: isAgenda ? 'Ver solicitação' : 'Ver pedido',
        screen: isAgenda ? 'agenda' : 'privateRequestDetails',
        id: requestId,
      },
      extra: {
        ...(isAgenda
          ? {
              eventId: requestEventId,
              tipoEvento: EVENT_NOTIFICATION_TYPES.AGENDAMENTO_SOLICITADO,
              eventoStatus: 'pendente',
              origem: 'privateRequest',
              criadorUid: clienteId,
              destinatarioUid: profissionalId,
              solicitacaoId: requestId,
              agendamentoId: requestId,
              atorNome: request.clienteNome,
              atorFotoURL: request.clienteFotoURL || undefined,
              clienteNome: request.clienteNome,
              clienteFotoURL: request.clienteFotoURL || undefined,
              servicoTitulo: request.servicoTitulo,
              dataAgendamento: request.data || undefined,
              horaAgendamento: request.hora || undefined,
              duracao: request.duracao || undefined,
              localResumo: request.servicoSnapshot?.regiao || undefined,
              observacao: request.descricao || undefined,
              statusAtual: request.status,
            }
          : {}),
        privateRequestId: requestId,
        fromNome: request.clienteNome,
        autor: { id: clienteId, nome: request.clienteNome, fotoURL: request.clienteFotoURL || undefined },
      },
    })

    void enviarPushParaUsuario(profissionalId, {
      type: notification?.tipo,
      title: notification?.titulo,
      body: notification?.mensagem,
      pedidoId: requestId,
      privateRequestId: requestId,
      servicoId: request.servicoId,
      fromUid: clienteId,
      toUid: profissionalId,
      action: notification?.action,
      notificationId: notification?.id,
      eventId: notification?.eventId || requestEventId,
      prioridade: 'alta',
    })
  } catch (error) {
    logAgendaNotificationFailure({
      operation: 'create',
      path: `notifications/${profissionalId}/${requestEventId}`,
      recipientUid: profissionalId,
      eventType: requestEventType,
      existingNotification: null,
      error,
    })
  }

  return request
}

export async function notifyPublicRequestAccepted({ database, pedido = {}, profissional = {}, aceitoEm = Date.now() }) {
  const pedidoId = safeStr(pedido.id || pedido.pedidoId)
  const clienteId = safeStr(pedido?.criador?.id || pedido.clienteId)
  const profissionalId = safeStr(profissional.uid || profissional.id || pedido?.aceite?.id)
  if (!database || !pedidoId || !clienteId || !profissionalId) return null

  const profissionalNome = getNome(profissional, pedido?.aceite?.nome || 'Corre/Profissional')
  const profissionalFotoURL = pickText(
    profissional.fotoURL,
    profissional.photoURL,
    profissional.avatarURL,
    profissional.profile?.fotoURL,
    profissional.profile?.photoURL,
    pedido?.aceite?.fotoURL,
  )
  const tipoAtuacao = pickText(
    profissional.tipoAtuacao,
    profissional.perfilProfissional?.tipoAtuacao,
    profissional.profissional?.tipoAtuacao,
    profissional.role === 'profissional' ? 'Profissional' : '',
    'Corre/Profissional',
  )
  const avaliacaoValue = Number(
    profissional.avaliacaoMedia ||
      profissional.nota ||
      profissional.rating ||
      profissional.trustStats?.media ||
      0,
  )
  const eventId = createEventNotificationId({
    type: EVENT_NOTIFICATION_TYPES.PEDIDO_ACEITO,
    sourceId: pedidoId,
    toUid: clienteId,
    state: 'aceito',
  })
  const conversaId = safeStr(pedido.conversaId || pedidoId)
  const servicoTitulo = pickText(pedido.titulo, pedido.servicoTitulo, pedido.categoriaNome, 'Pedido Corre Aqui')
  const notification = await createBilateralNotification(database, {
    id: eventId,
    tipo: 'corre_aceito',
    titulo: 'Seu pedido foi aceito! 🎉',
    mensagem: `${profissionalNome} aceitou seu pedido: ${servicoTitulo}.`,
    pedidoId,
    servicoId: getServicoId(pedido) || undefined,
    fromUid: profissionalId,
    toUid: clienteId,
    action: { label: 'Conversar agora', screen: 'chat', id: conversaId },
    extra: {
      eventId,
      tipoEvento: EVENT_NOTIFICATION_TYPES.PEDIDO_ACEITO,
      eventoStatus: 'aceito',
      origem: 'pedido',
      criadorUid: clienteId,
      destinatarioUid: clienteId,
      conversaId,
      atorNome: profissionalNome,
      atorFotoURL: profissionalFotoURL || undefined,
      profissionalNome,
      profissionalFotoURL: profissionalFotoURL || undefined,
      tipoAtuacao,
      avaliacao: Number.isFinite(avaliacaoValue) && avaliacaoValue > 0 ? avaliacaoValue : undefined,
      servicoTitulo,
      categoriaNome: pickText(pedido.categoriaNome, pedido.categoriaLabel) || undefined,
      valor: pedido.valor ?? undefined,
      aceitoEm,
      statusAtual: 'aceito',
      proximoPasso: `Converse com ${profissionalNome} para confirmar endereço, valor e detalhes do atendimento.`,
      autor: { id: profissionalId, nome: profissionalNome, fotoURL: profissionalFotoURL || undefined },
      fromNome: profissionalNome,
    },
  })

  void enviarPushParaUsuario(clienteId, {
    type: 'pedido_aceito',
    title: notification?.titulo,
    body: notification?.mensagem,
    pedidoId,
    conversaId,
    servicoId: getServicoId(pedido) || undefined,
    fromUid: profissionalId,
    toUid: clienteId,
    action: notification?.action,
    notificationId: eventId,
    eventId,
    prioridade: 'alta',
  })

  return notification
}

function acceptedStatus(tipo) {
  return tipo === 'agendamento' ? 'agendado' : 'aceito'
}

function logAgendaNotificationFailure({ operation, path, recipientUid, eventType, existingNotification, error }) {
  if (!DEBUG_PRIVATE_REQUESTS) return
  console.warn('[AGENDA_NOTIFICATION]', {
    operation,
    path,
    authUid: auth.currentUser?.uid || null,
    recipientUid: recipientUid || null,
    eventType: eventType || null,
    existingNotification: existingNotification ?? null,
    error: {
      code: error?.code || null,
    },
  })
}

async function updateAgendaSourceNotifications({ database, requestId, profissionalId, finalStatus, accepted, agora }) {
  const eventType = EVENT_NOTIFICATION_TYPES.AGENDAMENTO_SOLICITADO
  const sourceEventId = createEventNotificationId({
    type: eventType,
    sourceId: requestId,
    toUid: profissionalId,
    state: 'pendente',
  })

  await Promise.all(
    ['notifications', 'notificacoes'].map(async (rootName) => {
      const path = `${rootName}/${profissionalId}/${sourceEventId}`
      const notificationRef = ref(database, path)
      let existingNotification = false

      try {
        const snapshot = await get(notificationRef)
        existingNotification = snapshot.exists()
      } catch (error) {
        logAgendaNotificationFailure({
          operation: 'get',
          path,
          recipientUid: profissionalId,
          eventType,
          existingNotification: null,
          error,
        })
        return
      }

      if (!existingNotification) return

      try {
        await update(notificationRef, {
          lida: true,
          read: true,
          eventoStatus: accepted ? 'confirmado' : 'recusado',
          statusAtual: finalStatus,
          respondidoEm: agora,
        })
      } catch (error) {
        logAgendaNotificationFailure({
          operation: 'update',
          path,
          recipientUid: profissionalId,
          eventType,
          existingNotification,
          error,
        })
      }
    }),
  )
}

async function deliverPrivateRequestResponseNotification({
  database,
  request,
  requestId,
  isAgenda,
  accepted,
  finalStatus,
  clienteId,
  profissionalId,
  profissional,
  profNome,
  scheduleText,
  title,
  servicoId,
  agora,
}) {
  const acceptedEventType = isAgenda
    ? EVENT_NOTIFICATION_TYPES.AGENDAMENTO_ACEITO
    : EVENT_NOTIFICATION_TYPES.PEDIDO_ACEITO
  const responseEventType = accepted
    ? acceptedEventType
    : isAgenda
      ? 'AGENDAMENTO_RECUSADO'
      : 'PEDIDO_DIRETO_RECUSADO'
  const responseEventId = createEventNotificationId({
    type: responseEventType,
    sourceId: requestId,
    toUid: clienteId,
    state: finalStatus,
  })
  const notificationPaths = [
    `notifications/${clienteId}/${responseEventId}`,
    `notificacoes/${clienteId}/${responseEventId}`,
  ]
  const profissionalFotoURL = pickText(
    profissional.fotoURL,
    profissional.photoURL,
    profissional.avatarURL,
    request.profissionalFotoURL,
  )

  let notification
  try {
    notification = await createBilateralNotification(database, {
      id: responseEventId,
      tipo: isAgenda
        ? accepted
          ? 'agendamento_aceito'
          : 'agendamento_recusado'
        : accepted
          ? 'pedido_direto_aceito'
          : 'pedido_direto_recusado',
      titulo: isAgenda
        ? accepted
          ? 'Agendamento confirmado ✅'
          : 'Atualização do agendamento'
        : accepted
          ? 'Seu pedido foi aceito! 🎉'
          : 'Pedido recusado',
      mensagem: isAgenda
        ? accepted
          ? `Seu agendamento com ${profNome} foi confirmado${scheduleText ? ` para ${scheduleText}` : ''}.`
          : `${profNome} não poderá atender nesse horário`
        : accepted
          ? `${profNome} aceitou seu pedido: ${title}.`
          : `${profNome} recusou seu pedido`,
      pedidoId: requestId,
      servicoId: servicoId || undefined,
      fromUid: profissionalId,
      toUid: clienteId,
      action: accepted
        ? { label: 'Abrir conversa', screen: 'chat', id: requestId }
        : {
            label: isAgenda ? 'Escolher outro horário' : 'Procurar outro profissional',
            screen: 'portfolio',
            id: servicoId || requestId,
          },
      extra: {
        ...(accepted
          ? {
              eventId: responseEventId,
              tipoEvento: acceptedEventType,
              eventoStatus: finalStatus,
              origem: 'privateRequest',
              criadorUid: clienteId,
              destinatarioUid: clienteId,
              solicitacaoId: requestId,
              agendamentoId: isAgenda ? requestId : undefined,
              atorNome: profNome,
              atorFotoURL: profissionalFotoURL || undefined,
              profissionalNome: profNome,
              profissionalFotoURL: profissionalFotoURL || undefined,
              tipoAtuacao: pickText(profissional.tipoAtuacao, profissional.role, 'Corre/Profissional'),
              avaliacao: Number(profissional.avaliacaoMedia || profissional.nota || 0) || undefined,
              servicoTitulo: title,
              dataAgendamento: request.data || undefined,
              horaAgendamento: request.hora || undefined,
              localResumo: request.servicoSnapshot?.regiao || undefined,
              observacao: request.descricao || undefined,
              aceitoEm: agora,
              statusAtual: finalStatus,
              proximoPasso: `Converse com ${profNome} para confirmar endereço, valor e detalhes do atendimento.`,
            }
          : {}),
        privateRequestId: requestId,
        conversaId: requestId,
        fromNome: profNome,
        autor: { id: profissionalId, nome: profNome, fotoURL: profissionalFotoURL || undefined },
      },
    })
  } catch (error) {
    notificationPaths.forEach((path) => {
      logAgendaNotificationFailure({
        operation: 'create',
        path,
        recipientUid: clienteId,
        eventType: responseEventType,
        existingNotification: null,
        error,
      })
    })
    return
  }

  void enviarPushParaUsuario(clienteId, {
    type: notification?.tipo,
    title: notification?.titulo,
    body: notification?.mensagem,
    pedidoId: requestId,
    privateRequestId: requestId,
    servicoId,
    fromUid: profissionalId,
    toUid: clienteId,
    action: notification?.action,
    notificationId: notification?.id,
    eventId: notification?.eventId || responseEventId,
    prioridade: 'alta',
  })
}

function schedulePrivateRequestResponseSideEffects(options) {
  const systemEventType = options.finalStatus === 'aceito'
    ? 'pedido_aceito'
    : options.finalStatus === 'agendado'
      ? 'agendamento_aceito'
      : options.isAgenda
        ? 'agendamento_recusado'
        : null
  const tasks = []

  if (systemEventType) {
    tasks.push(registrarMensagemSistemaConfiavel({
      pedidoId: options.requestId,
      eventType: systemEventType,
      contextKind: 'privateRequest',
    }))
  }
  if (options.isAgenda) {
    tasks.push(updateAgendaSourceNotifications(options))
  }
  tasks.push(deliverPrivateRequestResponseNotification(options))

  void Promise.allSettled(tasks).then((results) => {
    if (!DEBUG_PRIVATE_REQUESTS) return
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return
      console.warn('[AGENDA_SIDE_EFFECT]', {
        operation: index === 0 && systemEventType ? 'system_message' : 'background_effect',
        requestId: options.requestId,
        authUid: auth.currentUser?.uid || null,
        error: { code: result.reason?.code || null },
      })
    })
  })
}

export async function respondPrivateRequest({ database, request = {}, profissional = {}, status }) {
  const requestId = safeStr(request.id || request.privateRequestId)
  const actionUid = safeStr(auth.currentUser?.uid)
  if (!database || !requestId) {
    throw new Error('Solicitacao invalida.')
  }
  requireAgendaSession(actionUid)

  const requestPath = `privateRequests/${requestId}`
  const storedSnapshot = await get(ref(database, requestPath))
  requireAgendaSession(actionUid)
  const storedRequest = storedSnapshot.val()
  if (!storedRequest || typeof storedRequest !== 'object') {
    const currentUid = auth.currentUser?.uid || ''
    const inboxPath = currentUid ? `privateRequestInbox/${currentUid}/${requestId}` : ''
    let removedFromInbox = false

    if (currentUid) {
      try {
        const inboxSnapshot = await get(ref(database, inboxPath))
        const inboxItem = inboxSnapshot.val()
        const ownsIndex = inboxSnapshot.exists() && (
          inboxItem?.clienteId === currentUid || inboxItem?.profissionalId === currentUid
        )

        if (ownsIndex) {
          await remove(ref(database, inboxPath))
          removedFromInbox = true
        }
      } catch (error) {
        if (DEBUG_PRIVATE_REQUESTS) {
          console.error('[AGENDA] nao foi possivel remover inbox orfao', {
            path: inboxPath,
            requestId,
            authUid: currentUid,
            error,
          })
        }
      }
    }

    if (DEBUG_PRIVATE_REQUESTS) {
      console.error('[AGENDA] solicitacao principal ausente', {
        path: requestPath,
        inboxPath,
        requestId,
        authUid: currentUid || null,
        removedFromInbox,
      })
    }
    return {
      ok: false,
      stale: true,
      removedFromInbox,
      message: 'Esta solicitacao nao esta mais disponivel e foi removida da agenda.',
    }
  }

  request = { ...request, ...storedRequest, id: requestId }
  const tipo = safeStr(request.tipo || 'pedido_direto')
  const isAgenda = tipo === 'agendamento'
  const scheduleText = formatEventSchedule(request.data, request.hora)
  const clienteId = safeStr(request.clienteId)
  const profissionalId = safeStr(request.profissionalId || getUid(profissional))
  if (!database || !requestId || !clienteId || !profissionalId) {
    throw new Error('Solicitação inválida.')
  }
  if (actionUid !== profissionalId) {
    throw createAgendaInternalError('agenda/not-authorized', 'Somente o profissional vinculado pode responder.')
  }

  const requestedStatus = status === 'aceito' ? acceptedStatus(tipo) : 'recusado'
  const storedStatus = safeStr(storedRequest.status)
  if (storedStatus !== 'pendente' && storedStatus !== requestedStatus) {
    throw new Error('Esta solicitação já foi respondida com outro status.')
  }

  let authoritativeResponse = null
  if (storedStatus === 'pendente') {
    authoritativeResponse = await confirmPrivateRequestResponse(
      requestId,
      requestedStatus === 'recusado' ? 'reject' : 'accept',
      actionUid,
    )
  }

  if (authoritativeResponse?.stale) {
    return {
      ...request,
      ok: false,
      stale: true,
      status: authoritativeResponse.status || storedStatus,
      reason: authoritativeResponse.reason,
    }
  }

  const finalStatus = safeStr(authoritativeResponse?.status || storedStatus)
  if (finalStatus !== requestedStatus) {
    throw createAgendaInternalError('agenda/response-status-mismatch', 'A resposta da solicitação não foi confirmada.')
  }

  const agora = Number(authoritativeResponse?.respondidoEm || storedRequest.respondidoEm) || Date.now()
  const profNome = pickText(
    authoritativeResponse?.profissionalNome,
    getNome(profissional, request.profissionalNome || 'Profissional'),
  )
  const servicoId = getServicoId(request)
  const title = safeStr(request.servicoTitulo || request.titulo || 'Serviço solicitado')
  const updatedRequest = {
    ...request,
    id: requestId,
    privateRequestId: requestId,
    privateRequest: true,
    status: finalStatus,
    tipo,
    clienteId,
    profissionalId,
    profissionalNome: profNome,
    ...(servicoId ? { servicoId } : {}),
    atualizadoEm: agora,
    respondidoEm: agora,
  }
  const updatedSummary = requestSummary(updatedRequest)

  const inboxPayload = removeUndefined({
    [`privateRequestInbox/${clienteId}/${requestId}`]: updatedSummary,
    [`privateRequestInbox/${profissionalId}/${requestId}`]: updatedSummary,
  })
  requireAgendaSession(actionUid)
  await updateWithTrace(database, inboxPayload, {
    context: {
      operation: 'respondPrivateRequest:indexes',
      authUid: auth.currentUser?.uid || null,
      requestId,
      status: finalStatus,
      tipo,
    },
  })
  requireAgendaSession(actionUid)

  const accepted = finalStatus === 'aceito' || finalStatus === 'agendado'
  const conversation = accepted ? await ensurePrivateRequestConversation(requestId, actionUid) : null
  requireAgendaSession(actionUid)
  schedulePrivateRequestResponseSideEffects({
    database,
    request,
    requestId,
    isAgenda,
    accepted,
    finalStatus,
    clienteId,
    profissionalId,
    profissional,
    profNome,
    scheduleText,
    title,
    servicoId,
    agora,
  })

  return {
    ...request,
    status: finalStatus,
    respondidoEm: agora,
    conversationId: accepted ? requestId : null,
    conversationReady: accepted ? conversation?.conversationReady === true : false,
  }
}
