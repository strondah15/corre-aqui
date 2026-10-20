import { NextResponse } from 'next/server'
import {
  cleanFirebasePayload,
  getAuthenticatedUid,
  getCommercialDatabase,
  safeText,
} from '@/lib/commercialServer'
import { ensureClientDirectRequestAccess } from '@/lib/subscriptionServer'

export const runtime = 'nodejs'

const headers = { 'Cache-Control': 'private, no-store' }
const PRIVATE_REQUEST_TYPES = new Set(['agendamento', 'pedido_direto'])

function limitedText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function validId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 128
    && !/[.#$\[\]/]/.test(value)
}

function safeId(value, fallback) {
  const id = limitedText(value, 128).replace(/[.#$\[\]/]/g, '_')
  return id || fallback
}

function accountName(account = {}) {
  return limitedText(account?.profile?.nome || account?.nome || account?.displayName || 'Cliente', 120) || 'Cliente'
}

function accountPhoto(account = {}) {
  return limitedText(account?.profile?.fotoURL || account?.fotoURL || account?.photoURL, 2_000)
}

function profileName(profile = {}) {
  return limitedText(profile?.nome || profile?.profile?.nome || profile?.displayName || 'Profissional', 120) || 'Profissional'
}

function profilePhoto(profile = {}) {
  return limitedText(profile?.fotoURL || profile?.profile?.fotoURL || profile?.photoURL, 2_000)
}

function normalizeService(input = {}, profile = {}, now = Date.now()) {
  const fallbackId = `service_${now}`
  const titulo = limitedText(
    input?.titulo || input?.nome || input?.title || profile?.profTitulo || profile?.correTitulo || 'Serviço solicitado',
    160,
  ) || 'Serviço solicitado'
  const valor = limitedText(input?.valor || input?.faixaPreco || input?.preco || input?.priceRange || input?.price, 80)
  return cleanFirebasePayload({
    id: safeId(input?.id || input?.serviceId || input?.key, fallbackId),
    titulo,
    nome: titulo,
    categoriaId: safeId(input?.categoriaId || input?.categoryId || 'servicos_gerais', 'servicos_gerais'),
    categoriaNome: limitedText(input?.categoriaNome || input?.categoryName || input?.categoria || input?.category, 120),
    descricao: limitedText(input?.descricao || input?.description, 1_000),
    valor,
    faixaPreco: limitedText(input?.faixaPreco || valor, 80),
    tempoMedio: limitedText(input?.tempoMedio || input?.tempo || input?.duration, 80),
    regiao: limitedText(input?.regiao || input?.region || profile?.profCidadeAtende || profile?.correRegiao || profile?.cidade, 160),
    fotos: Array.isArray(input?.fotos)
      ? input.fotos.map((value) => limitedText(value, 2_000)).filter(Boolean).slice(0, 5)
      : [],
  })
}

function requestSummary(record) {
  return cleanFirebasePayload({
    id: record.id,
    privateRequestId: record.id,
    privateRequest: true,
    tipo: record.tipo,
    status: record.status,
    clienteId: record.clienteId,
    clienteNome: record.clienteNome,
    profissionalId: record.profissionalId,
    profissionalNome: record.profissionalNome,
    servicoId: record.servicoId,
    servicoTitulo: record.servicoTitulo,
    titulo: record.servicoTitulo,
    descricao: record.descricao,
    valor: record.valor,
    data: record.data || '',
    hora: record.hora || '',
    duracao: record.duracao || '',
    criadoEm: record.criadoEm,
    atualizadoEm: record.atualizadoEm,
    actionScreen: record.tipo === 'agendamento' ? 'agenda' : 'privateRequestDetails',
  })
}

function commercialError(error) {
  const reason = safeText(error?.message)
  if (reason === 'client_direct_subscription_required') {
    return NextResponse.json({
      ok: false,
      error: reason,
      reason,
      message: 'Para agendar diretamente com um profissional, ative o Plano Cliente.',
      subscription: error?.subscription || null,
    }, { status: 402, headers })
  }
  return null
}

export async function POST(request) {
  try {
    const uid = await getAuthenticatedUid(request)
    const body = await request.json().catch(() => ({}))
    const claimedClientUid = limitedText(body?.clienteId || body?.cliente?.uid || body?.cliente?.id, 128)
    if (claimedClientUid && claimedClientUid !== uid) {
      return NextResponse.json({ ok: false, error: 'client_identity_mismatch' }, { status: 403, headers })
    }

    const profissionalId = limitedText(body?.profissionalId, 128)
    const tipo = limitedText(body?.tipo || 'pedido_direto', 40).toLowerCase()
    if (!validId(profissionalId) || profissionalId === uid || !PRIVATE_REQUEST_TYPES.has(tipo)) {
      return NextResponse.json({ ok: false, error: 'invalid_private_request' }, { status: 400, headers })
    }

    const database = getCommercialDatabase()
    const now = Date.now()
    const [{ account, subscription }, profileSnapshot] = await Promise.all([
      ensureClientDirectRequestAccess(database, uid, now),
      database.ref(`publicProfiles/${profissionalId}`).get(),
    ])
    const profile = profileSnapshot.val()
    if (!profile || typeof profile !== 'object') {
      return NextResponse.json({ ok: false, error: 'professional_profile_not_found' }, { status: 404, headers })
    }
    if (tipo === 'agendamento' && profile?.agendaAberta === false) {
      return NextResponse.json({ ok: false, error: 'professional_agenda_closed' }, { status: 409, headers })
    }

    const service = normalizeService(body?.servico, profile, now)
    const schedule = body?.agendamento && typeof body.agendamento === 'object' ? body.agendamento : {}
    const requestId = database.ref('privateRequests').push().key
    if (!validId(requestId)) throw Object.assign(new Error('private_request_id_failed'), { status: 500 })

    const record = cleanFirebasePayload({
      id: requestId,
      tipo,
      status: 'pendente',
      privado: true,
      publico: false,
      clienteId: uid,
      clienteNome: accountName(account),
      clienteFotoURL: accountPhoto(account),
      profissionalId,
      profissionalNome: profileName(profile),
      profissionalFotoURL: profilePhoto(profile),
      servicoId: service.id,
      servicoTitulo: service.titulo,
      servicoSnapshot: service,
      descricao: limitedText(schedule?.descricao || body?.servico?.descricao || service.descricao, 1_000),
      valor: limitedText(schedule?.valor || service.valor, 80),
      data: limitedText(schedule?.data, 32),
      hora: limitedText(schedule?.hora, 32),
      duracao: limitedText(schedule?.duracao, 80),
      criadoEm: now,
      atualizadoEm: now,
      atualizadoEmServer: now,
    })
    const summary = requestSummary(record)
    await database.ref().update({
      [`privateRequests/${requestId}`]: record,
      [`privateRequestInbox/${uid}/${requestId}`]: summary,
      [`privateRequestInbox/${profissionalId}/${requestId}`]: summary,
    })

    return NextResponse.json({
      ok: true,
      request: record,
      subscription: {
        kind: subscription.kind,
        plan: subscription.plan,
        status: subscription.status,
        active: subscription.active,
        expiresAt: subscription.expiresAt,
      },
    }, { headers })
  } catch (error) {
    const response = commercialError(error)
    if (response) return response
    return NextResponse.json({
      ok: false,
      error: error?.message || 'private_request_creation_failed',
    }, { status: error?.status || 500, headers })
  }
}
