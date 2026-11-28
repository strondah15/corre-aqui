import { createFirebaseAdminDatabase } from './lib/firebase-admin-runtime.mjs'
import { classifyPublicRequestRoots } from './lib/public-request-audit-policy.mjs'
import {
  classifyUnpublishedPrivate,
  pedidoCreatedAtMs,
  summarizeUnpublishedClassifications,
} from './lib/unpublished-private-audit-policy.mjs'

const allowedArgs = new Set(['--dry-run'])
const unknownArgs = process.argv.slice(2).filter((arg) => !allowedArgs.has(arg))
if (unknownArgs.length) {
  console.error(`Argumento não permitido: ${unknownArgs.join(', ')}`)
  process.exit(1)
}

const PUBLIC_REQUESTS_INTRODUCED_AT = Date.parse('2026-08-19T23:55:08-03:00')
const now = Date.now()
const day = 24 * 60 * 60 * 1000

function creatorId(pedido) {
  return String(pedido?.criador?.id || pedido?.criador?.uid || '').trim()
}

const runtime = createFirebaseAdminDatabase('unpublished-private-audit')
try {
  const [publicSnapshot, privateSnapshot] = await Promise.all([
    runtime.database.ref('publicRequests').get(),
    runtime.database.ref('pedidos').get(),
  ])
  const publicRequests = publicSnapshot.val() || {}
  const pedidos = privateSnapshot.val() || {}
  const rootRows = classifyPublicRequestRoots({ publicRequests, pedidos })
  const unpublishedIds = rootRows
    .filter((row) => row.classification === 'UNPUBLISHED_PRIVATE')
    .map((row) => row.pedidoId)

  const results = unpublishedIds.map((pedidoId) => classifyUnpublishedPrivate({
    pedidoId,
    privatePedido: pedidos[pedidoId],
    publicRequest: publicRequests[pedidoId],
  }))
  const counts = summarizeUnpublishedClassifications(results)
  const candidateIds = results.filter((row) => row.eligibleForProjection).map((row) => row.pedidoId)
  const dated = unpublishedIds
    .map((pedidoId) => ({ pedidoId, createdAt: pedidoCreatedAtMs(pedidos[pedidoId], pedidoId) }))
    .filter((item) => item.createdAt !== null)
  const timestamps = dated.map((item) => item.createdAt)
  const recentCandidateIds = dated
    .filter((item) => candidateIds.includes(item.pedidoId) && now - item.createdAt <= 7 * day)
    .map((item) => item.pedidoId)
  const healthyCreatorIds = new Set(rootRows
    .filter((row) => row.classification === 'HEALTHY')
    .map((row) => creatorId(pedidos[row.pedidoId]))
    .filter(Boolean))
  const healthyIds = rootRows.filter((row) => row.classification === 'HEALTHY').map((row) => row.pedidoId)
  const healthyDated = healthyIds
    .map((pedidoId) => ({ pedidoId, createdAt: pedidoCreatedAtMs(pedidos[pedidoId], pedidoId) }))
    .filter((item) => item.createdAt !== null)

  console.log(JSON.stringify({
    dryRun: true,
    productionWrites: 0,
    auditedUnpublishedPrivate: results.length,
    counts,
    candidateIds,
    recency: {
      timestamped: dated.length,
      missingOrInvalidTimestamp: unpublishedIds.length - dated.length,
      within24Hours: dated.filter((item) => now - item.createdAt <= day).length,
      within7Days: dated.filter((item) => now - item.createdAt <= 7 * day).length,
      within30Days: dated.filter((item) => now - item.createdAt <= 30 * day).length,
      olderThan30Days: dated.filter((item) => now - item.createdAt > 30 * day).length,
      beforePublicRequestsIntroduction: dated.filter((item) => item.createdAt < PUBLIC_REQUESTS_INTRODUCED_AT).length,
      atOrAfterPublicRequestsIntroduction: dated.filter((item) => item.createdAt >= PUBLIC_REQUESTS_INTRODUCED_AT).length,
      oldestCreatedAt: timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null,
      newestCreatedAt: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null,
      recentCandidateIds,
    },
    creatorComparison: {
      healthyCount: healthyIds.length,
      distinctHealthyCreators: healthyCreatorIds.size,
      healthyAtOrAfterPublicRequestsIntroduction: healthyDated.filter((item) => item.createdAt >= PUBLIC_REQUESTS_INTRODUCED_AT).length,
      distinctUnpublishedCreators: new Set(unpublishedIds.map((id) => creatorId(pedidos[id])).filter(Boolean)).size,
      unpublishedFromCreatorAlsoHavingHealthyProjection: unpublishedIds.filter((id) => healthyCreatorIds.has(creatorId(pedidos[id]))).length,
      recentUnpublishedFromCreatorAlsoHavingHealthyProjection: dated.filter((item) => now - item.createdAt <= 7 * day && healthyCreatorIds.has(creatorId(pedidos[item.pedidoId]))).length,
      note: 'UIDs não são emitidos; conta antiga/nova exige mapeamento externo explícito.',
    },
    results,
  }, null, 2))
} finally {
  await runtime.close()
}
