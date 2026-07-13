'use client'

import { push, ref, serverTimestamp, set, update } from './firebaseDebug'

function safeStr(value) {
  return String(value || '').trim()
}

function pickText(...values) {
  return values.map((value) => safeStr(value)).find(Boolean) || ''
}

function safeId(value) {
  return safeStr(value).replace(/[.#$\[\]/]/g, '_')
}

function getUid(entity = {}) {
  return safeStr(entity.uid || entity.id || entity.userId || entity.clienteId || entity.profissionalId)
}

function getNome(entity = {}, fallback = 'Corre Aqui') {
  return pickText(entity.nome, entity.displayName, entity.profile?.nome, entity.profissionalNome, entity.clienteNome, fallback)
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
  const toUid = safeStr(options?.toUid)
  if (!database || !toUid) return null

  const id = safeId(options?.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
  const payload = makeNotification({ ...options, id, toUid })
  const updates = {
    [`notifications/${toUid}/${id}`]: payload,
    [`notificacoes/${toUid}/${id}`]: payload,
  }

  await update(ref(database), updates)
  return payload
}

function requestSummary(request) {
  return {
    id: request.id,
    privateRequestId: request.id,
    privateRequest: true,
    tipo: request.tipo,
    status: request.status,
    clienteId: request.clienteId,
    clienteNome: request.clienteNome,
    profissionalId: request.profissionalId,
    profissionalNome: request.profissionalNome,
    servicoId: request.servicoId,
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

  await set(requestRef, request)
  await update(ref(database), {
    [`privateRequestInbox/${clienteId}/${requestId}`]: summary,
    [`privateRequestInbox/${profissionalId}/${requestId}`]: summary,
  })

  const isAgenda = tipo === 'agendamento'
  await createBilateralNotification(database, {
    tipo: isAgenda ? 'agendamento_criado' : 'pedido_direto_criado',
    titulo: isAgenda ? 'Novo agendamento' : 'Novo pedido direto',
    mensagem: isAgenda
      ? `${request.clienteNome} solicitou agendamento para ${request.servicoTitulo}`
      : `${request.clienteNome} solicitou ${request.servicoTitulo}`,
    pedidoId: requestId,
    servicoId: request.servicoId,
    fromUid: clienteId,
    toUid: profissionalId,
    action: {
      label: isAgenda ? 'Ver agenda' : 'Ver pedido',
      screen: isAgenda ? 'agenda' : 'privateRequestDetails',
      id: requestId,
    },
    extra: {
      privateRequestId: requestId,
      fromNome: request.clienteNome,
      autor: { id: clienteId, nome: request.clienteNome },
    },
  })

  return request
}

function acceptedStatus(tipo) {
  return tipo === 'agendamento' ? 'agendado' : 'aceito'
}

export async function respondPrivateRequest({ database, request = {}, profissional = {}, status }) {
  const requestId = safeStr(request.id || request.privateRequestId)
  const tipo = safeStr(request.tipo || 'pedido_direto')
  const clienteId = safeStr(request.clienteId)
  const profissionalId = safeStr(request.profissionalId || getUid(profissional))
  if (!database || !requestId || !clienteId || !profissionalId) {
    throw new Error('Solicitação inválida.')
  }

  const profNome = getNome(profissional, request.profissionalNome || 'Profissional')
  const finalStatus = status === 'aceito' ? acceptedStatus(tipo) : 'recusado'
  const agora = Date.now()
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
    atualizadoEm: agora,
    respondidoEm: agora,
  }
  const updatedSummary = requestSummary(updatedRequest)
  const updates = {
    [`privateRequests/${requestId}/status`]: finalStatus,
    [`privateRequests/${requestId}/respondidoEm`]: agora,
    [`privateRequests/${requestId}/atualizadoEm`]: agora,
    [`privateRequests/${requestId}/atualizadoEmServer`]: serverTimestamp(),
    [`privateRequests/${requestId}/respondidoPor/id`]: profissionalId,
    [`privateRequests/${requestId}/respondidoPor/nome`]: profNome,
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
      lastAt: agora,
      updatedAt: agora,
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
    updates[`chats/${requestId}/msg_${agora}`] = {
      texto: `${profNome} aceitou o pedido.`,
      sistema: true,
      criadoEm: agora,
      hora: agora,
      autorId: 'sistema',
      autorNome: 'Sistema',
    }
    updates[`mensagens/${requestId}/msg_${agora}`] = updates[`chats/${requestId}/msg_${agora}`]
  }

  await update(ref(database), updates)

  const isAgenda = tipo === 'agendamento'
  const accepted = finalStatus === 'aceito' || finalStatus === 'agendado'
  await createBilateralNotification(database, {
    tipo: isAgenda
      ? accepted
        ? 'agendamento_aceito'
        : 'agendamento_recusado'
      : accepted
        ? 'pedido_direto_aceito'
        : 'pedido_direto_recusado',
    titulo: isAgenda
      ? accepted
        ? 'Agendamento confirmado'
        : 'Agendamento recusado'
      : accepted
        ? 'Pedido aceito'
        : 'Pedido recusado',
    mensagem: isAgenda
      ? accepted
        ? `${profNome} confirmou seu agendamento`
        : `${profNome} não poderá atender nesse horário`
      : accepted
        ? `${profNome} aceitou seu pedido`
        : `${profNome} recusou seu pedido`,
    pedidoId: requestId,
    servicoId: request.servicoId || '',
    fromUid: profissionalId,
    toUid: clienteId,
    action: isAgenda
      ? {
          label: accepted ? 'Ver pedido' : 'Escolher outro horário',
          screen: accepted ? 'myOrders' : 'portfolio',
          id: requestId,
        }
      : {
          label: accepted ? 'Abrir conversa' : 'Procurar outro profissional',
          screen: accepted ? 'chat' : 'portfolio',
          id: accepted ? requestId : request.servicoId || requestId,
        },
    extra: {
      privateRequestId: requestId,
      conversaId: requestId,
      fromNome: profNome,
      autor: { id: profissionalId, nome: profNome },
    },
  })

  return { ...request, status: finalStatus, respondidoEm: agora }
}
