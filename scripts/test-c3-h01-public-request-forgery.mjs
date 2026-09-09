import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules
const policySource = await readFile(new URL('../src/lib/pedidoPublication.js', import.meta.url), 'utf8')
const policy = await import('data:text/javascript;base64,' + Buffer.from(policySource).toString('base64'))
const publicRequestsSource = await readFile(new URL('../src/lib/publicRequests.js', import.meta.url), 'utf8')
const publicRequests = await import('data:text/javascript;base64,' + Buffer.from(publicRequestsSource).toString('base64'))
const claimRoute = await readFile(new URL('../src/app/api/pedidos/claim/route.js', import.meta.url), 'utf8')
const projectionRoute = await readFile(new URL('../src/app/api/pedidos/public-request/route.js', import.meta.url), 'utf8')
const projectionClient = await readFile(new URL('../src/lib/pedidoProjectionClient.js', import.meta.url), 'utf8')
const atendimento = await readFile(new URL('../src/lib/atendimento.js', import.meta.url), 'utf8')
const pedidoPage = await readFile(new URL('../src/app/pedido/[pedidoId]/page.jsx', import.meta.url), 'utf8')
const modalWriter = await readFile(new URL('../src/components/ModalIA.jsx', import.meta.url), 'utf8')
const pedidosWriter = await readFile(new URL('../src/lib/pedidos.js', import.meta.url), 'utf8')
const mapaPedidosWriter = await readFile(new URL('../src/lib/mapapedidos.js', import.meta.url), 'utf8')
const clientOrderWriter = await readFile(new URL('../src/lib/clientOrders.js', import.meta.url), 'utf8')
const createOrderRoute = await readFile(new URL('../src/app/api/pedidos/create/route.js', import.meta.url), 'utf8')
const mapSource = await readFile(new URL('../src/components/Mapadinamico.jsx', import.meta.url), 'utf8')

const privatePedidoRules = rules.pedidos.$pedidoId
const publicRequestRules = rules.publicRequests.$pedidoId

const preFixH01 = {
  publicCreation: "auth != null && (!data.exists() && newData.exists() && newData.child('criador/id').val() === auth.uid && newData.child('status').val() === 'aberto')",
  privateRead: "root.child('publicRequests').child($pedidoId).child('aceite/id').val() === auth.uid",
  privateWrite: "newData.child('aceite/id').val() === auth.uid && root.child('publicRequests').child($pedidoId).child('aceite/id').val() === auth.uid",
}
assert.doesNotMatch(preFixH01.publicCreation, /root\.child\('pedidos'\)/, 'reprodução pré-correção: C podia criar espelho sem consultar pedido privado')
assert.match(preFixH01.privateRead, /publicRequests/, 'reprodução pré-correção: leitura privada confiava no aceite público')
assert.match(preFixH01.privateWrite, /publicRequests/, 'reprodução pré-correção: escrita privada confiava no aceite público')

assert.match(publicRequestRules['.write'], /^auth != null && root\.child\('admins'\)\.child\(auth\.uid\)\.val\(\) === true$/, 'cliente autenticado não grava publicRequests diretamente')
for (const rule of [
  privatePedidoRules['.read'],
  privatePedidoRules['.write'],
  privatePedidoRules['.validate'],
  privatePedidoRules.status['.validate'],
]) {
  assert.doesNotMatch(rule, /publicRequests/, 'nenhuma autorização privada consulta a projeção pública')
}
assert.match(privatePedidoRules.publicacao['.validate'], /admins/, 'somente backend/Admin SDK cria o marcador privado de publicação')

const canReadPrivate = (pedido, uid) => [pedido?.criador?.id, pedido?.aceite?.id].includes(uid)
const canClientWritePrivate = (pedido, uid) => pedido?.criador?.id === uid || pedido?.aceite?.id === uid
const visibleExactLocation = (pedido, uid) => canReadPrivate(pedido, uid) ? pedido.local : null

const pedidoX = {
  id: 'X',
  titulo: 'Pedido privado legado',
  status: 'aberto',
  criador: { id: 'A', nome: 'Cliente A' },
  local: { lat: -23.5505199, lng: -46.6333094 },
}
const publicFakeQuePareceLegitima = {
  id: 'X',
  status: 'aberto',
  criador: { id: 'A', nome: 'Cliente A' },
}

assert.equal(
  publicRequests.normalizePublicRequest('PUBLIC_KEY', { id: 'STALE_INTERNAL_ID', status: 'aberto' }).id,
  'PUBLIC_KEY',
  'a chave real de publicRequests vence qualquer id interno legado na navegação/claim',
)

