import { NextResponse } from 'next/server'

import { getFirebaseAdminConfigurationStatus } from '@/lib/firebaseAdmin'
import {
  PROFESSIONAL_PORTFOLIO_V2_STAGING_BRANCH,
  PROFESSIONAL_PORTFOLIO_V2_STAGING_INSTANCE,
  PROFESSIONAL_PORTFOLIO_V2_STAGING_PROJECT_ID,
  PROFESSIONAL_PORTFOLIO_V2_VERCEL_PROJECT_ID,
  assessProfessionalPortfolioV2Runtime,
} from '@/lib/professionalPortfolioV2Runtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const READINESS_TTL_MS = 5 * 60 * 1_000
const responseHeaders = { 'Cache-Control': 'private, no-store, max-age=0' }

export async function GET() {
  const verifiedAt = Date.now()
  const admin = getFirebaseAdminConfigurationStatus()
  const commit = String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim()
  const runtimeStatus = assessProfessionalPortfolioV2Runtime({ env: process.env, adminStatus: admin })
  const codeReady = runtimeStatus.environmentReady && /^[a-f0-9]{40}$/i.test(commit)
  const featureEnabled = codeReady && runtimeStatus.enabled

  return NextResponse.json({
    version: 1,
    feature: 'professional_services_v2',
    environment: runtimeStatus.environmentReady ? 'staging' : 'unavailable',
    target: runtimeStatus.environmentReady ? 'preview' : 'unavailable',
    projectId: runtimeStatus.environmentReady ? PROFESSIONAL_PORTFOLIO_V2_STAGING_PROJECT_ID : '',
    instance: runtimeStatus.environmentReady ? PROFESSIONAL_PORTFOLIO_V2_STAGING_INSTANCE : '',
    branch: runtimeStatus.environmentReady ? PROFESSIONAL_PORTFOLIO_V2_STAGING_BRANCH : '',
    vercelProjectId: runtimeStatus.environmentReady ? PROFESSIONAL_PORTFOLIO_V2_VERCEL_PROJECT_ID : '',
    schemaVersion: 2,
    codeDeployed: codeReady,
    featureEnabled,
    codeReady,
    rulesReady: false,
    codeCommit: codeReady ? commit : '',
    reason: !codeReady
      ? 'environment_unavailable'
      : featureEnabled
        ? 'rules_verification_required'
        : 'feature_disabled',
    verifiedAt,
    expiresAt: verifiedAt + READINESS_TTL_MS,
  }, {
    status: codeReady ? 200 : 503,
    headers: responseHeaders,
  })
}
