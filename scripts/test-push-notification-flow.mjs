import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function importSource(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const policy = await importSource('../src/lib/pushNotificationPolicy.js')
const [pushClientSource, registerSource, profileSource] = await Promise.all([
  readFile(new URL('../src/lib/pushClient.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PWARegister.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PerfilDrawer.jsx', import.meta.url), 'utf8'),
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
assert.doesNotMatch(rtdbDenied.message, /sessao mudou|sessao expirou/i, 'negacao RTDB nao e mascarada como troca de sessao')

const denied = policy.createPushFlowError('push/browser-permission-denied', 'permission_request')
assert.match(denied.message, /bloqueadas no navegador/i)
assert.equal(policy.describePushFlowError(denied).code, 'push/browser-permission-denied')

const sessionChanged = policy.createPushFlowError('push/session-changed', 'token_registration')
assert.match(sessionChanged.message, /sessao mudou ou expirou/i)

assert.deepEqual(policy.getPushTestReadiness({
  uid: uidA,
  authenticatedUid: uidA,
  supported: true,
  permission: 'granted',
  pushEnabled: true,
}), { allowed: true, code: 'push/test-ready', message: '' })
assert.equal(policy.getPushTestReadiness({
  uid: uidA,
  authenticatedUid: uidA,
  supported: true,
  permission: 'default',
  pushEnabled: false,
}).code, 'push/test-requires-activation')
assert.equal(policy.getPushTestReadiness({
  uid: uidA,
  authenticatedUid: uidA,
  supported: true,
  permission: 'denied',
  pushEnabled: true,
}).code, 'push/browser-permission-denied')
assert.equal(policy.getPushTestReadiness({
  uid: uidA,
  authenticatedUid: uidB,
  supported: true,
  permission: 'granted',
  pushEnabled: true,
}).code, 'push/session-changed')

let storageWrites = 0
let sessionRecoveries = 0
const recoveredWrite = await policy.runPushStorageWriteWithRecovery({
  write: async () => {
    storageWrites += 1
    if (storageWrites === 1) throw Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' })
    return 'stored'
  },
  recoverSession: async () => { sessionRecoveries += 1 },
})
assert.deepEqual(recoveredWrite, { value: 'stored', recovered: true })
assert.equal(storageWrites, 2, 'negacao inicial permite somente uma repeticao controlada')
assert.equal(sessionRecoveries, 1, 'sessao e renovada somente uma vez')

let swappedWrites = 0
await assert.rejects(policy.runPushStorageWriteWithRecovery({
  write: async () => {
    swappedWrites += 1
    throw Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' })
  },
  recoverSession: async () => { throw policy.createPushFlowError('push/session-changed', 'rtdb_auth_refresh') },
}), (error) => error?.code === 'push/session-changed')
assert.equal(swappedWrites, 1, 'troca de conta impede a segunda escrita')

let persistentDenials = 0
await assert.rejects(policy.runPushStorageWriteWithRecovery({
  write: async () => {
    persistentDenials += 1
    throw Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' })
  },
  recoverSession: async () => {},
}), /Permission denied/)
assert.equal(persistentDenials, 2, 'negacao real falha fechada depois de uma unica repeticao')

assert.match(pushClientSource, /async function requireCurrentPushSession\(uid, stage, \{ forceRefresh = false \} = \{\}\)/)
assert.match(pushClientSource, /currentUser\.getIdToken\(forceRefresh\)/)
assert.match(pushClientSource, /currentUser !== auth\.currentUser/)
assert.match(pushClientSource, /await requireCurrentPushSession\(uid, 'permission_request'\)/)
assert.match(pushClientSource, /await requireCurrentPushSession\(uid, 'token_registration'\)/)
assert.match(pushClientSource, /await requireCurrentPushSession\(uid, 'rtdb_persistence'\)/)
assert.match(pushClientSource, /const writeRegistration = \(\) => update\(ref\(database\), updates\)/, 'registro usa uma unica atualizacao atomica')
assert.doesNotMatch(pushClientSource, /await update\(ref\(database, `users\/\$\{uid\}`\)/, 'nao ha mais primeira escrita isolada e parcial no usuario')
assert.match(pushClientSource, /runPushStorageWriteWithRecovery/)
assert.match(pushClientSource, /rtdb_auth_refresh[\s\S]*forceRefresh: true/)
assert.match(pushClientSource, /data\?\.skipped === true/, 'teste nao anuncia envio quando a API pulou por falta de token')
assert.match(pushClientSource, /shouldRemoveRemotePushToken\(uid, auth\.currentUser\?\.uid\)/, 'troca de conta nao tenta apagar dados do UID anterior')

const testPushHandler = profileSource.slice(
  profileSource.indexOf('async function testarPush()'),
  profileSource.indexOf('async function sairDaConta()'),
)
assert.match(testPushHandler, /getPushTestReadiness\(/)
assert.match(testPushHandler, /await testarPushNotification\(uid\)/)
assert.doesNotMatch(testPushHandler, /ativarPushNotifications\(/, 'teste nao registra ou grava token implicitamente')
assert.match(profileSource, /ConfigToggle checked=\{pushAtivo\}/, 'toggle representa registro FCM real, nao preferencia generica')

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
