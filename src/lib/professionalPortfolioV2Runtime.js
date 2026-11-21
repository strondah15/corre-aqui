export const PROFESSIONAL_PORTFOLIO_V2_FLAG = 'STAGING_PORTFOLIO_V2_ENABLED'
export const PROFESSIONAL_PORTFOLIO_V2_STAGING_PROJECT_ID = 'corre-aqui-staging'
export const PROFESSIONAL_PORTFOLIO_V2_STAGING_INSTANCE = 'corre-aqui-staging-default-rtdb'
export const PROFESSIONAL_PORTFOLIO_V2_STAGING_BRANCH = 'codex/staging/consolidated-2026-09-07'
export const PROFESSIONAL_PORTFOLIO_V2_VERCEL_PROJECT_ID = 'prj_M3gKqNx4UkEzAEgL4pcyoYG5kTUB'

function text(value) {
  return String(value || '').trim()
}

export function professionalPortfolioV2DatabaseInstance(origin) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase()
    if (!hostname.endsWith('.firebaseio.com') && !hostname.endsWith('.firebasedatabase.app')) {
      return ''
    }
    return hostname.split('.')[0]
  } catch {
    return ''
  }
}

export function assessProfessionalPortfolioV2Runtime({
  env = process.env,
  adminStatus = {},
} = {}) {
  const requested = env[PROFESSIONAL_PORTFOLIO_V2_FLAG] === 'true'
  const instance = professionalPortfolioV2DatabaseInstance(adminStatus.databaseOrigin)
  const environmentIssues = []

  if (text(env.CORRE_AQUI_ENV) !== 'staging') {
    environmentIssues.push('portfolio_v2_environment_mismatch')
  }
  if (text(env.VERCEL_ENV) !== 'preview') {
    environmentIssues.push('portfolio_v2_vercel_target_mismatch')
  }
  if (text(env.VERCEL_GIT_COMMIT_REF) !== PROFESSIONAL_PORTFOLIO_V2_STAGING_BRANCH) {
    environmentIssues.push('portfolio_v2_branch_mismatch')
  }
  if (text(env.VERCEL_PROJECT_ID) !== PROFESSIONAL_PORTFOLIO_V2_VERCEL_PROJECT_ID) {
    environmentIssues.push('portfolio_v2_vercel_project_mismatch')
  }
  if (adminStatus.configured !== true) {
    environmentIssues.push('portfolio_v2_firebase_admin_unavailable')
  }
  if (text(adminStatus.projectId) !== PROFESSIONAL_PORTFOLIO_V2_STAGING_PROJECT_ID) {
    environmentIssues.push('portfolio_v2_firebase_project_mismatch')
  }
  if (instance !== PROFESSIONAL_PORTFOLIO_V2_STAGING_INSTANCE) {
    environmentIssues.push('portfolio_v2_firebase_instance_mismatch')
  }

  const environmentReady = environmentIssues.length === 0
  const issues = requested
    ? environmentIssues
    : ['portfolio_v2_feature_disabled', ...environmentIssues]

  return Object.freeze({
    enabled: requested && environmentReady,
    requested,
    environmentReady,
    issues: Object.freeze(issues),
    projectId: environmentReady ? PROFESSIONAL_PORTFOLIO_V2_STAGING_PROJECT_ID : '',
    instance: environmentReady ? PROFESSIONAL_PORTFOLIO_V2_STAGING_INSTANCE : '',
    branch: environmentReady ? PROFESSIONAL_PORTFOLIO_V2_STAGING_BRANCH : '',
    vercelProjectId: environmentReady ? PROFESSIONAL_PORTFOLIO_V2_VERCEL_PROJECT_ID : '',
  })
}
