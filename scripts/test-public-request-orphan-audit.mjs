import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { classifyPublicRequestRoots, classifyPublicRequestState, summarizeClassifications } from './lib/public-request-audit-policy.mjs'

const marker = (id, creator = 'A') => ({
  pedidoId: id,
  criadorId: creator,
  origem: 'backend_public_projection',
  versao: 1,
})
const publicRequest = { id: 'X', status: 'aberto', criador: { id: 'A' } }
const privatePedido = { id: 'X', status: 'aberto', criador: { id: 'A' }, publicacao: marker('X') }

assert.equal(classifyPublicRequestState({ pedidoId: 'X', publicRequest, privatePedido }).classification, 'HEALTHY')
assert.equal(classifyPublicRequestState({ pedidoId: 'X', publicRequest, privatePedido: null }).classification, 'ORPHAN_PUBLIC')
assert.equal(classifyPublicRequestState({ pedidoId: 'X', publicRequest: null, privatePedido }).classification, 'UNPUBLISHED_PRIVATE')
assert.equal(classifyPublicRequestState({ pedidoId: 'X', publicRequest, privatePedido: { ...privatePedido, publicacao: null } }).classification, 'INVALID_MARKER')
assert.equal(classifyPublicRequestState({ pedidoId: 'X', publicRequest, privatePedido: { ...privatePedido, publicacao: marker('OUTRO') } }).classification, 'INVALID_MARKER')

const rows = classifyPublicRequestRoots({
  publicRequests: { healthy: { status: 'aberto' }, orphan: { status: 'aberto' }, invalid: { status: 'aberto' } },
  pedidos: {
    healthy: { criador: { id: 'A' }, publicacao: marker('healthy') },
    privateOnly: { criador: { id: 'B' }, publicacao: marker('privateOnly', 'B') },
    invalid: { criador: { id: 'C' } },
  },
})
assert.deepEqual(summarizeClassifications(rows), {
  HEALTHY: 1,
  ORPHAN_PUBLIC: 1,
  UNPUBLISHED_PRIVATE: 1,
  INVALID_MARKER: 1,
})
for (const row of rows) {
  assert.deepEqual(Object.keys(row), [
    'pedidoId',
    'classification',
    'publicStatus',
    'privateExists',
    'publicExists',
    'publicationMarkerExists',
    'publicationMarkerValid',
  ])
}

const removalSource = await readFile(new URL('./remove-orphan-public-requests.mjs', import.meta.url), 'utf8')
assert.match(removalSource, /EXPLICIT_CONFIRMATION_REQUIRED/)
assert.match(removalSource, /NON_ORPHAN_ID_REFUSED/)
assert.match(removalSource, /seletor global proibido/)
assert.match(removalSource, /`publicRequests\/\$\{pedidoId\}`, null/)
const writeBlock = removalSource.slice(
  removalSource.indexOf('const updates ='),
  removalSource.indexOf('const verification ='),
)
assert.doesNotMatch(writeBlock, /pedidos\//, 'removedor nunca escreve em /pedidos')

console.log('Auditoria de órfãos: classificação, saída sanitizada e remoção explícita fail-closed OK')
