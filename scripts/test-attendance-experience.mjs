import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function importSource(path, transform = (source) => source) {
  const source = transform(await readFile(new URL(path, import.meta.url), 'utf8'))
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const conversations = await importSource('../src/lib/conversations.js')
const attendanceWrites = await importSource('../src/lib/attendanceTransitionWrite.js')
const attendanceStateSource = await readFile(new URL('../src/lib/attendanceState.js', import.meta.url), 'utf8')
const attendanceStateUrl = `data:text/javascript;base64,${Buffer.from(attendanceStateSource).toString('base64')}`
const attendanceState = await import(attendanceStateUrl)
const attendanceProgress = await importSource('../src/lib/attendanceProgress.js', (source) => source
  .replace('./attendanceState.js', attendanceStateUrl))
const chatNavigation = await importSource('../src/lib/chatNavigation.js')

assert.equal(chatNavigation.getChatReturnHref('corre'), '/corre')
assert.equal(chatNavigation.getChatReturnHref('agenda'), '/corre/agenda')
assert.equal(chatNavigation.getChatReturnHref('inbox'), '/corre/inbox')
assert.equal(chatNavigation.getChatReturnHref('cliente'), '/cliente')
assert.equal(chatNavigation.getChatReturnHref('https://example.com'), '/cliente', 'origem arbitrária não vira redirect')
assert.equal(chatNavigation.getChatOriginFromContext({ explicit: 'javascript:alert(1)', fallback: 'corre' }), 'corre')
assert.equal(chatNavigation.getChatOriginFromContext({ mode: 'corre', tab: 'agenda' }), 'agenda')
assert.equal(chatNavigation.getChatOriginFromContext({ mode: 'corre', tab: 'inbox' }), 'inbox')
assert.equal(chatNavigation.createChatHref('pedido A/B', 'agenda'), '/chat/pedido%20A%2FB?voltar=agenda')
const prefetchCalls = []
const prefetchedChats = new Set()
const prefetchRouter = { prefetch: (href) => prefetchCalls.push(href) }
assert.equal(chatNavigation.prefetchChatRoute(prefetchRouter, prefetchedChats, 'pedido-ativo', 'agenda'), '/chat/pedido-ativo?voltar=agenda')
assert.equal(chatNavigation.prefetchChatRoute(prefetchRouter, prefetchedChats, 'pedido-ativo', 'agenda'), '/chat/pedido-ativo?voltar=agenda')
assert.deepEqual(prefetchCalls, ['/chat/pedido-ativo?voltar=agenda'], 'preload do mesmo Chat é deduplicado por sessão do componente')
const sorted = conversations.normalizeAndSortConversations({
  legacyMirror: {
    pedidoId: 'pedido-a',
    lastText: 'legado',
    lastAt: 100,
    unread: true,
  },
  canonicalA: {
    pedidoId: 'pedido-a',
    lastText: 'mais novo',
    updatedAt: { seconds: 3 },
    unread: false,
  },
  pedidoB: {
    pedidoId: 'pedido-b',
    lastAt: 2000,
  },
  pedidoC: {
    pedidoId: 'pedido-c',
    lastAt: 2000,
  },
}, 20)

assert.deepEqual(sorted.map((item) => item.pedidoId), ['pedido-a', 'pedido-b', 'pedido-c'])
assert.equal(sorted.length, 3, 'espelhos do mesmo pedido são deduplicados')
assert.equal(sorted[0].lastText, 'mais novo', 'o espelho mais recente vence')
assert.equal(sorted[0].unread, false, 'estado de leitura vem do espelho mais recente')
assert.equal(conversations.conversationTimestampMs({ _seconds: 4, _nanoseconds: 500_000_000 }), 4500)

const rawA = {
  A1: { pedidoId: 'A1', outroNome: 'Profissional 1', lastText: 'A1 original', updatedAt: 100 },
  A2: { pedidoId: 'A2', outroNome: 'Profissional 2', lastText: 'A2 original', updatedAt: 200 },
}
const rawB = {
  B1: { pedidoId: 'B1', outroNome: 'Cliente B', lastText: 'B1 original', updatedAt: 300 },
}
const sessionA = conversations.createConversationSessionSnapshot('A', rawA)
assert.deepEqual(conversations.selectConversationSessionItems(sessionA, 'A').map((item) => item.pedidoId), ['A2', 'A1'], 'A enxerga somente A1/A2')
assert.deepEqual(conversations.selectConversationSessionItems(sessionA, 'B'), [], 'troca para B oculta A antes do novo listener responder')
const sessionB = conversations.createConversationSessionSnapshot('B', rawB)
assert.deepEqual(conversations.selectConversationSessionItems(sessionB, 'B').map((item) => item.pedidoId), ['B1'], 'B enxerga somente B1')
assert.deepEqual(conversations.selectConversationSessionItems(sessionB, 'A'), [], 'volta para A nao reaproveita cache de B')
const sessionAReloaded = conversations.createConversationSessionSnapshot('A', {
  ...rawA,
  A2: { ...rawA.A2, lastText: 'A2 atualizada', unread: true, updatedAt: 400 },
})
const aReloaded = conversations.selectConversationSessionItems(sessionAReloaded, 'A')
assert.equal(aReloaded.find((item) => item.pedidoId === 'A1')?.outroNome, 'Profissional 1', 'mensagem em A2 nao troca identidade de A1')
assert.equal(aReloaded.find((item) => item.pedidoId === 'A1')?.lastText, 'A1 original', 'mensagem em A2 nao troca preview de A1')
assert.equal(aReloaded.find((item) => item.pedidoId === 'A1')?.unread, undefined, 'mensagem em A2 nao troca unread de A1')
assert.equal(aReloaded.find((item) => item.pedidoId === 'A2')?.lastText, 'A2 atualizada', 'A2 recebe somente a propria atualizacao')

const indexedPedidoIds = conversations.getIndexedPublicPedidoIds({
  pedidoPublico: { pedidoId: 'pedido-publico', pedidoStatus: 'aceito' },
  pedidoDireto: { pedidoId: 'pedido-direto', privateRequestId: 'pedido-direto', pedidoStatus: 'aceito' },
  mirrorPublico: { pedidoId: 'pedido-publico', updatedAt: 5000 },
})
assert.deepEqual(indexedPedidoIds, ['pedido-publico'], 'índice exclui pedidos diretos e deduplica pedidos públicos')
assert.equal(
  conversations.getIndexedPublicPedidoRevisionKey({ pedidoPublico: { pedidoId: 'pedido-publico', pedidoStatus: 'finalizado', unread: true } }),
  'pedido-publico:finalizado',
  'chave privada acompanha status canônico sem depender de não lida',
)
assert.equal(conversations.getIndexedPublicPedidoRevisionKey({}), '', 'índice privado vazio possui revisão estável')
assert.equal(conversations.isPedidoParticipant({ criador: { id: 'cliente' }, aceite: { id: 'corre' } }, 'corre'), true)
assert.equal(conversations.isPedidoParticipant({ criador: { id: 'cliente' }, aceite: { id: 'corre' } }, 'terceiro'), false)

const serviceContactPolicySource = await readFile(new URL('../src/lib/serviceContactPolicy.js', import.meta.url), 'utf8')
const serviceContactPolicyUrl = `data:text/javascript;base64,${Buffer.from(serviceContactPolicySource).toString('base64')}`
const serviceExperience = await importSource('../src/lib/serviceExperience.js', (source) => source
  .replace(
    /import \{ ATENDIMENTO_STATUS, normalizeAtendimentoStatus \} from '@\/lib\/atendimento'\s*/,
    `const ATENDIMENTO_STATUS = {
    ACEITO: 'aceito', EM_ANDAMENTO: 'em_andamento', A_CAMINHO: 'a_caminho',
    CHEGOU: 'chegou', AGUARDANDO_CONFIRMACAO: 'aguardando_confirmacao',
    FINALIZADO: 'finalizado', CANCELADO: 'cancelado'
  };
  const normalizeAtendimentoStatus = (value) => String(value || '').toLowerCase();\n`,
  )
  .replace('@/lib/serviceContactPolicy', serviceContactPolicyUrl))

const publicProfile = { allowPublicContact: true, profWhats: '(21) 99999-0000' }
assert.equal(serviceExperience.getAuthorizedPhoneHref({
  publicProfile,
  pedidoStatus: 'em_andamento',
  isParticipant: true,
}), 'tel:+5521999990000')
assert.equal(serviceExperience.getAuthorizedPhoneHref({
  publicProfile: { ...publicProfile, allowPublicContact: false },
  pedidoStatus: 'em_andamento',
  isParticipant: true,
}), '')
assert.equal(serviceExperience.getAuthorizedPhoneHref({
  serviceContact: { phone: '5521988880000' },
  pedidoStatus: 'aceito',
  isParticipant: true,
}), 'tel:+5521988880000')
assert.equal(serviceExperience.getAuthorizedPhoneHref({
  publicProfile,
  pedidoStatus: 'finalizado',
  isParticipant: true,
}), '')
assert.equal(serviceExperience.getPrimaryAttendanceAction({ status: 'em_andamento', isWorker: true })?.id, 'en_route')
assert.equal(serviceExperience.getPrimaryAttendanceAction({ status: 'a_caminho', isWorker: true })?.id, 'arrived')
assert.equal(serviceExperience.getPrimaryAttendanceAction({ status: 'aguardando_confirmacao', isClient: true })?.clientDecision, true)
assert.equal(serviceExperience.getPrimaryAttendanceAction({ status: 'finalizado', isClient: true, hasRating: true }), null)

assert.equal(attendanceState.normalizeServiceAttendanceStatus({
  status: 'agendado',
  kind: 'privateRequest',
  type: 'agendamento',
}), 'em_andamento', 'agendamento aceito entra em Combinando na mesma máquina visual do pedido comum')
assert.equal(attendanceState.normalizeServiceAttendanceStatus({
  status: 'aceito',
  record: { status: 'aceito' },
}), 'em_andamento', 'pedido recém-aceito entra em Combinando sem iniciar deslocamento')
assert.equal(attendanceState.normalizeServiceAttendanceStatus({
  status: 'em_andamento',
  record: { status: 'em_andamento' },
}), 'em_andamento', 'em_andamento canônico permanece Combinando')
assert.equal(attendanceState.normalizeServiceAttendanceStatus({
  status: 'em_andamento',
  record: { status: 'em_andamento', atendimentoIniciadoEm: 123 },
}), 'a_caminho', 'pedido legado iniciado antes da nova máquina preserva o deslocamento')
assert.equal(attendanceState.normalizeServiceAttendanceStatus({
  status: 'em_atendimento',
  record: { status: 'em_atendimento' },
}), 'a_caminho', 'alias legado em_atendimento permanece compatível')
assert.equal(attendanceState.isPrivateAttendanceStatus('pendente'), false, 'agenda pendente não abre atendimento')
assert.equal(attendanceState.isPrivateAttendanceStatus('recusado'), false, 'agenda recusada não abre atendimento')

const attendanceRoles = {
  combiningWorker: { status: 'em_andamento', isWorker: true },
  enRouteWorker: { status: 'a_caminho', isWorker: true },
  arrivedWorker: { status: 'chegou', isWorker: true },
  waitingClient: { status: 'aguardando_confirmacao', isClient: true },
}
for (const [key, role] of Object.entries(attendanceRoles)) {
  const action = serviceExperience.getPrimaryAttendanceAction(role)
  const model = attendanceProgress.getAttendanceProgressModel(role.status, action)
  assert.equal(model.filter((step) => step.actionable).length, 1, `${key} possui uma única etapa interativa`)
}
assert.deepEqual(
  attendanceProgress.getAttendanceProgressModel('finalizado').map((step) => step.completed),
  [true, true, true, true, true, true],
  'finalizado mantém as seis etapas concluídas',
)
assert.equal(serviceExperience.getPrimaryAttendanceAction({ status: 'aceito', isWorker: false, isClient: false }), null, 'terceiro C não recebe ação')
assert.equal(serviceExperience.getPrimaryAttendanceAction({ status: 'cancelado', isWorker: true }), null, 'cancelamento encerra as ações do atendimento')

const acceptedAppointment = {
  clienteId: 'A',
  profissionalId: 'B',
  tipo: 'agendamento',
  status: 'agendado',
}
const modernPrivateRequest = {
  clienteId: 'A',
  profissionalId: 'B',
  tipo: 'imediato',
  status: 'em_andamento',
}
assert.equal(attendanceState.authorizePrivateAttendanceTransition({
  record: modernPrivateRequest,
  actorUid: 'B',
  expectedStatus: 'em_andamento',
  nextStatus: 'a_caminho',
  responseAuthorized: true,
}).ok, true, 'privateRequest moderno permite B avançar de Combinando para A caminho')
assert.equal(attendanceState.authorizePrivateAttendanceTransition({
  record: modernPrivateRequest,
  actorUid: 'A',
  expectedStatus: 'em_andamento',
  nextStatus: 'a_caminho',
  responseAuthorized: true,
}).reason, 'wrong_actor', 'cliente A não marca A caminho no privateRequest moderno')
assert.equal(attendanceState.authorizePrivateAttendanceTransition({
  record: modernPrivateRequest,
  actorUid: 'C',
  expectedStatus: 'em_andamento',
  nextStatus: 'a_caminho',
  responseAuthorized: true,
}).reason, 'wrong_actor', 'terceiro C não marca A caminho no privateRequest moderno')

const legacyPrivateRequestInTransit = {
  ...modernPrivateRequest,
  atendimentoIniciadoEm: 123,
  atendimento: { iniciadoEm: 123, iniciadoPor: { id: 'B', nome: 'Profissional B' } },
}
const legacyPrivateStatus = attendanceState.normalizeServiceAttendanceStatus({
  status: legacyPrivateRequestInTransit.status,
  kind: 'privateRequest',
  type: legacyPrivateRequestInTransit.tipo,
  record: legacyPrivateRequestInTransit,
})
assert.equal(legacyPrivateStatus, 'a_caminho', 'privateRequest legado com marcador é interpretado como A caminho')
assert.equal(
  serviceExperience.getPrimaryAttendanceAction({ status: legacyPrivateStatus, isWorker: true })?.id,
  'arrived',
  'privateRequest legado em deslocamento oferece Cheguei, não Estou a caminho',
)
assert.equal(attendanceState.authorizePrivateAttendanceTransition({
  record: legacyPrivateRequestInTransit,
  actorUid: 'B',
  expectedStatus: 'em_andamento',
  nextStatus: 'a_caminho',
  responseAuthorized: true,
}).reason, 'status_mismatch', 'privateRequest legado não repete a transição de deslocamento')
assert.equal(attendanceState.authorizePrivateAttendanceTransition({
  record: legacyPrivateRequestInTransit,
  actorUid: 'B',
  expectedStatus: 'a_caminho',
  nextStatus: 'chegou',
  responseAuthorized: true,
}).ok, true, 'privateRequest legado segue de A caminho para Cheguei')

assert.equal(attendanceState.authorizePrivateAttendanceTransition({
  record: acceptedAppointment,
  actorUid: 'B',
  expectedStatus: 'em_andamento',
  nextStatus: 'a_caminho',
  responseAuthorized: true,
}).ok, true, 'B marca explicitamente que está a caminho no agendamento aceito')
assert.equal(attendanceState.authorizePrivateAttendanceTransition({
  record: acceptedAppointment,
  actorUid: 'A',
  expectedStatus: 'em_andamento',
  nextStatus: 'a_caminho',
  responseAuthorized: true,
}).reason, 'wrong_actor', 'A não executa etapa reservada ao profissional')
assert.equal(attendanceState.authorizePrivateAttendanceTransition({
  record: acceptedAppointment,
  actorUid: 'C',
  expectedStatus: 'em_andamento',
  nextStatus: 'a_caminho',
  responseAuthorized: true,
}).reason, 'wrong_actor', 'C permanece bloqueado')
assert.equal(attendanceState.authorizePrivateAttendanceTransition({
  record: acceptedAppointment,
  actorUid: 'B',
  expectedStatus: 'em_andamento',
  nextStatus: 'a_caminho',
  responseAuthorized: false,
}).reason, 'private_response_unverified', 'agendamento sem resposta autoritativa falha fechado')

for (const actorUid of ['A', 'B']) {
  assert.equal(attendanceState.authorizePrivateAttendanceTransition({
    record: acceptedAppointment,
    actorUid,
    expectedStatus: 'em_andamento',
    nextStatus: 'cancelado',
    responseAuthorized: true,
  }).ok, true, `${actorUid} pode cancelar o próprio atendimento em etapa ativa`)
}
assert.equal(attendanceState.authorizePrivateAttendanceTransition({
  record: acceptedAppointment,
  actorUid: 'C',
  expectedStatus: 'em_andamento',
  nextStatus: 'cancelado',
  responseAuthorized: true,
}).reason, 'wrong_actor', 'terceiro C não cancela atendimento A/B')
assert.equal(attendanceState.authorizePrivateAttendanceTransition({
  record: { ...acceptedAppointment, status: 'finalizado' },
  actorUid: 'A',
  expectedStatus: 'finalizado',
  nextStatus: 'cancelado',
  responseAuthorized: true,
}).reason, 'invalid_transition', 'atendimento finalizado não pode ser cancelado')
assert.deepEqual(attendanceState.validateAttendanceCancellation({
  reasonCode: 'sem_acordo',
  reason: 'Não chegamos a um acordo',
}), { ok: true, reasonCode: 'sem_acordo', reason: 'Não chegamos a um acordo' })
assert.equal(attendanceState.validateAttendanceCancellation({
  reasonCode: 'desconhecido',
  reason: 'Texto',
}).ok, false, 'motivo fora da lista fechada é rejeitado')
assert.equal(attendanceState.validateAttendanceCancellation({
  reasonCode: 'outro',
  reason: '',
}).ok, false, 'cancelamento exige justificativa')

const actor = (id) => ({ id, nome: 'Nome sanitizado' })
const transitionCases = [
  {
    current: 'em_andamento',
    next: 'a_caminho',
    attendance: { aCaminhoEm: 2, aCaminhoPor: actor('B') },
    top: { aCaminhoEm: 2, aCaminhoPor: actor('B'), atualizadoEmServer: 2 },
    marker: 'aCaminhoPor',
    expectedActor: 'B',
  },
  {
    current: 'a_caminho',
    next: 'chegou',
    attendance: { chegouEm: 3, chegouPor: actor('B') },
    top: { chegouEm: 3, chegouPor: actor('B'), atualizadoEmServer: 3 },
    marker: 'chegouPor',
    expectedActor: 'B',
  },
  {
    current: 'chegou',
    next: 'aguardando_confirmacao',
    attendance: { finalizacaoSolicitadaEm: 4, finalizacaoSolicitadaPor: actor('B') },
    top: { finalizacaoSolicitadaEm: 4, finalizacaoSolicitadaPor: actor('B'), atualizadoEmServer: 4 },
    marker: 'finalizacaoSolicitadaPor',
    expectedActor: 'B',
  },
  {
    current: 'aguardando_confirmacao',
    next: 'finalizado',
    attendance: { finalizadoEm: 5, finalizadoPor: actor('A') },
    top: { finalizadoEm: 5, finalizadoPor: actor('A'), avaliacaoPendente: true, atualizadoEmServer: 5 },
    marker: 'finalizadoPor',
    expectedActor: 'A',
  },
]

const canRuleTransition = ({ current, next, authUid, creatorId = 'A', workerId = 'B', markerActor }) => (
  (['aceito', 'aguardando_inicio', 'em_andamento'].includes(current) && next === 'a_caminho' && workerId === authUid && markerActor === authUid)
  || (['em_andamento', 'em_atendimento', 'a_caminho', 'em_deslocamento'].includes(current) && next === 'chegou' && workerId === authUid && markerActor === authUid)
  || (current === 'chegou' && next === 'aguardando_confirmacao' && workerId === authUid && markerActor === authUid)
  || (current === 'aguardando_confirmacao' && next === 'finalizado' && creatorId === authUid && markerActor === authUid)
)

for (const transition of transitionCases) {
  const privatePayload = attendanceWrites.buildAttendanceTransitionUpdate({
    nextStatus: transition.next,
    atendimentoPatch: transition.attendance,
    topLevelPatch: transition.top,
    updatedAt: 10,
  })
  assert.equal(privatePayload.status, transition.next)
  assert.equal(privatePayload[`atendimento/${transition.marker}`].id, transition.expectedActor)
  for (const immutableField of ['criador', 'aceite', 'local', 'latitude', 'longitude', 'publicacao', 'clienteId', 'profissionalId']) {
    assert.equal(Object.hasOwn(privatePayload, immutableField), false, `${transition.next} não regrava ${immutableField}`)
  }
  const counterpartUid = transition.expectedActor === 'B' ? 'A' : 'B'
  const notification = {
    id: `notification_${transition.next}`,
    tipo: 'atendimento',
    titulo: 'Atualização',
    mensagem: 'Status atualizado',
    pedidoId: 'pedido-1',
    fromUid: transition.expectedActor,
    toUid: counterpartUid,
    lida: false,
    autor: actor(transition.expectedActor),
  }
  const multipath = attendanceWrites.buildAttendanceTransitionMultipath({
    pedidoId: 'pedido-1',
    actorUid: transition.expectedActor,
    privateUpdate: privatePayload,
    eventWrite: {
      counterpartUid,
      conversation: {
        id: 'pedido-1',
        actorName: 'Nome sanitizado',
        nextStatus: transition.next,
        text: 'Status atualizado',
        timestamp: 10,
      },
      notification,
    },
  })
  assert.equal(multipath['pedidos/pedido-1/status'], transition.next)
  assert.equal(multipath[`conversas/${counterpartUid}/pedido-1/outroId`], transition.expectedActor)
  assert.equal(multipath[`notifications/${counterpartUid}/${notification.id}`], notification)
  assert.equal(multipath[`notificacoes/${counterpartUid}/${notification.id}`], notification)
  assert.equal(Object.keys(multipath).some((path) => path.startsWith(`conversas/${transition.expectedActor}/`)), false, 'ator não escreve o próprio índice')
  assert.equal(Object.keys(multipath).some((path) => path.endsWith('/unread')), false, 'evento não forja unread=true')
  assert.equal(canRuleTransition({
    current: transition.current,
    next: transition.next,
    authUid: transition.expectedActor,
    markerActor: privatePayload[`atendimento/${transition.marker}`].id,
  }), true, `${transition.current} -> ${transition.next} é compatível com a Rule`)
  assert.equal(canRuleTransition({
    current: transition.current,
    next: transition.next,
    authUid: 'C',
    markerActor: privatePayload[`atendimento/${transition.marker}`].id,
  }), false, `C não executa ${transition.current} -> ${transition.next}`)
}

assert.equal(canRuleTransition({ current: 'aceito', next: 'a_caminho', authUid: 'A', markerActor: 'A' }), false, 'cliente A não inicia deslocamento como profissional B')
assert.throws(() => attendanceWrites.buildAttendanceTransitionUpdate({
  nextStatus: 'a_caminho',
  atendimentoPatch: { aCaminhoEm: 2, aCaminhoPor: actor('B') },
  topLevelPatch: { aceite: actor('C') },
  updatedAt: 10,
}), /Campos incompatíveis/, 'transição rejeita alteração de aceite')
assert.throws(() => attendanceWrites.buildAttendanceTransitionUpdate({
  nextStatus: 'a_caminho',
  atendimentoPatch: { aCaminhoEm: 2, aCaminhoPor: actor('B') },
  topLevelPatch: { local: { lat: 0, lng: 0 } },
  updatedAt: 10,
}), /Campos incompatíveis/, 'transição rejeita alteração de localização')
assert.throws(() => attendanceWrites.buildAttendanceTransitionMultipath({
  pedidoId: 'pedido-1',
  actorUid: 'B',
  privateUpdate: { status: 'a_caminho' },
  eventWrite: {
    counterpartUid: 'B',
    conversation: { id: 'pedido-1', nextStatus: 'a_caminho', timestamp: 10 },
  },
}), /próprio ator/, 'writer canônico rejeita índice de conversa do próprio ator')

const cancellationPayload = attendanceWrites.buildAttendanceTransitionUpdate({
  nextStatus: 'cancelado',
  atendimentoPatch: { canceladoEm: 20, canceladoPor: actor('A') },
  topLevelPatch: {
    canceladoEm: 20,
    canceladoPor: actor('A'),
    canceladoNaEtapa: 'a_caminho',
    motivoCodigo: 'sem_acordo',
    motivo: 'Não chegamos a um acordo',
    atualizadoEmServer: 20,
  },
  updatedAt: 20,
})
assert.equal(cancellationPayload.status, 'cancelado')
assert.equal(cancellationPayload['atendimento/canceladoPor'].id, 'A')
for (const forbiddenField of ['criador', 'aceite', 'local', 'latitude', 'longitude', 'publicacao', 'avaliacao']) {
  assert.equal(Object.hasOwn(cancellationPayload, forbiddenField), false, `cancelamento não regrava ${forbiddenField}`)
}

const [chat, rating, map, profile, firebaseDebug, attendanceSource, rulesSource, pedidoPage, loginGate, progressComponent, privateTransitionRoute, privateRatingRoute, agenda, meusPedidos, listaConversas, statusFluxo, chatPage, loadingSkeletons, correPanel] = await Promise.all([
  readFile(new URL('../src/components/ChatMensagens.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/serviceRatings.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/Mapadinamico.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PerfilPublico.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/firebaseDebug.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/atendimento.js', import.meta.url), 'utf8'),
  readFile(new URL('../database.rules.json', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/pedido/[pedidoId]/page.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/LoginGate.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AttendanceProgress.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/private-requests/transition/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/private-requests/rating/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/AgendaProfissional.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/MeusPedidosCliente.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ListaConversas.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/StatusFluxoServico.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/chat/[pedidoId]/page.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/LoadingSkeletons.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/CorrePainelPage.jsx', import.meta.url), 'utf8'),
])

assert.doesNotMatch(chat, /window\.confirm\(/, 'confirmação usa diálogo acessível, não prompt nativo')
assert.doesNotMatch(chat, /status:\s*['"]concluido['"]/, 'chat não mantém finalização paralela legada')
assert.doesNotMatch(chat, /Ainda não/, 'ação secundária grande foi removida do rodapé')
assert.match(chat, /<AttendanceProgress/, 'chat possui um único tracker interativo')
assert.equal((chat.match(/<AttendanceProgress/g) || []).length, 1, 'não há tracker duplicado')
assert.match(progressComponent, /grid grid-cols-6/, 'seis etapas cabem no mobile sem carrossel horizontal')
assert.doesNotMatch(progressComponent, /overflow-x-auto|content-visibility/, 'tracker não esconde etapas nem exige scroll horizontal')
assert.match(chat, /loadingActionId=\{etapaProcessando\}/, 'loading fica restrito à etapa acionada')
assert.match(chat, /conversationContextKind === 'privateRequest'[\s\S]*await transitionPrivateAttendance[\s\S]*await transitionAtendimento/, 'pedido comum e agenda usam a mesma UX com writers autoritativos próprios')
assert.match(chat, /setConfirmacaoFinalizacaoAberta\(false\)[\s\S]*finalizarAtendimento\(\{ confirmado: true \}\)/, 'modal só dispara a transição após confirmação explícita')
assert.match(chat, /AvaliacaoAtendimentoModal/)
assert.match(rating, /avaliacoes\/\$\{payload\.pedidoId\}/)
assert.match(rating, /avaliacaoPendente`\]: false/)
assert.match(map, /saveCanonicalServiceRating/)
assert.match(map, /if \(!authReady\)[\s\S]*if \(!meuId\)[\s\S]*ref\(database, 'publicRequests'\)/)
assert.match(map, /orderByChild\('status'\)[\s\S]*equalTo\(ATENDIMENTO_STATUS\.ABERTO\)/)
assert.match(map, /const effectUid = meuId[\s\S]*ref\(database, `conversas\/\$\{effectUid\}`\)/)
assert.match(map, /onValue\(cRef, \(snap\) => \{[\s\S]*cancelled \|\| auth\.currentUser\?\.uid !== effectUid/, 'callback tardio de A não repõe Inbox após troca para B')
assert.match(map, /get\(ref\(database, `publicRequests\/\$\{pedidoId\}`\)\)/, 'projeção sanitizada impede leitura privada de ID excluído')
assert.match(map, /getIfReadable\(ref\(database, `pedidos\/\$\{pedidoId\}`\)/, 'pedido indexado é lido individualmente e falha fechado')
assert.match(map, /auth\.currentUser\?\.uid !== effectUid/, 'troca de usuário ou logout interrompe a leitura privada')
assert.match(loginGate, /authenticatedUidRef\.current !== firebaseUser\.uid[\s\S]*auth\.currentUser\?\.uid !== firebaseUser\.uid/, 'sincronização tardia de A não sobrescreve a sessão B')
assert.match(loginGate, /cacheBelongsToUser[\s\S]*removeItem\(key\)/, 'troca de conta remove avatar e emoji pertencentes à sessão anterior')
assert.match(map, /onAuthStateChanged\(auth,[\s\S]*setMeuUserProfile\(null\)[\s\S]*setFotoURL\(''\)[\s\S]*setMeuId\(uid\)/, 'troca A-B limpa perfil e avatar antes de aplicar o novo UID')
assert.match(map, /localStorage\.getItem\('meuId'\) !== meuId[\s\S]*setFotoURL\(''\)[\s\S]*setAvatarEmoji\(''\)/, 'cache visual só é reidratado quando pertence ao UID atual')
assert.match(firebaseDebug, /operation:stale-index-skip/, 'índice obsoleto é diagnosticado sem erro global')
assert.match(firebaseDebug, /path: getPath\(target\)/, 'falha RTDB registra o path real sem imprimir payload')
assert.match(map, /const source = filtro === 'abertos' \? corres : pedidosParticipantes/)
assert.doesNotMatch(map, /onValue\(\s*ref\(database, ['"]pedidos['"]\)/, 'usuário comum não enumera /pedidos')
assert.doesNotMatch(map, /ChatMensagens|chatPedido|setChatPedido/, 'mapa não mantém uma segunda implementação inline do chat')
assert.match(map, /createChatHref\(pedido\.id, origin\)/, 'mapa abre a rota dedicada do chat com origem canônica')
assert.match(chatPage, /loadingAuthoritativeContext[\s\S]*<ChatScreenSkeleton \/>/, 'Chat mostra skeleton enquanto o contexto autoritativo ainda está carregando')
assert.doesNotMatch(loadingSkeletons, /Abrir atendimento|Concluir atendimento|A caminho/, 'skeleton do Chat não presume ação ou estado')
assert.match(loadingSkeletons, /role="status"[\s\S]*aria-live="polite"[\s\S]*aria-hidden="true"/, 'skeletons mantêm feedback acessível e escondem conteúdo falso')
assert.match(listaConversas, /loading \? \([\s\S]*label="Carregando conversas"[\s\S]*conversasFiltradas\.length === 0/, 'Inbox não pisca estado vazio antes do primeiro snapshot')
assert.match(map, /chatPrefetchesRef = useRef\(new Set\(\)\)[\s\S]*onPointerDown[\s\S]*preloadChatFocado/, 'Mapa usa preload por intenção com cache local')
assert.match(correPanel, /chatPrefetchesRef = useRef\(new Set\(\)\)[\s\S]*onPreloadChat/, 'Agenda e Inbox dedicadas compartilham preload local deduplicado')
assert.match(meusPedidos, /onPointerEnter[\s\S]*onPointerDown[\s\S]*onFocus/, 'Meus Pedidos cobre mouse, toque e teclado sem aguardar o preload')
assert.match(pedidoPage, /onPointerEnter=\{podeAbrirChat \? preloadChat[\s\S]*onPointerDown=\{podeAbrirChat \? preloadChat/, 'detalhe aceito prepara o Chat apenas quando a conversa está disponível')
assert.match(profile, /allowPublicContact[\s\S]*whatsapp/)
assert.match(attendanceSource, /\[ATTENDANCE_TRANSITION\]/, 'transição possui diagnóstico sanitizado dedicado')
assert.match(attendanceSource, /buildAttendanceTransitionMultipath/, 'transição usa um único writer multipath canônico')
assert.match(attendanceSource, /await update\(ref\(database\), updatePayload\)/, 'pedido, índice do outro e notificações são confirmados atomicamente')
assert.doesNotMatch(attendanceSource, /runTransaction\(ref\(database, path\)/, 'transição não regrava o pedido privado inteiro')
for (const source of [pedidoPage, chat, map]) {
  assert.doesNotMatch(source, /for \(const uid of \[(?:clienteId, profissionalId|meuId, outroId|p\?\.criador\?\.id, p\?\.aceite\?\.id)\]\)/, 'UI não escreve índices dos dois participantes')
}
assert.match(chat, /eventWrite:/, 'Chat delega os efeitos pós-aceite ao writer canônico')
assert.equal((`${pedidoPage}\n${map}`.match(/finalizarAtendimento|avancarAtendimento|cancelarAtendimento|cancelarAceite|marcarConclu/g) || []).length, 0, 'detalhe e mapa não duplicam ações pós-aceite')
assert.match(pedidoPage, /const acceptedPedido = await transitionAtendimento\([\s\S]*setPrivatePedido\(\{ id: pedido\.id, \.\.\.acceptedPedido/, 'detalhe preserva apenas o claim confirmado e abre o Chat depois')
assert.match(pedidoPage, /podeAbrirChat[\s\S]*Abrir conversa/, 'pedido aceito encaminha para o Chat canônico')
assert.match(map, /onConfirmarServicoFeito=\{abrirChatFocado\}/, 'ação do cliente fora do Chat apenas abre o fluxo canônico')
assert.match(agenda, /statusInfo\.em_andamento = \{[\s\S]*label: 'Combinando'/, 'Agenda exibe em_andamento como Combinando')
assert.match(agenda, /statusInfo\.a_caminho = \{[\s\S]*label: 'A caminho'/, 'Agenda separa explicitamente A caminho')
assert.match(agenda, /statusHistorico = new Set\(\['finalizado', 'concluido', 'recusado', 'cancelado'\]\)/, 'Agenda mantém cancelados no histórico')
assert.match(agenda, /navigatingToChat = abrirAtendimento\(destino\)/, 'Agenda aceita/abre o mesmo Chat sem duplicar a máquina')
assert.match(meusPedidos, /onConfirmarServicoFeito\?\.\(pedido\)/, 'lista do cliente encaminha conclusão para o Chat')
assert.match(listaConversas, /label: 'Combinando'/, 'lista de conversas mantém o estado Combinando')
assert.match(listaConversas, /label: 'A caminho'/, 'lista de conversas mantém o estado A caminho')
assert.match(statusFluxo, /\['Aceito', 'Combinando', 'A caminho', 'Cheguei', 'Concluir', 'Finalizado'\]/, 'tracker auxiliar usa as mesmas seis etapas')
assert.match(privateTransitionRoute, /verifyIdToken/, 'transição de agenda valida a sessão no servidor')
assert.match(privateTransitionRoute, /privateResponseAuthorized/, 'transição de agenda exige resposta autoritativa C6')
assert.match(privateTransitionRoute, /transaction\(/, 'estado da agenda é revalidado atomicamente')
assert.match(privateTransitionRoute, /if \(current == null\) return null/, 'primeiro null local mantém a transaction viva até a leitura autoritativa')
assert.match(privateTransitionRoute, /authorizePrivateAttendanceTransition/, 'A/B/C usam uma autorização canônica')
assert.match(privateTransitionRoute, /reason === 'transition_conflict'[\s\S]*Não foi possível confirmar esta etapa/, 'conflito transacional não é apresentado como erro de conta')
assert.match(privateTransitionRoute, /nextStatus === ATENDIMENTO_STATUS\.CANCELADO[\s\S]*validateAttendanceCancellation/, 'cancelamento privado valida motivo no servidor')
assert.match(privateTransitionRoute, /canceladoNaEtapa: liveAuthorization\.currentStatus/, 'cancelamento privado preserva a etapa autoritativa')
assert.doesNotMatch(privateTransitionRoute, /body\?\.(?:clienteId|profissionalId|nome|descricao)/, 'cliente não escolhe participantes ou PII na transição')
assert.match(privateRatingRoute, /verifyIdToken[\s\S]*privateResponseAuthorized[\s\S]*status, 40\)\.toLowerCase\(\) !== 'finalizado'/, 'avaliação de agenda exige sessão, resposta válida e finalização')
assert.match(privateRatingRoute, /actorUid !== clienteId/, 'somente cliente A avalia o profissional B')
assert.match(privateRatingRoute, /transaction\(/, 'avaliação privada preserva unicidade')
assert.match(rulesSource, /data\.val\(\) === 'aceito'[\s\S]*data\.val\(\) === 'em_andamento'[\s\S]*newData\.val\(\) === 'a_caminho'[\s\S]*atendimento\/aCaminhoPor\/id/, 'Rule exige ação explícita de B para entrar em A caminho')
assert.match(rulesSource, /data\.val\(\) === 'em_atendimento'[\s\S]*data\.val\(\) === 'a_caminho'[\s\S]*newData\.val\(\) === 'chegou'[\s\S]*atendimento\/chegouPor\/id/, 'Rule cobre chegada canônica e pedido legado')
assert.match(rulesSource, /data\.val\(\) === 'chegou'[\s\S]*newData\.val\(\) === 'aguardando_confirmacao'[\s\S]*atendimento\/finalizacaoSolicitadaPor\/id/, 'Rule cobre solicitação de conclusão')
assert.match(rulesSource, /data\.val\(\) === 'aguardando_confirmacao'[\s\S]*newData\.val\(\) === 'finalizado'[\s\S]*atendimento\/finalizadoPor\/id/, 'Rule cobre confirmação do cliente')
assert.match(rulesSource, /newData\.val\(\) === 'cancelado'[\s\S]*criador\/id'[\s\S]*aceite\/id'[\s\S]*canceladoPor\/id/, 'Rule limita cancelamento aos participantes A/B e exige autoria')
assert.match(rulesSource, /canceladoNaEtapa[\s\S]*em_andamento'[\s\S]*a_caminho'[\s\S]*chegou'[\s\S]*aguardando_confirmacao'/, 'Rule permite cancelamento apenas nas etapas ativas previstas')
assert.match(rulesSource, /motivoCodigo[\s\S]*sem_acordo'[\s\S]*profissional_desistiu'[\s\S]*outro'/, 'Rule mantém lista fechada de motivos')
assert.match(rulesSource, /motivo[\s\S]*length > 0[\s\S]*length <= 160/, 'Rule exige justificativa curta')
assert.match(chat, /chatSomenteLeitura = Boolean\(atendimento && pedidoStatus === ATENDIMENTO_STATUS\.CANCELADO\)/, 'cancelamento preserva histórico e bloqueia novas mensagens')
assert.match(chat, /sendActionLockRef\.current = true/, 'envio de mensagem possui trava síncrona')
assert.match(chat, /attendanceActionLockRef\.current = true/, 'transições do atendimento compartilham trava autoritativa síncrona')
assert.match(chat, /overlayAberto[\s\S]*fecharOverlays\(\)[\s\S]*return/, 'voltar visual fecha overlay antes de navegar')
assert.match(chat, /addEventListener\('popstate'/, 'back do navegador fecha overlay do Chat antes de sair')
assert.match(map, /authoritativeAcceptLockRef\.current = actionKey/, 'aceite no mapa possui trava síncrona')
assert.match(agenda, /authoritativeActionLockRef\.current = actionKey/, 'resposta da Agenda possui trava síncrona')
assert.match(chat, /O cancelamento não aplica penalidade automática de reputação/, 'cancelamento não altera reputação automaticamente')
assert.match(rulesSource, /"conversas"[\s\S]*root\.child\('pedidos'\).*auth\.uid[\s\S]*root\.child\('pedidos'\).*\$uid/, 'Rule de conversa permite somente o participante gravar o índice do outro')
assert.match(rulesSource, /"unread"[\s\S]*newData\.val\(\) === false/, 'Rule não aceita unread=true do remetente')

console.log('Experiência de atendimento: auth gating, escrita parcial, máquina A/B/C, estados, avaliação e telefone OK')
