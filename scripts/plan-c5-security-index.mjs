import { readFile } from 'node:fs/promises'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Uso dry-run: node scripts/plan-c5-security-index.mjs <export-rtdb.json>')
  process.exitCode = 1
} else {
  const exportData = JSON.parse(await readFile(inputPath, 'utf8'))
  const records = exportData.problemasServico || {}
  const existingIndexes = exportData.registrosSegurancaPorUsuario || {}
  const proposedIndexes = {}
  const invalid = []
  const missingDenunciaMirror = []
  const legacyReputationFields = []
  const protectedReputationFields = [
    'reputation', 'reputacao', 'trust', 'trustStats', 'rating', 'ratingAvg', 'ratingCount', 'reviewCount',
    'avaliacoesCount', 'avaliacaoMedia', 'notaMedia', 'nota', 'estrelas', 'stars', 'totalAvaliacoes',
    'quantidadeAvaliacoes', 'avaliacoes', 'reviews', 'avaliacao', 'servicosConcluidos', 'completedServices',
    'entregas', 'servicosCorre', 'servicosProf', 'profile', 'perfil',
  ]
  let recordsNeedingIndex = 0

  for (const [registroId, record] of Object.entries(records)) {
    const autorId = String(record?.autor?.id || '').trim()
    const pedidoId = String(record?.pedidoId || '').trim()
    const clienteId = String(record?.clienteId || '').trim()
    const aceitadorId = String(record?.aceitadorId || '').trim()
    const criadoEm = Number(record?.criadoEm || 0)
    const denuncia = record?.denuncia === true

    if (!autorId || !pedidoId || !clienteId || !Number.isFinite(criadoEm) || criadoEm <= 0) {
      invalid.push({ registroId, reason: 'autor/pedido/cliente/criadoEm inválido' })
      continue
    }

    if (denuncia && !exportData?.denuncias?.[registroId]) {
      missingDenunciaMirror.push(registroId)
    }

    const recipients = new Set([autorId])
    if (!denuncia) {
      recipients.add(clienteId)
      if (aceitadorId) recipients.add(aceitadorId)
    }

    let missing = false
    for (const uid of recipients) {
      proposedIndexes[uid] ||= {}
      proposedIndexes[uid][registroId] = {
        registroId,
        status: String(record?.status || 'aberto').toLowerCase(),
        criadoEm,
      }
      if (!existingIndexes?.[uid]?.[registroId]) missing = true
    }
    if (missing) recordsNeedingIndex += 1
  }

  for (const [uid, profile] of Object.entries(exportData.publicProfiles || {})) {
    const fields = protectedReputationFields.filter((field) => Object.prototype.hasOwnProperty.call(profile || {}, field))
    if (fields.length) legacyReputationFields.push({ uid, fields })
  }

  console.log(JSON.stringify({
    dryRun: true,
    productionWrites: 0,
    problemasServicoFound: Object.keys(records).length,
    denunciasFound: Object.keys(exportData.denuncias || {}).length,
    recordsNeedingIndex,
    invalid,
    missingDenunciaMirror,
    legacyReputationFields,
    proposedRegistrosSegurancaPorUsuario: proposedIndexes,
  }, null, 2))
}
