import { readFile } from 'node:fs/promises'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Uso dry-run: node scripts/plan-c4-agendamentos-index.mjs <export-rtdb.json>')
  process.exitCode = 1
} else {
  const exportData = JSON.parse(await readFile(inputPath, 'utf8'))
  const agendamentos = exportData.agendamentos || {}
  const existingIndexes = exportData.agendamentosPorUsuario || {}
  const proposedIndexes = {}
  const invalid = []
  let recordsNeedingIndex = 0

  for (const [id, item] of Object.entries(agendamentos)) {
    const clienteId = String(item?.clienteId || '').trim()
    const profissionalId = String(item?.profissionalId || '').trim()
    const atualizadoEm = Number(item?.atualizadoEm || item?.criadoEm || 0)
    if (!clienteId || !profissionalId || clienteId === profissionalId || !Number.isFinite(atualizadoEm) || atualizadoEm <= 0) {
      invalid.push({ id, reason: 'clienteId/profissionalId/atualizadoEm inválido' })
      continue
    }

    const index = { agendamentoId: id, status: String(item?.status || 'pendente').toLowerCase(), atualizadoEm }
    proposedIndexes[clienteId] ||= {}
    proposedIndexes[profissionalId] ||= {}
    proposedIndexes[clienteId][id] = index
    proposedIndexes[profissionalId][id] = index
    if (!existingIndexes?.[clienteId]?.[id] || !existingIndexes?.[profissionalId]?.[id]) recordsNeedingIndex += 1
  }

  console.log(JSON.stringify({
    dryRun: true,
    productionWrites: 0,
    agendamentosFound: Object.keys(agendamentos).length,
    recordsNeedingIndex,
    invalid,
    proposedAgendamentosPorUsuario: proposedIndexes,
  }, null, 2))
}
