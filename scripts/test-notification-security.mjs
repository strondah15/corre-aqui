import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function importSource(path, transform = (source) => source) {
  const source = transform(await readFile(new URL(path, import.meta.url), 'utf8'))
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const policy = await importSource('../src/lib/notificationPolicy.js', (source) => source.replace(
  /import \{ consumeFixedWindowLimit \} from '\.\/serverRateLimit\.js'\s*/,
  'const consumeFixedWindowLimit = async () => ({ allowed: true, retryAfterMs: 0 });\n',
))
const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules

const publicOrder = {
  status: 'aceito',
  titulo: 'Instalação segura',
  criador: { id: 'client-A', nome: 'Cliente A' },
  aceite: { id: 'worker-B', nome: 'Profissional B' },
}
const privateRequest = {
  tipo: 'pedido_direto',
  status: 'aceito',
  clienteId: 'client-A',
  clienteNome: 'Cliente A',
  profissionalId: 'worker-B',
  profissionalNome: 'Profissional B',
  servicoTitulo: 'Reparo seguro',
}
const responseMarker = {
  requestId: 'private-1',
  clienteId: 'client-A',
  profissionalId: 'worker-B',
  respondedBy: 'worker-B',
  status: 'aceito',
  committed: true,
}

assert.equal(policy.normalizeNotificationType('mensagem_chat'), 'nova_mensagem')
assert.equal(policy.normalizeNotificationType('atendimento_cancelado'), 'pedido_cancelado')

const accepted = policy.authorizeNotificationEvent({
  kind: 'pedido',
  record: publicOrder,
  sourceId: 'pedido-1',
  actorUid: 'worker-B',
  toUid: 'client-A',
  requestedType: 'pedido_aceito',
})
assert.equal(accepted.ok, true, 'profissional aceito pode notificar o cliente')
assert.equal(policy.authorizeNotificationEvent({
  kind: 'pedido',
  record: { ...publicOrder, status: 'finalizado' },
  sourceId: 'pedido-1',
  actorUid: 'worker-B',
  toUid: 'client-A',
  requestedType: 'pedido_aceito',
}).ok, false, 'evento de aceite não pode ser recriado em estado posterior')
assert.equal(policy.authorizeNotificationEvent({
  kind: 'pedido',
  record: publicOrder,
  sourceId: 'pedido-1',
  actorUid: 'attacker-C',
  toUid: 'client-A',
  requestedType: 'pedido_aceito',
}).ok, false, 'terceiro não falsifica aceite')

const verifiedMessage = {
  kind: 'pedido',
  record: publicOrder,
  sourceId: 'pedido-1',
  actorUid: 'client-A',
  toUid: 'worker-B',
  requestedType: 'nova_mensagem',
  message: { userId: 'client-A', texto: 'Olá' },
}
assert.equal(policy.authorizeNotificationEvent(verifiedMessage).ok, true)
assert.equal(policy.authorizeNotificationEvent({
  ...verifiedMessage,
  message: { userId: 'worker-B', texto: 'identidade forjada' },
}).ok, false, 'mensagem precisa pertencer ao token autenticado')
assert.equal(policy.authorizeNotificationEvent({
  ...verifiedMessage,
  record: { ...publicOrder, status: 'cancelado' },
}).ok, false, 'pedido cancelado não aceita nova mensagem ou push')

const privateAccepted = policy.authorizeNotificationEvent({
  kind: 'privateRequest',
  record: privateRequest,
  sourceId: 'private-1',
  actorUid: 'worker-B',
  toUid: 'client-A',
  requestedType: 'pedido_direto_aceito',
  responseMarker,
  privateResponseAuthorized: true,
})
assert.equal(privateAccepted.ok, true, 'registro legado sem campo id usa o ID autoritativo da rota')
assert.equal(policy.authorizeNotificationEvent({
  kind: 'privateRequest',
  record: privateRequest,
  sourceId: 'private-other',
  actorUid: 'worker-B',
  toUid: 'client-A',
  requestedType: 'pedido_direto_aceito',
  responseMarker,
  privateResponseAuthorized: true,
}).ok, false, 'marcador de resposta não pode ser reutilizado em outra solicitação')

const attendanceRecord = {
  ...publicOrder,
  status: 'a_caminho',
  atendimento: { aCaminhoPor: { id: 'worker-B', nome: 'Profissional B' } },
}
assert.equal(policy.authorizeNotificationEvent({
  kind: 'pedido',
  record: attendanceRecord,
  sourceId: 'pedido-1',
  actorUid: 'worker-B',
  toUid: 'client-A',
  requestedType: 'atendimento_a_caminho',
}).ok, true)
assert.equal(policy.authorizeNotificationEvent({
  kind: 'pedido',
  record: { ...attendanceRecord, atendimento: { aCaminhoPor: { id: 'client-A' } } },
  sourceId: 'pedido-1',
  actorUid: 'worker-B',
  toUid: 'client-A',
  requestedType: 'atendimento_a_caminho',
}).ok, false, 'estado sem auditoria do ator não gera notificação')

const rating = {
  pedidoId: 'pedido-1',
  cliente: { id: 'client-A' },
  avaliado: { id: 'worker-B' },
}
assert.equal(policy.authorizeNotificationEvent({
  kind: 'pedido',
  record: { ...publicOrder, status: 'finalizado' },
  sourceId: 'pedido-1',
  actorUid: 'client-A',
  toUid: 'worker-B',
  requestedType: 'avaliacao_recebida',
  rating,
}).ok, true, 'avaliação persistida e coerente permite o evento')
assert.equal(policy.authorizeNotificationEvent({
  kind: 'pedido',
  record: { ...publicOrder, status: 'finalizado' },
  sourceId: 'pedido-2',
  actorUid: 'client-A',
  toUid: 'worker-B',
  requestedType: 'avaliacao_recebida',
  rating,
}).ok, false, 'avaliação de outro pedido não pode ser reutilizada')

const trusted = policy.buildTrustedNotification({
  event: accepted,
  kind: 'pedido',
  record: publicOrder,
  sourceId: 'pedido-1',
  actorUid: 'worker-B',
  toUid: 'client-A',
  now: 1_700_000_000_000,
})
assert.equal(trusted.serverGenerated, true)
assert.equal(trusted.titulo, 'Seu pedido foi aceito!')
assert.equal(trusted.fromUid, 'worker-B')
assert.equal(trusted.toUid, 'client-A')
assert.equal(trusted.action.id, 'pedido-1')
assert.equal(
  policy.trustedNotificationId({ type: 'pedido_aceito', sourceId: 'pedido-1', toUid: 'client-A', now: 1 }),
  policy.trustedNotificationId({ type: 'pedido_aceito', sourceId: 'pedido-1', toUid: 'client-A', now: 2 }),
  'evento de estado é idempotente',
)
assert.notEqual(
  policy.trustedNotificationId({ type: 'nova_mensagem', sourceId: 'pedido-1', toUid: 'worker-B', messageId: 'm1' }),
  policy.trustedNotificationId({ type: 'nova_mensagem', sourceId: 'pedido-1', toUid: 'worker-B', messageId: 'm2' }),
  'cada mensagem possui identidade própria',
)
assert.deepEqual(policy.notificationRateProfile('chamar_atencao_chat'), {
  windowMs: 600_000,
  maxRequests: 3,
  minIntervalMs: 120_000,
})

for (const rootName of ['notifications', 'notificacoes']) {
  const notificationRule = rules[rootName].$uid.$notificacaoId
  assert.equal(notificationRule['.write'], undefined, `${rootName} não permite criação direta`)
  assert.match(notificationRule.lida['.write'], /auth\.uid === \$uid/)
  assert.match(notificationRule.lida['.write'], /newData\.val\(\) === true/)
}

const [routeSource, senderSource, privateRequestsSource, chatSource, mapSource] = await Promise.all([
  readFile(new URL('../src/app/api/push/send/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/pushSender.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/privateRequests.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ChatMensagens.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/Mapadinamico.jsx', import.meta.url), 'utf8'),
])
assert.ok(routeSource.indexOf('verifyIdToken(idToken)') < routeSource.indexOf('request.json()'), 'autenticação antecede o corpo')
assert.ok(
  routeSource.indexOf('notification_request_rate_limited') < routeSource.indexOf('request.json()'),
  'limite global por usuário antecede parsing e consultas do evento',
)
assert.match(routeSource, /authorizeNotificationEvent/)
assert.match(routeSource, /consumeNotificationRateLimit/)
assert.match(routeSource, /serverNotificationEvents/)
assert.match(routeSource, /!reservation\.owner/)
assert.match(routeSource, /notifications\/\$\{trusted\.toUid\}/)
assert.match(routeSource, /notificacoes\/\$\{trusted\.toUid\}/)
assert.doesNotMatch(senderSource, /title:\s*normalized\.title|body:\s*normalized\.body/, 'cliente não envia conteúdo autoritativo')
assert.doesNotMatch(privateRequestsSource, /updates\[`notifications\/\$\{toUid\}/, 'helper cliente não persiste notificação')
const sourceNotificationUpdate = privateRequestsSource.slice(
  privateRequestsSource.indexOf('async function updateAgendaSourceNotifications'),
  privateRequestsSource.indexOf('async function deliverPrivateRequestResponseNotification'),
)
assert.doesNotMatch(sourceNotificationUpdate, /eventoStatus:|statusAtual:|respondidoEm:/, 'cliente não altera estado autoritativo da notificação')
assert.doesNotMatch(chatSource, /set\(ref\(database, `notifications\//, 'Chat não grava notificação diretamente')
assert.match(chatSource, /if \(skipNotification\) return messageId/, 'chamar atenção envia o ID real da mensagem verificada')
assert.doesNotMatch(mapSource, /set\(ref\(database, `notifications\//, 'Mapa não grava notificação diretamente')

console.log('Segurança de notificações: identidade, evento, idempotência, spam e persistência server-side OK')
