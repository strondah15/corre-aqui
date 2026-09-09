import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/lib/publicRequestClaimUi.js', import.meta.url), 'utf8')
const policy = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const snapshot1 = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
const snapshot2 = [{ id: 'A' }, { id: 'C' }]
assert.deepEqual(policy.replacePublicRequestCards(snapshot1).map((item) => item.id), ['A', 'B', 'C'])
assert.deepEqual(policy.replacePublicRequestCards(snapshot2).map((item) => item.id), ['A', 'C'])
assert.deepEqual(policy.removePublicRequestCard(snapshot1, 'B').map((item) => item.id), ['A', 'C'])

assert.deepEqual(policy.createClaimUiCheck({
  pedidoId: 'B',
  cardPresent: true,
  publicExistsNow: false,
  publicStatus: 'aberto',
}), {
  pedidoId: 'B',
  cardPresent: true,
  publicExistsNow: false,
  publicStatus: '',
  claimRequested: false,
})
assert.equal(policy.createClaimUiCheck({
  pedidoId: 'A',
  cardPresent: true,
  publicExistsNow: true,
  publicStatus: 'aberto',
}).claimRequested, true)

const [mapSource, detailSource] = await Promise.all([
  readFile(new URL('../src/components/Mapadinamico.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/pedido/[pedidoId]/page.jsx', import.meta.url), 'utf8'),
])

assert.doesNotMatch(mapSource, /pedidosCache/, 'lista pública não reutiliza cache global entre snapshots ou contas')
assert.match(mapSource, /setCorres\(lista\)/, 'snapshot atual substitui o estado React')
assert.doesNotMatch(mapSource, /setCorres\(\s*\(?prev/, 'listener não mescla snapshot com estado anterior')
assert.match(mapSource, /get\(ref\(database, `publicRequests\/\$\{p\.id\}`\)\)/, 'card relê somente a projeção pública antes do claim')
assert.match(detailSource, /get\(ref\(database, `publicRequests\/\$\{pedidoId\}`\)\)/, 'detalhe relê somente a projeção pública antes do claim')
for (const uiSource of [mapSource, detailSource]) {
  assert.match(uiSource, /\[CLAIM_UI_CHECK\]/)
  assert.match(uiSource, /Este pedido não está mais disponível\./)
}

console.log('Lista pública: snapshot substitutivo, sem cache global e claim UI fail-closed OK')
