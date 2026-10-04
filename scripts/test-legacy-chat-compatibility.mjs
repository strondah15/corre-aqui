import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const compatibilitySource = await read('../src/lib/chatMessageCompatibility.js')
const compatibility = await import(`data:text/javascript;base64,${Buffer.from(compatibilitySource).toString('base64')}`)

assert.equal(compatibility.chatTimestampMs(1710000000000), 1710000000000)
assert.equal(compatibility.chatTimestampMs('2024-03-09T16:00:00.000Z'), 1710000000000)
assert.equal(compatibility.chatTimestampMs({ seconds: 1710000000 }), 1710000000000)
assert.equal(compatibility.chatTimestampMs({ _seconds: 1710000000, _nanoseconds: 500_000_000 }), 1710000000500)

const legacyEvents = [
  ['João aceitou o pedido.', 'pedido_aceito'],
  ['Atendimento iniciado.', 'atendimento_iniciado'],
  ['Profissional informou que chegou ao local.', 'atendimento_chegou'],
  ['João solicitou a finalização do atendimento.', 'finalizacao_solicitada'],
  ['Serviço concluído.', 'atendimento_finalizado'],
  ['Agendamento confirmado.', 'agendamento_aceito'],
]
for (const [texto, eventType] of legacyEvents) {
  assert.equal(
    compatibility.normalizeChatMessage({ autorId: 'sistema', texto }).eventType,
    eventType,
    `${texto} vira evento conhecido`,
  )
}

assert.equal(
  compatibility.normalizeChatMessage({ userId: 'A', texto: 'Atendimento iniciado.' }).renderKind,
  'message',
  'texto de usuário nunca vira evento apenas pelo conteúdo',
)
assert.equal(
  compatibility.normalizeChatMessage({ userId: 'A', tipo: 'sistema', texto: 'Atendimento iniciado.' }).renderKind,
  'message',
  'tipo isolado não permite que usuário imite evento legado',
)
assert.equal(
  compatibility.normalizeChatMessage({ autorId: 'sistema', texto: 'Podemos combinar outro horário?' }).renderKind,
  'message',
  'mensagem de sistema ambígua permanece balão normal',
)
assert.equal(
  compatibility.normalizeChatMessage({ sistema: true, autorId: 'sistema', evento: 'pedido_aceito', texto: '✓ Pedido aceito.' }).renderKind,
  'event',
  'evento novo confiável continua na timeline',
)

const legacyNormal = compatibility.normalizeChatMessage({
  autorId: 'A',
  autorNome: 'Cliente',
  mensagem: 'Mensagem antiga preservada',
  sentAt: 1000,
  attachment: { tipo: 'arquivo', url: 'https://example.invalid/legacy.pdf' },
})
assert.equal(legacyNormal.texto, 'Mensagem antiga preservada')
assert.equal(legacyNormal.autor, 'Cliente')
assert.equal(legacyNormal.timestampMs, 1000)
assert.equal(legacyNormal.anexo.tipo, 'arquivo')

const merged = compatibility.normalizeAndMergeChatMessages(
  {
    shared: { userId: 'A', texto: 'Versão canônica', criadoEm: 3000 },
    current: { userId: 'B', texto: 'Mensagem nova', timestamp: 4000 },
  },
  {
    legacy: { autorId: 'A', mensagem: 'Mensagem legada', sentAt: 1000 },
    shared: { autorId: 'A', mensagem: 'Espelho antigo', timestamp: 2000 },
  },
)
assert.deepEqual(merged.map((message) => message.id), ['legacy', 'shared', 'current'])
assert.equal(merged[1].texto, 'Versão canônica', 'registro canônico vence o espelho com o mesmo ID')

const chronologicalScenario = {
  messageA: {
    userId: 'A',
    texto: 'Mensagem A',
    hora: 1_000,
    criadoEm: 1_000,
    criadoEmServer: 1_000,
  },
  arrived: {
    tipo: 'sistema',
    sistema: true,
    autorId: 'sistema',
    evento: 'atendimento_chegou',
    eventId: 'system:pedido:atendimento_chegou',
    texto: '✓ Profissional informou que chegou ao local.',
    hora: 2_000,
    criadoEm: 2_000,
  },
  messageB: {
    userId: 'B',
    texto: 'Mensagem B',
    hora: 1_500,
    criadoEm: 1_500,
    criadoEmServer: 3_000,
  },
  messageC: {
    userId: 'A',
    texto: 'Mensagem C',
    hora: 5_500,
    criadoEm: 5_500,
    criadoEmServer: 4_000,
  },
  received: {
    userId: 'B',
    texto: 'Mensagem recebida',
    hora: 2_500,
    criadoEm: 2_500,
    criadoEmServer: 5_000,
  },
}

const expectedChronology = ['messageA', 'arrived', 'messageB', 'messageC', 'received']
const afterEachSnapshot = [
  { messageA: chronologicalScenario.messageA, arrived: chronologicalScenario.arrived },
  { messageB: chronologicalScenario.messageB, arrived: chronologicalScenario.arrived, messageA: chronologicalScenario.messageA },
  { messageC: chronologicalScenario.messageC, messageA: chronologicalScenario.messageA, messageB: chronologicalScenario.messageB, arrived: chronologicalScenario.arrived },
  { received: chronologicalScenario.received, messageC: chronologicalScenario.messageC, arrived: chronologicalScenario.arrived, messageB: chronologicalScenario.messageB, messageA: chronologicalScenario.messageA },
]
const expectedAfterSnapshot = [
  ['messageA', 'arrived'],
  ['messageA', 'arrived', 'messageB'],
  ['messageA', 'arrived', 'messageB', 'messageC'],
  expectedChronology,
]
afterEachSnapshot.forEach((snapshot, index) => {
  assert.deepEqual(
    compatibility.normalizeAndMergeChatMessages(snapshot, {}).map((message) => message.id),
    expectedAfterSnapshot[index],
    `snapshot ${index + 1} preserva a cronologia`,
  )
})

