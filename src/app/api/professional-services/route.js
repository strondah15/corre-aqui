import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminConfigurationStatus,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import { assessProfessionalPortfolioV2Runtime } from '@/lib/professionalPortfolioV2Runtime'
import {
  ProfessionalServiceServerError,
  createProfessionalService,
  deleteProfessionalService,
  editProfessionalService,
  getProfessionalService,
  listProfessionalServices,
} from '@/lib/professionalServicesServer'
import {
  ProfessionalServiceCatalogError,
  listPublicProfessionalServiceCatalog,
  listPublicProfessionalServices,
} from '@/lib/professionalServiceCatalog'

export const runtime = 'nodejs'

const responseHeaders = { 'Cache-Control': 'private, no-store' }

const publicMessages = Object.freeze({
  professional_service_auth_required: 'Autenticação necessária.',
  professional_service_auth_invalid: 'Sua sessão expirou. Entre novamente.',
  professional_service_request_invalid: 'A solicitação do serviço é inválida.',
  professional_service_payload_invalid: 'Os dados do serviço são inválidos.',
  professional_service_payload_empty: 'Informe pelo menos um campo para editar.',
  professional_service_managed_or_unknown_field: 'O serviço contém campos que não podem ser alterados.',
  professional_service_validation_failed: 'Revise os dados informados para o serviço.',
  professional_service_operation_id_invalid: 'Não foi possível identificar esta operação.',
  professional_service_expected_revision_invalid: 'A versão do serviço é inválida.',
  professional_service_not_found: 'Serviço não encontrado.',
  professional_service_catalog_request_invalid: 'A consulta pública de serviços é inválida.',
  professional_service_stale_revision: 'O serviço foi alterado em outro dispositivo. Atualize e tente novamente.',
  professional_service_limit_reached: 'O limite de 12 serviços cadastrados foi atingido.',
  professional_service_idempotency_conflict: 'Esta operação já foi utilizada com outros dados.',
  professional_service_feature_disabled: 'O Portfólio 2.0 ainda não está disponível para alterações.',
  professional_service_service_unavailable: 'O portfólio está temporariamente indisponível.',
})

function structuredError(code, status, details = []) {
  const safeCode = /^[a-z][a-z0-9_]{0,95}$/.test(String(code || ''))
    ? String(code)
    : 'professional_service_unexpected_error'
  const safeDetails = Array.isArray(details)
    ? details.slice(0, 20).map((detail) => ({
      code: String(detail?.code || '').slice(0, 96),
      path: String(detail?.path || '').slice(0, 96),
    }))
    : []
  return NextResponse.json({
    ok: false,
    reason: safeCode,
    error: {
      code: safeCode,
      message: publicMessages[safeCode] || 'Não foi possível concluir a operação agora.',
      retryable: status >= 500,
      details: safeDetails,
    },
  }, { status, headers: responseHeaders })
}

function success(data, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: responseHeaders })
}

async function authenticatedUid(request) {
  if (!isFirebaseAdminConfigured()) {
    throw new ProfessionalServiceServerError('professional_service_service_unavailable', 503)
  }
  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) throw new ProfessionalServiceServerError('professional_service_auth_required', 401)
  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken)
    return decoded.uid
  } catch {
    throw new ProfessionalServiceServerError('professional_service_auth_invalid', 401)
  }
}

function portfolioV2RuntimeStatus() {
  return assessProfessionalPortfolioV2Runtime({
    env: process.env,
    adminStatus: getFirebaseAdminConfigurationStatus(),
  })
}

function assertPortfolioV2MutationEnabled() {
  if (!portfolioV2RuntimeStatus().enabled) {
    throw new ProfessionalServiceServerError('professional_service_feature_disabled', 503)
  }
}

function requestBodyKeysAre(body, allowed, required) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const keys = Object.keys(body)
  return keys.every((key) => allowed.includes(key)) && required.every((key) => keys.includes(key))
}

function sanitizedFailure(error, method) {
  const known = error instanceof ProfessionalServiceServerError
    || error instanceof ProfessionalServiceCatalogError
  const code = known ? error.code : 'professional_service_unexpected_error'
  const status = known ? error.status : 500
  if (status >= 500) {
    console.error('[PROFESSIONAL_SERVICES]', {
      event: 'request_failed',
      method,
      code,
      category: known ? 'domain' : 'unexpected',
    })
  }
  return structuredError(code, status, known ? error.details : [])
}