assert.equal(policy.canSynchronizePublicRequest({ pedido: pedidoX, pedidoId: 'X', actorUid: 'C' }), false, 'C não consegue derivar projeção para pedido de A')
assert.equal(policy.hasDiscoverablePublicProjection({ pedido: pedidoX, pedidoId: 'X', publicRequest: publicFakeQuePareceLegitima }), true, 'a simulação mostra que aparência pública não é autoridade')
assert.equal(policy.canStartAuthoritativeClaim({ pedido: pedidoX, pedidoId: 'X', actorUid: 'C' }), false, 'projeção falsa não supre marcador privado autoritativo')
assert.equal(canReadPrivate(pedidoX, 'C'), false, 'C não se torna participante privado')
assert.equal(visibleExactLocation(pedidoX, 'C'), null, 'C não lê local exato após tentar a projeção falsa')
assert.equal(canClientWritePrivate(pedidoX, 'C'), false, 'C não altera pedidos/X diretamente')
assert.equal(canReadPrivate(pedidoX, 'A'), true, 'A continua vendo o próprio pedido')
assert.equal(policy.canStartAuthoritativeClaim({ pedido: pedidoX, pedidoId: 'X', actorUid: 'B' }), false, 'pedido legado sem marcador/projeção confiável falha fechado')

const pedidoPublicado = {
  ...pedidoX,
  publicacao: policy.createPublicationStamp({ pedido: pedidoX, pedidoId: 'X', now: 1 }),
}
const publicA1 = publicRequests.buildPublicRequest({ ...pedidoPublicado, id: 'X' })
assert.equal(publicA1.id, pedidoPublicado.id, 'A1 privado e público preservam o mesmo ID')
assert.equal(publicA1.status, 'aberto', 'A1 nasce aberto nos dois caminhos')
assert.equal(policy.hasAuthoritativePublication(pedidoPublicado, 'X'), true, 'marcador privado deriva a publicação de X')
assert.equal(policy.canStartAuthoritativeClaim({ pedido: pedidoPublicado, pedidoId: 'X', actorUid: 'B' }), true, 'B pode iniciar o claim legítimo')
assert.equal(policy.assessAuthoritativeClaim({
  pedido: pedidoPublicado,
  pedidoId: 'X',
  actorUid: 'B',
  publicRequest: publicFakeQuePareceLegitima,
}).abortReason, '', 'public-request 200 com estado privado aberto e marcador válido permite claim de B')
assert.equal(policy.assessAuthoritativeClaim({ pedido: null, pedidoId: 'X', actorUid: 'B', publicRequest: publicFakeQuePareceLegitima }).abortReason, 'private_request_missing')
assert.equal(policy.assessAuthoritativeClaim({ pedido: { id: 'X', status: 'aberto' }, pedidoId: 'X', actorUid: 'B', publicRequest: publicFakeQuePareceLegitima }).abortReason, 'creator_mismatch')
assert.equal(policy.assessAuthoritativeClaim({ pedido: { ...pedidoPublicado, status: 'cancelado' }, pedidoId: 'X', actorUid: 'B', publicRequest: publicFakeQuePareceLegitima }).abortReason, 'status_not_open')
assert.equal(policy.assessAuthoritativeClaim({ pedido: pedidoX, pedidoId: 'X', actorUid: 'B', publicRequest: publicFakeQuePareceLegitima }).abortReason, 'publication_missing')
assert.equal(policy.assessAuthoritativeClaim({
  pedido: { ...pedidoPublicado, publicacao: { ...pedidoPublicado.publicacao, versao: 999 } },
  pedidoId: 'X',
  actorUid: 'B',
  publicRequest: publicFakeQuePareceLegitima,
}).abortReason, 'publication_invalid')
assert.equal(policy.assessAuthoritativeClaim({
  pedido: pedidoPublicado,
  pedidoId: 'X',
  actorUid: 'B',
  publicRequest: { ...publicFakeQuePareceLegitima, criador: { id: 'C' } },
}).abortReason, 'creator_mismatch')
assert.equal(policy.assessAuthoritativeClaim({
  pedido: { ...pedidoPublicado, aceite: { id: 123 } },
  pedidoId: 'X',
  actorUid: 'B',
  publicRequest: publicFakeQuePareceLegitima,
}).abortReason, '', 'aceite legado sem UID string não é classificado falsamente como already_accepted')
assert.equal(policy.assessAuthoritativeClaim({
  pedido: { ...pedidoPublicado, aceite: { id: 'x'.repeat(129) } },
  pedidoId: 'X',
  actorUid: 'B',
  publicRequest: publicFakeQuePareceLegitima,
}).abortReason, 'claim_conflict', 'identidade de aceite inválida falha fechada sem fingir already_accepted')

