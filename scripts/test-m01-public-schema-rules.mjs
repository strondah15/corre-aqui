import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules
const profile = rules.publicProfiles.$uid
const publicPortfolio = rules.publicPortfolio.$uid

function wildcardKeys(node) {
  return Object.keys(node || {}).filter((key) => key.startsWith('$'))
}

function assertSingleValidatedWildcard(node, wildcard, label) {
  assert.deepEqual(wildcardKeys(node), [wildcard], `${label} deve ter um único wildcard RTDB`)
  assert.match(node[wildcard]['.validate'], new RegExp(`\\${wildcard}\\.matches\\(\\/`), `${label} valida o nome dinâmico com regex literal`)
}

function assertClosedObject(node, label) {
  assert.equal(node.$other?.['.validate'], false, `${label} rejeita campos inesperados`)
}

function assertNoMultipleWildcards(node, path = 'rules') {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return
  const wildcards = wildcardKeys(node)
  assert.ok(wildcards.length <= 1, `${path} não pode combinar ${wildcards.join(' e ')}`)
  for (const [key, value] of Object.entries(node)) assertNoMultipleWildcards(value, `${path}/${key}`)
}

assert.equal(rules['.read'], false)
assert.equal(rules['.write'], false)
assert.equal(profile['.write'], 'auth != null && auth.uid === $uid && newData.exists()')
assertClosedObject(profile, 'publicProfiles/$uid')
assertClosedObject(profile.corre, 'publicProfiles/$uid/corre')
assertClosedObject(profile.profissional, 'publicProfiles/$uid/profissional')

assertSingleValidatedWildcard(profile.regionKeys, '$regionKeyIndex', 'regionKeys')
assertSingleValidatedWildcard(profile.correCategorias, '$categoryIndex', 'correCategorias')
assertSingleValidatedWildcard(profile.profCategorias, '$categoryIndex', 'profCategorias')
assertSingleValidatedWildcard(profile.portfolio, '$serviceId', 'publicProfiles/$uid/portfolio')
assertClosedObject(profile.portfolio.$serviceId, 'item de portfolio em publicProfiles')
assertSingleValidatedWildcard(profile.portfolio.$serviceId.fotos, '$photoIndex', 'fotos em publicProfiles')

assertSingleValidatedWildcard(publicPortfolio, '$serviceId', 'publicPortfolio/$uid')
assertClosedObject(publicPortfolio.$serviceId, 'item de publicPortfolio')
assertSingleValidatedWildcard(publicPortfolio.$serviceId.fotos, '$photoIndex', 'fotos em publicPortfolio')

assert.equal(/^[0-4]$/.test('0'), true)
assert.equal(/^[0-4]$/.test('4'), true)
assert.equal(/^[0-4]$/.test('5'), false, 'índice de foto acima do limite continua rejeitado')
assert.equal(/^[0-4]$/.test('foto'), false, 'chave de foto inesperada continua rejeitada')
assertNoMultipleWildcards(rules)

console.log('M-01 estático: schemas fechados, wildcards únicos, fotos 0..4 e portfolios dinâmicos OK')
