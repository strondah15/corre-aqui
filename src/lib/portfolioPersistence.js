function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function portfolioSourceEntries(source) {
  if (Array.isArray(source)) {
    return source.map((item, index) => [String(item?.id || item?.key || `portfolio_${index}`), item])
  }

  const record = asRecord(source)
  return record ? Object.entries(record) : []
}

export function mergePortfolioSources(...sources) {
  const merged = {}

  for (const source of sources) {
    for (const [sourceKey, rawItem] of portfolioSourceEntries(source)) {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue
      const id = String(rawItem.id || rawItem.key || sourceKey || '').trim()
      if (!id) continue
      merged[id] = { ...rawItem, id }
    }
  }

  return merged
}

export function resolveUserPortfolioMap(userData = {}) {
  const data = asRecord(userData) || {}
  const profile = asRecord(data.profile) || {}
  const rootProfessional = asRecord(data.profissional) || {}
  const profileProfessional = asRecord(profile.profissional) || {}
  const canonicalInitialized = Number(data.portfolioCanonicalVersion || 0) >= 1
    || Object.prototype.hasOwnProperty.call(data, 'portfolio')

  if (canonicalInitialized) return mergePortfolioSources(data.portfolio)

  return mergePortfolioSources(
    profileProfessional.profPortfolio,
    profileProfessional.portfolio,
    rootProfessional.profPortfolio,
    rootProfessional.portfolio,
    profile.profPortfolio,
    data.profPortfolio,
    profile.portfolio,
    data.portfolio,
  )
}

export function applyPortfolioMutation(currentValue, mutation = {}) {
  const current = mergePortfolioSources(currentValue)
  const type = String(mutation.type || '').trim()
  const id = String(mutation.id || mutation.item?.id || '').trim()

  if (!id) {
    const error = new Error('portfolio_service_id_missing')
    error.code = 'portfolio_service_id_missing'
    throw error
  }

  if (type === 'remove') {
    delete current[id]
    return current
  }

  if (type !== 'upsert' || !mutation.item || typeof mutation.item !== 'object') {
    const error = new Error('portfolio_mutation_invalid')
    error.code = 'portfolio_mutation_invalid'
    throw error
  }

  current[id] = { ...mutation.item, id }
  return current
}

export function withoutPortfolioFields(value = {}) {
  const next = value && typeof value === 'object' ? { ...value } : {}
  delete next.profPortfolio
  delete next.portfolio

  if (next.profissional && typeof next.profissional === 'object' && !Array.isArray(next.profissional)) {
    next.profissional = { ...next.profissional }
    delete next.profissional.profPortfolio
    delete next.profissional.portfolio
  }

  return next
}

export function createPortfolioOperationQueue() {
  let tail = Promise.resolve()

  return {
    run(task) {
      if (typeof task !== 'function') {
        return Promise.reject(new TypeError('portfolio_task_required'))
      }

      const execute = () => Promise.resolve().then(task)
      const result = tail.then(execute, execute)
      tail = result.catch(() => undefined)
      return result
    },
    whenIdle() {
      return tail
    },
  }
}

export function sanitizePortfolioErrorCode(error, fallback = 'portfolio_operation_failed') {
  const raw = String(error?.code || error?.message || fallback).trim()
  return (raw || fallback).replace(/[^a-zA-Z0-9_./-]/g, '_').slice(0, 80)
}

export function getPortfolioReadErrorMessage(error) {
  const code = sanitizePortfolioErrorCode(error, 'portfolio_read_failed').toLowerCase()
  if (code.includes('permission') || code.includes('auth')) {
    return 'Não foi possível carregar seus serviços porque a sessão precisa ser renovada. Entre novamente.'
  }
  return 'Não foi possível carregar seus serviços agora. Tente novamente em instantes.'
}
