import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  createOwnProfessionalService,
  createProfessionalServiceOperationId,
  deleteOwnProfessionalService,
  editOwnProfessionalService,
  getProfessionalServicesErrorMessage,
  listOwnProfessionalServices,
} from '../src/lib/professionalServicesClient.js'
import {
  buildProfessionalServicePayload,
  countLegacyPortfolioServices,
  createProfessionalServiceDraft,
  createUploadedPhotoEntries,
  getProfessionalServiceFormIssue,
  PROFESSIONAL_SERVICE_PHOTO_STATUS,
  professionalServiceOperationFingerprint,
} from '../src/lib/professionalPortfolioUiState.js'

const sectionSource = await readFile(new URL('../src/components/ProfessionalPortfolioSection.jsx', import.meta.url), 'utf8')
const formSource = await readFile(new URL('../src/components/ProfessionalServiceForm.jsx', import.meta.url), 'utf8')
const cardSource = await readFile(new URL('../src/components/ProfessionalServiceCard.jsx', import.meta.url), 'utf8')
const hookSource = await readFile(new URL('../src/hooks/useProfessionalServices.js', import.meta.url), 'utf8')
const profileDrawerSource = await readFile(new URL('../src/components/PerfilDrawer.jsx', import.meta.url), 'utf8')

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function testUser(uid = 'uid-profissional') {
  return {
    uid,
    tokenCalls: 0,
    async getIdToken() {
      this.tokenCalls += 1
      return 'firebase-id-token-for-test'
    },
  }
}

const user = testUser()
const requests = []
const fetchImpl = async (url, options) => {
  requests.push({ url, options })
  if (options.method === 'GET') {
    return jsonResponse({ ok: true, data: { owner: true, services: [] } })
  }
  const body = JSON.parse(options.body)
  if (options.method === 'DELETE') {
    return jsonResponse({ ok: true, data: { action: 'delete', serviceId: body.serviceId, deleted: true } })
  }
  return jsonResponse({
    ok: true,
    data: {
      action: options.method === 'POST' ? 'create' : 'edit',
      serviceId: body.serviceId || 'svc-created',
      service: { id: body.serviceId || 'svc-created', ...body.service },
    },
  }, options.method === 'POST' ? 201 : 200)
}

await listOwnProfessionalServices({ user, expectedUid: user.uid, fetchImpl })
assert.equal(requests[0].url, '/api/professional-services')
assert.equal(requests[0].options.method, 'GET')
assert.equal(requests[0].options.headers.Authorization, 'Bearer firebase-id-token-for-test')
assert.equal(requests[0].options.cache, 'no-store')
assert.equal(requests[0].options.credentials, 'same-origin')

const service = {
  nome: 'Reparo elétrico',
  descricao: 'Troca de tomada',
  categoriaId: 'reparos',
  categoriaNome: 'Reparos',
  faixaPreco: 'R$ 80',
  tempoMedio: '1 hora',
  regiao: 'Centro',
  atendeDomicilio: true,
  urgente: false,
  ativo: true,
  fotos: { 0: 'https://i.ibb.co/reparo.webp' },
}
const operationId = createProfessionalServiceOperationId('create')
assert.match(operationId, /^[A-Za-z0-9_-]{8,128}$/)

await createOwnProfessionalService({ user, expectedUid: user.uid, fetchImpl, operationId, service })
await createOwnProfessionalService({ user, expectedUid: user.uid, fetchImpl, operationId, service })
const firstCreateBody = JSON.parse(requests[1].options.body)
const retryCreateBody = JSON.parse(requests[2].options.body)
assert.equal(firstCreateBody.operationId, operationId)
assert.deepEqual(retryCreateBody, firstCreateBody, 'retry idêntico mantém operationId e payload')

await editOwnProfessionalService({
  user,
  expectedUid: user.uid,
  fetchImpl,
  operationId: createProfessionalServiceOperationId('edit'),
  serviceId: 'svc-one',
  expectedRevision: 3,
  service,
})
assert.equal(requests[3].options.method, 'PATCH')
assert.equal(JSON.parse(requests[3].options.body).expectedRevision, 3)

await deleteOwnProfessionalService({
  user,
  expectedUid: user.uid,
  fetchImpl,
  operationId: createProfessionalServiceOperationId('delete'),
  serviceId: 'svc-one',
  expectedRevision: 4,
})
assert.equal(requests[4].options.method, 'DELETE')
assert.deepEqual(JSON.parse(requests[4].options.body), {
  operationId: JSON.parse(requests[4].options.body).operationId,
  serviceId: 'svc-one',
  expectedRevision: 4,
})

let mismatchFetchCalled = false
await assert.rejects(
  () => listOwnProfessionalServices({
    user,
    expectedUid: 'outro-uid',
    fetchImpl: async () => {
      mismatchFetchCalled = true
      return jsonResponse({ ok: true, data: {} })
    },
  }),
  (error) => error.code === 'professional_service_auth_mismatch',
)
assert.equal(mismatchFetchCalled, false, 'UID divergente falha antes da rede')

await assert.rejects(
  () => listOwnProfessionalServices({
    user,
    expectedUid: user.uid,
    fetchImpl: async () => jsonResponse({
      ok: false,
      reason: 'professional_service_auth_invalid',
      error: { code: 'professional_service_auth_invalid', message: 'Sessão inválida.', retryable: false },
    }, 401),
  }),
  (error) => error.code === 'professional_service_auth_invalid' && error.status === 401,
)
assert.match(getProfessionalServicesErrorMessage({ code: 'professional_service_stale_revision' }), /outro dispositivo/)
assert.match(getProfessionalServicesErrorMessage({ code: 'professional_service_limit_reached' }), /12 serviços/)

