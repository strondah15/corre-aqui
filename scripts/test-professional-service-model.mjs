import assert from 'node:assert/strict'
import {
  PROFESSIONAL_SERVICE_LIMITS,
  PROFESSIONAL_SERVICE_SCHEMA,
  PROFESSIONAL_SERVICE_SCHEMA_VERSION,
  ProfessionalServiceValidationError,
  getProfessionalServicePhotoUrls,
  isSafeProfessionalServicePhotoUrl,
  normalizeProfessionalService,
  parseProfessionalService,
  validateProfessionalService,
  validateProfessionalServiceRevision,
} from '../src/lib/professionalServiceModel.js'

const NOW = 1_800_000_000_000
const CREATED_AT = NOW - 60_000
const UPDATED_AT = NOW - 30_000

const validInput = {
  schemaVersion: 2,
  id: 'service_reparos_01',
  nome: 'Reparos residenciais',
  descricao: 'Pequenos reparos e manutenção preventiva.',
  categoriaId: 'reparos',
  categoriaNome: 'Reparos',
  faixaPreco: 'A partir de R$ 80',
  tempoMedio: '1 a 2 horas',
  regiao: 'São Paulo',
  atendeDomicilio: true,
  urgente: false,
  ativo: true,
  fotos: {
    0: 'https://images.example.com/reparo-1.webp',
    1: 'https://images.example.com/reparo-2.webp',
  },
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  revision: 1,
}

const valid = parseProfessionalService(validInput, {
  serviceId: validInput.id,
  now: NOW,
  previous: null,
  expectedRevision: 0,
})

assert.equal(PROFESSIONAL_SERVICE_SCHEMA_VERSION, 2)
assert.equal(PROFESSIONAL_SERVICE_SCHEMA.path, 'professionalServices/{uid}/{serviceId}')
assert.equal(PROFESSIONAL_SERVICE_LIMITS.maxPhotos, 5)
assert.deepEqual(valid, validInput)
assert.equal(validateProfessionalService(valid, { serviceId: valid.id, now: NOW }).ok, true)
assert.deepEqual(getProfessionalServicePhotoUrls(valid), Object.values(validInput.fotos))

assert.equal(isSafeProfessionalServicePhotoUrl('https://images.example.com/photo.jpg'), true)
assert.equal(isSafeProfessionalServicePhotoUrl('http://images.example.com/photo.jpg'), false)
assert.equal(isSafeProfessionalServicePhotoUrl('blob:https://app.example.com/123'), false)
assert.equal(isSafeProfessionalServicePhotoUrl('data:image/png;base64,AAAA'), false)
assert.equal(isSafeProfessionalServicePhotoUrl('https://user:secret@images.example.com/photo.jpg'), false)
assert.equal(isSafeProfessionalServicePhotoUrl('https://images.example.com:8443/photo.jpg'), false)
assert.equal(isSafeProfessionalServicePhotoUrl('https://localhost/photo.jpg'), false)
assert.equal(isSafeProfessionalServicePhotoUrl('https://127.0.0.1/photo.jpg'), false)
assert.equal(isSafeProfessionalServicePhotoUrl('https://192.168.0.10/photo.jpg'), false)
assert.equal(isSafeProfessionalServicePhotoUrl('https://camera.local/photo.jpg'), false)
assert.equal(isSafeProfessionalServicePhotoUrl('https://images.example.com/photo with space.jpg'), false)

const legacyInput = {
  key: 'legacy_service_01',
  titulo: 'Montagem de móveis',
  description: 'Montagem e desmontagem de móveis.',
  categoryId: 'montagem_moveis',
  category: 'Montagem de móveis',
  preco: 'R$ 120 a R$ 300',
  duration: '2 horas',
  region: 'Campinas',
  domicilio: true,
  urgent: true,
  active: true,
  photos: [
    { url: 'https://images.example.com/montagem-1.webp' },
    'https://images.example.com/montagem-2.webp',
  ],
  fotoURL: 'https://images.example.com/montagem-1.webp',
  criadoEm: CREATED_AT / 1_000,
  atualizadoEm: new Date(UPDATED_AT).toISOString(),
}
const legacySnapshot = structuredClone(legacyInput)
const normalizedLegacy = normalizeProfessionalService(legacyInput)

assert.deepEqual(legacyInput, legacySnapshot, 'normalização não modifica o registro legado')
assert.deepEqual(normalizedLegacy, {
  schemaVersion: 2,
  id: 'legacy_service_01',
  nome: 'Montagem de móveis',
  descricao: 'Montagem e desmontagem de móveis.',
  categoriaId: 'montagem_moveis',
  categoriaNome: 'Montagem de móveis',
  faixaPreco: 'R$ 120 a R$ 300',
  tempoMedio: '2 horas',
  regiao: 'Campinas',
  atendeDomicilio: true,
  urgente: true,
  ativo: true,
  fotos: {
    0: 'https://images.example.com/montagem-1.webp',
    1: 'https://images.example.com/montagem-2.webp',
  },
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  revision: 1,
})
assert.equal(validateProfessionalService(normalizedLegacy, { now: NOW }).ok, true)

const legacyV1 = parseProfessionalService({
  ...legacyInput,
  schemaVersion: 1,
  serviceId: 'legacy_service_02',
  key: undefined,
}, { now: NOW })
assert.equal(legacyV1.schemaVersion, 2)
assert.equal(legacyV1.id, 'legacy_service_02')

function expectInvalid(service, expectedCode, options = {}) {
  const result = validateProfessionalService(service, { now: NOW, ...options })
  assert.equal(result.ok, false, `esperava registro inválido para ${expectedCode}`)
  assert.ok(result.errorCodes.includes(expectedCode), `${expectedCode} não encontrado em ${result.errorCodes.join(', ')}`)
  return result
}

