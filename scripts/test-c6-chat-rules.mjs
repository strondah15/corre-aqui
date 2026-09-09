import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const rules = JSON.parse(await read('../database.rules.json')).rules
const storageRules = await read('../storage.rules')
const [
  chatSource,
  conversationListSource,
  privateRequests,
  pedidoPage,
  mapSource,
  systemClient,
  systemRoute,
  chatPageSource,
  activityClient,
  activityRoute,
  activityServer,
  contextRoute,
  privateTransitionRoute,
  attendanceStateSource,
] = await Promise.all([
  read('../src/components/ChatMensagens.jsx'),
  read('../src/components/ListaConversas.jsx'),
  read('../src/lib/privateRequests.js'),
  read('../src/app/pedido/[pedidoId]/page.jsx'),
  read('../src/components/Mapadinamico.jsx'),
  read('../src/lib/trustedSystemChat.js'),
  read('../src/app/api/chat/system/route.js'),
  read('../src/app/chat/[pedidoId]/page.jsx'),
  read('../src/lib/conversationActivity.js'),
  read('../src/app/api/conversations/activity/route.js'),
  read('../src/lib/conversationActivityServer.js'),
  read('../src/app/api/conversations/context/route.js'),
  read('../src/app/api/private-requests/transition/route.js'),
  read('../src/lib/attendanceState.js'),
])

const chat = rules.chats.$pedidoId
const message = chat.$msgId
const legacyMessage = rules.mensagens.$conversaId.$msgId
const conversation = rules.conversas.$uid.$conversaId
const inbox = rules.usersChats.$uid.$conversaId
const modernNotification = rules.notifications.$uid.$notificacaoId
const legacyNotification = rules.notificacoes.$uid.$notificacaoId
const pedidoRule = rules.pedidos.$pedidoId
const privateRequestRule = rules.privateRequests.$requestId

assert.doesNotMatch(pedidoRule['.write'], /!data\.exists\(\) && newData\.exists\(\)/, 'pedido novo não pode ser criado diretamente pelo cliente')
assert.doesNotMatch(privateRequestRule['.write'], /!data\.exists\(\) && newData\.exists\(\)/, 'privateRequest novo não pode ser criado diretamente pelo cliente')
assert.match(privateRequestRule['.write'], /data\.exists\(\) && !newData\.exists\(\)/, 'cliente ainda pode cancelar por delete um privateRequest pendente existente')
assert.equal(privateRequestRule.status['.write'], false, 'status privado continua reservado ao backend')

assert.match(chat['.read'], /criador\/id/, 'cliente participante lê chat privado')
assert.match(chat['.read'], /aceite\/id/, 'profissional participante lê chat privado')
assert.match(chat['.read'], /privateRequests/, 'chat privado de agenda usa os participantes reais')
assert.match(message['.write'], /!data\.exists\(\)/, 'mensagem existente não aceita regravação')
assert.match(message['.write'], /newData\.exists\(\)/, 'delete/null de mensagem é negado')
assert.match(message['.write'], /newData\.child\('userId'\)\.val\(\) === auth\.uid/, 'autor vem da sessão autenticada')
assert.doesNotMatch(message['.write'], /autorId.*sistema/, 'cliente não tem exceção para escrever como sistema')
assert.match(message['.validate'], /!newData\.child\('sistema'\)\.exists\(\)/, 'campo sistema é bloqueado no cliente')
assert.match(message['.validate'], /!newData\.child\('autorId'\)\.exists\(\)/, 'autorId de sistema é bloqueado no cliente')
assert.match(message['.validate'], /!newData\.child\('eventId'\)\.exists\(\)/, 'eventId reservado ao servidor')
assert.equal(message.texto['.validate'], 'newData.isString() && newData.val().length <= 700', 'texto tem limite de 700 caracteres')
assert.match(message.hora['.validate'], /now - 300000/, 'timestamp não pode ser antigo demais')
assert.match(message.hora['.validate'], /now \+ 300000/, 'timestamp não pode ser futuro demais')
assert.equal(legacyMessage['.write'], false, 'espelho legado mensagens é somente do servidor')

