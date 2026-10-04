import { createFirebaseAdminDatabase } from './lib/firebase-admin-runtime.mjs'
import { classifyPublicRequestState, isSafePedidoId } from './lib/public-request-audit-policy.mjs'

function parseArgs(args) {
  let confirm = false
  let rawIds = ''
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--confirm') confirm = true
    else if (arg === '--ids') rawIds = args[index += 1] || ''
    else if (arg.startsWith('--ids=')) rawIds = arg.slice('--ids='.length)
    else throw new Error(`Argumento não permitido: ${arg}`)
  }

  const ids = [...new Set(rawIds.split(',').map((id) => id.trim()).filter(Boolean))]
  if (!ids.length) throw new Error('Informe uma lista explícita com --ids ID1,ID2.')
  if (ids.some((id) => ['*', 'all', 'todos'].includes(id.toLowerCase()) || !isSafePedidoId(id))) {
    throw new Error('A lista contém ID inválido ou seletor global proibido.')
  }
  return { confirm, ids }
}

const { confirm, ids } = parseArgs(process.argv.slice(2))
const runtime = createFirebaseAdminDatabase('public-request-removal')
try {
  const preflight = []
  for (const pedidoId of ids) {
    const [publicSnapshot, privateSnapshot] = await Promise.all([
      runtime.database.ref(`publicRequests/${pedidoId}`).get(),
      runtime.database.ref(`pedidos/${pedidoId}`).get(),
    ])
    preflight.push(classifyPublicRequestState({
      pedidoId,
      publicRequest: publicSnapshot.val(),
      privatePedido: privateSnapshot.val(),
    }))
  }

  const refused = preflight.filter((row) => row.classification !== 'ORPHAN_PUBLIC')
  if (refused.length) {
    console.log(JSON.stringify({ deleted: false, reason: 'NON_ORPHAN_ID_REFUSED', results: preflight }, null, 2))
    process.exitCode = 2
  } else if (!confirm) {
    console.log(JSON.stringify({
      deleted: false,
      dryRun: true,
      reason: 'EXPLICIT_CONFIRMATION_REQUIRED',
      confirmedOrphanIds: ids,
      results: preflight,
    }, null, 2))
  } else {
    const updates = Object.fromEntries(ids.map((pedidoId) => [`publicRequests/${pedidoId}`, null]))
    await runtime.database.ref().update(updates)
    const verification = []
    for (const pedidoId of ids) {
      const publicSnapshot = await runtime.database.ref(`publicRequests/${pedidoId}`).get()
      verification.push({ pedidoId, publicRemoved: !publicSnapshot.exists() })
    }
    console.log(JSON.stringify({ deleted: true, removedPaths: Object.keys(updates), verification }, null, 2))
  }
} finally {
  await runtime.close()
}
