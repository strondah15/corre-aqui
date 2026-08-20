import { readFile } from 'node:fs/promises'
import { buildPublicRequest } from '../src/lib/publicRequests.js'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Uso dry-run: node scripts/plan-c3-public-requests.mjs <export-rtdb.json>')
  process.exitCode = 1
} else {
  const exportData = JSON.parse(await readFile(inputPath, 'utf8'))
  const pedidos = exportData.pedidos || {}
  const existing = exportData.publicRequests || {}
  const projections = {}
  const failures = []

  for (const [id, pedido] of Object.entries(pedidos)) {
    try {
      projections[id] = buildPublicRequest({ id, ...(pedido || {}) })
    } catch (error) {
      failures.push({ id, reason: error?.message || String(error) })
    }
  }

  console.log(JSON.stringify({
    dryRun: true,
    productionWrites: 0,
    pedidosFound: Object.keys(pedidos).length,
    publicRequestsExisting: Object.keys(existing).length,
    projectionsReady: Object.keys(projections).length,
    failures,
    proposedPublicRequests: projections,
  }, null, 2))
}
