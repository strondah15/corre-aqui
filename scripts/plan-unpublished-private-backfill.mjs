import { readFile } from 'node:fs/promises'
import { createFirebaseAdminDatabase } from './lib/firebase-admin-runtime.mjs'
import { classifyPublicRequestRoots } from './lib/public-request-audit-policy.mjs'
import { classifyUnpublishedPrivate } from './lib/unpublished-private-audit-policy.mjs'

const allowedArgs = new Set(['--dry-run'])
const unknownArgs = process.argv.slice(2).filter((arg) => !allowedArgs.has(arg))
if (unknownArgs.length) {
  console.error(`Argumento não permitido: ${unknownArgs.join(', ')}`)
  process.exit(1)
}

async function importSource(relativeUrl) {
  const source = await readFile(new URL(relativeUrl, import.meta.url), 'utf8')
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const [{ buildPublicRequest }, { createPublicationStamp, hasAuthoritativePublication }] = await Promise.all([
  importSource('../src/lib/publicRequests.js'),
  importSource('../src/lib/pedidoPublication.js'),
])

const runtime = createFirebaseAdminDatabase('unpublished-private-backfill-plan')
try {
  const [publicSnapshot, privateSnapshot] = await Promise.all([
    runtime.database.ref('publicRequests').get(),
    runtime.database.ref('pedidos').get(),
  ])
  const publicRequests = publicSnapshot.val() || {}
  const pedidos = privateSnapshot.val() || {}
  const initialCandidates = classifyPublicRequestRoots({ publicRequests, pedidos })
    .filter((row) => row.classification === 'UNPUBLISHED_PRIVATE')
    .map((row) => row.pedidoId)
    .filter((pedidoId) => classifyUnpublishedPrivate({
      pedidoId,
      privatePedido: pedidos[pedidoId],
      publicRequest: publicRequests[pedidoId],
    }).eligibleForProjection)

  const plannedCandidateIds = []
  const rejectedAfterReread = []
  for (const pedidoId of initialCandidates) {
    const [privateCurrent, publicCurrent] = await Promise.all([
      runtime.database.ref(`pedidos/${pedidoId}`).get(),
      runtime.database.ref(`publicRequests/${pedidoId}`).get(),
    ])
    const pedido = privateCurrent.val()
    const publicRequest = publicCurrent.val()
    const current = classifyUnpublishedPrivate({ pedidoId, privatePedido: pedido, publicRequest })
    if (!current.eligibleForProjection) {
      rejectedAfterReread.push({ pedidoId, reason: current.reason })
      continue
    }

    const authoritativePedido = { ...pedido, id: pedidoId }
    const projection = buildPublicRequest(authoritativePedido)
    const stamp = createPublicationStamp({ pedido: authoritativePedido, pedidoId })
    const markerValid = hasAuthoritativePublication({ ...authoritativePedido, publicacao: stamp }, pedidoId)
    if (projection.id !== pedidoId || projection.status !== 'aberto' || !markerValid) {
      rejectedAfterReread.push({ pedidoId, reason: 'authoritative_build_validation_failed' })
      continue
    }
    plannedCandidateIds.push(pedidoId)
  }

  console.log(JSON.stringify({
    dryRun: true,
    productionWrites: 0,
    initialCandidateCount: initialCandidates.length,
    plannedCandidateCount: plannedCandidateIds.length,
    plannedCandidateIds,
    rejectedAfterReread,
    authoritativePlan: [
      'Admin SDK relê pedidos/{pedidoId} e publicRequests/{pedidoId} individualmente.',
      'A política revalida criador, status aberto, modalidade pública e ausência de projeção.',
      'buildPublicRequest gera a projeção a partir do pedido privado autoritativo.',
      'createPublicationStamp gera o marcador H-01 compatível.',
      'Uma futura operação separada faria update multipath de publicRequests/{pedidoId} e pedidos/{pedidoId}/publicacao.',
    ],
  }, null, 2))
} finally {
  await runtime.close()
}
