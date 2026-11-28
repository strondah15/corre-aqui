import { createFirebaseAdminDatabase } from './lib/firebase-admin-runtime.mjs'
import { classifyPublicRequestRoots, summarizeClassifications } from './lib/public-request-audit-policy.mjs'

const allowedArgs = new Set(['--dry-run'])
const unknownArgs = process.argv.slice(2).filter((arg) => !allowedArgs.has(arg))
if (unknownArgs.length) {
  console.error(`Argumento não permitido: ${unknownArgs.join(', ')}`)
  process.exit(1)
}

const runtime = createFirebaseAdminDatabase()
try {
  const [publicSnapshot, privateSnapshot] = await Promise.all([
    runtime.database.ref('publicRequests').get(),
    runtime.database.ref('pedidos').get(),
  ])
  const rows = classifyPublicRequestRoots({
    publicRequests: publicSnapshot.val() || {},
    pedidos: privateSnapshot.val() || {},
  })
  const counts = summarizeClassifications(rows)

  console.log(JSON.stringify({
    dryRun: true,
    productionWrites: 0,
    counts,
    orphanIds: rows.filter((row) => row.classification === 'ORPHAN_PUBLIC').map((row) => row.pedidoId),
    results: rows,
  }, null, 2))
} finally {
  await runtime.close()
}
