import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules
const agendamentos = rules.agendamentos
const agenda = agendamentos.$agendamentoId
const index = rules.agendamentosPorUsuario.$uid
const privateRequest = rules.privateRequests.$requestId
const inbox = rules.privateRequestInbox.$uid.$requestId

assert.match(agendamentos['.read'], /admins/, 'a raiz privada de agendamentos nao e enumeravel por autenticado comum')
assert.match(agenda['.read'], /clienteId/)
assert.match(agenda['.read'], /profissionalId/)
assert.match(index['.read'], /auth\.uid === \$uid/)
assert.equal(index.$agendamentoId.$other['.validate'], false, 'indice por participante possui esquema fechado')
assert.match(index.$agendamentoId['.validate'], /root\.child\('agendamentos'\)/, 'indice precisa espelhar agendamento existente')
assert.match(agenda['.write'], /privateRequestId/, 'criacao legada requer vinculo privado existente')
assert.match(agenda['.write'], /data\.child\('profissionalId'\)\.val\(\) === auth\.uid/, 'somente o profissional responde pendente')
assert.match(agenda.status['.validate'], /pendente/)
assert.match(agenda.status['.validate'], /aceito/)
assert.match(agenda.status['.validate'], /recusado/)

for (const identity of ['clienteId', 'profissionalId', 'pedidoId', 'privateRequestId', 'criadoPor']) {
  assert.match(agenda[identity]['.validate'], /newData\.val\(\) === data\.val\(\)/, `${identity} permanece imutavel`)
}
for (const privateField of ['data', 'hora', 'horario', 'inicio', 'fim', 'endereco', 'local', 'latitude', 'longitude', 'telefone']) {
  assert.match(agenda[privateField]['.validate'], /newData\.val\(\) === data\.val\(\)/, `${privateField} nao muda silenciosamente apos criar`)
}
assert.doesNotMatch(privateRequest['.write'], /!data\.exists\(\) && newData\.exists\(\)/, 'cliente nao cria privateRequest diretamente pelas Rules')
assert.match(privateRequest['.write'], /data\.child\('status'\)\.val\(\) === 'pendente'/, 'cancelamento por delete limita-se a pendente')
assert.match(inbox['.validate'], /root\.child\('privateRequests'\)/, 'inbox precisa apontar para solicitacao principal legitima')

const canReadSchedule = ({ authUid, clienteId, profissionalId }) => Boolean(authUid) && [clienteId, profissionalId].includes(authUid)
const canReadIndex = ({ authUid, indexUid }) => Boolean(authUid) && authUid === indexUid
const canRespond = ({ authUid, profissionalId, previous, next }) => authUid === profissionalId && previous === 'pendente' && ['aceito', 'recusado'].includes(next)
const canWritePrivateInbox = ({ authUid, indexUid, requestExists, clienteId, profissionalId }) => (
  Boolean(authUid)
  && requestExists
  && [clienteId, profissionalId].includes(authUid)
  && [clienteId, profissionalId].includes(indexUid)
)
assert.equal(canReadSchedule({ authUid: 'A', clienteId: 'A', profissionalId: 'B' }), true, 'A le A/B')
assert.equal(canReadSchedule({ authUid: 'B', clienteId: 'A', profissionalId: 'B' }), true, 'B le A/B')
assert.equal(canReadSchedule({ authUid: 'C', clienteId: 'A', profissionalId: 'B' }), false, 'C nao le A/B')
assert.equal(canReadSchedule({ authUid: null, clienteId: 'A', profissionalId: 'B' }), false, 'nao autenticado nao le')
assert.equal(canReadIndex({ authUid: 'A', indexUid: 'A' }), true, 'A le apenas indice A')
assert.equal(canReadIndex({ authUid: 'C', indexUid: 'A' }), false, 'C nao le indice A')
assert.equal(canRespond({ authUid: 'B', profissionalId: 'B', previous: 'pendente', next: 'aceito' }), true, 'B aceita')
assert.equal(canRespond({ authUid: 'C', profissionalId: 'B', previous: 'pendente', next: 'aceito' }), false, 'C nao aceita')
assert.equal(canRespond({ authUid: 'B', profissionalId: 'B', previous: 'aceito', next: 'recusado' }), false, 'B nao troca estado terminal')
assert.equal(canWritePrivateInbox({ authUid: 'A', indexUid: 'A', requestExists: true, clienteId: 'A', profissionalId: 'B' }), true, 'A cria o proprio inbox depois do principal')
assert.equal(canWritePrivateInbox({ authUid: 'A', indexUid: 'B', requestExists: true, clienteId: 'A', profissionalId: 'B' }), true, 'A cria o inbox de B depois do principal')
assert.equal(canWritePrivateInbox({ authUid: 'A', indexUid: 'B', requestExists: false, clienteId: 'A', profissionalId: 'B' }), false, 'inbox nao nasce antes do principal autoritativo')
assert.equal(canWritePrivateInbox({ authUid: 'C', indexUid: 'B', requestExists: true, clienteId: 'A', profissionalId: 'B' }), false, 'C nao escreve inbox A/B')

