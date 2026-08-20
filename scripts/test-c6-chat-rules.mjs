import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const rules = JSON.parse(await read('../database.rules.json')).rules
const storageRules = await read('../storage.rules')
const [chatSource, privateRequests, pedidoPage, mapSource, systemClient, systemRoute] = await Promise.all([
  read('../src/components/ChatMensagens.jsx'),
  read('../src/lib/privateRequests.js'),
  read('../src/app/pedido/[pedidoId]/page.jsx'),
  read('../src/components/Mapadinamico.jsx'),
  read('../src/lib/trustedSystemChat.js'),
  read('../src/app/api/chat/system/route.js'),
])

const chat = rules.chats.$pedidoId
const message = chat.$msgId
const legacyMessage = rules.mensagens.$conversaId.$msgId
const conversation = rules.conversas.$uid.$conversaId
const inbox = rules.usersChats.$uid.$conversaId

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
assert.match(inbox['.write'], /newData\.val\(\) === true/, 'atalho de inbox não aceita payload livre')
assert.doesNotMatch(inbox['.write'], /auth\.uid === \$uid/, 'dono do inbox não cria atalho arbitrário')

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
assert.match(systemRoute, /verifyIdToken/, 'endpoint valida identidade Firebase')
assert.match(systemRoute, /SYSTEM_MESSAGES/, 'endpoint usa templates conhecidos')
assert.match(systemRoute, /canCreatePublicSystemMessage/, 'endpoint valida evento de pedido')
assert.match(systemRoute, /canCreatePrivateSystemMessage/, 'endpoint valida evento de agenda')
assert.match(systemRoute, /atendimento_chegou[\s\S]*status === 'chegou'/, 'chegada exige estado real')
assert.match(systemRoute, /atendimento_finalizado[\s\S]*status === 'finalizado'/, 'conclusão exige estado real')
assert.match(systemRoute, /agendamento_aceito[\s\S]*status === 'agendado'/, 'aceite de agenda exige estado real')
assert.match(systemRoute, /eventId = `system:\$\{context\.conversaId\}:\$\{eventType\}`/, 'eventId é determinístico')
assert.match(systemRoute, /transaction\(/, 'criação automática é idempotente')
assert.doesNotMatch(systemRoute, /body\?\.texto|body\.texto/, 'endpoint não recebe texto livre do cliente')

assert.match(chatSource, /MIME_ANEXOS_CHAT/, 'UI limita MIME permitido')
assert.match(chatSource, /isUrlAnexoChatSeguro/, 'renderização confere URL de anexo')
assert.match(chatSource, /noopener noreferrer/, 'link de imagem segura janela externa')
assert.doesNotMatch(chatSource, /dangerouslySetInnerHTML|innerHTML|eval\(|new Function/, 'chat não injeta HTML ou executa texto')
assert.doesNotMatch(chatSource, /video\s+controls/, 'chat não reativa vídeo não suportado')

const order = { creator: 'A', professional: 'B' }
const isParticipant = (uid) => [order.creator, order.professional].includes(uid)
const canRead = (uid) => Boolean(uid) && isParticipant(uid)
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
assert.equal(canCreateSystemViaApi({ uid: 'B', event: 'atendimento_chegou', status: 'chegou' }), true, 'evento real chega pelo servidor')
assert.equal(canCreateSystemViaApi({ uid: 'A', event: 'atendimento_chegou', status: 'chegou' }), false, 'papel errado não cria evento')
assert.equal(canCreateSystemViaApi({ uid: 'B', event: 'atendimento_chegou', status: 'em_andamento' }), false, 'estado falso não cria evento')

console.log('C6 estático: matriz A/B/C/Admin-SDK, sistema confiável, imutabilidade, inbox, anexos e Storage OK')