expectInvalid(
  normalizeProfessionalService({ ...validInput, nome: '   ' }),
  'professional_service_name_required',
)
expectInvalid(
  normalizeProfessionalService({ ...validInput, categoriaId: '' }),
  'professional_service_category_id_required',
)
expectInvalid(
  normalizeProfessionalService({ ...validInput, categoriaId: 'Reparos Gerais' }),
  'professional_service_category_id_invalid',
)
expectInvalid(
  normalizeProfessionalService({ ...validInput, categoriaNome: '' }),
  'professional_service_category_name_required',
)
expectInvalid(
  normalizeProfessionalService({ ...validInput, faixaPreco: '' }),
  'professional_service_price_required',
)
expectInvalid(
  normalizeProfessionalService({ ...validInput, descricao: 'x'.repeat(PROFESSIONAL_SERVICE_LIMITS.maxDescriptionLength + 1) }),
  'professional_service_description_too_long',
)
expectInvalid(
  normalizeProfessionalService({ ...validInput, nome: { html: '<script>' } }),
  'professional_service_name_required',
)
expectInvalid(
  normalizeProfessionalService({ ...validInput, atendeDomicilio: 'true' }),
  'professional_service_home_service_invalid',
)

for (const unsafeUrl of [
  'blob:https://app.example.com/local-preview',
  'data:image/png;base64,AAAA',
  'http://images.example.com/insecure.jpg',
  'https://localhost/local.jpg',
  'https://10.0.0.10/private.jpg',
  'https://camera.local/private.jpg',
  'not-a-url',
]) {
  expectInvalid(
    normalizeProfessionalService({ ...validInput, fotos: [unsafeUrl], fotoURL: '' }),
    'professional_service_photo_url_invalid',
  )
}

expectInvalid(
  normalizeProfessionalService({
    ...validInput,
    fotos: Array.from({ length: 6 }, (_, index) => `https://images.example.com/${index}.webp`),
    fotoURL: '',
  }),
  'professional_service_photos_limit_exceeded',
)

expectInvalid(
  { ...valid, fotos: { 1: 'https://images.example.com/gap.webp' } },
  'professional_service_photo_index_invalid',
)
expectInvalid(
  { ...valid, unexpectedPrivateField: 'secret' },
  'professional_service_unknown_field',
)
expectInvalid(
  { ...valid, schemaVersion: 3 },
  'professional_service_schema_version_invalid',
)
expectInvalid(
  { ...valid, id: 'invalid/id' },
  'professional_service_id_invalid',
)
expectInvalid(valid, 'professional_service_id_mismatch', { serviceId: 'another_service' })
expectInvalid(
  { ...valid, revision: 0 },
  'professional_service_revision_invalid',
)
expectInvalid(
  { ...valid, createdAt: 'yesterday' },
  'professional_service_created_at_invalid',
)
expectInvalid(
  { ...valid, updatedAt: CREATED_AT - 1 },
  'professional_service_timestamp_order_invalid',
)
expectInvalid(
  { ...valid, updatedAt: NOW + PROFESSIONAL_SERVICE_LIMITS.maxFutureSkewMs + 1 },
  'professional_service_updated_at_in_future',
)

assert.deepEqual(
  validateProfessionalServiceRevision({ currentRevision: 0, expectedRevision: 0, nextRevision: 1 }),
  { ok: true, reason: '' },
)
assert.deepEqual(
  validateProfessionalServiceRevision({ currentRevision: 2, expectedRevision: 1, nextRevision: 3 }),
  { ok: false, reason: 'professional_service_stale_revision' },
)
assert.deepEqual(
  validateProfessionalServiceRevision({ currentRevision: 2, expectedRevision: 2, nextRevision: 4 }),
  { ok: false, reason: 'professional_service_next_revision_invalid' },
)

const updated = {
  ...valid,
  descricao: 'Descrição revisada.',
  updatedAt: UPDATED_AT + 1_000,
  revision: 2,
}
assert.equal(validateProfessionalService(updated, {
  previous: valid,
  expectedRevision: 1,
  serviceId: valid.id,
  now: NOW,
}).ok, true)

expectInvalid(updated, 'professional_service_stale_revision', {
  previous: valid,
  expectedRevision: 0,
})
expectInvalid({ ...updated, revision: 3 }, 'professional_service_next_revision_invalid', {
  previous: valid,
  expectedRevision: 1,
})
expectInvalid({ ...updated, createdAt: CREATED_AT - 1 }, 'professional_service_created_at_immutable', {
  previous: valid,
  expectedRevision: 1,
})
expectInvalid({ ...updated, updatedAt: UPDATED_AT - 1 }, 'professional_service_updated_at_not_monotonic', {
  previous: valid,
  expectedRevision: 1,
})

assert.throws(
  () => parseProfessionalService({ ...validInput, fotos: ['blob:https://app.example.com/preview'] }, { now: NOW }),
  (error) => error instanceof ProfessionalServiceValidationError
    && error.code === 'professional_service_invalid'
    && error.errors.some(({ code }) => code === 'professional_service_photo_url_invalid'),
)
assert.throws(
  () => parseProfessionalService({ ...validInput, schemaVersion: 3 }, { now: NOW }),
  (error) => error instanceof ProfessionalServiceValidationError
    && error.errors.some(({ code }) => code === 'professional_service_schema_version_invalid'),
)

console.log('Professional Service Model v2: schema, validação, revisão, timestamps, fotos e legado OK')