for (const [label, aceite] of [
  ['ausente', undefined],
  ['null', null],
  ['objeto vazio', {}],
  ['id ausente', { nome: 'Sem identidade' }],
  ['id vazio', { id: '' }],
]) {
  const candidate = { ...pedidoPublicado }
  if (aceite !== undefined) candidate.aceite = aceite
  assert.equal(policy.canStartAuthoritativeClaim({ pedido: candidate, pedidoId: 'X', actorUid: 'B' }), true, `aceite ${label} continua livre`)
  assert.notEqual(policy.getAuthoritativeClaimBlockReason({ pedido: candidate, pedidoId: 'X', actorUid: 'B' }), 'already_accepted')
}
assert.equal(
  policy.getAuthoritativeClaimBlockReason({ pedido: { ...pedidoPublicado, aceite: { id: 'profissional-valido' } }, pedidoId: 'X', actorUid: 'B' }),
  'already_accepted',
  'somente aceite com UID não vazio bloqueia como já aceito',
)

const pedidoAceitoPorB = policy.buildAuthoritativeClaim({
  pedido: pedidoPublicado,
  pedidoId: 'X',
  actorUid: 'B',
  actorName: 'Profissional B',
  actorLocation: { lat: -23.56, lng: -46.64 },
  now: 2,
})
assert.equal(pedidoAceitoPorB.aceite.id, 'B', 'o primeiro claim legítimo persiste B no pedido privado')
assert.equal(
  policy.buildAuthoritativeClaimTransactionValue({ pedido: null, pedidoId: 'X', actorUid: 'B' }),
  null,
  'cache local inicialmente vazio não aborta a transação antes da leitura autoritativa do RTDB',
)
assert.equal(
  policy.buildAuthoritativeClaimTransactionValue({ pedido: pedidoPublicado, pedidoId: 'X', actorUid: 'B', actorName: 'Profissional B', now: 2 }).aceite.id,
  'B',
  'nova invocação do callback com o valor do servidor conclui o claim legítimo',
)
assert.equal(policy.canStartAuthoritativeClaim({ pedido: pedidoAceitoPorB, pedidoId: 'X', actorUid: 'C' }), false, 'C perde a concorrência após B vencer')
assert.equal(canReadPrivate(pedidoAceitoPorB, 'B'), true, 'B recebe acesso privado somente após o aceite autoritativo')
assert.equal(canReadPrivate(pedidoAceitoPorB, 'C'), false, 'C continua sem acesso privado depois da concorrência')
assert.equal(visibleExactLocation(pedidoAceitoPorB, 'C'), null, 'C não recebe local de A nem local de B')
assert.equal(canClientWritePrivate(pedidoAceitoPorB, 'C'), false, 'C não ganha escrita privada')

const pedidoCriadoPorB = {
  id: 'B1',
  titulo: 'Pedido de B',
  status: 'aberto',
  criador: { id: 'B', nome: 'Cliente B' },
}
pedidoCriadoPorB.publicacao = policy.createPublicationStamp({ pedido: pedidoCriadoPorB, pedidoId: 'B1', now: 3 })
const publicB1 = publicRequests.buildPublicRequest(pedidoCriadoPorB)
assert.equal(publicB1.id, pedidoCriadoPorB.id, 'B1 privado e público preservam o mesmo ID')
assert.equal(publicB1.status, 'aberto', 'B1 nasce aberto nos dois caminhos')
assert.equal(policy.getAuthoritativeClaimBlockReason({ pedido: pedidoCriadoPorB, pedidoId: 'B1', actorUid: 'B' }), 'own_request')
const pedidoBAceitoPorA = policy.buildAuthoritativeClaim({
  pedido: pedidoCriadoPorB,
  pedidoId: 'B1',
  actorUid: 'A',
  actorName: 'Profissional A',
  now: 4,
})
assert.equal(pedidoBAceitoPorA.aceite.id, 'A', 'A aceita pedido canônico de B')
assert.equal(policy.getAuthoritativeClaimBlockReason({ pedido: pedidoBAceitoPorA, pedidoId: 'B1', actorUid: 'C' }), 'already_accepted')
assert.equal(canReadPrivate(pedidoBAceitoPorA, 'B'), true, 'B continua vendo B1 em Meus pedidos')
assert.equal(canReadPrivate(pedidoBAceitoPorA, 'C'), false, 'C não participa de B1')

