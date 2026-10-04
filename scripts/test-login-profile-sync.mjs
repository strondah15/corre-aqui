import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const helperSource = await readFile(new URL('../src/lib/userProfileSync.js', import.meta.url), 'utf8')
const helper = await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`)
const loginGateSource = await readFile(new URL('../src/components/LoginGate.jsx', import.meta.url), 'utf8')
const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules

const existingUserPayload = helper.buildBasicUserSyncPayload({
  uid: 'A',
  id: 'A',
  email: 'a@example.test',
  nome: 'Pessoa A',
  fotoURL: 'https://example.test/a.jpg',
  updatedAt: 10,
  subscriptions: { client: { status: 'active', expiresAt: 999 } },
  clientFreeOrderUsed: true,
  reputacao: { media: 5 },
  admin: true,
  role: 'admin',
})

assert.deepEqual(existingUserPayload, {
  uid: 'A',
  id: 'A',
  email: 'a@example.test',
  updatedAt: 10,
  nome: 'Pessoa A',
  fotoURL: 'https://example.test/a.jpg',
})
for (const protectedField of ['subscriptions', 'clientFreeOrderUsed', 'reputacao', 'admin', 'role']) {
  assert.equal(protectedField in existingUserPayload, false, `${protectedField} não entra no sync de login`)
}

const newUserPayload = helper.buildBasicUserSyncPayload({
  uid: 'NOVO',
  id: 'NOVO',
  email: 'novo@example.test',
  anonimo: false,
  authProvider: 'google',
  criadoEm: 20,
  nome: 'Pessoa Nova',
  avatarEmoji: '🙂',
})
assert.equal(newUserPayload.uid, 'NOVO')
assert.equal(newUserPayload.criadoEm, 20)
assert.equal(newUserPayload.nome, 'Pessoa Nova')

const switchedUserPayload = helper.buildBasicUserSyncPayload({
  uid: 'B',
  id: 'B',
  nome: 'Pessoa B',
  subscriptions: { professional: { status: 'trial' } },
})
assert.equal(switchedUserPayload.uid, 'B')
assert.equal(switchedUserPayload.nome, 'Pessoa B')
assert.equal('subscriptions' in switchedUserPayload, false, 'B não herda assinatura de A')

for (const editableField of ['nome', 'fotoURL', 'photoURL', 'avatarEmoji']) {
  assert.ok(helper.BASIC_USER_SYNC_FIELDS.includes(editableField), `${editableField} permanece sincronizável`)
}

assert.match(loginGateSource, /buildBasicUserSyncPayload\(basePayload\)/)
assert.match(loginGateSource, /update\(userRef, safeUserPayload\)/)
assert.doesNotMatch(loginGateSource, /userPathPatch/)
assert.doesNotMatch(loginGateSource, /update\(ref\(database\),\s*safeUserPayload\)/)

const userRules = rules.users.$uid
assert.match(userRules['.write'], /newData\.child\('subscriptions'\)\.exists\(\) === data\.child\('subscriptions'\)\.exists\(\)/)
assert.doesNotMatch(userRules['.write'], /newData\.child\('subscriptions'\)\.val\(\) === data\.child\('subscriptions'\)\.val\(\)/)
assert.equal(userRules.subscriptions['.validate'], false, 'cliente não altera conteúdo de subscriptions')
assert.match(userRules['.write'], /newData\.child\('clientFreeOrderUsed'\)\.val\(\) === data\.child\('clientFreeOrderUsed'\)\.val\(\)/)

console.log('Login profile sync: existente/novo/A→B, allowlist e campos server-authoritative protegidos OK')
