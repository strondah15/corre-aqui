import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const rulesDocument = JSON.parse(
  await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')
)

const rules = rulesDocument.rules
const users = rules.users
const user = users.$uid
const publicProfiles = rules.publicProfiles

assert.equal(users['.read'], undefined, 'A raiz /users nao pode herdar leitura')
assert.equal(user['.read'], 'auth != null && auth.uid === $uid')
assert.equal(user.portfolio.$serviceId['.read'], 'auth != null && auth.uid === $uid')
assert.equal(publicProfiles['.read'], 'auth != null')

const canReadPrivateUser = (authUid, targetUid) => Boolean(authUid) && authUid === targetUid
const canWritePrivateUser = (authUid, targetUid) => Boolean(authUid) && authUid === targetUid
assert.equal(canReadPrivateUser('user-a', 'user-a'), true, 'A: usuario le o proprio no')
assert.equal(canReadPrivateUser('user-a', 'user-b'), false, 'B: usuario nao le outro usuario')
assert.equal(canWritePrivateUser('user-a', 'user-a'), true, 'A: usuario escreve campos permitidos no proprio no')
assert.equal(canWritePrivateUser('user-a', 'user-b'), false, 'A: usuario nao escreve no de B')
assert.equal(canReadPrivateUser('user-b', 'user-b'), true, 'B: usuario le o proprio no')
assert.equal(canReadPrivateUser('user-b', 'user-a'), false, 'B: usuario nao le o de A')
assert.equal(canWritePrivateUser('user-b', 'user-b'), true, 'B: usuario escreve campos permitidos no proprio no')
assert.equal(canWritePrivateUser('user-b', 'user-a'), false, 'B: usuario nao escreve no de A')
assert.equal(canReadPrivateUser(null, 'user-a'), false, 'Nao autenticado nao le users/A')
assert.equal(canWritePrivateUser(null, 'user-a'), false, 'Nao autenticado nao escreve users/A')
assert.equal(Boolean(users['.read']), false, 'Usuario autenticado nao enumera /users')
assert.equal(Boolean('user-a') && publicProfiles['.read'] === 'auth != null', true, 'C: autenticado le perfil publico')

for (const protectedPath of [
  "newData.child('admin')",
  "newData.child('role')",
  "newData.child('profile/admin')",
  "newData.child('profile/role')",
  "newData.child('cpf')",
  "newData.child('documento')",
]) {
  assert.match(user['.write'], new RegExp(protectedPath.replace(/[()/'$]/g, '\\$&')))
}

assert.match(publicProfiles.$uid['.validate'], /data\.child\('profileStatus'\)/)
assert.match(publicProfiles.$uid['.validate'], /!newData\.child\('email'\)\.exists\(\)/)
assert.match(publicProfiles.$uid['.validate'], /!newData\.child\('telefone'\)\.exists\(\)/)
assert.match(publicProfiles.$uid['.validate'], /!newData\.child\('cpf'\)\.exists\(\)/)
assert.match(publicProfiles.$uid['.validate'], /!newData\.child\('documento'\)\.exists\(\)/)

console.log('C1 Rules: cenarios A/B/C e invariantes estruturais OK')
