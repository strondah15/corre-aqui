'use client'

import { get, push, ref, remove, serverTimestamp, update } from './firebaseDebug'
import { auth } from './firebase'
import { enviarPushParaUsuario } from './pushSender'
import { buildPushPayload } from './pushPayload'
import { createEventNotificationId, EVENT_NOTIFICATION_TYPES, formatEventSchedule } from './eventNotifications'
import { registrarMensagemSistemaConfiavel } from './trustedSystemChat'

const DEBUG_PRIVATE_REQUESTS = process.env.NODE_ENV !== 'production'

function debugPrivateRequests(...args) {
  if (DEBUG_PRIVATE_REQUESTS) console.log(...args)
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

async function updateWithTrace(database, updates, { context = {} } = {}) {
  debugPrivateRequests('Updates:', updates)

  const payload = updates || {}
  const paths = Object.keys(payload)
  paths.forEach((path) => debugPrivateRequests('Atualizando atomicamente:', path))

  try {
    await update(ref(database), payload)
  } catch (error) {
    if (DEBUG_PRIVATE_REQUESTS) {
      console.error('[AGENDA] atualização atômica negada:', paths)
      console.error('[AGENDA] operação:', context?.operation)
      console.error('[AGENDA] UID autenticado:', context?.uid)
      console.error('[AGENDA] código:', error?.code)
      console.error('[AGENDA] mensagem:', error?.message)
      console.error('[AGENDA] payload:', payload)
      console.error('[AGENDA] contexto completo:', context)
    } else {
      console.error('[AGENDA] operacao recusada', {
        raiz: String(paths[0] || '').split('/').filter(Boolean)[0] || 'desconhecida',
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
  if (!database || !clienteId || !profissionalId) {
    throw new Error('Dados insuficientes para criar a solicitação.')
  }
  if (clienteId === profissionalId) {
    throw new Error('Você não pode solicitar um serviço para o próprio perfil.')
  }

  const service = normalizeService(servico, profissional)
  const requestRef = push(ref(database, 'privateRequests'))
  const requestId = requestRef.key
  const agora = Date.now()
  const request = {
    id: requestId,
    tipo,
    status: 'pendente',
    privado: true,
    publico: false,
    clienteId,
    clienteNome: getNome(cliente, 'Cliente'),
    clienteFotoURL: pickText(cliente.fotoURL, cliente.photoURL, cliente.avatarURL),
    profissionalId,
    profissionalNome: getNome(profissional, 'Profissional'),
    profissionalFotoURL: pickText(profissional.fotoURL, profissional.photoURL, profissional.avatarURL),
    servicoId: service.id,
    servicoTitulo: service.titulo,
    servicoSnapshot: service,
    descricao: pickText(agendamento.descricao, servico.descricao, service.descricao),
    valor: pickText(agendamento.valor, service.valor),
    data: safeStr(agendamento.data),
    hora: safeStr(agendamento.hora),
    duracao: safeStr(agendamento.duracao),
    criadoEm: agora,
    atualizadoEm: agora,
    atualizadoEmServer: serverTimestamp(),
  }
  const summary = requestSummary(request)

  const payload = removeUndefined({
    [`privateRequests/${requestId}`]: request,
    [`privateRequestInbox/${clienteId}/${requestId}`]: summary,
    [`privateRequestInbox/${profissionalId}/${requestId}`]: summary,
  })
  debugPrivateRequests('[AGENDA] privateRequestInbox update', {
    id: requestId,
    servicoId: request?.servicoId,
    payload,
  })
  await updateWithTrace(database, payload, {
    context: {
      operation: 'createPrivateRequest',
      uid: auth.currentUser?.uid || null,
      requestId,
      criadorUid: clienteId,
      destinatarioUid: profissionalId,
    },
  })

  const isAgenda = tipo === 'agendamento'
  if (isAgenda) {
    await registrarMensagemSistemaConfiavel({ pedidoId: requestId, eventType: 'agendamento_solicitado' })
  }
  const requestEventType = isAgenda ? EVENT_NOTIFICATION_TYPES.AGENDAMENTO_SOLICITADO : 'PEDIDO_DIRETO_CRIADO'
  const requestEventId = createEventNotificationId({
    type: requestEventType,
    sourceId: requestId,
    toUid: profissionalId,
    state: 'pendente',
  })
  const scheduleText = formatEventSchedule(request.data, request.hora)
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

export async function respondPrivateRequest({ database, request = {}, profissional = {}, status }) {
  const requestId = safeStr(request.id || request.privateRequestId)
  if (!database || !requestId) {
    throw new Error('Solicitacao invalida.')
  }

  const requestPath = `privateRequests/${requestId}`
  const storedSnapshot = await get(ref(database, requestPath))
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

  const profNome = getNome(profissional, request.profissionalNome || 'Profissional')
  const finalStatus = status === 'aceito' ? acceptedStatus(tipo) : 'recusado'
  const agora = Date.now()
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
  const updates = {
    [`privateRequests/${requestId}`]: removeUndefined({
      status: finalStatus,
      respondidoEm: agora,
      atualizadoEm: agora,
      atualizadoEmServer: serverTimestamp(),
      respondidoPor: {
        id: profissionalId,
        nome: profNome,
      },
    }),
    [`privateRequestInbox/${clienteId}/${requestId}`]: updatedSummary,
    [`privateRequestInbox/${profissionalId}/${requestId}`]: updatedSummary,
  }

  if (finalStatus === 'aceito' || finalStatus === 'agendado') {
    const conversaBase = {
      pedidoId: requestId,
      privateRequestId: requestId,
      titulo: title,
      lastText: `${profNome} aceitou sua solicitação.`,
      mensagemPreview: `${profNome} aceitou sua solicitação.`,
      lastAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastById: profissionalId,
      lastByNome: profNome,
      status: 'ativa',
    }
    updates[`conversas/${clienteId}/${requestId}`] = {
      ...conversaBase,
      outroId: profissionalId,
      outroNome: profNome,
      unread: true,
    }
    updates[`conversas/${profissionalId}/${requestId}`] = {
      ...conversaBase,
      outroId: clienteId,
      outroNome: request.clienteNome || 'Cliente',
      unread: false,
    }
    updates[`usersChats/${clienteId}/${requestId}`] = true
    updates[`usersChats/${profissionalId}/${requestId}`] = true
  }

  const payload = removeUndefined(updates)
  debugPrivateRequests('[AGENDA] privateRequestInbox update', {
    authUid: auth.currentUser?.uid || null,
    id: requestId,
    criadorUid: clienteId,
    destinatarioUid: profissionalId,
    statusAtual: request?.status || 'pendente',
    proximoStatus: finalStatus,
    caminhos: Object.keys(payload),
    servicoId,
    payload,
  })
  await updateWithTrace(database, payload, {
    context: {
      operation: 'respondPrivateRequest',
      uid: auth.currentUser?.uid || null,
      authUid: auth.currentUser?.uid || null,
      requestId,
      criadorUid: clienteId,
      destinatarioUid: profissionalId,
      statusAtual: request?.status || 'pendente',
      proximoStatus: finalStatus,
    },
  })

  if (finalStatus === 'aceito') {
    await registrarMensagemSistemaConfiavel({ pedidoId: requestId, eventType: 'pedido_aceito' })
  } else if (finalStatus === 'agendado') {
    await registrarMensagemSistemaConfiavel({ pedidoId: requestId, eventType: 'agendamento_aceito' })
  } else if (isAgenda && finalStatus === 'recusado') {
    await registrarMensagemSistemaConfiavel({ pedidoId: requestId, eventType: 'agendamento_recusado' })
  }

  const accepted = finalStatus === 'aceito' || finalStatus === 'agendado'
  if (isAgenda) {
    const sourceEventId = createEventNotificationId({
      type: EVENT_NOTIFICATION_TYPES.AGENDAMENTO_SOLICITADO,
      sourceId: requestId,
      toUid: profissionalId,
      state: 'pendente',
    })
    const results = await Promise.allSettled(
      ['notifications', 'notificacoes'].map(async (rootName) => {
        const notificationRef = ref(database, `${rootName}/${profissionalId}/${sourceEventId}`)
        const snapshot = await get(notificationRef)
        if (!snapshot.exists()) return
        await update(notificationRef, {
          lida: true,
          read: true,
          eventoStatus: accepted ? 'confirmado' : 'recusado',
          statusAtual: finalStatus,
          respondidoEm: agora,
        })
      }),
    )
    results.forEach((result) => {
      if (result.status === 'rejected' && DEBUG_PRIVATE_REQUESTS) {
        console.warn('[AGENDA] resposta salva, mas o balão original não foi atualizado:', result.reason)
      }
    })
  }

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
  const profissionalFotoURL = pickText(
    profissional.fotoURL,
    profissional.photoURL,
    profissional.avatarURL,
    request.profissionalFotoURL,
  )
  const notification = await createBilateralNotification(database, {
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
      ? isAgenda
        ? { label: 'Ver agendamento', screen: 'myOrders', id: requestId }
        : { label: 'Conversar agora', screen: 'chat', id: requestId }
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

  return { ...request, status: finalStatus, respondidoEm: agora }
}