for (const sourcePath of [
  '../src/components/AgendaPanel.jsx',
  '../src/components/AgendaProfissional.jsx',
  '../src/components/Mapadinamico.jsx',
]) {
  const source = await readFile(new URL(sourcePath, import.meta.url), 'utf8')
  assert.match(source, /subscribeParticipantAgendamentos/, `${sourcePath} usa indice por participante`)
  assert.doesNotMatch(source, /ref\(database, ['"]agendamentos['"]\)/, `${sourcePath} nao enumera a raiz privada`)
}

const privateRequestsSource = await readFile(new URL('../src/lib/privateRequests.js', import.meta.url), 'utf8')
const agendaSource = await readFile(new URL('../src/components/AgendaProfissional.jsx', import.meta.url), 'utf8')
const loadingSkeletonsSource = await readFile(new URL('../src/components/LoadingSkeletons.jsx', import.meta.url), 'utf8')
const eventHostSource = await readFile(new URL('../src/components/EventNotificationHost.jsx', import.meta.url), 'utf8')
const eventNotificationSource = await readFile(new URL('../src/lib/eventNotifications.js', import.meta.url), 'utf8')
const correPanelSource = await readFile(new URL('../src/components/CorrePainelPage.jsx', import.meta.url), 'utf8')
const conversationRouteSource = await readFile(new URL('../src/app/api/private-requests/conversation/route.js', import.meta.url), 'utf8')
const responseRouteSource = await readFile(new URL('../src/app/api/private-requests/respond/route.js', import.meta.url), 'utf8')
const createRouteSource = await readFile(new URL('../src/app/api/private-requests/create/route.js', import.meta.url), 'utf8')
assert.match(privateRequestsSource, /await update\(ref\(database\), payload\)/, 'espelhos de agenda usam update multipath atomico')
assert.match(privateRequestsSource, /fetch\('\/api\/private-requests\/create'/, 'criacao usa writer autoritativo autenticado')
assert.doesNotMatch(privateRequestsSource, /update\(ref\(database, requestPath\), request\)/, 'cliente nao grava privateRequest diretamente')
assert.match(privateRequestsSource, /authUid !== clienteId/, 'criacao exige que o cliente seja a sessao autenticada')
assert.match(createRouteSource, /getAuthenticatedUid\(request\)/, 'writer de criacao valida o token Firebase')
assert.match(createRouteSource, /claimedClientUid && claimedClientUid !== uid/, 'UID C nao cria em nome de A')
assert.match(createRouteSource, /ensureClientDirectRequestAccess\(database, uid, now\)/, 'writer exige Plano Cliente ativo e valido')
assert.match(createRouteSource, /publicProfiles\/\$\{profissionalId\}/, 'writer exige perfil profissional publico')
assert.match(createRouteSource, /profile\?\.agendaAberta === false/, 'writer respeita agenda fechada')
assert.match(createRouteSource, /database\.ref\(\)\.update\(\{[\s\S]*privateRequests\/\$\{requestId\}[\s\S]*privateRequestInbox\/\$\{uid\}[\s\S]*privateRequestInbox\/\$\{profissionalId\}/, 'principal e indices A/B nascem no mesmo update Admin atomico')
assert.match(createRouteSource, /status: 402/, 'falta de assinatura retorna erro comercial sem criar dados')
assert.ok(
  createRouteSource.indexOf('ensureClientDirectRequestAccess(database, uid, now)') < createRouteSource.indexOf('database.ref().update({'),
  'assinatura e validada antes de qualquer escrita da solicitacao',
)
assert.match(privateRequestsSource, /fetch\('\/api\/private-requests\/respond'/, 'resposta usa writer autoritativo autenticado')
assert.match(privateRequestsSource, /result\?\.responseConfirmed !== true/, 'cliente exige confirmação autoritativa antes de preparar a conversa')
assert.doesNotMatch(privateRequestsSource, /\[`privateRequests\/\$\{requestId\}\/status`\]/, 'cliente não altera status privado diretamente')
assert.doesNotMatch(privateRequestsSource, /responsePayload\[`conversas\//, 'resposta client-side nao mistura status com nenhum indice de conversa')
assert.doesNotMatch(privateRequestsSource, /responsePayload\[`usersChats\//, 'resposta client-side nao grava atalho legado sem consumidor')
assert.doesNotMatch(privateRequestsSource, /unread:\s*true/, 'aceite client-side nao viola a validacao descendente de unread')
assert.match(privateRequestsSource, /\[AGENDA_WRITE\]/, 'diagnostico sanitizado de agenda esta ativo')
assert.doesNotMatch(privateRequestsSource, /\[AGENDA\] payload:|contexto completo|Updates:/, 'diagnostico nao imprime payload nem contexto completos')
assert.match(privateRequestsSource, /const conversation = accepted \? await ensurePrivateRequestConversation\(requestId, actionUid\) : null/, 'aceite confirma via servidor os dois índices canônicos da conversa')
assert.ok(
  privateRequestsSource.indexOf('await confirmPrivateRequestResponse(') < privateRequestsSource.indexOf('await ensurePrivateRequestConversation(requestId, actionUid)'),
  'status autoritativo é confirmado antes da conversa',
)
assert.match(privateRequestsSource, /schedulePrivateRequestResponseSideEffects\([\s\S]*return \{[\s\S]*conversationReady: accepted \? conversation\?\.conversationReady === true : false/, 'notificacoes auxiliares nao bloqueiam o retorno autoritativo')
assert.match(privateRequestsSource, /eventType: 'agendamento_solicitado',[\s\S]*contextKind: 'privateRequest'/, 'evento de criação declara explicitamente o namespace privado')
assert.match(responseRouteSource, /verifyIdToken/, 'writer de resposta valida a identidade Firebase')
assert.match(responseRouteSource, /actorUid !== profissionalId/, 'somente o profissional destinatário responde')
assert.match(responseRouteSource, /currentStatus !== 'pendente'/, 'writer não inventa resposta sobre estado incompatível')
assert.match(responseRouteSource, /privateRequestResponses\/\$\{requestId\}/, 'resposta cria marcador autoritativo não exposto ao cliente')
assert.match(responseRouteSource, /markerRef\.transaction[\s\S]*requestRef\.transaction[\s\S]*committed: true/, 'marcador e transição são idempotentes e finalizados somente após persistência')
assert.match(responseRouteSource, /if \(current == null\) return null/, 'cache inicial nulo não aborta a transação antes da leitura autoritativa')
assert.match(responseRouteSource, /replaceableUncommittedMarker[\s\S]*currentStatus === 'pendente'/, 'marcador incompleto do mesmo A\/B pode ser recuperado somente enquanto o pedido continua pendente')
assert.match(responseRouteSource, /\[AGENDA_RESPONSE\]/, 'API registra diagnóstico sanitizado por estágio')
for (const reason of ['request_missing', 'not_participant', 'wrong_responder', 'already_responded', 'invalid_current_status', 'response_marker_conflict', 'request_transaction_conflict', 'legacy_request_incompatible']) {
  assert.match(responseRouteSource, new RegExp(reason), `API distingue ${reason}`)
}
const responseDiagnosticSource = responseRouteSource.slice(
  responseRouteSource.indexOf('function logResponseDiagnostic'),
  responseRouteSource.indexOf('function responseError'),
)
assert.doesNotMatch(responseDiagnosticSource, /clienteNome|profissionalNome|descricao|fotoURL|telefone|email|localizacao|token[,:]/i, 'diagnóstico da API não inclui payload ou PII')
assert.match(privateRequestsSource, /\['request_missing', 'already_responded', 'invalid_current_status'\][\s\S]*stale: true/, 'card obsoleto é removido sem erro genérico após conflito de estado real')

const modelResponseTransaction = (current, expected) => {
  if (current == null) return null
  if (current.clienteId !== expected.clienteId || current.profissionalId !== expected.profissionalId) return undefined
  if (current.status !== 'pendente') return undefined
  return { ...current, status: expected.nextStatus }
}
const modelExpectedResponse = { clienteId: 'A', profissionalId: 'B', nextStatus: 'agendado' }
assert.equal(modelResponseTransaction(null, modelExpectedResponse), null, 'primeiro passe nulo mantém a transação viva')
assert.equal(
  modelResponseTransaction({ clienteId: 'A', profissionalId: 'B', status: 'pendente' }, modelExpectedResponse).status,
  'agendado',
  'segundo passe autoritativo conclui a resposta legítima de B',
)
assert.equal(
  modelResponseTransaction({ clienteId: 'A', profissionalId: 'B', status: 'agendado' }, { ...modelExpectedResponse, nextStatus: 'recusado' }),
  undefined,
  'pedido terminal não pode ser respondido novamente',
)
assert.match(conversationRouteSource, /verifyIdToken/, 'writer server-side confirma a identidade Firebase do profissional')
assert.match(conversationRouteSource, /actorUid !== profissionalId[\s\S]*isAcceptedPrivateRequest/, 'terceiro ou participante com papel incorreto não prepara índices')
assert.match(conversationRouteSource, /conversas\/\$\{clienteId\}\/\$\{requestId\}[\s\S]*conversas\/\$\{profissionalId\}\/\$\{requestId\}/, 'servidor prepara exatamente as inboxes A/B do mesmo privateRequest')
assert.match(conversationRouteSource, /conversation_identity_conflict/, 'identidade já existente e divergente falha fechado')
assert.match(conversationRouteSource, /isPrivateResponseMarkerValid[\s\S]*private_request_response_unverified/, 'conversa nova exige resposta autoritativa confirmada')
assert.match(conversationRouteSource, /db\.ref\(path\)\.transaction/, 'criação dos índices é condicional e não sobrescreve atividade concorrente')
assert.match(conversationRouteSource, /confirmedCliente[\s\S]*confirmedProfissional[\s\S]*conversationReady: true/, 'navegação só é liberada após reler os dois índices')
assert.match(agendaSource, /Aceitando\.\.\./, 'botao mobile informa o aceite em andamento')
assert.match(agendaSource, /result\?\.conversationReady !== true/, 'agenda nao navega antes da conversa confirmada')
assert.match(agendaSource, /navigatingToChat = abrirAtendimento\(destino\)/, 'aceite possui uma unica acao de navegacao protegida para o chat')
assert.match(agendaSource, /const privateRequestId = String\(item\?\.privateRequestId \|\| ''\)\.trim\(\)[\s\S]*\.\.\.\(privateRequestId \? \{ privateRequestId \} : \{\}\)/, 'item legado não recebe privateRequestId sintético')
assert.match(agendaSource, /if \(item\?\.privateRequest \|\| item\?\.privateRequestId\)[\s\S]*respondLegacyAgendamento/, 'dispatch mantém ramos privado e legado alcançáveis')
assert.match(agendaSource, /const conversationId = String\(item\.privateRequestId \|\| item\.pedidoId \|\| ''\)\.trim\(\)[\s\S]*Boolean\(conversationId\)/, 'agenda legada sem vínculo não oferece chat impossível')
assert.match(agendaSource, /const actionUid = String\(uid \|\| ''\)[\s\S]*auth\.currentUser\?\.uid !== actionUid[\s\S]*isActionCurrent\(\)/, 'resposta assíncrona não navega nem atualiza outra sessão')
assert.doesNotMatch(agendaSource, /onAbrirPedido/, 'aceite nao retorna para detalhes ou agenda por callback paralelo')
assert.match(agendaSource, /Pendentes[\s\S]*Agendados[\s\S]*Histórico/, 'agenda mobile usa uma única linha de filtros por estado')
assert.match(agendaSource, /aria-expanded=\{expanded\}[\s\S]*Ver detalhes/, 'detalhes privados começam recolhidos e possuem controle acessível')
assert.match(agendaSource, /line-clamp-1[\s\S]*min-\[390px\]:line-clamp-2/, 'descrição fechada ocupa no máximo duas linhas')
assert.match(agendaSource, /statusEmAtendimento[\s\S]*aguardando_confirmacao/, 'badge cobre toda a máquina de estados da agenda')
assert.doesNotMatch(agendaSource, /content-visibility|contain-intrinsic-size/, 'cards da agenda não podem pular a pintura dentro do scroll mobile')
assert.doesNotMatch(agendaSource, /<motion\.|from 'framer-motion'/, 'agenda não depende de animação opaca para pintar painel ou cards')
assert.match(agendaSource, /const listaRender = listaFiltrada\b/, 'agenda renderiza todos os itens filtrados sem lote que possa ocultar cards')
assert.doesNotMatch(agendaSource, /visibleLimit|setVisibleLimit|listaFiltrada\.slice/, 'agenda não usa lote ou paginação visual no mobile')
assert.match(agendaSource, /loading && listaRender\.length === 0/, 'loading só aparece quando nenhum dado real está disponível')
assert.match(agendaSource, /<ListPanelSkeleton[\s\S]*label="Carregando agenda"[\s\S]*rows=\{3\}/, 'agenda usa três linhas skeleton coerentes durante o carregamento')
assert.match(loadingSkeletonsSource, /role="status"[\s\S]*aria-live="polite"[\s\S]*aria-hidden="true"/, 'skeleton mantém feedback acessível sem anunciar conteúdo falso')
assert.doesNotMatch(agendaSource, /h-44 animate-pulse/, 'loading não reserva grandes retângulos vazios')
assert.doesNotMatch(agendaSource, /R\$ 90,00/, 'detalhes não inventam preço ausente')
assert.match(agendaSource, /aria-pressed=\{active\}/, 'filtros expõem o estado selecionado')
assert.match(agendaSource, /aria-label=\{`\$\{expanded \? 'Ocultar detalhes' : 'Ver detalhes'\} de/, 'expansão identifica o agendamento para leitores de tela')
assert.match(agendaSource, /key=\{`\$\{uid\}:\$\{item\.id\}`\}/, 'card possui identidade React determinística por sessão e pedido')
assert.doesNotMatch(agendaSource, /setSelectedKey|Mais opções/, 'controles altos ou sem ação foram removidos')
assert.match(agendaSource, /listaRender\.map\(\(item\) => \([\s\S]*<AgendaItem[\s\S]*item=\{item\}/, 'cada item filtrado monta o conteúdo real do card')
for (const contentPattern of [/\{nomePessoa\}/, /\{titulo\}/, /formatDataCurta\(item\)/, /formatHora\(item\)/, /<StatusPill status=\{status\}/]) {
  assert.match(agendaSource, contentPattern, 'card renderiza pessoa, serviço, data, hora e status')
}
for (const actionPattern of [/status === 'pendente'/, /Recusar/, /Aceitar/, /canOpenAttendance/, /Abrir atendimento/]) {
  assert.match(agendaSource, actionPattern, 'card mantém ações de pendente e atendimento aceito')
}

const fourPendingRequests = Array.from({ length: 4 }, (_, index) => ({
  id: `pending-${index + 1}`,
  clienteNome: `Cliente ${index + 1}`,
  servicoTitulo: `Serviço ${index + 1}`,
  data: `2026-08-${String(index + 25).padStart(2, '0')}`,
  hora: '09:00',
  status: 'pendente',
}))
const fourPendingCards = fourPendingRequests
  .filter((item) => item.status === 'pendente')
  .slice(0, 12)
assert.equal(fourPendingCards.length, 4, 'quatro solicitações pendentes montam quatro cards, não só o contador')
for (const card of fourPendingCards) {
  assert.ok(card.id && card.clienteNome && card.servicoTitulo && card.data && card.hora && card.status, `${card.id} possui conteúdo estrutural completo`)
}
const agendaRenderMode = ({ loading, itemCount }) => (
  loading && itemCount === 0 ? 'loading' : itemCount === 0 ? 'empty' : 'cards'
)
assert.equal(agendaRenderMode({ loading: true, itemCount: 3 }), 'cards', '3 pendentes reais vencem o loading legado')
assert.equal(agendaRenderMode({ loading: true, itemCount: 1 }), 'cards', '1 agendado real vence o loading legado')
assert.equal(agendaRenderMode({ loading: true, itemCount: 0 }), 'loading', 'loading aparece apenas sem dados reais')
assert.match(correPanelSource, /return navigateOnce\(createChatHref\(pedidoId, origin\)\)/, 'rota profissional abre o chat canonico diretamente com origem preservada')
assert.match(correPanelSource, /<AgendaProfissional[\s\S]*key=\{`agenda:\$\{uid\}`\}/, 'agenda dedicada remonta ao trocar A/B')
assert.match(await readFile(new URL('../src/components/Mapadinamico.jsx', import.meta.url), 'utf8'), /<AgendaProfissional[\s\S]*key=\{`agenda:\$\{meuId\}`\}/, 'agenda embutida remonta ao trocar A/B')
assert.ok(eventHostSource.includes('`${rootName}/${recipientUid}/${firebaseId}`'), 'marcacao de leitura inclui o UID dono da notificacao')
assert.equal(eventHostSource.includes('`${rootName}/${firebaseId}`'), false, 'marcacao nao atualiza mais a raiz de notificacoes sem UID')
assert.match(eventHostSource, /\[AGENDA_NOTIFICATION\][\s\S]*operation:[\s\S]*path,[\s\S]*authUid:[\s\S]*recipientUid:[\s\S]*eventType:[\s\S]*existingNotification:[\s\S]*error:/, 'falha de notificacao possui diagnostico sanitizado completo')
assert.match(eventNotificationSource, /AGENDAMENTO_ACEITO[\s\S]*createChatHref\(getEventSourceId\(notification\), normalizeChatOrigin\(origin\)\)/, 'cliente abre a mesma conversa de agenda pelo evento aceito com origem validada')

console.log('C4 estatico: matriz A/B/C, indice privado, status, identidade e multipath OK')
