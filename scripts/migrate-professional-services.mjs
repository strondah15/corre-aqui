import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  ProfessionalServicesMigrationError,
  buildProfessionalServicesMigrationReport,
  summarizeProfessionalServicesMigrationReport,
} from './lib/professional-services-migration-core.mjs'

const MAX_INPUT_BYTES = 100 * 1024 * 1024
const MAX_RESOLUTION_BYTES = 1024 * 1024
const MAX_DECISION_BYTES = 1024 * 1024

function usage() {
  return [
    'Uso:',
    '  node scripts/migrate-professional-services.mjs --input <snapshot.json> [--resolutions <resolucoes.json>] [--decisions <manifesto.json>] [--report <relatorio.json>] [--now <timestamp_ms>]',
    '',
    'Segurança:',
    '  - Executa somente DRY-RUN offline.',
    '  - Não importa Firebase Admin e não abre conexões de rede.',
    '  - --apply é recusado explicitamente.',
    '  - Resoluções manuais são opcionais, vinculadas ao hash do snapshot e exigem confirmação do proprietário.',
    '  - Decisões de não migração são opcionais, auditáveis e não excluem os registros legados.',
    '  - Um relatório completo só é gravado quando --report é informado.',
  ].join('\n')
}

function parseArgs(argv) {
  const options = {
    input: '',
    resolutions: '',
    decisions: '',
    report: '',
    plannedAt: Date.now(),
    help: false,
    apply: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--apply') options.apply = true
    else if (arg === '--input') options.input = argv[++index] || ''
    else if (arg === '--resolutions') options.resolutions = argv[++index] || ''
    else if (arg === '--decisions') options.decisions = argv[++index] || ''
    else if (arg === '--report') options.report = argv[++index] || ''
    else if (arg === '--now') options.plannedAt = Number(argv[++index])
    else throw new ProfessionalServicesMigrationError('migration_argument_unknown', `Argumento desconhecido: ${arg}`)
  }
  return options
}

async function loadExplicitSnapshot(inputPath) {
  if (!inputPath) throw new ProfessionalServicesMigrationError('migration_input_required')
  const resolved = path.resolve(inputPath)
  const metadata = await stat(resolved)
  if (!metadata.isFile()) throw new ProfessionalServicesMigrationError('migration_input_not_file')
  if (metadata.size <= 0 || metadata.size > MAX_INPUT_BYTES) {
    throw new ProfessionalServicesMigrationError('migration_input_size_invalid')
  }
  const content = await readFile(resolved, 'utf8')
  let snapshot
  try {
    snapshot = JSON.parse(content)
  } catch {
    throw new ProfessionalServicesMigrationError('migration_input_json_invalid')
  }
  return { snapshot, resolved }
}

async function loadManualResolutions(resolutionPath) {
  if (!resolutionPath) return null
  const resolved = path.resolve(resolutionPath)
  const metadata = await stat(resolved)
  if (!metadata.isFile()) throw new ProfessionalServicesMigrationError('migration_resolutions_not_file')
  if (metadata.size <= 0 || metadata.size > MAX_RESOLUTION_BYTES) {
    throw new ProfessionalServicesMigrationError('migration_resolutions_size_invalid')
  }
  try {
    return JSON.parse(await readFile(resolved, 'utf8'))
  } catch {
    throw new ProfessionalServicesMigrationError('migration_resolutions_json_invalid')
  }
}

async function loadMigrationDecisions(decisionPath) {
  if (!decisionPath) return null
  const resolved = path.resolve(decisionPath)
  const metadata = await stat(resolved)
  if (!metadata.isFile()) throw new ProfessionalServicesMigrationError('migration_decisions_not_file')
  if (metadata.size <= 0 || metadata.size > MAX_DECISION_BYTES) {
    throw new ProfessionalServicesMigrationError('migration_decisions_size_invalid')
  }
  try {
    return JSON.parse(await readFile(resolved, 'utf8'))
  } catch {
    throw new ProfessionalServicesMigrationError('migration_decisions_json_invalid')
  }
}

export async function runProfessionalServicesMigrationCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(`${usage()}\n`)
    return { exitCode: 0, report: null }
  }
  if (options.apply) {
    throw new ProfessionalServicesMigrationError(
      'migration_apply_disabled',
      'O modo de aplicação remota não está implementado nesta etapa. Nenhuma escrita foi executada.',
    )
  }
  const { snapshot, resolved } = await loadExplicitSnapshot(options.input)
  const manualResolutions = await loadManualResolutions(options.resolutions)
  const migrationDecisions = await loadMigrationDecisions(options.decisions)
  const report = buildProfessionalServicesMigrationReport(snapshot, {
    plannedAt: options.plannedAt,
    sourceLabel: path.basename(resolved),
    manualResolutions,
    migrationDecisions,
  })
  if (options.report) {
    const reportPath = path.resolve(options.report)
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  }
  process.stdout.write(`${JSON.stringify(summarizeProfessionalServicesMigrationReport(report), null, 2)}\n`)
  return { exitCode: report.counts.blocked > 0 ? 2 : 0, report }
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (invokedDirectly) {
  runProfessionalServicesMigrationCli().then(({ exitCode }) => {
    process.exitCode = exitCode
  }).catch((error) => {
    const code = error instanceof ProfessionalServicesMigrationError
      ? error.code
      : 'migration_unexpected_error'
    process.stderr.write(`${JSON.stringify({ ok: false, mode: 'dry-run', writesPerformed: false, code })}\n`)
    process.exitCode = 1
  })
}