assert.match(projectionRoute, /verifyIdToken/, 'sincronização da projeção autentica ID token')
assert.match(projectionRoute, /getFirebaseAdminDatabase/, 'sincronização lê pedido autoritativo com Admin SDK')
assert.match(projectionRoute, /buildPublicRequest/, 'projeção usa schema sanitizado conhecido')
assert.match(projectionRoute, /createPublicationStamp/, 'backend grava marcador privado junto da projeção')
assert.ok(
  projectionRoute.indexOf("database.ref('pedidos/' + pedidoId).get()") < projectionRoute.indexOf("['publicRequests/' + pedidoId]: projection"),
  'backend lê a origem privada antes de criar a projeção pública',
)
for (const [label, writer] of [
  ['ModalIA', modalWriter],
  ['pedidos.js', pedidosWriter],
  ['mapapedidos.js', mapaPedidosWriter],
]) {
  assert.match(writer, /createAuthorizedClientOrder/, `${label} delega criação à autoridade backend`)
  assert.doesNotMatch(writer, /update\(ref\(database, `pedidos\//, `${label} não grava pedido privado diretamente`)
  assert.doesNotMatch(writer, /synchronizePublicRequest\(payload\.id/, `${label} não publica projeção pelo navegador`)
}
assert.match(clientOrderWriter, /Authorization: `Bearer \$\{token\}`/, 'cliente envia ID token ao backend de criação')
assert.match(clientOrderWriter, /\/api\/pedidos\/create/, 'cliente usa a rota autoritativa de criação')
assert.match(createOrderRoute, /getAuthenticatedUid/, 'criação backend valida autenticação')
assert.match(createOrderRoute, /clientOrderCreationLocks/, 'criação backend serializa tentativas concorrentes')
assert.match(createOrderRoute, /buildPublicRequest/, 'criação backend deriva projeção sanitizada')
assert.match(createOrderRoute, /createPublicationStamp/, 'criação backend carimba publicação privada')
assert.match(createOrderRoute, /\[`pedidos\/\$\{id\}`\]: payload[\s\S]*\[`publicRequests\/\$\{id\}`\]: publication/, 'pedido privado e projeção pública entram no mesmo multipath')
assert.match(createOrderRoute, /clientFreeOrderUsed/, 'criação backend consome o benefício somente junto do pedido real')

const pedidoComIdForjadoEDadosPrivados = {
  ...pedidoPublicado,
  id: 'ID_CONTROLADO_POR_C',
  authUid: 'C',
  telefone: '(11) 99999-8888',
  endereco: { rua: 'Rua privada', numero: '123' },
  local: { lat: -23.5505199, lng: -46.6333094 },
  segredoInterno: { token: 'nao-publicar' },
}
const projectionBoundToPath = publicRequests.buildPublicRequest({ ...pedidoComIdForjadoEDadosPrivados, id: 'X' })
assert.equal(projectionBoundToPath.id, 'X', 'ID autoritativo do path substitui qualquer ID interno forjado')
assert.equal(projectionBoundToPath.criador.id, 'A', 'criador da projeção continua derivado do pedido privado correto')
assert.match(publicRequestRules.id['.validate'], /newData\.val\(\) === \$pedidoId/, 'Rules vinculam o ID público à chave autoritativa')
assert.equal(publicRequestRules.$other['.validate'], false, 'Rules rejeitam campos públicos fora do schema permitido')
const allowedPublicFields = new Set(Object.keys(publicRequestRules).filter((key) => !key.startsWith('.') && key !== '$other'))
for (const field of Object.keys(projectionBoundToPath)) {
  assert.equal(allowedPublicFields.has(field), true, `projeção não publica campo privado inesperado: ${field}`)
}
for (const field of ['authUid', 'telefone', 'endereco', 'local', 'segredoInterno', 'publicacao']) {
  assert.equal(Object.hasOwn(projectionBoundToPath, field), false, `projeção omite dado privado ${field}`)
}
assert.match(projectionRoute, /const projection = buildPublicRequest\(\{ \.\.\.pedido, id: pedidoId \}\)/, 'projeção sobrescreve ID interno com o ID validado do path')
assert.match(projectionRoute, /canSynchronizePublicRequest\(\{ pedido, pedidoId, actorUid: uid \}\)/, 'publicação vincula pedido, path e usuário autenticado')
assert.match(projectionRoute, /\['publicRequests\/' \+ pedidoId\]: projection[\s\S]*\['pedidos\/' \+ pedidoId \+ '\/publicacao'\]: stamp/, 'projeção e marcador autoritativo usam o mesmo ID no multipath')
assert.doesNotMatch(projectionRoute, /body\?\.(?:pedido\b|criador\b|aceite\b|actorUid\b|projection\b)/, 'cliente não fornece pedido, participantes ou projeção autoritativa')
assert.match(projectionRoute, /\['publicRequests\/' \+ pedidoId\]: null[\s\S]*\['pedidos\/' \+ pedidoId\]: null/, 'exclusão remove público e privado no mesmo multipath Admin')
assert.match(projectionRoute, /const authority = getPedidoAuthority\(pedido, pedidoId\)[\s\S]*!authority\.creatorId \|\| uid !== authority\.creatorId[\s\S]*403/, 'exclusão exige o criador autoritativo autenticado')
assert.doesNotMatch(projectionRoute, /console\.(?:log|info)\s*\(/, 'rota pública não mantém logs diagnósticos identificáveis')
assert.doesNotMatch(projectionRoute, /\bauthUid\b|creationIntegrity|\bintegrity\s*:/, 'resposta pública não inclui identidade ou integridade diagnóstica')
assert.doesNotMatch(mapSource, /remove\(ref\(database, `pedidos\/\$\{p\.id\}`\)\)/, 'frontend não mantém deleter privado isolado')
assert.match(claimRoute, /verifyIdToken/, 'claim autentica ID token')
assert.match(claimRoute, /transaction/, 'claim definitivo é transacional no pedido privado')
assert.match(claimRoute, /buildAuthoritativeClaimTransactionValue/, 'callback tolera o primeiro passe nulo do cache sem abortar o claim')
assert.match(claimRoute, /!result\.committed \|\| !claimedPedido \|\| typeof claimedPedido !== 'object'/, 'resultado nulo real continua falhando fechado')
assert.match(claimRoute, /assessAuthoritativeClaim/, 'claim classifica estado privado e projeção sanitizada')
assert.match(claimRoute, /reason === 'already_accepted'/, 'mensagem de concorrência só é usada para aceite identificado')
for (const reason of ['own_request', 'already_accepted', 'status_not_open', 'publication_missing', 'publication_invalid', 'private_request_missing', 'creator_mismatch', 'claim_conflict']) {
  assert.match(claimRoute, new RegExp(reason), `claim distingue ${reason}`)
}
assert.doesNotMatch(claimRoute, /console\.(?:log|info)\s*\(/, 'claim não mantém logs diagnósticos identificáveis')
assert.doesNotMatch(claimRoute, /\bauthUid\b|creationIntegrity|\bintegrity\s*:/, 'claim não devolve identidade ou integridade diagnóstica')
assert.doesNotMatch(claimRoute, /body\?\.(criador|aceite|actorUid)/, 'cliente não informa criador, aceitador nem identidade autoritativa')
assert.match(projectionClient, /Authorization:/, 'cliente envia token ao backend')
assert.match(atendimento, /claimPedidoAuthority/, 'UI usa o claim server-side')
assert.doesNotMatch(atendimento, /publicRequests\//, 'UI não cria disputa de autorização no nó público')

const publicListenerAt = pedidoPage.indexOf('`publicRequests/${pedidoId}`')
const privateGateAt = pedidoPage.indexOf('if (!pedidoId || !canReadPrivatePedido) return undefined')
const privateListenerAt = pedidoPage.indexOf('`pedidos/${pedidoId}`')
const claimGrantAt = pedidoPage.indexOf('setPrivateAccessGranted(true)')
assert.ok(publicListenerAt >= 0 && publicListenerAt < privateGateAt, 'pré-aceite começa na projeção pública sanitizada')
assert.ok(privateGateAt >= 0 && privateGateAt < privateListenerAt, 'listener privado fica atrás de participação/claim')
assert.ok(claimGrantAt > privateListenerAt, 'sucesso do claim libera explicitamente a transição privada')
assert.match(pedidoPage, /const pedido = privatePedido \|\| publicPedido/, 'dados privados substituem a projeção somente quando autorizados')

console.log('H-01 estático: forja C, legado fail-closed, concorrência B/C e sigilo de localização cobertos')
