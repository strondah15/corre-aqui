import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const helperSource = await readFile(new URL('../src/lib/pushRegistrationControl.js', import.meta.url), 'utf8')
const helper = await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`)
const pushClientSource = await readFile(new URL('../src/lib/pushClient.js', import.meta.url), 'utf8')
const firebaseConfigRouteSource = await readFile(new URL('../src/app/api/firebase-config/route.js', import.meta.url), 'utf8')
const fakeApiKey = `AIza${'x'.repeat(35)}`
const fakeFisCredential = 'y'.repeat(140)

const details = helper.describePushRegistrationError({
  code: 'messaging/token-subscribe-failed',
  message: `Request is missing required authentication credential. FIS ${fakeFisCredential} and ${fakeApiKey}.`,
})
assert.equal(details.phase, 'token_registration')
assert.equal(details.reason, 'fcm_registration_unauthorized')
assert.equal(details.httpStatus, 401)
assert.equal(details.code, 'messaging/token-subscribe-failed')
assert.doesNotMatch(details.message, new RegExp(`${fakeApiKey}|${fakeFisCredential}`))

const publicFailure = helper.createPushRegistrationError({
  code: 'messaging/token-subscribe-failed',
  message: 'Request is missing required authentication credential.',
})
assert.equal(publicFailure.name, 'PushRegistrationError')
assert.equal(publicFailure.reason, 'fcm_registration_unauthorized')
assert.match(publicFailure.message, /HTTP 401/)
assert.match(publicFailure.message, /nao chegou a etapa de envio/)
assert.doesNotMatch(publicFailure.message, /firebase|messaging|token|vapid/i)

let now = 1_000
let calls = 0
let rejectRegistration = null
const failures = []
const controller = helper.createPushRegistrationController({
  now: () => now,
  requestToken: () => {
    calls += 1
    return new Promise((resolve, reject) => {
      rejectRegistration = reject
    })
  },
  onFailure: (failure) => failures.push(failure.safeDetails),
})

const first = controller.request()
const concurrent = controller.request()
assert.equal(first, concurrent, 'chamadas concorrentes compartilham a mesma tentativa de registro')
await Promise.resolve()
assert.equal(calls, 1)
rejectRegistration({
  code: 'messaging/token-subscribe-failed',
  message: 'Request is missing required authentication credential.',
})
await assert.rejects(first, (error) => error.reason === 'fcm_registration_unauthorized')
assert.equal(failures.length, 1)

await assert.rejects(controller.request(), (error) => error.reason === 'fcm_registration_unauthorized')
assert.equal(calls, 1, 'cooldown nao repete o POST rejeitado')

now += helper.PUSH_REGISTRATION_AUTH_COOLDOWN_MS + 1
const afterCooldown = controller.request()
await Promise.resolve()
assert.equal(calls, 2, 'nova tentativa so ocorre depois do cooldown')
rejectRegistration({ code: 'messaging/token-subscribe-failed', message: 'Request contains an invalid argument.' })
await assert.rejects(afterCooldown, (error) => error.reason === 'fcm_registration_rejected')

assert.equal((pushClientSource.match(/\bgetToken\(/g) || []).length, 1, 'getToken fica centralizado no controlador')
assert.equal((pushClientSource.match(/pushRegistration\.request\(/g) || []).length, 3)
assert.match(pushClientSource, /\[PUSH REGISTRATION\]/)
assert.match(
  firebaseConfigRouteSource,
  /process\.env\.FIREBASE_VAPID_KEY\s*\|\|\s*process\.env\.NEXT_PUBLIC_FIREBASE_VAPID_KEY/,
  'a VAPID server-side deve prevalecer sobre o fallback NEXT_PUBLIC legado',
)

console.log('FCM registration: erro sanitizado, fases distintas, single-flight e cooldown OK')
