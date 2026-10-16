const PRODUCTION_SITE_ORIGIN = 'https://www.correaquibrasil.com.br'
const PRODUCTION_SITE_HOSTS = new Set([
  'correaquibrasil.com.br',
  'www.correaquibrasil.com.br',
])

export const CORRE_AQUI_ENVIRONMENTS = Object.freeze({
  production: Object.freeze({
    firebaseProjectId: 'corre-aqui-3f9ec',
    mercadoPagoCredentialEnvironment: 'production',
    siteOrigin: PRODUCTION_SITE_ORIGIN,
  }),
  staging: Object.freeze({
    firebaseProjectId: 'corre-aqui-staging',
    mercadoPagoCredentialEnvironment: 'test',
    siteOrigin: '',
  }),
})

const MERCADO_PAGO_CREDENTIAL_ENVIRONMENTS = new Set(['test', 'production'])

function envText(value) {
  return String(value || '').trim()
}

function uniqueIssues(issues) {
  return Array.from(new Set(issues.filter(Boolean)))
}

function isPublicHostname(hostname) {
  const normalized = envText(hostname).toLowerCase()
  if (!normalized || !normalized.includes('.')) return false
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
  ) return false
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return false
  if (normalized.includes(':') || normalized.includes('[') || normalized.includes(']')) return false
  return true
}

function parseSecureRootUrl(value, { requirePublicHostname = false } = {}) {
  const raw = envText(value)
  if (!raw) return { valid: false, reason: 'missing', origin: '', hostname: '' }

  try {
    const url = new URL(raw)
    const hasRootPath = !url.pathname || url.pathname === '/'
    const valid = url.protocol === 'https:'
      && !url.username
      && !url.password
      && !url.port
      && !url.search
      && !url.hash
      && hasRootPath
      && (!requirePublicHostname || isPublicHostname(url.hostname))

    return {
      valid,
      reason: valid ? '' : 'invalid',
      origin: valid ? url.origin : '',
      hostname: url.hostname.toLowerCase(),
    }
  } catch {
    return { valid: false, reason: 'invalid', origin: '', hostname: '' }
  }
}

export function normalizeCanonicalSiteUrl(value) {
  return parseSecureRootUrl(value, { requirePublicHostname: true })
}

export function normalizeFirebaseDatabaseUrl(value) {
  return parseSecureRootUrl(value)
}

export function firebaseDatabaseBelongsToProject(databaseUrl, projectId) {
  const normalizedProjectId = envText(projectId).toLowerCase()
  const parsed = normalizeFirebaseDatabaseUrl(databaseUrl)
  if (!parsed.valid || !normalizedProjectId) return false

  const exactHosts = new Set([
    `${normalizedProjectId}.firebaseio.com`,
    `${normalizedProjectId}-default-rtdb.firebaseio.com`,
  ])
  if (exactHosts.has(parsed.hostname)) return true

  const regionalPrefix = `${normalizedProjectId}-default-rtdb.`
  return parsed.hostname.startsWith(regionalPrefix)
    && parsed.hostname.endsWith('.firebasedatabase.app')
    && parsed.hostname.length > regionalPrefix.length + '.firebasedatabase.app'.length
}

export function getCorreAquiEnvironmentPolicy(env = process.env) {
  const environment = envText(env.CORRE_AQUI_ENV)
  return {
    environment,
    policy: CORRE_AQUI_ENVIRONMENTS[environment] || null,
  }
}

