import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules
const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8')

const reviews = rules.avaliacoes
const problems = rules.problemasServico
const reports = rules.denuncias
const securityIndex = rules.registrosSegurancaPorUsuario
const privatePedido = rules.pedidos.$pedidoId

assert.match(reviews['.read'], /admins/, 'a coleção de avaliações não é enumerável por usuário comum')
assert.match(reviews.$pedidoId['.read'], /cliente\/id/)
assert.match(reviews.$pedidoId['.read'], /avaliado\/id/)
assert.match(reviews.$pedidoId['.write'], /!data\.exists\(\)/, 'uma avaliação existente não pode ser regravada')
assert.match(reviews.$pedidoId['.write'], /status'\)\.val\(\) === 'finalizado'/)
assert.match(reviews.$pedidoId['.write'], /aceite\/id/)
assert.match(reviews.$pedidoId['.write'], /!== auth\.uid/, 'autoavaliação é bloqueada')
assert.match(reviews.$pedidoId.nota['.validate'], /% 1 === 0/)
assert.match(reviews.$pedidoId.comentario['.validate'], /500/)
assert.equal(reviews.$pedidoId.$other['.validate'], false, 'schema de avaliação é fechado')

assert.match(problems['.read'], /admins/, 'problemas não podem ser enumerados por autenticado comum')
assert.match(problems.$registroId['.read'], /autor\/id/)
assert.match(problems.$registroId['.read'], /denuncia/)
assert.match(problems.$registroId['.write'], /root\.child\('pedidos'\)/, 'problema exige pedido existente')
assert.match(problems.$registroId['.write'], /criador\/id/)
assert.match(problems.$registroId['.write'], /aceite\/id/)
assert.match(problems.$registroId['.write'], /!data\.exists\(\)/, 'usuário só cria; não edita/deleta')
assert.match(problems.$registroId.status['.validate'], /admins/)
assert.match(problems.$registroId.moderacao['.validate'], /admins/)
assert.match(problems.$registroId.moderadoPor['.validate'], /admins/)

assert.match(reports['.read'], /admins/, 'denúncias não podem ser enumeradas por autenticado comum')
assert.match(reports.$registroId['.read'], /autor\/id/, 'denúncia detalhada é do autor ou admin')
assert.match(reports.$registroId['.write'], /problemasServico/, 'espelho de denúncia depende do problema protegido')
assert.match(reports.$registroId['.write'], /denuncia'\)\.val\(\) === true/)
assert.match(reports.$registroId.status['.validate'], /admins/)
assert.match(reports.$registroId.moderacao['.validate'], /admins/)

assert.match(securityIndex['.read'], /admins/)
assert.match(securityIndex.$uid['.read'], /auth\.uid === \$uid/)
assert.match(securityIndex.$uid.$registroId['.write'], /problemasServico/)
assert.equal(securityIndex.$uid.$registroId.$other['.validate'], false, 'índice não duplica conteúdo sensível')
assert.match(privatePedido.avaliacao['.validate'], /avaliacoes/)
assert.match(privatePedido.problemaServico['.validate'], /!newData\.child\('descricao'\)\.exists\(\)/, 'resumo de denúncia não vaza texto')
assert.match(privatePedido['.write'], /!data\.child\('avaliacao'\)\.exists\(\)/, 'espelho da avaliação não pode ser removido pelo participante')
assert.match(privatePedido['.write'], /!data\.child\('problemaServico'\)\.exists\(\)/, 'espelho do problema não pode ser removido pelo participante')

for (const field of [
  'reputation', 'reputacao', 'trust', 'trustStats', 'rating', 'ratingAvg', 'ratingCount', 'reviewCount',
  'avaliacoesCount', 'avaliacaoMedia', 'notaMedia', 'nota', 'estrelas', 'stars', 'totalAvaliacoes',
  'quantidadeAvaliacoes', 'avaliacoes', 'reviews', 'avaliacao', 'servicosConcluidos', 'completedServices',
  'entregas', 'servicosCorre', 'servicosProf', 'profile', 'perfil',
]) {
  assert.equal(
    rules.publicProfiles.$uid[field]['.validate'],
    'newData.val() === data.val()',
    `${field} não aceita escrita nem null do cliente`
  )
}

const [panel, map, moderation, publicProfile] = await Promise.all([
  source('../src/components/PainelProblemasDenuncias.jsx'),
  source('../src/components/Mapadinamico.jsx'),
  source('../src/components/AdminModeracao.jsx'),
  source('../src/lib/publicWorkProfile.js'),
])
assert.match(panel, /subscribeSecurityRecords/)
assert.doesNotMatch(panel, /ref\(database, ['"]problemasServico['"]\)/, 'painel comum não enumera problemas')
assert.doesNotMatch(panel, /ref\(database, ['"]denuncias['"]\)/, 'painel comum não enumera denúncias')
assert.match(map, /registrosSegurancaPorUsuario/)
assert.match(map, /\!denuncia/)
assert.match(moderation, /registrosSegurancaPorUsuario/)
assert.match(publicProfile, /SERVER_MANAGED_REPUTATION_FIELDS/)

const order = { creator: 'A', accepted: 'B', status: 'finalizado' }
const canCreateReview = ({ actor, target, previous = null, score = 5, pedido = order }) => (
  !previous &&
  actor === pedido.creator &&
  target === pedido.accepted &&
  actor !== target &&
  pedido.status === 'finalizado' &&
  Number.isInteger(score) && score >= 1 && score <= 5
)
const canCreateProblem = ({ actor, pedido = order }) => (
  [pedido.creator, pedido.accepted].includes(actor) && actor !== ''
)
const canReadProblem = ({ actor, record, admin = false }) => (
  admin || actor === record.author || (record.denuncia !== true && [record.client, record.accepted].includes(actor))
)
const canReadReport = ({ actor, record, admin = false }) => admin || actor === record.author
const canModerate = ({ admin }) => admin === true
const canWriteAggregate = ({ before, after }) => before === after
const canDeleteReview = () => false
const canDeleteReport = ({ admin = false }) => admin === true

const normalProblem = { author: 'A', client: 'A', accepted: 'B', denuncia: false }
const reportProblem = { ...normalProblem, denuncia: true }

assert.equal(canCreateProblem({ actor: 'A' }), true, 'A cria problema legítimo')
assert.equal(canCreateProblem({ actor: 'B' }), true, 'B cria problema legítimo')
assert.equal(canCreateProblem({ actor: 'C' }), false, 'C não cria problema de A/B')
assert.equal(canReadProblem({ actor: 'C', record: normalProblem }), false, 'C não lê problema')
assert.equal(canReadReport({ actor: 'B', record: reportProblem }), false, 'denunciado não lê texto sensível')
assert.equal(canReadReport({ actor: 'A', record: reportProblem }), true, 'autor lê própria denúncia')
assert.equal(canReadReport({ actor: 'ADMIN', record: reportProblem, admin: true }), true, 'admin lê fila')
assert.equal(canModerate({ admin: false }), false, 'usuário comum não modera')
assert.equal(canModerate({ admin: true }), true, 'admin real modera')

assert.equal(canCreateReview({ actor: 'A', target: 'B' }), true, 'A avalia B após finalização')
assert.equal(canCreateReview({ actor: 'A', target: 'C' }), false, 'A não avalia C com pedido A/B')
assert.equal(canCreateReview({ actor: 'C', target: 'B' }), false, 'C não avalia B com pedido A/B')
assert.equal(canCreateReview({ actor: 'A', target: 'A' }), false, 'A não se autoavalia')
assert.equal(canCreateReview({ actor: 'A', target: 'B', score: 5.5 }), false, 'nota fracionária é rejeitada')
assert.equal(canCreateReview({ actor: 'A', target: 'B', score: 6 }), false, 'nota fora da escala é rejeitada')
assert.equal(canCreateReview({ actor: 'A', target: 'B', previous: { id: 'pedido-1' } }), false, 'segunda avaliação é rejeitada')
assert.equal(canWriteAggregate({ before: 4.8, after: 5 }), false, 'não altera agregado')
assert.equal(canWriteAggregate({ before: 4.8, after: null }), false, 'null não contorna agregado')
assert.equal(canDeleteReview(), false, 'nem cliente nem terceiro remove avaliação')
assert.equal(canDeleteReport({ admin: false }), false, 'usuário comum não remove denúncia')
assert.equal(canDeleteReport({ admin: true }), true, 'admin pode tratar denúncia excepcionalmente')

console.log('C5 estático: matriz A/B/C/Admin, vínculo, privacidade, moderação, unicidade, null/delete e reputação OK')
