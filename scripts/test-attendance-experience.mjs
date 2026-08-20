import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function importSource(path, transform = (source) => source) {
  const source = transform(await readFile(new URL(path, import.meta.url), 'utf8'))
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const conversations = await importSource('../src/lib/conversations.js')
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

const serviceExperience = await importSource('../src/lib/serviceExperience.js', (source) => source.replace(
  /import \{ ATENDIMENTO_STATUS, normalizeAtendimentoStatus \} from '@\/lib\/atendimento'\s*/,
  `const ATENDIMENTO_STATUS = {
    ACEITO: 'aceito', EM_ANDAMENTO: 'em_andamento', CHEGOU: 'chegou',
    AGUARDANDO_CONFIRMACAO: 'aguardando_confirmacao', FINALIZADO: 'finalizado'
  };
  const normalizeAtendimentoStatus = (value) => String(value || '').toLowerCase();\n`,
))

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
  publicProfile,
  pedidoStatus: 'finalizado',
  isParticipant: true,
}), '')
assert.equal(serviceExperience.getPrimaryAttendanceAction({ status: 'aceito', isWorker: true })?.id, 'start')
assert.equal(serviceExperience.getPrimaryAttendanceAction({ status: 'aguardando_confirmacao', isClient: true })?.clientDecision, true)
assert.equal(serviceExperience.getPrimaryAttendanceAction({ status: 'finalizado', isClient: true, hasRating: true }), null)

const [chat, rating, map, profile] = await Promise.all([
  readFile(new URL('../src/components/ChatMensagens.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/serviceRatings.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/Mapadinamico.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PerfilPublico.jsx', import.meta.url), 'utf8'),
])

assert.doesNotMatch(chat, /window\.confirm\(/, 'confirmação usa diálogo acessível, não prompt nativo')
assert.doesNotMatch(chat, /status:\s*['"]concluido['"]/, 'chat não mantém finalização paralela legada')
assert.match(chat, /Ainda não/)
assert.match(chat, /AvaliacaoAtendimentoModal/)
assert.match(rating, /avaliacoes\/\$\{payload\.pedidoId\}/)
assert.match(rating, /avaliacaoPendente`\]: false/)
assert.match(map, /saveCanonicalServiceRating/)
assert.match(profile, /allowPublicContact[\s\S]*whatsapp/)

console.log('Experiência de atendimento: ordenação, dedupe, estados, avaliação única e telefone autorizado OK')