await assert.rejects(
  () => listOwnProfessionalServices({
    user,
    expectedUid: user.uid,
    fetchImpl: async () => { throw new TypeError('offline') },
  }),
  (error) => error.code === 'professional_service_network_error' && error.retryable === true,
)

const controller = new AbortController()
controller.abort()
await assert.rejects(
  () => listOwnProfessionalServices({
    user,
    expectedUid: user.uid,
    signal: controller.signal,
    fetchImpl: async (_url, options) => {
      if (options.signal.aborted) throw new DOMException('aborted', 'AbortError')
      return jsonResponse({ ok: true, data: {} })
    },
  }),
  (error) => error.code === 'professional_service_request_aborted',
)

const draft = createProfessionalServiceDraft({
  id: 'svc-one',
  revision: 2,
  nome: 'Reparo elétrico',
  categoriaId: 'reparos',
  categoriaNome: 'Reparos',
  faixaPreco: 'R$ 80',
  fotos: { 0: 'https://i.ibb.co/reparo.webp' },
})
const uploadedPhotos = createUploadedPhotoEntries({ fotos: { 0: 'https://i.ibb.co/reparo.webp' } })
assert.equal(getProfessionalServiceFormIssue({ draft, photos: uploadedPhotos }), '')
assert.deepEqual(buildProfessionalServicePayload(draft, uploadedPhotos).fotos, { 0: 'https://i.ibb.co/reparo.webp' })
assert.equal(
  getProfessionalServiceFormIssue({
    draft,
    photos: [{ ...uploadedPhotos[0], status: PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADING }],
  }),
  'professional_service_photo_uploading',
)
assert.equal(
  getProfessionalServiceFormIssue({
    draft,
    photos: [{ ...uploadedPhotos[0], status: PROFESSIONAL_SERVICE_PHOTO_STATUS.FAILED }],
  }),
  'professional_service_photo_failed',
)
assert.deepEqual(
  buildProfessionalServicePayload(draft, [
    { status: PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADED, url: 'blob:https://preview/1' },
    ...uploadedPhotos,
  ]).fotos,
  { 0: 'https://i.ibb.co/reparo.webp' },
  'blob não entra no payload mesmo com estado adulterado',
)
assert.equal(countLegacyPortfolioServices([{ id: 'old' }]), 1)
assert.equal(countLegacyPortfolioServices({ old: { id: 'old' } }), 1)

const firstFingerprint = professionalServiceOperationFingerprint({ action: 'edit', serviceId: 'svc-one', revision: 2, payload: service })
const sameFingerprint = professionalServiceOperationFingerprint({ action: 'edit', serviceId: 'svc-one', revision: 2, payload: { ...service } })
const changedFingerprint = professionalServiceOperationFingerprint({ action: 'edit', serviceId: 'svc-one', revision: 2, payload: { ...service, nome: 'Outro' } })
assert.equal(firstFingerprint, sameFingerprint)
assert.notEqual(firstFingerprint, changedFingerprint, 'edição real gera uma nova identidade de operação')

assert.match(hookSource, /mutationLockRef\.current/, 'hook bloqueia mutações simultâneas antes do rerender')
assert.match(hookSource, /generationRef\.current \+= 1[\s\S]*abortPending\(\)/, 'troca de conta invalida respostas e requisições')
assert.match(hookSource, /controller\.signal\.aborted/, 'resposta cancelada não atualiza estado')
assert.match(hookSource, /loadedUid === activeUid/, 'dados de outra conta não são reutilizados')
assert.match(hookSource, /featureEnabled: result\?\.featureEnabled === true/, 'UI aceita somente liberação explícita do servidor')
assert.match(sectionSource, /operationRef\.current\?\.fingerprint === fingerprint/, 'retry inalterado reutiliza operationId')
assert.match(sectionSource, /setFormError\(getProfessionalServicesErrorMessage\(error\)\)/, 'erro preserva o formulário e recebe mensagem clara')
assert.match(sectionSource, /setFormMode\(''\)[\s\S]*setSectionNotice/, 'sucesso visual só ocorre depois da API')
assert.match(sectionSource, /A lista não foi interpretada como vazia/, 'falha de leitura não vira estado vazio')
assert.match(sectionSource, /aguardando migração/, 'legado ainda não migrado é identificado')
assert.match(sectionSource, /disabled=\{!featureEnabled \|\|/, 'novo serviço fica indisponível até ativação coordenada')
assert.match(sectionSource, /Portfólio 2\.0 em preparação/, 'estado desativado é explícito e não simula perda de dados')
assert.doesNotMatch(sectionSource, /firebaseDebug|runTransaction|professionalServices\//, 'interface não possui caminho direto ao RTDB')
assert.match(formSource, /máximo cinco fotos|Até 5 fotos/, 'formulário comunica limite de fotos')
assert.match(formSource, /Detalhes adicionais/, 'campos secundários são recolhíveis')
assert.match(cardSource, /Ativo[\s\S]*Oculto/, 'card diferencia estado público')
assert.match(profileDrawerSource, /<ProfessionalPortfolioSection/, 'PerfilDrawer usa a nova seção modular')
assert.doesNotMatch(profileDrawerSource, /salvarPortfolio|adicionarPortfolioItem|removerPortfolioItem/, 'fluxos diretos antigos foram removidos')

console.log('Portfólio 2.0 UI/API: auth, HTTP, retry, conflito, logout, duplicação, legado e estados de erro OK')
