import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminConfigurationStatus,
  getFirebaseAdminDatabase,
} from '@/lib/firebaseAdmin'
import { assessNotificationsV2Runtime } from '@/lib/notificationsV2Runtime'
import {
  PushDeviceRegistryError,
  disablePushDevice,
  getPushDeviceState,
  registerPushDevice,
} from '@/lib/pushDeviceRegistryServer'

export const runtime = 'nodejs'

const responseHeaders = { 'Cache-Control': 'private, no-store' }
const publicMessages = Object.freeze({
  push_device_auth_required: 'Autenticação necessária.',
  push_device_auth_invalid: 'Sua sessão expirou. Entre novamente.',
  push_device_feature_disabled: 'Notificações 2.0 ainda não estão disponíveis.',
  push_device_request_invalid: 'A solicitação do dispositivo é inválida.',
  push_device_token_invalid: 'O token de notificação é inválido.',
  push_device_id_invalid: 'O identificador do dispositivo é inválido.',
  push_device_transaction_failed: 'Não foi possível atualizar o dispositivo agora.',
  push_device_service_unavailable: 'O serviço de notificações está indisponível.',
})

function success(data, status = 200) {
  return NextResponse.json({ ok: true, data }, { status, headers: responseHeaders })
}

function failure(code, status) {
  const safeCode = /^[a-z][a-z0-9_]{0,95}$/.test(String(code || ''))
    ? String(code)
    : 'push_device_service_unavailable'
  return NextResponse.json({
    ok: false,
    reason: safeCode,
    error: {
      code: safeCode,
      message: publicMessages[safeCode] || 'Não foi possível concluir a operação.',
      retryable: status >= 500,
    },
  }, { status, headers: responseHeaders })
}

function runtimeStatus() {
  return assessNotificationsV2Runtime({
    env: process.env,
    adminStatus: getFirebaseAdminConfigurationStatus(),
  })
}

function assertFeatureEnabled() {
  if (!runtimeStatus().enabled) {
    throw new PushDeviceRegistryError('push_device_feature_disabled', 503)
  }
}

async function authenticatedUid(request) {
  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) throw new PushDeviceRegistryError('push_device_auth_required', 401)
  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken)
    return decoded.uid
  } catch {
    throw new PushDeviceRegistryError('push_device_auth_invalid', 401)
  }
}

function bodyKeysAre(body, allowed, required) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const keys = Object.keys(body)
  return keys.every((key) => allowed.includes(key)) && required.every((key) => keys.includes(key))
}

function sanitizedFailure(error, method) {
  const known = error instanceof PushDeviceRegistryError
  const code = known ? error.code : 'push_device_service_unavailable'
  const status = known ? error.status : 500
  if (status >= 500) {
    console.error('[PUSH_DEVICE_API]', {
      event: 'request_failed',
      method,
      code,
      category: known ? 'domain' : 'unexpected',
    })
  }
  return failure(code, status)
}

export async function GET(request) {
  try {
    assertFeatureEnabled()
    const uid = await authenticatedUid(request)
    const deviceId = new URL(request.url).searchParams.get('deviceId') || ''
    return success(await getPushDeviceState({
      database: getFirebaseAdminDatabase(),
      uid,
      deviceId,
    }))
  } catch (error) {
    return sanitizedFailure(error, 'GET')
  }
}

export async function POST(request) {
  try {
    assertFeatureEnabled()
    const uid = await authenticatedUid(request)
    const body = await request.json().catch(() => null)
    if (!bodyKeysAre(body, ['token', 'device'], ['token', 'device'])) {
      throw new PushDeviceRegistryError('push_device_request_invalid', 400)
    }
    const result = await registerPushDevice({
      database: getFirebaseAdminDatabase(),
      uid,
      token: body.token,
      device: body.device,
    })
    return success(result, result.idempotent ? 200 : 201)
  } catch (error) {
    return sanitizedFailure(error, 'POST')
  }
}

export async function DELETE(request) {
  try {
    assertFeatureEnabled()
    const uid = await authenticatedUid(request)
    const body = await request.json().catch(() => null)
    if (!bodyKeysAre(body, ['deviceId'], ['deviceId'])) {
      throw new PushDeviceRegistryError('push_device_request_invalid', 400)
    }
    return success(await disablePushDevice({
      database: getFirebaseAdminDatabase(),
      uid,
      deviceId: body.deviceId,
    }))
  } catch (error) {
    return sanitizedFailure(error, 'DELETE')
  }
}
