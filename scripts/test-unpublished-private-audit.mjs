import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  classifyUnpublishedPrivate,
  firebasePushIdTimestamp,
  pedidoCreatedAtMs,
  summarizeUnpublishedClassifications,
} from './lib/unpublished-private-audit-policy.mjs'

const creator = { id: 'creator-a' }
const cases = [
  [{ status: 'aberto', modoPedido: 'geral', criador: creator }, 'ABERTO_PUBLICAVEL', true],
  [{ status: 'aberto', criador: creator }, 'ABERTO_PUBLICAVEL', true],
  [{ status: 'aceito', criador: creator }, 'ACEITO_PRIVADO', false],
  [{ status: 'aberto', criador: creator, aceite: { id: 'worker-b' } }, 'ACEITO_PRIVADO', false],
  [{ status: 'concluido', criador: creator }, 'FINALIZADO', false],
  [{ status: 'recusado', criador: creator }, 'CANCELADO', false],
  [{ status: 'aberto', modoPedido: 'direto', criador: creator }, 'DIRETO/PRIVADO', false],
  [{ status: 'aberto', tipo: 'pedido_direto', criador: creator }, 'DIRETO/PRIVADO', false],
  [{ status: 'aberto' }, 'LEGADO_INCOMPLETO', false],
  [{ status: 'misterioso', criador: creator }, 'OUTRO', false],
]

const rows = cases.map(([privatePedido, expected, eligible], index) => {
  const row = classifyUnpublishedPrivate({ pedidoId: `pedido-${index}`, privatePedido })
  assert.equal(row.classification, expected)
  assert.equal(row.eligibleForProjection, eligible)
  assert.deepEqual(Object.keys(row), [
    'pedidoId',
    'classification',
    'status',
    'modoPedido',
    'hasCreator',
    'hasAcceptance',
    'hasPublicationMarker',
    'publicProjectionExists',
    'eligibleForProjection',
    'reason',
  ])
  return row
})

assert.equal(classifyUnpublishedPrivate({
  pedidoId: 'already-public',
  privatePedido: { status: 'aberto', criador: creator },
  publicRequest: { id: 'already-public' },
}).eligibleForProjection, false, 'projeção existente nunca entra no backfill')
assert.equal(pedidoCreatedAtMs({ criadoEm: 1_700_000_000 }), 1_700_000_000_000)
assert.equal(pedidoCreatedAtMs({ criadoEmServer: 1_700_000_000_000 }), 1_700_000_000_000)
assert.equal(firebasePushIdTimestamp('-NjEtLV-WK1KvsXypR2E'), 1_700_000_000_000)
assert.equal(pedidoCreatedAtMs({}, '-NjEtLV-WK1KvsXypR2E'), 1_700_000_000_000)
assert.equal(summarizeUnpublishedClassifications(rows).ABERTO_PUBLICAVEL, 2)

const planSource = await readFile(new URL('./plan-unpublished-private-backfill.mjs', import.meta.url), 'utf8')
assert.doesNotMatch(planSource, /\.set\s*\(|\.update\s*\(|\.remove\s*\(|\.transaction\s*\(/, 'planejador não contém primitivas de escrita')
assert.match(planSource, /buildPublicRequest\(authoritativePedido\)/, 'planejador usa sanitizador atual')
assert.match(planSource, /createPublicationStamp/, 'planejador prepara marcador H-01')

console.log('Auditoria UNPUBLISHED_PRIVATE: classificação, schema sanitizado e plano sem escrita OK')
