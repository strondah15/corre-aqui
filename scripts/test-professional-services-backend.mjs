import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  deriveProfessionalServiceId,
  normalizeProfessionalServiceId,
  normalizeProfessionalServiceOperationId,
  normalizeProfessionalServiceUid,
} from '../src/lib/professionalServicesServer.js'

const uid = 'professional-test-user'
const operationId = 'portfolio-create-operation-001'
const serviceId = deriveProfessionalServiceId(uid, operationId)

assert.match(serviceId, /^svc_[a-f0-9]{40}$/)
assert.equal(serviceId, deriveProfessionalServiceId(uid, operationId), 'operationId gera ID determinístico')
assert.notEqual(serviceId, deriveProfessionalServiceId(uid, 'portfolio-create-operation-002'))
assert.equal(normalizeProfessionalServiceUid(uid), uid)
assert.equal(normalizeProfessionalServiceUid('invalid/uid'), '')
assert.equal(normalizeProfessionalServiceOperationId(operationId), operationId)
assert.equal(normalizeProfessionalServiceOperationId('short'), '')
assert.equal(normalizeProfessionalServiceId(serviceId), serviceId)
assert.equal(normalizeProfessionalServiceId('invalid/id'), '')

const routeSource = await readFile(
  new URL('../src/app/api/professional-services/route.js', import.meta.url),
  'utf8',
)
const serverSource = await readFile(
  new URL('../src/lib/professionalServicesServer.js', import.meta.url),
  'utf8',
)
const rules = JSON.parse(
  await readFile(new URL('../database.rules.json', import.meta.url), 'utf8'),
).rules

for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
  assert.match(routeSource, new RegExp(`export async function ${method}\\(request\\)`))
}
assert.match(routeSource, /verifyIdToken\(idToken\)/)
assert.match(routeSource, /structuredError[\s\S]*retryable:[\s\S]*details:/)
assert.match(routeSource, /Cache-Control': 'private, no-store'/)
assert.match(routeSource, /createProfessionalService/)
assert.match(routeSource, /editProfessionalService/)
assert.match(routeSource, /deleteProfessionalService/)
assert.match(routeSource, /listProfessionalServices/)
assert.match(routeSource, /professional_service_feature_disabled/)
assert.equal(
  (routeSource.match(/assertPortfolioV2MutationEnabled\(\)/g) || []).length,
  4,
  'POST, PATCH e DELETE exigem o gate server-side',
)

assert.match(serverSource, /professionalServices\/\$\{identity\.uid\}/)
assert.match(serverSource, /professionalServiceOperations\/\$\{uid\}\/\$\{operationId\}/)
assert.match(serverSource, /maxServicesPerProfessional/)
assert.match(serverSource, /servicesRef\.transaction/)
assert.match(serverSource, /serviceRef\.transaction/)
assert.match(serverSource, /validateProfessionalService\(service, options\)/)
assert.match(serverSource, /createdAt: now/)
assert.match(serverSource, /updatedAt: now/)
assert.match(serverSource, /ensureProfessionalPortfolioSchemaV2/)
assert.match(serverSource, /ensureSchemaV2\(database, identity\.uid\)/)

assert.equal(rules.professionalServices.$uid['.write'], false)
assert.equal(rules.professionalServices.$uid.$serviceId['.write'], false)
assert.equal(rules.professionalServiceOperations['.read'], false)
assert.equal(rules.professionalServiceOperations['.write'], false)
assert.equal(rules.users.$uid.portfolioSchemaVersion['.validate'], 'newData.val() === data.val()')

console.log('Professional Services Backend v2: API, autenticação, idempotência e bloqueio client-side OK')
