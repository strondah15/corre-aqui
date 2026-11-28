const PRODUCTION_PROJECT_ID = 'corre-aqui-3f9ec'
const STAGING_PROJECT_ID = 'corre-aqui-staging'
const KNOWN_PROJECT_IDS = new Set([PRODUCTION_PROJECT_ID, STAGING_PROJECT_ID])
const PRODUCTION_HOSTS = new Set(['correaquibrasil.com.br', 'www.correaquibrasil.com.br'])

const REQUIRED_CLIENT_FIELDS = Object.freeze([
  'apiKey',
  'authDomain',
  'databaseURL',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
])

function text(value) {
  return String(value || '').trim()
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function normalizedHostname(value) {
  return text(value).toLowerCase().replace(/\.$/, '')
}

function isLocalHostname(hostname) {
  return hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '[::1]'
}

function databaseBelongsToProject(databaseURL, projectId) {
  if (!databaseURL || !projectId) return false
  try {
    const host = new URL(databaseURL).hostname.toLowerCase()
    const normalizedProjectId = projectId.toLowerCase()
    if (host === `${normalizedProjectId}.firebaseio.com`) return true
    if (host === `${normalizedProjectId}-default-rtdb.firebaseio.com`) return true
    const regionalPrefix = `${normalizedProjectId}-default-rtdb.`
    return host.startsWith(regionalPrefix)
      && host.endsWith('.firebasedatabase.app')
      && host.length > regionalPrefix.length + '.firebasedatabase.app'.length
  } catch {
    return false
  }
}

function officialAuthDomainBelongsToProject(authDomain, projectId) {
  const host = normalizedHostname(authDomain)
  if (!host || !projectId) return false
  if (!host.endsWith('.firebaseapp.com') && !host.endsWith('.web.app')) return true
  return host === `${projectId}.firebaseapp.com` || host === `${projectId}.web.app`
}

function officialStorageBucketBelongsToProject(storageBucket, projectId) {
  const bucket = text(storageBucket).toLowerCase().replace(/^gs:\/\//, '')
  if (!bucket || !projectId) return false
  if (!bucket.endsWith('.appspot.com') && !bucket.endsWith('.firebasestorage.app')) return true
  return bucket === `${projectId}.appspot.com` || bucket === `${projectId}.firebasestorage.app`
}

export function assessFirebaseClientConfiguration(config = {}, { hostname = '' } = {}) {
  const issues = []
  const normalizedConfig = Object.fromEntries(
    REQUIRED_CLIENT_FIELDS.map((field) => [field, text(config?.[field])]),
  )
  const projectId = normalizedConfig.projectId.toLowerCase()
  const host = normalizedHostname(hostname)

  for (const field of REQUIRED_CLIENT_FIELDS) {
    if (!normalizedConfig[field]) issues.push(`firebase_client_${field}_missing`)
  }

  if (projectId && !KNOWN_PROJECT_IDS.has(projectId)) {
    issues.push('firebase_client_project_unknown')
  }
  if (
    normalizedConfig.databaseURL
    && projectId
    && !databaseBelongsToProject(normalizedConfig.databaseURL, projectId)
  ) {
    issues.push('firebase_client_database_project_mismatch')
  }
  if (
    normalizedConfig.authDomain
    && projectId
    && !officialAuthDomainBelongsToProject(normalizedConfig.authDomain, projectId)
  ) {
    issues.push('firebase_client_auth_domain_project_mismatch')
  }
  if (
    normalizedConfig.storageBucket
    && projectId
    && !officialStorageBucketBelongsToProject(normalizedConfig.storageBucket, projectId)
  ) {
    issues.push('firebase_client_storage_bucket_project_mismatch')
  }

  if (host && !isLocalHostname(host)) {
    if (PRODUCTION_HOSTS.has(host) && projectId !== PRODUCTION_PROJECT_ID) {
      issues.push('firebase_client_host_environment_mismatch')
    }
    if (!PRODUCTION_HOSTS.has(host) && projectId !== STAGING_PROJECT_ID) {
      issues.push('firebase_client_host_environment_mismatch')
    }
  }

  const normalizedIssues = unique(issues)
  return Object.freeze({
    valid: normalizedIssues.length === 0,
    issues: Object.freeze(normalizedIssues),
    projectId,
  })
}

export const FIREBASE_CLIENT_PROJECTS = Object.freeze({
  production: PRODUCTION_PROJECT_ID,
  staging: STAGING_PROJECT_ID,
})