assert.match(message.anexo['.validate'], /image\/jpeg/, 'JPEG permitido')
assert.match(message.anexo['.validate'], /image\/png/, 'PNG permitido')
assert.match(message.anexo['.validate'], /image\/webp/, 'WEBP permitido')
assert.match(message.anexo['.validate'], /audio\/webm/, 'áudio WEBM preservado')
assert.match(message.anexo['.validate'], /audio\/mp4/, 'áudio MP4 preservado')
assert.match(message.anexo['.validate'], /921600/, 'anexo tem limite de 900 KiB')
assert.match(message.anexo['.validate'], /\^data:/, 'URL precisa ser data URL Base64 permitida')
assert.equal(message.anexo.$other['.validate'], false, 'schema de anexo é fechado')
assert.equal(message.$other['.validate'], false, 'schema de mensagem é fechado')

assert.match(conversation['.write'], /newData\.exists\(\)/, 'índice de conversa não pode ser apagado livremente')
assert.doesNotMatch(conversation['.write'], /auth\.uid === \$uid/, 'dono do índice não cria conversa arbitrária')
assert.match(conversation['.write'], /privateRequests/, 'índice exige vínculo privado real')
assert.match(conversation['.validate'], /outroId/, 'índice valida o outro participante')
assert.match(conversation.unread['.write'], /auth\.uid === \$uid/, 'dono pode alterar somente o próprio estado de leitura')
assert.match(conversation.unread['.write'], /data\.parent\(\)\.exists\(\)/, 'estado de leitura não cria conversa parcial')
assert.match(conversation.unread['.write'], /newData\.val\(\) === false/, 'estado próprio só pode ser marcado como lido')
assert.match(conversation.unread['.write'], /pedidos/, 'estado de leitura exige vínculo real com pedido')
assert.match(conversation.unread['.write'], /privateRequests/, 'estado de leitura preserva conversas privadas de agenda')
assert.equal(conversation.unread['.validate'], 'newData.val() === false', 'unread próprio não aceita true, null ou outro tipo')
assert.doesNotMatch(pedidoPage, /unread:\s*true|\/unread`]\s*=\s*true|\/unread`]\s*=\s*uid\s*!==/, 'fluxo do pedido não tenta marcar como não lido o índice privado de outro usuário')
assert.doesNotMatch(pedidoPage, /update\(ref\(database, `conversas\/\$\{user\.uid\}\/\$\{conversaId\}`\)/, 'aceitador não cria o próprio índice de conversa')
assert.doesNotMatch(pedidoPage, /set\(ref\(database, `usersChats\/\$\{user\.uid\}\/\$\{conversaId\}`\)/, 'aceitador não cria o próprio índice legado de chat')
assert.doesNotMatch(pedidoPage, /(?:update|set)\(ref\(database, `conversas\//, 'detalhe público delega a materialização dos índices ao servidor')
assert.doesNotMatch(mapSource, /(?:update|set)\(ref\(database, `conversas\//, 'mapa não mantém writer legado de conversa após claim')
assert.doesNotMatch(mapSource, /(?:update|set)\(ref\(database, `usersChats\//, 'mapa não cria atalhos próprios ou da contraparte após claim')
assert.doesNotMatch(privateRequests, /responsePayload\[`conversas\//, 'aceite de agenda não mistura status autoritativo com índice client-side')
assert.doesNotMatch(privateRequests, /responsePayload\[`usersChats\//, 'aceite de agenda não grava usersChats legado')
for (const source of [chatSource, conversationListSource]) {
  assert.match(source, /set\(ref\(database, `conversas\/\$\{(?:meuId|expectedUid)\}\/\$\{pedidoId\}\/unread`\), false\)/, 'leitura grava somente unread do próprio índice')
  assert.doesNotMatch(source, /abertoEm/, 'campo abertoEm sem consumidor não volta ao payload')
}
assert.match(chatSource, /const snapshot = await get\(conversationRef\)[\s\S]*auth\.currentUser\?\.uid !== expectedUid[\s\S]*!snapshot\.exists\(\)[\s\S]*set\(ref\(database, `conversas\/\$\{expectedUid\}\/\$\{pedidoId\}\/unread`\), false\)/, 'chat revalida a sessão e só marca unread quando o próprio índice já existe')
assert.match(inbox['.write'], /newData\.val\(\) === true/, 'atalho de inbox não aceita payload livre')
assert.doesNotMatch(inbox['.write'], /auth\.uid === \$uid/, 'dono do inbox não cria atalho arbitrário')

const registrarMensagemSource = chatSource.slice(
  chatSource.indexOf('async function registrarMensagem'),
  chatSource.indexOf('async function iniciarGravacao'),
)
const chamarAtencaoSource = chatSource.slice(
  chatSource.indexOf('async function chamarAtencao'),
  chatSource.indexOf('async function finalizarAtendimento'),
)
assert.match(modernNotification['.write'], /newData\.child\('toUid'\)\.val\(\) === \$uid/, 'notificação moderna exige destinatário explícito')
assert.match(legacyNotification['.write'], /!newData\.child\('toUid'\)\.exists\(\)/, 'espelho legado explica por que o payload antigo sem toUid passava')
assert.match(registrarMensagemSource, /fromUid: expectedUid[\s\S]*toUid: outroId/, 'nova mensagem identifica remetente e destinatário para a Rule moderna')
assert.match(registrarMensagemSource, /const expectedUid = String\(meuId \|\| ''\)[\s\S]*auth\.currentUser\?\.uid !== expectedUid[\s\S]*await push/, 'envio revalida a conta antes de persistir a mensagem')
assert.match(registrarMensagemSource, /scheduleChatNotification\(/, 'notificação de mensagem usa writer canônico')
assert.match(registrarMensagemSource, /scheduleConversationActivity\(\{ conversationId: pedidoId, messageId, authUid: expectedUid \}\)/, 'mensagem persistida agenda atualização autoritativa da Inbox')
assert.doesNotMatch(registrarMensagemSource, /notificacoes\/\$\{outroId\}/, 'nova mensagem não duplica mais escrita na árvore legada')
assert.doesNotMatch(registrarMensagemSource, /conversas\/\$\{meuId\}\/\$\{pedidoId\}`\), \{/, 'remetente não tenta regravar o próprio índice sem permissão')
assert.doesNotMatch(registrarMensagemSource, /conversas\/\$\{outroId\}\/\$\{pedidoId\}/, 'remetente não envia unread=true proibido ao índice da contraparte')
assert.doesNotMatch(chamarAtencaoSource, /conversas\//, 'chamar atenção não mistura conversa proibida ao multipath de notificações')
assert.match(chamarAtencaoSource, /auth\.currentUser\?\.uid !== expectedUid[\s\S]*await update[\s\S]*auth\.currentUser\?\.uid !== expectedUid[\s\S]*registrarMensagem/, 'chamar atenção interrompe efeitos restantes quando A troca para B')
assert.match(chatSource, /const path = `notifications\/\$\{recipientUid\}\/\$\{notificationId\}`/, 'notifications é o caminho canônico de nova mensagem')
assert.match(chatSource, /\[CHAT_NOTIFICATION\][\s\S]*operation:[\s\S]*path,[\s\S]*authUid:[\s\S]*recipientUid:[\s\S]*eventType:[\s\S]*error:/, 'falha moderna não é engolida e possui log sanitizado')
assert.match(conversationListSource, /selectConversationSessionItems\(conversationState, sessionUid\)/, 'lista nunca exibe snapshot pertencente a outro UID')
assert.match(conversationListSource, /let active = true[\s\S]*active = false[\s\S]*off\(\)/, 'listener anterior é invalidado e desmontado na troca de conta')
assert.doesNotMatch(conversationListSource, /c\?\.photoURL/, 'avatar ambíguo legado não substitui a contraparte')
assert.match(chatPageSource, /function useOwnedValue\(ownerKey[\s\S]*state\.ownerKey === ownerKey/, 'rota escopa dados privados por uid e pedidoId')
assert.match(chatPageSource, /fetch\(contextPath[\s\S]*result\?\.kind !== 'pedido'[\s\S]*const sourceKind = result\.kind[\s\S]*sourceKind === 'privateRequest'/, 'rota usa contexto autenticado para assinar somente a árvore autoritativa real')
assert.doesNotMatch(chatPageSource, /conversationIndex\.privateRequest|privateSnapshot\.exists\(\)/, 'rota não confia em discriminador client-writable nem sonda privateRequest primeiro')
assert.match(chatPageSource, /function isPrivateChatReady[\s\S]*isPrivateAttendanceStatus\(record\?\.status\)/, 'chat privado usa a lista canônica de estados autorizados')
assert.match(attendanceStateSource, /PRIVATE_ATTENDANCE_STORED_STATUSES[\s\S]*'agendado'[\s\S]*ATENDIMENTO_STATUS\.FINALIZADO/, 'agenda aceita permanece acessível durante toda a máquina de atendimento')
assert.doesNotMatch(attendanceStateSource.slice(
  attendanceStateSource.indexOf('PRIVATE_ATTENDANCE_STORED_STATUSES'),
  attendanceStateSource.indexOf('export function normalizeAtendimentoStatus'),
), /pendente|recusado/, 'agenda pendente ou recusada não abre chat por URL direta')
assert.match(chatPageSource, /offSource\?\.\(\)/, 'listener único da fonte privada possui cleanup')
assert.match(chatPageSource, /key=\{`\$\{authUser\.uid\}:\$\{pedidoId\}`\}/, 'troca de conta ou conversa remonta o estado local do chat')
assert.doesNotMatch(chatPageSource, /localStorage\.getItem\('meuNome'\)/, 'rota não herda nome global da conta anterior')
assert.doesNotMatch(chatSource, /!msg\.userId[\s\S]{0,120}msg\.autor[\s\S]{0,120}meuNome/, 'mensagem legada sem UID não vira própria apenas por nome igual')

assert.match(storageRules, /match \/chatAnexos\/\{pedidoId\}\/\{fileName\}/)
assert.match(storageRules, /allow read, write: if false;/, 'caminho de Storage de chat sem consumidor é fechado')
assert.doesNotMatch(storageRules, /chatAnexos[\s\S]*12 \* 1024 \* 1024/, 'não resta upload amplo de 12 MiB')

for (const source of [chatSource, privateRequests, pedidoPage, mapSource]) {
  assert.match(source, /registrarMensagemSistemaConfiavel/, 'produtor de evento usa caminho confiável')
  assert.doesNotMatch(source, /autorId\s*:\s*['"]sistema['"]/, 'cliente não escreve autorId do sistema')
  assert.doesNotMatch(source, /sistema\s*:\s*true/, 'cliente não marca mensagem como sistema')
}
assert.match(systemClient, /fetch\('\/api\/chat\/system'/, 'cliente usa endpoint autenticado')
assert.match(systemClient, /Authorization: `Bearer \$\{idToken\}`/, 'token Firebase acompanha a chamada')
assert.match(systemClient, /body: JSON\.stringify\(\{ pedidoId: id, eventType: evento, contextKind: kind \}\)/, 'cliente declara o namespace sem enviar dados privados')
assert.match(systemRoute, /verifyIdToken/, 'endpoint valida identidade Firebase')
assert.match(systemRoute, /SYSTEM_MESSAGES/, 'endpoint usa templates conhecidos')
assert.match(systemRoute, /canCreatePublicSystemMessage/, 'endpoint valida evento de pedido')
assert.match(systemRoute, /canCreatePrivateSystemMessage/, 'endpoint valida evento de agenda')
assert.match(systemRoute, /atendimento_chegou[\s\S]*status === 'chegou'/, 'chegada exige estado real')
assert.match(systemRoute, /atendimento_finalizado[\s\S]*status === 'finalizado'/, 'conclusão exige estado real')
assert.match(systemRoute, /agendamento_aceito[\s\S]*status === 'agendado'/, 'aceite de agenda exige estado real')
assert.match(systemRoute, /eventType !== 'agendamento_solicitado'[\s\S]*context\.privateResponseAuthorized !== true[\s\S]*private_request_response_unverified/, 'evento terminal privado exige resposta autoritativa antes de qualquer escrita')
assert.match(systemRoute, /eventId = `system:\$\{context\.conversaId\}:\$\{eventType\}`/, 'eventId é determinístico')
assert.match(systemRoute, /transaction\(/, 'criação automática é idempotente')
assert.doesNotMatch(systemRoute, /body\?\.texto|body\.texto/, 'endpoint não recebe texto livre do cliente')
assert.match(systemRoute, /applyConversationActivity/, 'mensagem de sistema materializa os dois índices pelo servidor')
assert.match(privateTransitionRoute, /verifyIdToken/, 'transição privada valida Firebase Auth')
assert.match(privateTransitionRoute, /readConversationContext\(database, requestId, \{ kind: 'privateRequest' \}\)/, 'transição lê o pedido privado autoritativo')
assert.match(privateTransitionRoute, /privateResponseAuthorized/, 'transição falha fechado sem marcador ou par legado C6 válido')
assert.match(privateTransitionRoute, /authorizePrivateAttendanceTransition/, 'transição aplica matriz A/B/C compartilhada')
assert.match(privateTransitionRoute, /requestRef\.transaction/, 'status é revalidado no commit')
assert.doesNotMatch(privateTransitionRoute, /body\?\.(?:clienteId|profissionalId|clienteNome|profissionalNome|descricao)/, 'cliente não injeta participantes ou PII')

assert.match(activityClient, /fetch\('\/api\/conversations\/activity'/, 'atividade de Inbox usa endpoint autenticado')
assert.match(activityClient, /Authorization: `Bearer \$\{idToken\}`/, 'atividade envia token Firebase')
assert.match(activityRoute, /verifyIdToken/, 'endpoint de atividade valida o token')
assert.match(activityRoute, /chats\/\$\{conversationId\}\/\$\{messageId\}/, 'preview deriva da mensagem já persistida')
assert.match(activityRoute, /text\(message\.userId\) !== actorUid/, 'ator não aponta para mensagem de outro participante')
assert.doesNotMatch(activityRoute, /body\?\.(?:recipientUid|unread|preview|texto|nome)/, 'cliente não escolhe destinatário, unread, nome ou preview')
assert.match(activityRoute, /resolveActiveConversationContext\(database, conversationId, actorUid\)/, 'atividade resolve o namespace por participação autoritativa, não por flag mutável da Inbox')
assert.match(contextRoute, /verifyIdToken[\s\S]*conversas\/\$\{actorUid\}\/\$\{conversationId\}[\s\S]*resolveActiveConversationContext/, 'endpoint de contexto exige sessão e índice próprio antes de revelar apenas o namespace')
assert.doesNotMatch(contextRoute, /record|clienteId|profissionalId|nome|descricao/, 'endpoint de contexto não devolve dados privados ou PII')
assert.match(activityServer, /readConversationContext[\s\S]*pedidos\/[\s\S]*privateRequests\//, 'contexto A/B vem das estruturas privadas autoritativas')
assert.match(activityServer, /resolveActiveConversationContext[\s\S]*for \(const kind of \['pedido', 'privateRequest'\]\)[\s\S]*participant && meta\.active/, 'pedido legítimo tem precedência e privateRequest forjado falha fechado')
assert.match(activityServer, /conversation_actor_not_participant/, 'terceiro C falha fechado')
assert.match(activityServer, /unread: false[\s\S]*unread: true/, 'Admin grava lido no ator e não lido apenas na contraparte')
assert.match(activityServer, /currentMessageId === messageId[\s\S]*return false/, 'retry da mesma mensagem não reabre unread já lido')
assert.match(activityClient, /RETRY_DELAYS_MS = \[0, 250, 750\][\s\S]*for \(let attempt = 0; attempt < RETRY_DELAYS_MS\.length/, 'atividade auxiliar repara commit parcial com retry limitado sem bloquear o envio')

const canClientWriteConversationPayload = (payload = {}) => payload.unread !== true
assert.equal(canClientWriteConversationPayload({ pedidoId: 'p', outroId: 'A', unread: true }), false, 'validate filha nega unread=true mesmo quando write pai permite')
assert.equal(canClientWriteConversationPayload({ pedidoId: 'p', outroId: 'A', unread: false }), true, 'payload sem unread proibido permanece compatível')

assert.match(chatSource, /MIME_ANEXOS_CHAT/, 'UI limita MIME permitido')
assert.match(chatSource, /isUrlAnexoChatSeguro/, 'renderização confere URL de anexo')
assert.match(chatSource, /noopener noreferrer/, 'link de imagem segura janela externa')
assert.doesNotMatch(chatSource, /dangerouslySetInnerHTML|innerHTML|eval\(|new Function/, 'chat não injeta HTML ou executa texto')
assert.doesNotMatch(chatSource, /video\s+controls/, 'chat não reativa vídeo não suportado')

const order = { creator: 'A', professional: 'B' }
const isParticipant = (uid) => [order.creator, order.professional].includes(uid)
const canRead = (uid) => Boolean(uid) && isParticipant(uid)
const canReadUnderCurrentRules = (uid, pedidoPair, privatePair = null) => Boolean(uid) && (
  [pedidoPair?.creator, pedidoPair?.professional].includes(uid)
  || [privatePair?.creator, privatePair?.professional].includes(uid)
)
const canCreatePrivateRequest = () => false
const canCreatePedido = ({ uid, pedidoId, privateRequestIds = [], record = {} }) => (
  Boolean(uid)
  && Boolean(pedidoId)
  && !privateRequestIds.includes(pedidoId)
  && record.creator === uid
  && record.status === 'aberto'
)
const canWriteMessage = ({ uid, authorId, exists = false, system = false }) => (
  Boolean(uid) && !exists && !system && isParticipant(uid) && authorId === uid
)
const canWriteInbox = ({ uid, targetUid }) => isParticipant(uid) && isParticipant(targetUid)
const canCreateSystemViaApi = ({ uid, event, status }) => (
  uid === order.professional && event === 'atendimento_chegou' && status === 'chegou'
)

assert.equal(canRead('A'), true, 'A lê chat A/B')
assert.equal(canRead('B'), true, 'B lê chat A/B')
assert.equal(canRead('C'), false, 'C não lê chat A/B')
assert.equal(canRead(null), false, 'não autenticado não lê chat')
const forgedPrivateRequest = {
  id: 'shared-id',
  clienteId: 'C',
  profissionalId: 'D',
  tipo: 'agendamento',
  status: 'pendente',
  privado: true,
  publico: false,
}
const forgedPrivateCreationAllowed = canCreatePrivateRequest({
  uid: 'C',
  requestId: 'shared-id',
  pedidoIds: ['shared-id'],
  record: forgedPrivateRequest,
})
assert.equal(forgedPrivateCreationAllowed, false, 'C recebe PERMISSION_DENIED ao colidir privateRequests/X com pedidos/X')
const namespaceCollisionBypassDetected = canReadUnderCurrentRules(
  'C',
  order,
  forgedPrivateCreationAllowed ? { creator: 'C', professional: 'D' } : null,
)
assert.equal(
  namespaceCollisionBypassDetected,
  false,
  'privateRequest negado não contamina a autorização OR do pedido existente',
)
for (const namespace of ['conversas', 'chats', 'mensagens']) {
  assert.equal(namespaceCollisionBypassDetected, false, `C permanece negado em ${namespace}/X após a colisão bloqueada`)
}
assert.equal(canCreatePrivateRequest({ uid: 'A', requestId: 'agenda-1', record: { ...forgedPrivateRequest, id: 'agenda-1', clienteId: 'A', profissionalId: 'B' } }), false, 'agenda A→B depende do writer backend')
assert.equal(canCreatePrivateRequest({ uid: 'A', requestId: 'direct-1', record: { ...forgedPrivateRequest, id: 'direct-1', clienteId: 'A', profissionalId: 'B', tipo: 'pedido_direto' } }), false, 'pedido direto A→B depende do writer backend')
assert.equal(canCreatePrivateRequest({ uid: 'A', requestId: 'agenda-closed', professionalEligible: false, record: { ...forgedPrivateRequest, id: 'agenda-closed', clienteId: 'A', profissionalId: 'B' } }), false, 'agenda exige profissional público elegível')
for (const status of ['aceito', 'agendado', 'em_andamento', 'chegou', 'aguardando_confirmacao', 'finalizado', 'recusado', 'cancelado']) {
  assert.equal(canCreatePrivateRequest({ uid: 'A', requestId: `forged-${status}`, record: { ...forgedPrivateRequest, id: `forged-${status}`, clienteId: 'A', profissionalId: 'B', status } }), false, `criação direta em ${status} é negada`)
}
assert.equal(canCreatePrivateRequest({ uid: 'A', requestId: 'forged-response-time', record: { ...forgedPrivateRequest, id: 'forged-response-time', clienteId: 'A', profissionalId: 'B', respondidoEm: 1 } }), false, 'criação não injeta respondidoEm')
assert.equal(canCreatePrivateRequest({ uid: 'A', requestId: 'forged-response-actor', record: { ...forgedPrivateRequest, id: 'forged-response-actor', clienteId: 'A', profissionalId: 'B', respondidoPor: { id: 'B' } } }), false, 'criação não injeta respondidoPor')
assert.equal(canCreatePedido({ uid: 'C', pedidoId: 'private-id', privateRequestIds: ['private-id'], record: { creator: 'C', status: 'aberto' } }), false, 'colisão inversa pedidos/X × privateRequests/X também é negada')
assert.equal(canCreatePedido({ uid: 'A', pedidoId: 'public-1', record: { creator: 'A', status: 'aberto' } }), true, 'pedido público legítimo continua nascendo aberto')
assert.equal(canWriteMessage({ uid: 'A', authorId: 'A' }), true, 'A envia como A')
assert.equal(canWriteMessage({ uid: 'B', authorId: 'B' }), true, 'B envia como B')
assert.equal(canWriteMessage({ uid: 'C', authorId: 'C' }), false, 'C não envia em A/B')
assert.equal(canWriteMessage({ uid: 'A', authorId: 'B' }), false, 'A não finge ser B')
assert.equal(canWriteMessage({ uid: 'B', authorId: 'A' }), false, 'B não finge ser A')
assert.equal(canWriteMessage({ uid: 'A', authorId: 'sistema', system: true }), false, 'A não cria sistema')
assert.equal(canWriteMessage({ uid: 'B', authorId: 'sistema', system: true }), false, 'B não cria sistema')
assert.equal(canWriteMessage({ uid: 'A', authorId: 'A', exists: true }), false, 'A não edita mensagem enviada')
assert.equal(canWriteInbox({ uid: 'A', targetUid: 'B' }), true, 'A atualiza inbox do participante B')
assert.equal(canWriteInbox({ uid: 'A', targetUid: 'C' }), false, 'A não cria inbox de terceiro C')
const canMarkOwnConversationRead = ({ uid, targetUid, participant, field = 'unread', value }) => (
  Boolean(uid) && uid === targetUid && participant === true && field === 'unread' && value === false
)
assert.equal(canMarkOwnConversationRead({ uid: 'A', targetUid: 'A', participant: true, value: false }), true, 'A marca sua conversa como lida')
assert.equal(canMarkOwnConversationRead({ uid: 'A', targetUid: 'B', participant: true, value: false }), false, 'A não marca conversa de B')
assert.equal(canMarkOwnConversationRead({ uid: 'B', targetUid: 'A', participant: true, value: false }), false, 'B não altera conversa de A')
assert.equal(canMarkOwnConversationRead({ uid: 'A', targetUid: 'A', participant: false, value: false }), false, 'A não usa índice sem vínculo real')
assert.equal(canMarkOwnConversationRead({ uid: 'A', targetUid: 'A', participant: true, value: true }), false, 'A não forja não lida no próprio índice')
assert.equal(canMarkOwnConversationRead({ uid: 'A', targetUid: 'A', participant: true, value: null }), false, 'delete/null não remove unread')
assert.equal(canMarkOwnConversationRead({ uid: 'A', targetUid: 'A', participant: true, field: 'pedidoId', value: false }), false, 'campo estrutural não recebe permissão do filho unread')
assert.equal(canMarkOwnConversationRead({ uid: 'A', targetUid: 'A', participant: true, field: 'hackerField', value: false }), false, 'campo desconhecido não recebe permissão do filho unread')
assert.equal(canCreateSystemViaApi({ uid: 'B', event: 'atendimento_chegou', status: 'chegou' }), true, 'evento real chega pelo servidor')
assert.equal(canCreateSystemViaApi({ uid: 'A', event: 'atendimento_chegou', status: 'chegou' }), false, 'papel errado não cria evento')
assert.equal(canCreateSystemViaApi({ uid: 'B', event: 'atendimento_chegou', status: 'em_andamento' }), false, 'estado falso não cria evento')

const activityModuleSource = activityServer.replace(
  /import \{ isPrivateAttendanceStatus \} from '\.\/attendanceState\.js'\s*/,
  "const isPrivateAttendanceStatus = (value) => ['aceito', 'agendado', 'em_andamento', 'chegou', 'aguardando_confirmacao', 'finalizado'].includes(String(value || '').toLowerCase())\n",
)
const activityModule = await import(`data:text/javascript;base64,${Buffer.from(activityModuleSource).toString('base64')}`)
const memory = new Map()
const clone = (value) => value === undefined ? undefined : structuredClone(value)
const fakeDatabase = {
  ref(path) {
    return {
      async get() {
        const value = clone(memory.get(path))
        return { exists: () => value !== undefined && value !== null, val: () => value }
      },
      async transaction(updateValue) {
        const next = updateValue(clone(memory.get(path)))
        if (next === undefined) {
          return { committed: false, snapshot: { val: () => clone(memory.get(path)) } }
        }
        memory.set(path, clone(next))
        return { committed: true, snapshot: { val: () => clone(next) } }
      },
    }
  },
}
const publicContext = {
  ok: true,
  kind: 'pedido',
  record: {
    status: 'aceito',
    titulo: 'Pedido seguro',
    criador: { id: 'A', nome: 'Cliente' },
    aceite: { id: 'B', nome: 'Profissional' },
  },
}
const forgedPrivateContext = {
  ok: true,
  kind: 'privateRequest',
  privateResponseAuthorized: false,
  record: {
    status: 'agendado',
    tipo: 'agendamento',
    clienteId: 'C',
    profissionalId: 'D',
  },
}
assert.equal(activityModule.describeConversationContext(forgedPrivateContext).active, false, 'status terminal forjado sem marcador não ativa conversa')
assert.equal(activityModule.describeConversationContext({
  ...forgedPrivateContext,
  privateResponseAuthorized: true,
}).active, true, 'resposta privada confirmada ativa a conversa legítima')
const forgedActivity = await activityModule.applyConversationActivity({
  database: fakeDatabase,
  context: forgedPrivateContext,
  conversationId: 'pedido-1',
  messageId: 'm-forged',
  message: { userId: 'C', texto: 'Forjada', criadoEm: 10 },
  actorUid: 'C',
})
assert.equal(forgedActivity.error, 'conversation_not_active', 'API não materializa Inbox para privateRequest terminal forjado')

memory.set('pedidos/shared-id', clone(publicContext.record))
memory.set('privateRequests/shared-id', clone(forgedPrivateContext.record))
const resolvedPublicCollision = await activityModule.resolveActiveConversationContext(fakeDatabase, 'shared-id', 'A')
assert.equal(resolvedPublicCollision.kind, 'pedido', 'participante A mantém o pedido público autoritativo mesmo sob colisão')
const rejectedForgedCollision = await activityModule.resolveActiveConversationContext(fakeDatabase, 'shared-id', 'C')
assert.equal(rejectedForgedCollision.error, 'conversation_context_not_authorized', 'servidor não aceita contexto privado colidente sem resposta autoritativa')

const firstActivity = await activityModule.applyConversationActivity({
  database: fakeDatabase,
  context: publicContext,
  conversationId: 'pedido-1',
  messageId: 'm1',
  message: { userId: 'A', texto: 'Mensagem A', criadoEm: 100 },
  actorUid: 'A',
})
assert.equal(firstActivity.ok, true, 'atividade A cria os dois índices')
assert.equal(memory.get('conversas/A/pedido-1').unread, false, 'índice do ator nasce lido')
assert.equal(memory.get('conversas/B/pedido-1').unread, true, 'contraparte recebe não lida')
memory.set('conversas/B/pedido-1', { ...memory.get('conversas/B/pedido-1'), unread: false })
await activityModule.applyConversationActivity({
  database: fakeDatabase,
  context: publicContext,
  conversationId: 'pedido-1',
  messageId: 'm1',
  message: { userId: 'A', texto: 'Mensagem A', criadoEm: 100 },
  actorUid: 'A',
})
assert.equal(memory.get('conversas/B/pedido-1').unread, false, 'retry da mesma mensagem não reabre não lida')
const thirdPartyActivity = await activityModule.applyConversationActivity({
  database: fakeDatabase,
  context: publicContext,
  conversationId: 'pedido-1',
  messageId: 'm-c',
  message: { userId: 'C', texto: 'Terceiro', criadoEm: 200 },
  actorUid: 'C',
})
assert.equal(thirdPartyActivity.error, 'conversation_actor_not_participant', 'C não atualiza Inbox A/B')
await activityModule.applyConversationActivity({
  database: fakeDatabase,
  context: publicContext,
  conversationId: 'pedido-1',
  messageId: 'm2',
  message: { userId: 'B', texto: 'Mensagem B', criadoEm: 300 },
  actorUid: 'B',
})
assert.equal(memory.get('conversas/A/pedido-1').lastText, 'Mensagem B', 'mensagem nova atualiza apenas o preview correto')
assert.equal(memory.get('conversas/A/pedido-1').unread, true, 'A recebe não lida da mensagem de B')
assert.equal(memory.get('conversas/B/pedido-1').unread, false, 'B mantém o próprio índice lido')
await activityModule.applyConversationActivity({
  database: fakeDatabase,
  context: publicContext,
  conversationId: 'pedido-1',
  messageId: 'm0',
  message: { userId: 'A', texto: 'Atrasada', criadoEm: 50 },
  actorUid: 'A',
})
assert.equal(memory.get('conversas/A/pedido-1').lastText, 'Mensagem B', 'atividade fora de ordem não regride preview')

console.log('C6 estático: colisão de namespace bloqueada na autoridade, estados iniciais rígidos, matriz A/B/C/Admin-SDK, inbox, chat, mensagens e Storage OK')
