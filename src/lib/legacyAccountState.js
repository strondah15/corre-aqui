const WORK_TYPE_FIELDS = Object.freeze([
  'profileType',
  'workProfileType',
  'tipoPerfilPublico',
  'tipoTrabalho',
  'tipoConta',
  'tipoContaInicial',
])

const LEGACY_ROLE_ALIASES = Object.freeze([
  'isProf',
  'corre.ativo',
  'profissional.ativo',
  'profissional.isCorre',
  'profissional.isProfissional',
])

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})

function getPath(source, path) {
  return path.split('.').reduce((value, key) => asObject(value)[key], source)
}

function firstBoolean(sources, paths) {
  for (const source of sources) {
    for (const path of paths) {
      const value = getPath(source, path)
      if (typeof value === 'boolean') return value
    }
  }
  return undefined
}

function firstText(sources, fields) {
  for (const source of sources) {
    for (const field of fields) {
      const value = String(getPath(source, field) || '').trim().toLowerCase()
      if (value) return value
    }
  }
  return ''
}

function normalizeWorkType(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (raw.includes('ambos') || raw.includes('both')) return 'both'
  if (raw.includes('prof')) return 'professional'
  if (raw.includes('corre') || raw.includes('worker') || raw.includes('trabalh')) return 'corre'
  if (raw.includes('client')) return 'client'
  return ''
}

function sourceNodes(values) {
  const result = []
  for (const value of values || []) {
    const source = asObject(value)
    if (!Object.keys(source).length) continue
    result.push(source)
    const profile = asObject(source.profile)
    if (Object.keys(profile).length) result.push(profile)
  }
  return result
}

function presentLegacyAliases(sources) {
  return [...WORK_TYPE_FIELDS, ...LEGACY_ROLE_ALIASES]
    .filter((path) => sources.some((source) => getPath(source, path) !== undefined))
}

/**
 * Converte formatos antigos do perfil próprio em flags canônicas de trabalho.
 * O UID vem exclusivamente da sessão autenticada; roles privilegiadas não são
 * lidas nem inferidas aqui. Uma flag canônica booleana, inclusive false, sempre
 * vence aliases legados.
 */
export function resolveLegacyAccountState({ uid = '', sources = [] } = {}) {
  const nodes = sourceNodes(sources)
  const rawWorkType = firstText(nodes, WORK_TYPE_FIELDS)
  const declaredWorkType = normalizeWorkType(rawWorkType)

  const canonicalCorre = firstBoolean(nodes, ['isCorre'])
  const canonicalProfessional = firstBoolean(nodes, ['isProfissional'])
  const legacyCorre = firstBoolean(nodes, ['corre.ativo', 'profissional.isCorre'])
  const legacyProfessional = firstBoolean(nodes, ['isProf', 'profissional.ativo', 'profissional.isProfissional'])

  const typeMeansCorre = declaredWorkType === 'corre' || declaredWorkType === 'professional' || declaredWorkType === 'both'
  const typeMeansProfessional = declaredWorkType === 'professional' || declaredWorkType === 'both'
  const isCorre = canonicalCorre ?? legacyCorre ?? typeMeansCorre
  const isProfissional = canonicalProfessional ?? legacyProfessional ?? typeMeansProfessional

  const workProfileType = declaredWorkType && declaredWorkType !== 'client'
    ? declaredWorkType
    : isCorre && isProfissional
      ? 'both'
      : isProfissional
        ? 'professional'
        : isCorre
          ? 'corre'
          : ''

  return Object.freeze({
    uid: String(uid || '').trim(),
    isCorre: isCorre === true,
    isProfissional: isProfissional === true,
    workProfileType,
    visivel: firstBoolean(nodes, ['visivel']) ?? true,
    profileVisible: firstBoolean(nodes, ['profileVisible']) ?? true,
    showOnlineStatus: firstBoolean(nodes, ['showOnlineStatus']) ?? true,
    legacyAliases: Object.freeze(presentLegacyAliases(nodes)),
  })
}

export const LEGACY_ACCOUNT_FIELDS = Object.freeze({
  workTypes: WORK_TYPE_FIELDS,
  roleAliases: LEGACY_ROLE_ALIASES,
})
