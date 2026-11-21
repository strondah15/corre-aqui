import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  PROFESSIONAL_PORTFOLIO_V2_STAGING_BRANCH,
  PROFESSIONAL_PORTFOLIO_V2_STAGING_INSTANCE,
  PROFESSIONAL_PORTFOLIO_V2_STAGING_PROJECT_ID,
  PROFESSIONAL_PORTFOLIO_V2_VERCEL_PROJECT_ID,
  assessProfessionalPortfolioV2Runtime,
} from '../src/lib/professionalPortfolioV2Runtime.js'

function stagingEnv(overrides = {}) {
  return {
    CORRE_AQUI_ENV: 'staging',
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: PROFESSIONAL_PORTFOLIO_V2_STAGING_BRANCH,
    VERCEL_PROJECT_ID: PROFESSIONAL_PORTFOLIO_V2_VERCEL_PROJECT_ID,
    STAGING_PORTFOLIO_V2_ENABLED: 'true',
    ...overrides,
  }
}

function stagingAdmin(overrides = {}) {
  return {
    configured: true,
    projectId: PROFESSIONAL_PORTFOLIO_V2_STAGING_PROJECT_ID,
    databaseOrigin: `https://${PROFESSIONAL_PORTFOLIO_V2_STAGING_INSTANCE}.firebasedatabase.app`,
    ...overrides,
  }
}

const enabled = assessProfessionalPortfolioV2Runtime({
  env: stagingEnv(),
  adminStatus: stagingAdmin(),
})
assert.equal(enabled.enabled, true)
assert.equal(enabled.environmentReady, true)
assert.equal(enabled.instance, PROFESSIONAL_PORTFOLIO_V2_STAGING_INSTANCE)

for (const value of [undefined, '', 'false', 'TRUE', '1', true, ' true ']) {
  const status = assessProfessionalPortfolioV2Runtime({
    env: stagingEnv({ STAGING_PORTFOLIO_V2_ENABLED: value }),
    adminStatus: stagingAdmin(),
  })
  assert.equal(status.enabled, false, `flag ${String(value)} deve falhar fechado`)
  assert.equal(status.environmentReady, true)
  assert.ok(status.issues.includes('portfolio_v2_feature_disabled'))
}

const blockedCases = [
  [stagingEnv({ CORRE_AQUI_ENV: 'production' }), stagingAdmin(), 'portfolio_v2_environment_mismatch'],
  [stagingEnv({ VERCEL_ENV: 'production' }), stagingAdmin(), 'portfolio_v2_vercel_target_mismatch'],
  [stagingEnv({ VERCEL_GIT_COMMIT_REF: 'main' }), stagingAdmin(), 'portfolio_v2_branch_mismatch'],
  [stagingEnv({ VERCEL_PROJECT_ID: 'prj_wrong' }), stagingAdmin(), 'portfolio_v2_vercel_project_mismatch'],
  [stagingEnv(), stagingAdmin({ configured: false }), 'portfolio_v2_firebase_admin_unavailable'],
  [stagingEnv(), stagingAdmin({ projectId: 'corre-aqui-3f9ec' }), 'portfolio_v2_firebase_project_mismatch'],
  [stagingEnv(), stagingAdmin({ databaseOrigin: 'https://corre-aqui-3f9ec-default-rtdb.firebaseio.com' }), 'portfolio_v2_firebase_instance_mismatch'],
]

for (const [env, adminStatus, issue] of blockedCases) {
  const status = assessProfessionalPortfolioV2Runtime({ env, adminStatus })
  assert.equal(status.enabled, false, issue)
  assert.ok(status.issues.includes(issue), issue)
}

const [routeSource, readinessSource, envExample, clientSource] = await Promise.all([
  readFile(new URL('../src/app/api/professional-services/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/professional-services/readiness/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../.env.example', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/ProfessionalPortfolioSection.jsx', import.meta.url), 'utf8'),
])
assert.equal(
  (routeSource.match(/assertPortfolioV2MutationEnabled\(\)/g) || []).length,
  4,
  'gate é definido uma vez e aplicado a POST, PATCH e DELETE',
)
assert.match(routeSource, /professional_service_feature_disabled/)
assert.match(readinessSource, /featureEnabled = codeReady && runtimeStatus\.enabled/)
assert.match(readinessSource, /codeReady,/)
assert.match(readinessSource, /rulesReady: false/)
assert.match(readinessSource, /reason:[\s\S]*'feature_disabled'/)
assert.match(envExample, /^STAGING_PORTFOLIO_V2_ENABLED=false$/m)
assert.doesNotMatch(envExample, /NEXT_PUBLIC_[A-Z0-9_]*PORTFOLIO_V2/)
assert.doesNotMatch(clientSource, /STAGING_PORTFOLIO_V2_ENABLED/, 'flag server-side não entra no componente cliente')

console.log('Portfólio 2.0 runtime: flag exata e isolamento Staging/Preview fail-closed OK')
