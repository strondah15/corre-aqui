import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules
const policySource = await readFile(new URL('../src/lib/pedidoPublication.js', import.meta.url), 'utf8')
const policy = await import('data:text/javascript;base64,' + Buffer.from(policySource).toString('base64'))
const claimRoute = await readFile(new URL('../src/app/api/pedidos/claim/route.js', import.meta.url), 'utf8')
const projectionRoute = await readFile(new URL('../src/app/api/pedidos/public-request/route.js', import.meta.url), 'utf8')
const projectionClient = await readFile(new URL('../src/lib/pedidoProjectionClient.js', import.meta.url), 'utf8')
const atendimento = await readFile(new URL('../src/lib/atendimento.js', import.meta.url), 'utf8')

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
assert.equal(policy.hasAuthoritativePublication(pedidoPublicado, 'X'), true, 'marcador privado deriva a publicação de X')
assert.equal(policy.canStartAuthoritativeClaim({ pedido: pedidoPublicado, pedidoId: 'X', actorUid: 'B' }), true, 'B pode iniciar o claim legítimo')

const pedidoAceitoPorB = policy.buildAuthoritativeClaim({
  pedido: pedidoPublicado,
  pedidoId: 'X',
  actorUid: 'B',
  actorName: 'Profissional B',
  actorLocation: { lat: -23.56, lng: -46.64 },
  now: 2,
})
assert.equal(pedidoAceitoPorB.aceite.id, 'B', 'o primeiro claim legítimo persiste B no pedido privado')
assert.equal(policy.canStartAuthoritativeClaim({ pedido: pedidoAceitoPorB, pedidoId: 'X', actorUid: 'C' }), false, 'C perde a concorrência após B vencer')
assert.equal(canReadPrivate(pedidoAceitoPorB, 'B'), true, 'B recebe acesso privado somente após o aceite autoritativo')
assert.equal(canReadPrivate(pedidoAceitoPorB, 'C'), false, 'C continua sem acesso privado depois da concorrência')
assert.equal(visibleExactLocation(pedidoAceitoPorB, 'C'), null, 'C não recebe local de A nem local de B')
assert.equal(canClientWritePrivate(pedidoAceitoPorB, 'C'), false, 'C não ganha escrita privada')

assert.match(projectionRoute, /verifyIdToken/, 'sincronização da projeção autentica ID token')
assert.match(projectionRoute, /getFirebaseAdminDatabase/, 'sincronização lê pedido autoritativo com Admin SDK')
assert.match(projectionRoute, /buildPublicRequest/, 'projeção usa schema sanitizado conhecido')
assert.match(projectionRoute, /createPublicationStamp/, 'backend grava marcador privado junto da projeção')
assert.match(claimRoute, /verifyIdToken/, 'claim autentica ID token')
assert.match(claimRoute, /transaction/, 'claim definitivo é transacional no pedido privado')
assert.match(claimRoute, /canStartAuthoritativeClaim/, 'claim depende do estado privado autoritativo')
assert.match(claimRoute, /hasDiscoverablePublicProjection/, 'publicação é somente pré-condição de descoberta')
assert.doesNotMatch(claimRoute, /body\?\.(criador|aceite|actorUid)/, 'cliente não informa criador, aceitador nem identidade autoritativa')
assert.match(projectionClient, /Authorization:/, 'cliente envia token ao backend')
assert.match(atendimento, /claimPedidoAuthority/, 'UI usa o claim server-side')
assert.doesNotMatch(atendimento, /publicRequests\//, 'UI não cria disputa de autorização no nó público')

console.log('H-01 estático: forja C, legado fail-closed, concorrência B/C e sigilo de localização cobertos')
