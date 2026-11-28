import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { sha256 } from './professional-services-migration-core.mjs'
import {
  PORTFOLIO2_STAGING_PROJECT_ID,
  ProfessionalServicesActivationError,
} from './professional-services-activation-core.mjs'

const PRODUCTION_PROJECT_ID = 'corre-aqui-3f9ec'

export const PORTFOLIO2_STAGING_WRITER_IDENTITY =
  'portfolio2-activation-operator@corre-aqui-staging.iam.gserviceaccount.com'

function inside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function serviceAccountFromImpersonationUrl(value) {
  try {
    const parsed = new URL(String(value || ''))
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'iamcredentials.googleapis.com') return ''
    const match = decodeURIComponent(parsed.pathname).match(/serviceAccounts\/([^/:]+):generateAccessToken$/)
    return match?.[1] || ''
  } catch {
    return ''
  }
}

export async function inspectPortfolio2WriterCredential({
  credentialPath,
  expectedIdentity,
  repositoryRoot,
} = {}) {
  if (!credentialPath) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_credential_required')
  }
  const resolved = path.resolve(credentialPath)
  if (inside(repositoryRoot || process.cwd(), resolved)) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_credential_inside_repository')
  }
  const metadata = await stat(resolved)
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > 1024 * 1024) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_credential_file_invalid')
  }
  let configuration
  try {
    configuration = JSON.parse(await readFile(resolved, 'utf8'))
  } catch {
    throw new ProfessionalServicesActivationError('portfolio2_writer_credential_json_invalid')
  }
  if (configuration.type !== 'external_account' || configuration.private_key) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_key_file_forbidden')
  }
  if (configuration.token_url !== 'https://sts.googleapis.com/v1/token') {
    throw new ProfessionalServicesActivationError('portfolio2_writer_token_endpoint_forbidden')
  }
  const subjectTokenPath = String(configuration.credential_source?.file || '')
  if (!path.isAbsolute(subjectTokenPath) || inside(repositoryRoot || process.cwd(), subjectTokenPath)) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_subject_token_location_forbidden')
  }
  const subjectTokenMetadata = await stat(subjectTokenPath)
  if (
    !subjectTokenMetadata.isFile()
    || subjectTokenMetadata.size <= 0
    || subjectTokenMetadata.size > 64 * 1024
  ) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_subject_token_file_invalid')
  }
  const impersonatedIdentity = serviceAccountFromImpersonationUrl(
    configuration.service_account_impersonation_url,
  )
  if (
    expectedIdentity !== PORTFOLIO2_STAGING_WRITER_IDENTITY
    || impersonatedIdentity !== expectedIdentity
  ) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_identity_mismatch')
  }
  return {
    credentialPath: resolved,
    identityHash: sha256(expectedIdentity).slice(0, 16),
    credentialType: configuration.type,
  }
}

async function projectMetadataAccessible(accessToken, projectId) {
  try {
    const response = await fetch(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (response.ok) return true
    if (response.status === 403 || response.status === 404) return false
    throw new ProfessionalServicesActivationError('portfolio2_writer_project_check_failed')
  } catch (error) {
    if (error instanceof ProfessionalServicesActivationError) throw error
    throw new ProfessionalServicesActivationError('portfolio2_writer_project_check_failed')
  }
}

function accessTokenValue(result) {
  if (typeof result === 'string') return result
  if (result && typeof result.access_token === 'string') return result.access_token
  return ''
}

export async function verifyPortfolio2WriterProjectIsolation({
  credential,
  declaredProjectId,
} = {}) {
  if (!credential?.getAccessToken) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_auth_invalid')
  }
  if (declaredProjectId !== PORTFOLIO2_STAGING_PROJECT_ID) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_adc_project_mismatch')
  }
  let accessToken
  try {
    accessToken = accessTokenValue(await credential.getAccessToken())
  } catch {
    throw new ProfessionalServicesActivationError('portfolio2_writer_authentication_failed')
  }
  if (!accessToken) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_authentication_failed')
  }
  if (!await projectMetadataAccessible(accessToken, PORTFOLIO2_STAGING_PROJECT_ID)) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_staging_inaccessible')
  }
  if (await projectMetadataAccessible(accessToken, PRODUCTION_PROJECT_ID)) {
    throw new ProfessionalServicesActivationError('portfolio2_writer_production_access_forbidden')
  }
  return {
    projectId: declaredProjectId,
    productionAccessible: false,
  }
}