export function getFirebaseAdminCredentialMetadata(env = process.env) {
  const rawJson = envText(env.FIREBASE_ADMIN_CREDENTIALS)
  const explicitProjectId = envText(env.FIREBASE_ADMIN_PROJECT_ID)

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson)
      const projectId = envText(parsed?.project_id || parsed?.projectId)
      const hasClientEmail = !!envText(parsed?.client_email || parsed?.clientEmail)
      const hasPrivateKey = !!envText(parsed?.private_key || parsed?.privateKey)
      return {
        source: 'json',
        valid: !!projectId && hasClientEmail && hasPrivateKey,
        parseError: false,
        projectId,
        explicitProjectId,
        projectIdSourcesMatch: !explicitProjectId || !projectId || explicitProjectId === projectId,
      }
    } catch {
      return {
        source: 'json',
        valid: false,
        parseError: true,
        projectId: '',
        explicitProjectId,
        projectIdSourcesMatch: false,
      }
    }
  }

  return {
    source: 'split',
    valid: !!explicitProjectId
      && !!envText(env.FIREBASE_ADMIN_CLIENT_EMAIL)
      && !!envText(env.FIREBASE_ADMIN_PRIVATE_KEY),
    parseError: false,
    projectId: explicitProjectId,
    explicitProjectId,
    projectIdSourcesMatch: true,
  }
}

