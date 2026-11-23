import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function importSource(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const policy = await importSource('../src/lib/pushNotificationPolicy.js')
const [pushClientSource, registerSource] = await Promise.all([
  readFile(new URL('../src/lib/pushClient.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PWARegister.jsx', import.meta.url), 'utf8'),
])

const now = 2_000_000_000_000
const uidA = 'account-A'
const uidB = 'account-B'

assert.equal(policy.isPushSessionCurrent(uidA, uidA), true)
assert.equal(policy.isPushSessionCurrent(uidA, uidB), false)
assert.equal(policy.isPushSessionCurrent(uidA, ''), false)
assert.equal(policy.shouldRemoveRemotePushToken(uidA, uidA), true)
assert.equal(policy.shouldRemoveRemotePushToken(uidA, uidB), false)

assert.equal(policy.shouldOfferPushPrompt({
  uid: uidA,
  authenticatedUid: uidA,
  supported: true,
  permission: 'default',
  dismissedAt: 0,
  now,
}), true, 'permissao ainda nao solicitada pode exibir o convite')
assert.equal(policy.shouldOfferPushPrompt({
  uid: uidA,
  authenticatedUid: uidA,
  supported: true,
  permission: 'denied',
  dismissedAt: 0,
  now,
}), false, 'permissao negada nao repete o modal contextual')
assert.equal(policy.shouldOfferPushPrompt({
  uid: uidA,
  authenticatedUid: uidA,
  supported: true,
  permission: 'granted',
  dismissedAt: 0,
  now,
}), false, 'permissao concedida nao exibe o modal')
assert.equal(policy.shouldOfferPushPrompt({
  uid: uidA,
  authenticatedUid: uidB,
  supported: true,
  permission: 'default',
  dismissedAt: 0,
  now,
}), false, 'troca de conta invalida o convite antigo')
assert.equal(policy.shouldOfferPushPrompt({
  uid: uidA,
  authenticatedUid: uidA,
  supported: true,
  permission: 'default',
  dismissedAt: now - policy.PUSH_PROMPT_COOLDOWN_MS + 1,
  now,
}), false, 'Agora nao aplica cooldown por conta')
assert.equal(policy.shouldOfferPushPrompt({
  uid: uidA,
  authenticatedUid: uidA,
  supported: true,
  permission: 'default',
  dismissedAt: now - policy.PUSH_PROMPT_COOLDOWN_MS,
  now,
}), true, 'o convite pode voltar depois do cooldown')
assert.notEqual(policy.pushPromptStorageKey(uidA), policy.pushPromptStorageKey(uidB))

const rtdbDenied = policy.describePushFlowError({
  code: 'PERMISSION_DENIED',
  message: 'PERMISSION_DENIED: Permission denied',
}, 'rtdb_persistence')
assert.equal(rtdbDenied.code, 'push/storage-permission-denied')
assert.equal(rtdbDenied.stage, 'rtdb_persistence')
assert.doesNotMatch(rtdbDenied.message, /permission_denied|firebase|rtdb/i)

const denied = policy.createPushFlowError('push/browser-permission-denied', 'permission_request')
assert.match(denied.message, /bloqueadas no navegador/i)
assert.equal(policy.describePushFlowError(denied).code, 'push/browser-permission-denied')

const sessionChanged = policy.createPushFlowError('push/session-changed', 'token_registration')
assert.match(sessionChanged.message, /sessao mudou ou expirou/i)

assert.match(pushClientSource, /async function requireCurrentPushSession\(uid, stage\)/)
assert.match(pushClientSource, /await currentUser\.getIdToken\(\)/)
assert.match(pushClientSource, /await requireCurrentPushSession\(uid, 'permission_request'\)/)
assert.match(pushClientSource, /await requireCurrentPushSession\(uid, 'token_registration'\)/)
assert.match(pushClientSource, /await requireCurrentPushSession\(uid, 'rtdb_persistence'\)/)
assert.match(pushClientSource, /await update\(ref\(database\), updates\)/, 'registro usa uma unica atualizacao atomica')
assert.doesNotMatch(pushClientSource, /await update\(ref\(database, `users\/\$\{uid\}`\)/, 'nao ha mais primeira escrita isolada e parcial no usuario')
assert.match(pushClientSource, /shouldRemoveRemotePushToken\(uid, auth\.currentUser\?\.uid\)/, 'troca de conta nao tenta apagar dados do UID anterior')

const permissionBranch = pushClientSource.slice(
  pushClientSource.indexOf("if (permission !== 'granted')"),
  pushClientSource.indexOf("await requireCurrentPushSession(uid, 'token_registration')"),
)
assert.doesNotMatch(permissionBranch, /update\(|remove\(/, 'negacao do navegador nao dispara escrita RTDB')

const assignCurrentUid = registerSource.indexOf('currentUid.current = nextUid')
const cleanupPreviousUid = registerSource.indexOf('await removerPushTokenDoDispositivo(previousUid)')
assert.ok(assignCurrentUid > 0 && assignCurrentUid < cleanupPreviousUid, 'UID visual e invalidado antes da limpeza assincrona')
assert.match(registerSource, /setPushPrompt\(null\)[\s\S]*setPushPromptError\(''\)[\s\S]*setAtivandoPush\(false\)/)
assert.match(registerSource, /pushActivationId\.current !== activationId/, 'resultado antigo nao altera a conta nova')
assert.match(registerSource, /shouldOfferPushPrompt\(/)
assert.match(registerSource, /describePushFlowError\(error, 'activation'\)/)

console.log('Push notifications: permissao, sessao A/B, cooldown, erro amigavel e persistencia atomica OK')
