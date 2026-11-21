import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  PROFESSIONAL_SERVICE_LIMITS,
  PROFESSIONAL_SERVICE_SCHEMA,
  PROFESSIONAL_SERVICE_SCHEMA_VERSION,
} from '../src/lib/professionalServiceModel.js'

const rules = JSON.parse(
  await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')
).rules

const root = rules.professionalServices
const owner = root?.$uid
const service = owner?.$serviceId

assert.ok(root && owner && service, 'professionalServices/{uid}/{serviceId} deve existir')
assert.deepEqual(owner['.indexOn'], ['ativo', 'updatedAt', 'categoriaId'])
assert.match(owner['.read'], /auth\.uid === \$uid/)
assert.match(owner['.read'], /query\.orderByChild === 'ativo'/)
assert.match(owner['.read'], /query\.equalTo === true/)
assert.match(owner['.read'], /query\.limitToFirst <= 12/)
assert.match(owner['.read'], /query\.limitToLast <= 12/)

assert.equal(owner['.write'], false)
assert.equal(service['.write'], false)
assert.equal(rules.professionalServiceOperations['.read'], false)
assert.equal(rules.professionalServiceOperations['.write'], false)
assert.equal(rules.users.$uid.portfolioSchemaVersion['.validate'], 'newData.val() === data.val()')
assert.equal(rules.publicProfiles.$uid.portfolioSchemaVersion['.validate'], 'newData.val() === data.val()')
assert.match(service['.read'], /data\.child\('ativo'\)\.val\(\) === true/)
assert.match(service['.validate'], /\$serviceId\.matches/)
assert.ok(
  service['.validate'].includes(`newData.child('schemaVersion').val() === ${PROFESSIONAL_SERVICE_SCHEMA_VERSION}`),
  'schemaVersion das Rules deve corresponder ao modelo v2',
)
assert.match(service['.validate'], /newData\.child\('revision'\)\.val\(\) === data\.child\('revision'\)\.val\(\) \+ 1/)
assert.match(service['.validate'], /newData\.child\('createdAt'\)\.val\(\) === data\.child\('createdAt'\)\.val\(\)/)
assert.match(service['.validate'], /newData\.child\('updatedAt'\)\.val\(\) === now/)
assert.equal(service.$other['.validate'], false)

const ruleFields = Object.keys(service)
  .filter((key) => !key.startsWith('.') && !key.startsWith('$'))
  .sort()
const modelFields = Object.keys(PROFESSIONAL_SERVICE_SCHEMA.fields).sort()
assert.deepEqual(ruleFields, modelFields, 'Rules e modelo v2 devem aceitar exatamente os mesmos campos')

for (const requiredField of modelFields.filter((field) => field !== 'fotos')) {
  assert.match(service['.validate'], new RegExp(`'${requiredField}'`), `${requiredField} deve ser obrigatório no RTDB`)
}
assert.doesNotMatch(service['.validate'], /'fotos'/, 'fotos vazias são omitidas pelo RTDB e devem ser opcionais no armazenamento')

assert.match(service.fotos.$photoIndex['.validate'], /\^\[0-4\]\$/)
assert.match(service.fotos.$photoIndex['.validate'], /\^https:/)
assert.match(service.fotos.$photoIndex['.validate'], /localhost/)
assert.match(service.fotos.$photoIndex['.validate'], /127\\\.0/)
assert.match(service.fotos.$photoIndex['.validate'], /\.local/)
assert.equal(PROFESSIONAL_SERVICE_LIMITS.maxPhotos, 5)
assert.equal(PROFESSIONAL_SERVICE_LIMITS.maxServicesPerProfessional, 12)

assert.doesNotMatch(
  JSON.stringify(owner),
  /numChildren/,
  'RuleDataSnapshot não oferece contagem segura de filhos dinâmicos; o limite de 12 exige coordenação server-side',
)

console.log('Professional Services Rules v2: schema, queries, ownership e invariantes estáticos OK')