export function assessFirebaseEnvironment(env = process.env, options = {}) {
  const {
    requireEnvironment = true,
    requireExplicitAdminDatabase = true,
    requireClientConfiguration = true,
  } = options
  const issues = []
  const { environment, policy } = getCorreAquiEnvironmentPolicy(env)
  const expectedProjectId = policy?.firebaseProjectId || ''

  if (!environment && requireEnvironment) issues.push('app_environment_missing')
  if (environment && !policy) issues.push('app_environment_invalid')

  const credentials = getFirebaseAdminCredentialMetadata(env)
  if (!credentials.valid) {
    issues.push(credentials.parseError ? 'firebase_admin_credentials_invalid_json' : 'firebase_admin_credentials_incomplete')
  }
  if (!credentials.projectIdSourcesMatch) issues.push('firebase_admin_project_sources_mismatch')
  if (expectedProjectId && credentials.projectId && credentials.projectId !== expectedProjectId) {
    issues.push('firebase_admin_project_environment_mismatch')
  }

  const clientProjectId = envText(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
  if (requireClientConfiguration && !clientProjectId) issues.push('firebase_client_project_missing')
  if (clientProjectId && credentials.projectId && clientProjectId !== credentials.projectId) {
    issues.push('firebase_client_admin_project_mismatch')
  }
  if (expectedProjectId && clientProjectId && clientProjectId !== expectedProjectId) {
    issues.push('firebase_client_project_environment_mismatch')
  }

  const adminDatabaseRaw = envText(env.FIREBASE_ADMIN_DATABASE_URL)
  const clientDatabaseRaw = envText(env.NEXT_PUBLIC_FIREBASE_DATABASE_URL)
  const effectiveAdminDatabaseRaw = adminDatabaseRaw || clientDatabaseRaw

  if (requireExplicitAdminDatabase && !adminDatabaseRaw) issues.push('firebase_admin_database_missing')
  if (!effectiveAdminDatabaseRaw) issues.push('firebase_database_missing')
  if (requireClientConfiguration && !clientDatabaseRaw) issues.push('firebase_client_database_missing')

  const adminDatabase = normalizeFirebaseDatabaseUrl(effectiveAdminDatabaseRaw)
  const clientDatabase = normalizeFirebaseDatabaseUrl(clientDatabaseRaw)
  if (effectiveAdminDatabaseRaw && !adminDatabase.valid) issues.push('firebase_admin_database_invalid')
  if (clientDatabaseRaw && !clientDatabase.valid) issues.push('firebase_client_database_invalid')

  const projectForDatabaseValidation = expectedProjectId || credentials.projectId || clientProjectId
  if (
    effectiveAdminDatabaseRaw
    && projectForDatabaseValidation
    && !firebaseDatabaseBelongsToProject(effectiveAdminDatabaseRaw, projectForDatabaseValidation)
  ) {
    issues.push('firebase_admin_database_project_mismatch')
  }
  if (
    clientDatabaseRaw
    && projectForDatabaseValidation
    && !firebaseDatabaseBelongsToProject(clientDatabaseRaw, projectForDatabaseValidation)
  ) {
    issues.push('firebase_client_database_project_mismatch')
  }
  if (
    adminDatabaseRaw
    && clientDatabaseRaw
    && adminDatabase.valid
    && clientDatabase.valid
    && adminDatabase.origin !== clientDatabase.origin
  ) {
    issues.push('firebase_admin_client_database_mismatch')
  }

  return Object.freeze({
    valid: uniqueIssues(issues).length === 0,
    issues: Object.freeze(uniqueIssues(issues)),
    environment,
    expectedProjectId,
    adminProjectId: credentials.projectId,
    clientProjectId,
    adminDatabaseOrigin: adminDatabase.valid ? adminDatabase.origin : '',
    clientDatabaseOrigin: clientDatabase.valid ? clientDatabase.origin : '',
  })
}

export function assessMercadoPagoCheckoutConfiguration(env = process.env) {
  const issues = []
  const enabled = envText(env.MERCADO_PAGO_CHECKOUT_ENABLED) === 'true'
  if (!enabled) issues.push('checkout_flag_not_enabled')

  const accessToken = envText(env.MERCADO_PAGO_ACCESS_TOKEN)
  const webhookSecret = envText(env.MERCADO_PAGO_WEBHOOK_SECRET)
  if (!accessToken) issues.push('mercado_pago_access_token_missing')
  if (!webhookSecret) issues.push('mercado_pago_webhook_secret_missing')

  const { environment, policy } = getCorreAquiEnvironmentPolicy(env)
  if (!environment) issues.push('app_environment_missing')
  if (environment && !policy) issues.push('app_environment_invalid')

  const credentialEnvironment = envText(env.MERCADO_PAGO_CREDENTIAL_ENV)
  const credentialEnvironmentValid = MERCADO_PAGO_CREDENTIAL_ENVIRONMENTS.has(credentialEnvironment)
  if (!credentialEnvironment) issues.push('mercado_pago_credential_environment_missing')
  else if (!credentialEnvironmentValid) issues.push('mercado_pago_credential_environment_invalid')
  if (
    policy
    && credentialEnvironmentValid
    && credentialEnvironment !== policy.mercadoPagoCredentialEnvironment
  ) {
    issues.push('mercado_pago_credential_environment_mismatch')
  }

  const site = normalizeCanonicalSiteUrl(env.SITE_URL)
  if (!envText(env.SITE_URL)) issues.push('site_url_missing')
  else if (!site.valid) issues.push('site_url_invalid')
  if (site.valid && policy?.siteOrigin && site.origin !== policy.siteOrigin) {
    issues.push('site_url_environment_mismatch')
  }
  if (site.valid && environment === 'staging' && PRODUCTION_SITE_HOSTS.has(site.hostname)) {
    issues.push('site_url_environment_mismatch')
  }

  const publicSiteRaw = envText(env.NEXT_PUBLIC_SITE_URL)
  if (publicSiteRaw) {
    const publicSite = normalizeCanonicalSiteUrl(publicSiteRaw)
    if (!publicSite.valid) issues.push('public_site_url_invalid')
    else if (site.valid && publicSite.origin !== site.origin) issues.push('public_site_url_mismatch')
  }

  const vercelEnvironment = envText(env.VERCEL_ENV)
  if (policy && vercelEnvironment) {
    if (environment === 'production' && vercelEnvironment !== 'production') {
      issues.push('vercel_environment_mismatch')
    }
    if (environment === 'staging' && vercelEnvironment === 'production') {
      issues.push('vercel_environment_mismatch')
    }
  }

  const firebase = assessFirebaseEnvironment(env, {
    requireEnvironment: true,
    requireExplicitAdminDatabase: true,
    requireClientConfiguration: true,
  })
  issues.push(...firebase.issues)

  const normalizedIssues = uniqueIssues(issues)
  return Object.freeze({
    ready: normalizedIssues.length === 0,
    issues: Object.freeze(normalizedIssues),
    environment,
    siteOrigin: site.valid ? site.origin : '',
    expectedFirebaseProjectId: firebase.expectedProjectId,
    mercadoPagoCredentialEnvironment: credentialEnvironmentValid ? credentialEnvironment : '',
  })
}