export async function GET(request) {
  try {
    const uid = await authenticatedUid(request)
    const featureEnabled = portfolioV2RuntimeStatus().enabled
    const url = new URL(request.url)
    const targetUid = url.searchParams.get('uid') || uid
    const serviceId = url.searchParams.get('serviceId') || ''
    const view = url.searchParams.get('view') || ''
    const requestedUids = (url.searchParams.get('uids') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    if (requestedUids.length) {
      if (view !== 'public' || serviceId || url.searchParams.has('uid')) {
        throw new ProfessionalServiceServerError('professional_service_catalog_request_invalid', 400)
      }
      return success({
        catalogs: await listPublicProfessionalServiceCatalog({
          database: getFirebaseAdminDatabase(),
          professionalIds: requestedUids,
        }),
        featureEnabled,
      })
    }
    if (view === 'public') {
      if (serviceId) throw new ProfessionalServiceServerError('professional_service_catalog_request_invalid', 400)
      return success({
        ...await listPublicProfessionalServices({
        database: getFirebaseAdminDatabase(),
        professionalId: targetUid,
        }),
        featureEnabled,
      })
    }
    if (view) throw new ProfessionalServiceServerError('professional_service_catalog_request_invalid', 400)
    if (serviceId) {
      return success({
        ...await getProfessionalService({
        database: getFirebaseAdminDatabase(),
        actorUid: uid,
        targetUid,
        serviceId,
        }),
        featureEnabled,
      })
    }
    return success({
      ...await listProfessionalServices({
      database: getFirebaseAdminDatabase(),
      actorUid: uid,
      targetUid,
      }),
      featureEnabled,
    })
  } catch (error) {
    return sanitizedFailure(error, 'GET')
  }
}

export async function POST(request) {
  try {
    const uid = await authenticatedUid(request)
    assertPortfolioV2MutationEnabled()
    const body = await request.json().catch(() => null)
    if (!requestBodyKeysAre(body, ['operationId', 'service'], ['operationId', 'service'])) {
      throw new ProfessionalServiceServerError('professional_service_request_invalid', 400)
    }
    const result = await createProfessionalService({
      database: getFirebaseAdminDatabase(),
      uid,
      operationId: body.operationId,
      input: body.service,
    })
    return success(result, result.idempotent ? 200 : 201)
  } catch (error) {
    return sanitizedFailure(error, 'POST')
  }
}

export async function PATCH(request) {
  try {
    const uid = await authenticatedUid(request)
    assertPortfolioV2MutationEnabled()
    const body = await request.json().catch(() => null)
    if (!requestBodyKeysAre(
      body,
      ['operationId', 'serviceId', 'expectedRevision', 'service'],
      ['operationId', 'serviceId', 'expectedRevision', 'service'],
    )) {
      throw new ProfessionalServiceServerError('professional_service_request_invalid', 400)
    }
    return success(await editProfessionalService({
      database: getFirebaseAdminDatabase(),
      uid,
      serviceId: body.serviceId,
      operationId: body.operationId,
      expectedRevision: body.expectedRevision,
      input: body.service,
    }))
  } catch (error) {
    return sanitizedFailure(error, 'PATCH')
  }
}

export async function DELETE(request) {
  try {
    const uid = await authenticatedUid(request)
    assertPortfolioV2MutationEnabled()
    const body = await request.json().catch(() => null)
    if (!requestBodyKeysAre(
      body,
      ['operationId', 'serviceId', 'expectedRevision'],
      ['operationId', 'serviceId', 'expectedRevision'],
    )) {
      throw new ProfessionalServiceServerError('professional_service_request_invalid', 400)
    }
    return success(await deleteProfessionalService({
      database: getFirebaseAdminDatabase(),
      uid,
      serviceId: body.serviceId,
      operationId: body.operationId,
      expectedRevision: body.expectedRevision,
    }))
  } catch (error) {
    return sanitizedFailure(error, 'DELETE')
  }
}
