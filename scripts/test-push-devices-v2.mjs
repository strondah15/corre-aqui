import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  NOTIFICATIONS_V2_STAGING_BRANCH,
  NOTIFICATIONS_V2_VERCEL_PROJECT_ID,
  assessNotificationsV2Runtime,
} from '../src/lib/notificationsV2Runtime.js'
import {
  PushDeviceRegistryError,
  pushDeviceIdForToken,
  validatePushDeviceId,
  validatePushToken,
} from '../src/lib/pushDeviceRegistryServer.js'
import {
  PushDeviceApiError,
  createPushDeviceApiClient,
} from '../src/lib/pushDeviceApiClient.js'

const stagingAdmin = {
  configured: true,
  projectId: 'corre-aqui-staging',
  databaseOrigin: 'https://corre-aqui-staging-default-rtdb.firebaseio.com',
}
const stagingEnv = {
  STAGING_NOTIFICATIONS_V2_ENABLED: 'true',
  CORRE_AQUI_ENV: 'staging',
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: NOTIFICATIONS_V2_STAGING_BRANCH,
  VERCEL_PROJECT_ID: NOTIFICATIONS_V2_VERCEL_PROJECT_ID,
}

assert.equal(assessNotificationsV2Runtime({ env: stagingEnv, adminStatus: stagingAdmin }).enabled, true)
assert.equal(assessNotificationsV2Runtime({
  env: { ...stagingEnv, STAGING_NOTIFICATIONS_V2_ENABLED: 'TRUE' },
  adminStatus: stagingAdmin,
}).enabled, false, 'somente o valor exato true ativa o fluxo')
assert.equal(assessNotificationsV2Runtime({
  env: { ...stagingEnv, CORRE_AQUI_ENV: 'production' },
  adminStatus: stagingAdmin,
}).enabled, false, 'Production falha fechada')
assert.equal(assessNotificationsV2Runtime({
  env: stagingEnv,
  adminStatus: { ...stagingAdmin, projectId: 'corre-aqui-3f9ec' },
}).enabled, false, 'projeto Firebase divergente falha fechado')

const token = `fcm-test-${'a'.repeat(80)}`
assert.equal(validatePushToken(token), token)
assert.match(pushDeviceIdForToken(token), /^[a-f0-9]{64}$/)
assert.throws(() => validatePushToken('short'), PushDeviceRegistryError)
assert.throws(() => validatePushToken(`invalid token ${'x'.repeat(40)}`), PushDeviceRegistryError)
assert.equal(validatePushDeviceId(pushDeviceIdForToken(token)), pushDeviceIdForToken(token))
assert.throws(() => validatePushDeviceId('../other-user'), PushDeviceRegistryError)

const accountA = {
  uid: 'account-A',
  getIdToken: async () => 'firebase-id-token-a',
}
let currentUser = accountA
const requests = []
const successResponse = (data) => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, data }),
})
const api = createPushDeviceApiClient({
  getCurrentUser: () => currentUser,
  fetchImpl: async (url, init) => {
    requests.push({ url, init })
    if (init.method === 'POST') {
      return successResponse({ deviceId: 'device-a', registered: true, activeDeviceCount: 1 })
    }
    if (init.method === 'DELETE') {
      return successResponse({ deviceId: 'device-a', registered: false, activeDeviceCount: 0 })
    }
    return successResponse({ deviceId: 'device-a', registered: true, activeDeviceCount: 1 })
  },
})

const registered = await api.register('account-A', {
  token,
  device: { language: 'pt-BR', origin: 'https://staging.example.test' },
})
assert.equal(registered.registered, true)
const registerBody = JSON.parse(requests[0].init.body)
assert.deepEqual(Object.keys(registerBody).sort(), ['device', 'token'])
assert.equal('uid' in registerBody, false, 'o cliente nunca informa UID no corpo')
assert.match(requests[0].init.headers.Authorization, /^Bearer /)

await api.status('account-A', 'device-a')
assert.equal(requests[1].url, '/api/push/devices?deviceId=device-a')
await api.disable('account-A', 'device-a')
assert.deepEqual(JSON.parse(requests[2].init.body), { deviceId: 'device-a' })

await assert.rejects(api.register('account-B', { token, device: {} }), (error) => {
  assert.ok(error instanceof PushDeviceApiError)
  return error.code === 'push_device_session_changed'
})
assert.equal(requests.length, 3, 'troca de conta falha antes de acessar a API')

const networkApi = createPushDeviceApiClient({
  getCurrentUser: () => accountA,
  fetchImpl: async () => { throw new Error('offline') },
})
await assert.rejects(networkApi.status('account-A'), (error) => error.code === 'push_device_network_error')

const expiredApi = createPushDeviceApiClient({
  getCurrentUser: () => ({ uid: 'account-A', getIdToken: async () => { throw new Error('expired') } }),
  fetchImpl: async () => successResponse({}),
})
await assert.rejects(expiredApi.status('account-A'), (error) => error.code === 'push_device_auth_invalid')

let resolveSwappedRequest
const swappedUser = { uid: 'account-B', getIdToken: async () => 'firebase-id-token-b' }
currentUser = accountA
const swapApi = createPushDeviceApiClient({
  getCurrentUser: () => currentUser,
  fetchImpl: () => new Promise((resolve) => { resolveSwappedRequest = resolve }),
})
const pendingStatus = swapApi.status('account-A')
await Promise.resolve()
currentUser = swappedUser
resolveSwappedRequest(successResponse({ registered: true, activeDeviceCount: 1 }))
await assert.rejects(pendingStatus, (error) => error.code === 'push_device_session_changed')
currentUser = accountA

const [routeSource, pushClientSource, registerSource, profileSource, sendSource, rulesSource] = await Promise.all([
  readFile(new URL('../src/app/api/push/devices/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/pushClient.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PWARegister.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PerfilDrawer.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/push/send/route.js', import.meta.url), 'utf8'),
  readFile(new URL('../database.rules.json', import.meta.url), 'utf8'),
])

assert.match(routeSource, /verifyIdToken\(idToken\)/)
assert.ok(routeSource.indexOf('authenticatedUid(request)') < routeSource.indexOf('request.json()'))
assert.doesNotMatch(routeSource, /body\.(uid|userId)/, 'a API deriva UID apenas do token autenticado')
assert.match(routeSource, /bodyKeysAre\(body, \['token', 'device'\]/)
assert.match(pushClientSource, /pushDeviceApi\.register\(uid/)
assert.match(pushClientSource, /pushDeviceApi\.disable\(uid, key\)/)
assert.match(pushClientSource, /explicit_activation_required/)
assert.match(registerSource, /if \(caps\?\.notificationsV2Enabled\) return/)
assert.match(profileSource, /pushCanUse && pushAtivo \? onTestPush : undefined/)
assert.match(sendSource, /seenTokens/, 'envio deduplica tokens preservados de registros legados')
assert.match(sendSource, /userPrivate\/\$\{toUid\}\/pushTokens/, 'backend de envio reutiliza o caminho privado existente')
assert.match(sendSource, /messaging\/invalid-registration-token/)
assert.match(sendSource, /messaging\/registration-token-not-registered/)
assert.match(sendSource, /disableInvalidTokens/, 'token FCM expirado é desativado pelo backend de envio')
assert.match(rulesSource, /"userPrivate"/)
assert.doesNotMatch(routeSource, /console\.(log|error)\([^\n]*(token|deviceId)/i, 'API não registra token ou identificador')

console.log('Notificações 2.0: runtime isolado, API sem UID, sessão A/B, rede, token expirado e compatibilidade OK')