const participantA = compatibility.normalizeAndMergeChatMessages(
  Object.fromEntries(Object.entries(chronologicalScenario).reverse()),
  { arrived: chronologicalScenario.arrived },
)
const participantB = compatibility.normalizeAndMergeChatMessages(
  chronologicalScenario,
  { arrived: chronologicalScenario.arrived },
)
assert.deepEqual(participantA.map((message) => message.id), expectedChronology, 'reload/remount preserva a ordem')
assert.deepEqual(participantB.map((message) => message.id), expectedChronology, 'ambos os participantes veem a mesma ordem')
assert.equal(participantA[2].timestampMs, 3_000, 'timestamp autoritativo do servidor vence relógio local atrasado')
assert.deepEqual(
  participantA.map(({ id, type, timestamp, senderId, content }) => ({ id, type, timestamp, senderId, content })),
  participantB.map(({ id, type, timestamp, senderId, content }) => ({ id, type, timestamp, senderId, content })),
  'todos os itens usam o mesmo formato canônico',
)

const unresolvedServerTimestamp = compatibility.normalizeChatMessage({
  texto: 'Estou no local.',
  userId: 'A',
  criadoEmServer: { '.sv': 'timestamp' },
  criadoEm: 6_000,
  hora: 6_000,
}, { id: 'unresolved' })
assert.equal(unresolvedServerTimestamp.timestampMs, 6_000, 'placeholder ainda não resolvido usa timestamp local válido temporariamente')

const invalidLegacyHour = compatibility.normalizeChatMessage({
  texto: 'Mensagem legada com hora textual',
  hora: '16:20',
  criadoEm: 7_000,
}, { id: 'legacy-hour' })
assert.equal(invalidLegacyHour.timestampMs, 7_000, 'hora inválida não esconde criadoEm válido')

const equalTimestampFirst = compatibility.normalizeAndMergeChatMessages({
  z: { texto: 'Z', criadoEm: 8_000 },
  a: { texto: 'A', criadoEm: 8_000 },
}, {})
const equalTimestampReload = compatibility.normalizeAndMergeChatMessages({
  a: { texto: 'A', criadoEm: 8_000 },
  z: { texto: 'Z', criadoEm: 8_000 },
}, {})
assert.deepEqual(equalTimestampFirst.map((message) => message.id), ['a', 'z'])
assert.deepEqual(equalTimestampReload.map((message) => message.id), ['a', 'z'], 'empate usa ID estável, não ordem do snapshot')

const [chatSource, chatPage, systemRoute, progressSource, progressModelSource] = await Promise.all([
  read('../src/components/ChatMensagens.jsx'),
  read('../src/app/chat/[pedidoId]/page.jsx'),
  read('../src/app/api/chat/system/route.js'),
  read('../src/components/AttendanceProgress.jsx'),
  read('../src/lib/attendanceProgress.js'),
])

assert.match(chatSource, /`chats\/\$\{pedidoId\}`/)
assert.match(chatSource, /`mensagens\/\$\{pedidoId\}`/, 'espelho legado é lido sem migração')
assert.match(chatSource, /normalizeAndMergeChatMessages/, 'normalização acontece somente antes da renderização')
assert.doesNotMatch(compatibilitySource, /from ['"][^'"]*firebase|ref\(database|serverTimestamp/, 'adaptador puro não escreve no Firebase')
assert.doesNotMatch(chatSource, /eventType: 'atendimento_intro'/, 'abrir histórico não cria mensagem automática')
assert.match(chatSource, /Anexo antigo indisponível/, 'anexo legado inseguro falha fechado')
assert.doesNotMatch(chatSource, /avaliacoes\/\$\{pedidoId\}/, 'chat não consulta avaliação canônica ausente antes de confirmar sua existência')
assert.match(chatSource, /pedido\?\.avaliacao \|\| serviceRecord\?\.avaliacao/, 'avaliação usa o espelho privado e atômico do atendimento')
assert.match(chatSource, /<AttendanceProgress/, 'chat legado e novo compartilham o tracker único')
assert.match(progressModelSource, /status === ATENDIMENTO_STATUS\.FINALIZADO \|\| index < statusIndex/, 'tracker finalizado marca todas as etapas')
assert.match(progressSource, /grid grid-cols-6/, 'tracker de seis etapas permanece compacto no mobile')
assert.doesNotMatch(progressSource, /content-visibility|overflow-x-auto/, 'tracker não desaparece nem vira carrossel')
assert.match(chatSource, /const atendimento = pedido \|\| serviceRecord/, 'tracker usa registro autoritativo atual')
assert.match(chatPage, /serviceRecord=\{pedidoChat\}/, 'pedido e privateRequest chegam ao mesmo layout')
assert.match(chatPage, /<ChatMensagens/, 'a rota dedicada monta a UI única do chat')
assert.match(systemRoute, /verifyIdToken/, 'eventos novos continuam autenticados no servidor')
assert.match(systemRoute, /isTrustedSystemMessage/, 'eventos novos continuam no caminho C6')

console.log('Chat legado: concluído/ativo, eventos confiáveis, balões normais, avaliação, anexos, timestamps e conversa nova OK')
