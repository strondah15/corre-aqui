import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const helperSource = await readFile(new URL('../src/lib/publicRequests.js', import.meta.url), 'utf8')
const helper = await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`)
const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules

const publicRequests = rules.publicRequests
const privatePedidos = rules.pedidos

assert.equal(publicRequests['.read'], 'auth != null', 'autenticado pode enumerar somente a descoberta')
assert.equal(publicRequests.$pedidoId.$other['.validate'], false, 'visao publica tem esquema fechado')
assert.match(privatePedidos['.read'], /admins/, 'somente admin pode enumerar pedidos privados')
assert.match(privatePedidos.$pedidoId['.read'], /criador\/id/)
assert.match(privatePedidos.$pedidoId['.read'], /aceite\/id/)
assert.doesNotMatch(privatePedidos.$pedidoId['.read'], /publicRequests/)
assert.doesNotMatch(privatePedidos.$pedidoId.status['.validate'], /data\.val\(\) === 'aberto'.*newData\.val\(\) === 'aceito'/)
assert.doesNotMatch(privatePedidos.$pedidoId.status['.validate'], /publicRequests/)
assert.match(privatePedidos.$pedidoId['.validate'], /newData\.child\('criador\/id'\)\.val\(\) === data\.child\('criador\/id'\)\.val\(\)/)
assert.match(privatePedidos.$pedidoId['.validate'], /newData\.child\('aceite\/id'\)\.val\(\) === data\.child\('aceite\/id'\)\.val\(\)/)
assert.doesNotMatch(privatePedidos.$pedidoId['.write'], /publicRequests/)
assert.doesNotMatch(privatePedidos.$pedidoId['.validate'], /publicRequests/)
assert.match(publicRequests.$pedidoId['.write'], /^auth != null && root\.child\('admins'\)/)

for (const forbidden of ['local', 'location', 'localizacao', 'geo', 'coordenadas', 'lat', 'lng', 'latitude', 'longitude', 'endereco', 'address', 'telefone', 'phone', 'whatsapp', 'email']) {
  assert.equal(publicRequests.$pedidoId[forbidden], undefined, `${forbidden} nao pertence ao esquema publico`)
}

const exact = { lat: -23.5505199, lng: -46.6333094 }
const privateRequest = {
  id: 'pedido-1',
  titulo: 'Instalar TV',
  descricao: 'Falar no teste@example.com ou (11) 99999-8888',
  tipo: 'servico',
  status: 'aberto',
  criador: { id: 'A', nome: 'Cliente A', telefone: '11999998888' },
  local: exact,
  telefone: '11999998888',
}
const projected = helper.buildPublicRequest(privateRequest)
assert.deepEqual({ gridLat: projected.gridLat, gridLng: projected.gridLng }, { gridLat: -2355, gridLng: -4663 })
assert.deepEqual(helper.fromPublicRequestGrid(projected), { lat: -23.55, lng: -46.63, approximate: true })
assert.equal(projected.local, undefined)
assert.equal(projected.telefone, undefined)
assert.equal(projected.criador.telefone, undefined)
assert.doesNotMatch(projected.descricao, /teste@example\.com|99999-8888/)

const canReadPrivate = ({ authUid, creatorId, acceptedId }) => Boolean(authUid) && [creatorId, acceptedId].includes(authUid)
const canClaim = ({ authUid, creatorId, status, acceptedId, published }) => Boolean(authUid) && authUid !== creatorId && status === 'aberto' && !acceptedId && published
assert.equal(canReadPrivate({ authUid: 'A', creatorId: 'A' }), true, 'A le o pedido privado proprio')
assert.equal(canReadPrivate({ authUid: 'B', creatorId: 'A', acceptedId: 'B' }), true, 'B le depois de vencer o aceite privado')
assert.equal(canReadPrivate({ authUid: 'C', creatorId: 'A', acceptedId: 'B' }), false, 'C nao le pedido/local privado')
assert.equal(canReadPrivate({ authUid: null, creatorId: 'A' }), false, 'nao autenticado e negado')
assert.equal(canClaim({ authUid: 'A', creatorId: 'A', status: 'aberto', published: true }), false, 'A nao aceita o proprio pedido')
assert.equal(canClaim({ authUid: 'B', creatorId: 'A', status: 'aberto', published: true }), true, 'B pode aceitar legitimamente')
assert.equal(canClaim({ authUid: 'B', creatorId: 'A', status: 'aberto', published: false }), false, 'pedido sem publicação autoritativa falha fechado')
assert.equal(canClaim({ authUid: 'C', creatorId: 'A', status: 'aceito', acceptedId: 'B', published: true }), false, 'C nao substitui B')

for (const sourcePath of [
  '../src/components/Mapadinamico.jsx',
  '../src/components/CorrePainelPage.jsx',
  '../src/app/pedidos/page.js',
  '../src/components/PerfilDrawer.jsx',
]) {
  const source = await readFile(new URL(sourcePath, import.meta.url), 'utf8')
  assert.match(source, /publicRequests/)
  assert.doesNotMatch(source, /ref\(database, ['"]pedidos['"]\)/)
}

const atendimento = await readFile(new URL('../src/lib/atendimento.js', import.meta.url), 'utf8')
assert.match(atendimento, /claimPedidoAuthority/, 'aceite inicial passa pela autoridade server-side')
assert.match(atendimento, /synchronizePublicRequest/, 'transições posteriores sincronizam projeção derivada')
assert.doesNotMatch(atendimento, /publicRequests\//, 'cliente não disputa autorização no espelho público')

console.log('C3 estatico: matriz A/B/C, projeção sanitizada e aceite com autoridade privada OK')
