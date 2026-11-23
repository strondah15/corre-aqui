import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  equalTo,
  get,
  limitToFirst,
  limitToLast,
  orderByChild,
  query,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from 'firebase/database'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getDatabase as getAdminDatabase } from 'firebase-admin/database'
import {
  ProfessionalServiceServerError,
  createProfessionalService,
  deleteProfessionalService,
  editProfessionalService,
  getProfessionalService,
  listProfessionalServices,
} from '../src/lib/professionalServicesServer.js'
import {
  buildProfessionalServiceContractSnapshot,
  listPublicProfessionalServices,
  resolveAuthoritativeProfessionalService,
} from '../src/lib/professionalServiceCatalog.js'
import {
  disablePushDevice,
  getPushDeviceState,
  registerPushDevice,
} from '../src/lib/pushDeviceRegistryServer.js'

const PROJECT_ID = 'demo-corre-aqui-security'
const rawHost = String(process.env.FIREBASE_DATABASE_EMULATOR_HOST || '')
const hostMatch = rawHost.match(/^(localhost|127\.0\.0\.1):(\d+)$/)
if (!hostMatch) {
  throw new Error('Execute este teste pelo script test:rules:emulator; somente um Emulator local é aceito.')
}
if (String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || PROJECT_ID) !== PROJECT_ID) {
  throw new Error('Projeto inesperado. O teste de Rules exige o projeto isolado demo-corre-aqui-security.')
}

const rules = await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')
const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  database: {
    host: hostMatch[1],
    port: Number(hostMatch[2]),
    rules,
  },
})
const adminApp = initializeAdminApp({
  projectId: PROJECT_ID,
  databaseURL: `http://${hostMatch[1]}:${hostMatch[2]}?ns=${PROJECT_ID}`,
}, 'professional-services-emulator-tests')
const adminDatabase = getAdminDatabase(adminApp)

const CLIENT = 'client-A'
const WORKER = 'worker-B'
const OUTSIDER = 'outsider-C'
const LIMIT_OWNER = 'limit-owner'
const LEGACY_OWNER = 'legacy-owner'
const V2_EMPTY_OWNER = 'v2-empty-owner'
const baseTime = Date.now() - 10_000
const actor = (id, nome) => ({ id, nome })
const acceptedOrder = (id, status = 'aceito') => ({
  id,
  titulo: 'Instalação de suporte',
  descricao: 'Pedido de teste local',
  status,
  criador: actor(CLIENT, 'Cliente A'),
  aceite: { ...actor(WORKER, 'Profissional B'), aceitoEm: baseTime },
  criadoEm: baseTime - 1_000,
  criadoEmServer: baseTime - 1_000,
  atualizadoEm: baseTime,
  atualizadoEmServer: baseTime,
})
const message = (uid, name, now = Date.now()) => ({
  tipo: 'texto',
  texto: 'Mensagem de teste',
  autor: name,
  autorNome: name,
  userId: uid,
  hora: now,
  criadoEm: now,
  criadoEmServer: now,
})
const professionalService = (id, overrides = {}) => ({
  schemaVersion: 2,
  id,
  nome: 'Reparos residenciais',
  descricao: 'Serviço canônico para teste local.',
  categoriaId: 'reparos',
  categoriaNome: 'Reparos',
  faixaPreco: 'A partir de R$ 80',
  tempoMedio: '1 hora',
  regiao: 'São Paulo',
  atendeDomicilio: true,
  urgente: false,
  ativo: true,
  fotos: { 0: `https://images.example.test/${id}.webp` },
  createdAt: baseTime - 1_000,
  updatedAt: baseTime,
  revision: 1,
  ...overrides,
})
const newProfessionalService = (id, overrides = {}) => professionalService(id, {
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
})
const professionalServiceInput = (overrides = {}) => ({
  nome: 'Reparos residenciais',
  descricao: 'Serviço criado exclusivamente no Emulator local.',
  categoriaId: 'reparos',
  categoriaNome: 'Reparos',
  faixaPreco: 'A partir de R$ 80',
  tempoMedio: '1 hora',
  regiao: 'São Paulo',
  atendeDomicilio: true,
  urgente: false,
  ativo: true,
  fotos: { 0: 'https://images.example.test/service.webp' },
  ...overrides,
})
const seededLimitServices = Object.fromEntries(
  Array.from({ length: 11 }, (_, index) => {
    const id = `limit-service-${String(index + 1).padStart(2, '0')}`
    return [id, professionalService(id)]
  })
)

async function expectProfessionalServiceError(operation, expectedCode) {
  try {
    await operation
    assert.fail(`esperava erro ${expectedCode}`)
  } catch (error) {
    assert.ok(error instanceof ProfessionalServiceServerError, `erro inesperado: ${error?.message}`)
    assert.equal(error.code, expectedCode)
    return error
  }
}

try {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const database = context.database()
    await set(ref(database), {
      pedidos: {
        'order-open': {
          id: 'order-open',
          titulo: 'Pedido aberto',
          descricao: 'Descrição inicial',
          valor: 100,
          status: 'aberto',
          criador: actor(CLIENT, 'Cliente A'),
          criadoEm: baseTime - 1_000,
          criadoEmServer: baseTime - 1_000,
          atualizadoEm: baseTime,
          atualizadoEmServer: baseTime,
        },
        'order-flow': acceptedOrder('order-flow'),
        'order-cancel': acceptedOrder('order-cancel'),
        'order-final': {
          ...acceptedOrder('order-final', 'finalizado'),
          finalizadoEm: baseTime,
          finalizadoPor: actor(CLIENT, 'Cliente A'),
          atendimento: {
            finalizadoEm: baseTime,
            finalizadoPor: actor(CLIENT, 'Cliente A'),
          },
        },
        'order-chat': acceptedOrder('order-chat'),
      },
      notifications: {
        [CLIENT]: {
          'server-existing': {
            id: 'server-existing',
            eventId: 'server-existing',
            serverGenerated: true,
            tipo: 'pedido_aceito',
            titulo: 'Seu pedido foi aceito',
            mensagem: 'Mensagem do servidor',
            pedidoId: 'order-flow',
            fromUid: WORKER,
            toUid: CLIENT,
            lida: false,
            read: false,
            criadoEm: baseTime,
          },
        },
      },
      notificacoes: {
        [CLIENT]: {
          'server-existing': {
            id: 'server-existing',
            eventId: 'server-existing',
            serverGenerated: true,
            tipo: 'pedido_aceito',
            titulo: 'Seu pedido foi aceito',
            mensagem: 'Mensagem do servidor',
            pedidoId: 'order-flow',
            fromUid: WORKER,
            toUid: CLIENT,
            lida: false,
            read: false,
            criadoEm: baseTime,
          },
        },
      },
      users: {
        [CLIENT]: {
          nome: 'Cliente A',
          online: false,
          portfolioSchemaVersion: 2,
          xp: 0,
          moedas: 0,
          servicosCorre: 0,
          servicosProf: 0,
          patenteCorre: 0,
          patenteProf: 0,
          patenteAtualizadaEm: baseTime,
          missaoAtualizadaEm: baseTime,
        },
        [WORKER]: {
          nome: 'Profissional B',
          online: false,
          xp: 90,
          moedas: 7,
          servicosCorre: 4,
          servicosProf: 2,
          patenteCorre: 1,
          patenteProf: 1,
          patenteAtualizadaEm: baseTime,
          missaoAtualizadaEm: baseTime,
          portfolio: {
            'legacy-private': {
              id: 'legacy-private',
              nome: 'Serviço legado preservado',
              ativo: true,
              descricao: 'Formato anterior ainda acessível ao proprietário.',
            },
          },
        },
        'repeat-owner': {
          nome: 'Profissional de repetição',
          online: false,
        },
        [LIMIT_OWNER]: {
          nome: 'Profissional no limite',
          online: false,
        },
        [LEGACY_OWNER]: {
          nome: 'Profissional legado',
          online: false,
          portfolio: {
            'legacy-service': {
              id: 'legacy-service',
              nome: 'Serviço legado ativo',
              categoriaId: 'reparos',
              categoriaNome: 'Reparos',
              faixaPreco: 'R$ 70',
              ativo: true,
            },
          },
        },
        [V2_EMPTY_OWNER]: {
          nome: 'Profissional v2 vazio',
          online: false,
          portfolioSchemaVersion: 2,
          portfolio: {
            resurrected: {
              id: 'resurrected',
              nome: 'Não pode ressuscitar',
              ativo: true,
            },
          },
        },
      },
      professionalServices: {
        [WORKER]: {
          'service-active': professionalService('service-active'),
          'service-inactive': professionalService('service-inactive', { ativo: false }),
        },
        [LIMIT_OWNER]: seededLimitServices,
      },
      publicProfiles: {
        [WORKER]: {
          uid: WORKER,
          id: WORKER,
          nome: 'Profissional B',
          createdAt: baseTime - 10_000,
          updatedAt: baseTime,
          atualizadoEm: baseTime,
          servicosCorre: 4,
          servicosProf: 2,
          servicosConcluidos: 6,
          completedServices: 6,
          reputation: { rating: 5, reviewCount: 1, completedServices: 6 },
        },
        [LEGACY_OWNER]: {
          uid: LEGACY_OWNER,
          id: LEGACY_OWNER,
          nome: 'Profissional legado',
          isProfissional: true,
          profTitulo: 'Reparos legados',
          profCategorias: ['reparos'],
          createdAt: baseTime - 10_000,
          updatedAt: baseTime,
          atualizadoEm: baseTime,
        },
        [V2_EMPTY_OWNER]: {
          uid: V2_EMPTY_OWNER,
          id: V2_EMPTY_OWNER,
          nome: 'Profissional v2 vazio',
          isProfissional: true,
          portfolioSchemaVersion: 2,
          profTitulo: 'Não ressuscitar legado',
          profCategorias: ['reparos'],
          portfolio: {
            resurrected: {
              id: 'resurrected',
              nome: 'Não pode ressuscitar',
              ativo: true,
            },
          },
          createdAt: baseTime - 10_000,
          updatedAt: baseTime,
          atualizadoEm: baseTime,
        },
      },
      publicPortfolio: {
        [LEGACY_OWNER]: {
          'legacy-service': {
            id: 'legacy-service',
            nome: 'Serviço legado ativo',
            titulo: 'Serviço legado ativo',
            descricao: 'Compatibilidade sem gravação duplicada.',
            categoriaId: 'reparos',
            categoriaNome: 'Reparos',
            categoria: 'Reparos',
            preco: 'R$ 70',
            faixaPreco: 'R$ 70',
            valor: 'R$ 70',
            tempoMedio: '1 hora',
            fotoURL: '',
            regiao: 'São Paulo',
            atendeDomicilio: true,
            urgente: false,
            ativo: true,
            createdAt: baseTime - 2_000,
            updatedAt: baseTime,
            profissionalId: LEGACY_OWNER,
            uid: LEGACY_OWNER,
            profissionalNome: 'Profissional legado',
            providerName: 'Profissional legado',
            profissionalFotoURL: '',
            providerFotoURL: '',
            cidade: 'São Paulo',
            isCorre: false,
            isProfissional: true,
          },
        },
      },
      missoes: {
        [WORKER]: {
          '2026-10-18': {
            aceitou: 1,
            entregou: 1,
            boostou: 0,
            xp: 10,
            moedas: 4,
            updatedAt: baseTime,
          },
        },
      },
      attendanceRewardGrants: {
        'server-grant': {
          version: 1,
          pedidoId: 'server-grant',
          beneficiaryUid: WORKER,
          status: 'completed',
        },
      },
      stagingSubscriptionFixtures: {
        [CLIENT]: {
          client: {
            version: 1,
            kind: 'client',
            source: 'staging_subscription_fixture_v1',
            accountType: 'dedicated_test',
            subjectUid: CLIENT,
            testAccountId: 'test-client-a',
            status: 'active',
            issuedAt: baseTime,
            expiresAt: baseTime + 60_000,
            updatedAt: baseTime,
            revision: 1,
            lastOperationId: 'operation-seed-01',
            operations: {
              'operation-seed-01': { type: 'grant' },
            },
          },
        },
      },
      privateRequests: {
        'private-final': {
          id: 'private-final',
          tipo: 'agendamento',
          status: 'finalizado',
          clienteId: CLIENT,
          profissionalId: WORKER,
          criadoEm: baseTime - 1_000,
          criadoEmServer: baseTime - 1_000,
          atendimento: {},
        },
      },
    })
  })

  const clientDb = testEnv.authenticatedContext(CLIENT).database()
  const workerDb = testEnv.authenticatedContext(WORKER).database()
  const outsiderDb = testEnv.authenticatedContext(OUTSIDER).database()
  const limitOwnerDb = testEnv.authenticatedContext(LIMIT_OWNER).database()
  const anonymousDb = testEnv.unauthenticatedContext().database()

  const ownerServices = await assertSucceeds(get(ref(workerDb, `professionalServices/${WORKER}`)))
  assert.deepEqual(
    Object.keys(ownerServices.val() || {}).sort(),
    ['service-active', 'service-inactive'],
    'proprietário lista serviços ativos e inativos sem query pública',
  )
  await assertFails(get(ref(outsiderDb, `professionalServices/${WORKER}`)), 'terceiro não enumera serviços sem filtro')
  await assertFails(get(ref(anonymousDb, `professionalServices/${WORKER}`)), 'anônimo não enumera serviços')
  await assertFails(get(ref(outsiderDb, 'professionalServices')), 'raiz global não pode ser enumerada')
  await assertSucceeds(get(ref(outsiderDb, `professionalServices/${WORKER}/service-active`)))
  await assertFails(get(ref(outsiderDb, `professionalServices/${WORKER}/service-inactive`)))
  await assertFails(get(ref(anonymousDb, `professionalServices/${WORKER}/service-active`)))

  const activeQuery = query(
    ref(outsiderDb, `professionalServices/${WORKER}`),
    orderByChild('ativo'),
    equalTo(true),
    limitToFirst(12),
  )
  const activeQuerySnapshot = await assertSucceeds(get(activeQuery))
  assert.deepEqual(Object.keys(activeQuerySnapshot.val() || {}), ['service-active'])
  await assertSucceeds(get(query(
    ref(outsiderDb, `professionalServices/${WORKER}`),
    orderByChild('ativo'),
    equalTo(true),
    limitToLast(12),
  )))
  await assertFails(get(query(
    ref(outsiderDb, `professionalServices/${WORKER}`),
    orderByChild('ativo'),
    equalTo(true),
  )), 'consulta pública sem limite é negada')
  await assertFails(get(query(
    ref(outsiderDb, `professionalServices/${WORKER}`),
    orderByChild('ativo'),
    equalTo(true),
    limitToFirst(13),
  )), 'consulta pública acima do limite é negada')
  await assertFails(get(query(
    ref(outsiderDb, `professionalServices/${WORKER}`),
    orderByChild('ativo'),
    equalTo(false),
    limitToFirst(12),
  )), 'terceiro não consulta serviços inativos')
  await assertFails(get(query(
    ref(anonymousDb, `professionalServices/${WORKER}`),
    orderByChild('ativo'),
    equalTo(true),
    limitToFirst(12),
  )), 'anônimo não usa nem a consulta pública limitada')

  const catalogBeforeMarker = await listPublicProfessionalServices({
    database: adminDatabase,
    professionalId: WORKER,
    now: baseTime + 20_000,
  })
  assert.equal(catalogBeforeMarker.source, 'none')
  assert.equal(catalogBeforeMarker.portfolioSchemaVersion, 1)
  assert.deepEqual(catalogBeforeMarker.services, [], 'coleção v2 sem marcador não ativa o catálogo')
  const legacyCatalog = await listPublicProfessionalServices({
    database: adminDatabase,
    professionalId: LEGACY_OWNER,
    now: baseTime + 20_000,
  })
  assert.equal(legacyCatalog.source, 'legacy')
  assert.deepEqual(legacyCatalog.services.map(({ id }) => id), ['legacy-service'])
  const legacyResolved = await resolveAuthoritativeProfessionalService({
    database: adminDatabase,
    professionalId: LEGACY_OWNER,
    serviceId: 'legacy-service',
    now: baseTime + 20_000,
  })
  assert.equal(legacyResolved.source, 'legacy')
  const emptyV2Catalog = await listPublicProfessionalServices({
    database: adminDatabase,
    professionalId: V2_EMPTY_OWNER,
    now: baseTime + 20_000,
  })
  assert.equal(emptyV2Catalog.source, 'canonical')
  assert.deepEqual(emptyV2Catalog.services, [], 'marcador v2 impede ressurreição do array legado')
  await assert.rejects(
    resolveAuthoritativeProfessionalService({
      database: adminDatabase,
      professionalId: V2_EMPTY_OWNER,
      serviceId: 'resurrected',
      now: baseTime + 20_000,
    }),
    (error) => error?.code === 'professional_service_not_found',
  )

  await assertSucceeds(get(ref(workerDb, `users/${WORKER}/portfolio/legacy-private`)))
  await assertSucceeds(update(ref(workerDb, `users/${WORKER}/portfolio/legacy-private`), {
    descricao: 'Legado continua compatível enquanto o v2 é aditivo.',
  }))
  await assertFails(set(
    ref(workerDb, `professionalServices/${WORKER}/legacy-shape`),
    { id: 'legacy-shape', nome: 'Formato incompleto', ativo: true },
  ), 'shape legado incompleto não é aceito na raiz v2')

  const blockedClientPath = `professionalServices/${WORKER}/service-client-bypass`
  await assertFails(set(ref(workerDb, blockedClientPath), newProfessionalService('service-client-bypass')))
  await assertFails(update(ref(workerDb, `professionalServices/${WORKER}/service-active`), {
    descricao: 'Tentativa direta do proprietário.',
    updatedAt: serverTimestamp(),
    revision: 2,
  }))
  await assertFails(remove(ref(workerDb, `professionalServices/${WORKER}/service-active`)))
  await assertFails(set(ref(outsiderDb, `professionalServices/${WORKER}/service-forged`), newProfessionalService('service-forged')))
  await assertFails(set(ref(anonymousDb, `professionalServices/${WORKER}/service-anonymous`), newProfessionalService('service-anonymous')))
  await assertFails(set(ref(workerDb, `professionalServices/${OUTSIDER}/service-cross-uid`), newProfessionalService('service-cross-uid')))
  await assertFails(get(ref(workerDb, `professionalServiceOperations/${WORKER}`)))
  await assertFails(set(ref(workerDb, `professionalServiceOperations/${WORKER}/forged-operation`), {
    status: 'completed',
  }))

  const backendNow = Date.now()
  const createResult = await createProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    operationId: 'backend-create-0001',
    input: professionalServiceInput(),
    now: backendNow,
  })
  assert.equal(createResult.revision, 1)
  assert.equal(createResult.service.createdAt, backendNow)
  assert.equal(createResult.service.updatedAt, backendNow)
  assert.equal(createResult.idempotent, false)
  assert.equal((await adminDatabase.ref(`users/${WORKER}/portfolioSchemaVersion`).get()).val(), 2)
  assert.equal((await adminDatabase.ref(`publicProfiles/${WORKER}/portfolioSchemaVersion`).get()).val(), 2)
  const canonicalCatalog = await listPublicProfessionalServices({
    database: adminDatabase,
    professionalId: WORKER,
    now: backendNow + 1,
  })
  assert.equal(canonicalCatalog.source, 'canonical')
  assert.equal(canonicalCatalog.portfolioSchemaVersion, 2)
  assert.ok(canonicalCatalog.services.some(({ id }) => id === 'service-active'))
  assert.ok(canonicalCatalog.services.some(({ id }) => id === createResult.serviceId))
  assert.equal(canonicalCatalog.services.some(({ id }) => id === 'service-inactive'), false)
  await assertFails(set(ref(workerDb, `users/${WORKER}/portfolioSchemaVersion`), 1))
  await assertFails(remove(ref(workerDb, `users/${WORKER}/portfolioSchemaVersion`)))
  await assertFails(set(ref(workerDb, `publicProfiles/${WORKER}/portfolioSchemaVersion`), 1))
  await assertFails(remove(ref(workerDb, `publicProfiles/${WORKER}/portfolioSchemaVersion`)))

  const duplicateCreate = await createProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    operationId: 'backend-create-0001',
    input: professionalServiceInput(),
    now: backendNow + 1,
  })
  assert.equal(duplicateCreate.serviceId, createResult.serviceId)
  assert.equal(duplicateCreate.revision, 1)
  assert.equal(duplicateCreate.idempotent, true)
  assert.deepEqual(duplicateCreate.service.fotos, { 0: 'https://images.example.test/service.webp' })
  await expectProfessionalServiceError(createProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    operationId: 'backend-create-0001',
    input: professionalServiceInput({ nome: 'Outro conteúdo' }),
    now: backendNow + 2,
  }), 'professional_service_idempotency_conflict')

  await adminDatabase.ref(`professionalServiceOperations/${WORKER}/backend-create-0001`).remove()
  const recoveredCreate = await createProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    operationId: 'backend-create-0001',
    input: professionalServiceInput(),
    now: backendNow + 3,
  })
  assert.equal(recoveredCreate.serviceId, createResult.serviceId)
  assert.equal(recoveredCreate.idempotent, true, 'retry recupera criação confirmada antes do ledger')

  const simultaneousRetries = await Promise.all([
    createProfessionalService({
      database: adminDatabase,
      uid: 'repeat-owner',
      operationId: 'backend-same-operation',
      input: professionalServiceInput({ nome: 'Repetição simultânea' }),
      now: backendNow + 3,
    }),
    createProfessionalService({
      database: adminDatabase,
      uid: 'repeat-owner',
      operationId: 'backend-same-operation',
      input: professionalServiceInput({ nome: 'Repetição simultânea' }),
      now: backendNow + 3,
    }),
  ])
  assert.equal(simultaneousRetries[0].serviceId, simultaneousRetries[1].serviceId)
  assert.equal(Object.keys((await adminDatabase.ref('professionalServices/repeat-owner').get()).val() || {}).length, 1)

  await expectProfessionalServiceError(createProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    operationId: 'backend-invalid-url-01',
    input: professionalServiceInput({ fotos: { 0: 'blob:https://app.example.test/preview' } }),
    now: backendNow + 4,
  }), 'professional_service_validation_failed')
  await expectProfessionalServiceError(createProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    operationId: 'backend-client-time-01',
    input: { ...professionalServiceInput(), createdAt: 1 },
    now: backendNow + 5,
  }), 'professional_service_managed_or_unknown_field')

  const edited = await editProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    serviceId: createResult.serviceId,
    operationId: 'backend-edit-0001',
    expectedRevision: 1,
    input: { descricao: 'Descrição editada pelo backend.' },
    now: backendNow + 10,
  })
  assert.equal(edited.revision, 2)
  assert.equal(edited.service.createdAt, backendNow)
  const contractSnapshot = buildProfessionalServiceContractSnapshot(createResult.service, {
    professionalId: WORKER,
    capturedAt: backendNow + 9,
  })
  assert.equal(contractSnapshot.sourceRevision, 1)
  assert.equal(contractSnapshot.descricao, createResult.service.descricao)
  assert.notEqual(contractSnapshot.descricao, edited.service.descricao, 'snapshot histórico não acompanha edição posterior')
  await adminDatabase.ref(`professionalServiceOperations/${WORKER}/backend-edit-0001`).update({
    status: 'processing',
    result: null,
    completedAt: null,
    updatedAt: backendNow + 10,
  })
  const duplicateEdit = await editProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    serviceId: createResult.serviceId,
    operationId: 'backend-edit-0001',
    expectedRevision: 1,
    input: { descricao: 'Descrição editada pelo backend.' },
    now: backendNow + 11,
  })
  assert.equal(duplicateEdit.revision, 2)
  assert.equal(duplicateEdit.idempotent, true)
  await expectProfessionalServiceError(editProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    serviceId: createResult.serviceId,
    operationId: 'backend-edit-new-operation',
    expectedRevision: 1,
    input: { descricao: 'Descrição editada pelo backend.' },
    now: backendNow + 12,
  }), 'professional_service_stale_revision')

  const concurrentEdits = await Promise.allSettled([
    editProfessionalService({
      database: adminDatabase,
      uid: WORKER,
      serviceId: createResult.serviceId,
      operationId: 'backend-edit-race-a',
      expectedRevision: 2,
      input: { descricao: 'Atualização concorrente A' },
      now: backendNow + 20,
    }),
    editProfessionalService({
      database: adminDatabase,
      uid: WORKER,
      serviceId: createResult.serviceId,
      operationId: 'backend-edit-race-b',
      expectedRevision: 2,
      input: { descricao: 'Atualização concorrente B' },
      now: backendNow + 21,
    }),
  ])
  assert.equal(concurrentEdits.filter(({ status }) => status === 'fulfilled').length, 1)
  assert.equal(concurrentEdits.filter(({ status }) => status === 'rejected').length, 1)
  const rejectedEdit = concurrentEdits.find(({ status }) => status === 'rejected')
  assert.equal(rejectedEdit.reason.code, 'professional_service_stale_revision')

  const afterRace = await getProfessionalService({
    database: adminDatabase,
    actorUid: WORKER,
    targetUid: WORKER,
    serviceId: createResult.serviceId,
    now: backendNow + 30,
  })
  assert.equal(afterRace.service.revision, 3)
  await expectProfessionalServiceError(deleteProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    serviceId: createResult.serviceId,
    operationId: 'backend-delete-stale',
    expectedRevision: 2,
    now: backendNow + 31,
  }), 'professional_service_stale_revision')

  const deleted = await deleteProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    serviceId: createResult.serviceId,
    operationId: 'backend-delete-0001',
    expectedRevision: 3,
    now: backendNow + 32,
  })
  assert.equal(deleted.deleted, true)
  await adminDatabase.ref(`professionalServiceOperations/${WORKER}/backend-delete-0001`).update({
    status: 'processing',
    result: null,
    completedAt: null,
    updatedAt: backendNow + 32,
  })
  const duplicateDelete = await deleteProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    serviceId: createResult.serviceId,
    operationId: 'backend-delete-0001',
    expectedRevision: 3,
    now: backendNow + 33,
  })
  assert.equal(duplicateDelete.deleted, true)
  assert.equal(duplicateDelete.idempotent, true)

  const deleteRaceService = await createProfessionalService({
    database: adminDatabase,
    uid: WORKER,
    operationId: 'backend-delete-race-create',
    input: professionalServiceInput({ nome: 'Serviço para exclusão concorrente' }),
    now: backendNow + 34,
  })
  const concurrentDeletes = await Promise.allSettled([
    deleteProfessionalService({
      database: adminDatabase,
      uid: WORKER,
      serviceId: deleteRaceService.serviceId,
      operationId: 'backend-delete-race-a',
      expectedRevision: 1,
      now: backendNow + 35,
    }),
    deleteProfessionalService({
      database: adminDatabase,
      uid: WORKER,
      serviceId: deleteRaceService.serviceId,
      operationId: 'backend-delete-race-b',
      expectedRevision: 1,
      now: backendNow + 36,
    }),
  ])
  assert.equal(concurrentDeletes.filter(({ status }) => status === 'fulfilled').length, 1)
  assert.equal(concurrentDeletes.filter(({ status }) => status === 'rejected').length, 1)
  assert.equal(concurrentDeletes.find(({ status }) => status === 'rejected').reason.code, 'professional_service_stale_revision')

  const ownerList = await listProfessionalServices({
    database: adminDatabase,
    actorUid: WORKER,
    targetUid: WORKER,
    now: backendNow + 40,
  })
  assert.equal(ownerList.owner, true)
  assert.equal(ownerList.services.some(({ ativo }) => ativo === false), true)
  const publicList = await listProfessionalServices({
    database: adminDatabase,
    actorUid: OUTSIDER,
    targetUid: WORKER,
    now: backendNow + 40,
  })
  assert.equal(publicList.owner, false)
  assert.equal(publicList.services.every(({ ativo }) => ativo === true), true)
  await expectProfessionalServiceError(getProfessionalService({
    database: adminDatabase,
    actorUid: OUTSIDER,
    targetUid: WORKER,
    serviceId: 'service-inactive',
    now: backendNow + 40,
  }), 'professional_service_not_found')

  await assertFails(set(
    ref(limitOwnerDb, `professionalServices/${LIMIT_OWNER}/client-bypass`),
    newProfessionalService('client-bypass'),
  ))
  const limitResults = await Promise.allSettled([
    createProfessionalService({
      database: adminDatabase,
      uid: LIMIT_OWNER,
      operationId: 'backend-limit-race-a',
      input: professionalServiceInput({ nome: 'Décimo segundo A' }),
      now: backendNow + 50,
    }),
    createProfessionalService({
      database: adminDatabase,
      uid: LIMIT_OWNER,
      operationId: 'backend-limit-race-b',
      input: professionalServiceInput({ nome: 'Décimo segundo B' }),
      now: backendNow + 51,
    }),
  ])
  assert.equal(
    limitResults.filter(({ status }) => status === 'fulfilled').length,
    1,
    'somente uma criação concorrente ocupa a 12ª vaga',
  )
  assert.equal(
    limitResults.filter(({ status }) => status === 'rejected').length,
    1,
    'a outra criação concorrente é rejeitada pelo limite autoritativo',
  )
  const limitRejection = limitResults.find(({ status }) => status === 'rejected')
  assert.equal(limitRejection.reason.code, 'professional_service_limit_reached')
  const limitedCollection = (await adminDatabase.ref(`professionalServices/${LIMIT_OWNER}`).get()).val()
  assert.equal(Object.keys(limitedCollection || {}).length, 12, 'duas criações simultâneas nunca ultrapassam 12')
  const limitWinner = limitResults.find(({ status }) => status === 'fulfilled').value
  const duplicateLimitWinner = await createProfessionalService({
    database: adminDatabase,
    uid: LIMIT_OWNER,
    operationId: limitWinner.service.nome.endsWith('A') ? 'backend-limit-race-a' : 'backend-limit-race-b',
    input: professionalServiceInput({ nome: limitWinner.service.nome }),
    now: backendNow + 52,
  })
  assert.equal(duplicateLimitWinner.serviceId, limitWinner.serviceId)
  assert.equal(Object.keys((await adminDatabase.ref(`professionalServices/${LIMIT_OWNER}`).get()).val() || {}).length, 12)
  const loserIndex = limitResults.findIndex(({ status }) => status === 'rejected')
  await expectProfessionalServiceError(createProfessionalService({
    database: adminDatabase,
    uid: LIMIT_OWNER,
    operationId: loserIndex === 0 ? 'backend-limit-race-a' : 'backend-limit-race-b',
    input: professionalServiceInput({ nome: loserIndex === 0 ? 'Décimo segundo A' : 'Décimo segundo B' }),
    now: backendNow + 53,
  }), 'professional_service_limit_reached')
  assert.equal(Object.keys((await adminDatabase.ref(`professionalServices/${LIMIT_OWNER}`).get()).val() || {}).length, 12)

  await assertSucceeds(update(ref(workerDb, `users/${WORKER}`), {
    online: true,
    lastSeen: Date.now(),
  }), 'perfil preserva escrita legítima não relacionada a recompensas')
  await assertFails(update(ref(workerDb, `users/${WORKER}`), { xp: 9_999 }))
  await assertFails(update(ref(workerDb, `users/${WORKER}`), { moedas: 9_999 }))
  await assertFails(update(ref(workerDb, `users/${WORKER}`), { servicosCorre: 999 }))
  await assertFails(update(ref(workerDb, `users/${WORKER}`), { patente: 5 }))
  await assertFails(update(ref(workerDb, `users/${WORKER}`), { patenteCorre: 5 }))
  await assertFails(update(ref(workerDb, `users/${WORKER}`), { patenteProf: 5 }))
  await assertFails(remove(ref(workerDb, `users/${WORKER}/xp`)), 'campo protegido não pode ser removido')
  await assertFails(set(ref(workerDb, `users/${WORKER}/attendanceRewardClaims/order-forged`), {
    version: 1,
    pedidoId: 'order-forged',
    mode: 'corre',
  }))
  await assertFails(update(ref(workerDb, `publicProfiles/${WORKER}`), {
    servicosCorre: 999,
    completedServices: 999,
  }), 'cliente antigo não altera a contagem pública de serviços')
  await assertFails(update(ref(workerDb, `publicProfiles/${WORKER}`), {
    'reputation/completedServices': 999,
  }), 'cliente antigo não altera a reputação pública')
  await assertFails(update(ref(workerDb, `missoes/${WORKER}/2026-10-18`), {
    entregou: 999,
    xp: 9_999,
    moedas: 9_999,
  }))
  await assertFails(set(ref(workerDb, `missoes/${WORKER}/2026-10-19`), {
    entregou: 1,
    xp: 10,
    moedas: 4,
  }))
  await assertFails(set(
    ref(workerDb, 'pedidos/order-final/atendimento/recompensasContabilizadas'),
    true,
  ))
  await assertFails(set(
    ref(workerDb, 'pedidos/order-final/atendimento/recompensasContabilizadasEm'),
    Date.now(),
  ))
  await assertFails(set(
    ref(clientDb, 'privateRequests/private-final/atendimento/recompensasContabilizadas'),
    true,
  ), 'cliente não marca pedido privado como contabilizado')
  await assertFails(update(ref(clientDb, 'pedidos/order-flow'), {
    criadoEmServer: Date.now(),
  }), 'cliente não altera o timestamp server-side de criação')
  await assertFails(update(ref(workerDb, 'pedidos/order-flow'), {
    criadoEmServer: Date.now(),
  }), 'profissional não antecipa a elegibilidade alterando o timestamp server-side')
  await assertFails(get(ref(workerDb, 'attendanceRewardGrants/server-grant')))
  await assertFails(get(ref(clientDb, `stagingSubscriptionFixtures/${CLIENT}/client`)))
  await assertFails(get(ref(workerDb, `stagingSubscriptionFixtures/${CLIENT}/client`)))
  await assertFails(get(ref(anonymousDb, `stagingSubscriptionFixtures/${CLIENT}/client`)))
  await assertFails(set(ref(clientDb, `stagingSubscriptionFixtures/${CLIENT}/client/status`), 'active'))
  await assertFails(set(ref(workerDb, `stagingSubscriptionFixtures/${WORKER}/client`), {
    status: 'active',
    expiresAt: Date.now() + 60_000,
  }))

  await assertSucceeds(get(ref(clientDb, 'pedidos/order-flow')))
  await assertSucceeds(get(ref(workerDb, 'pedidos/order-flow')))
  await assertFails(get(ref(outsiderDb, 'pedidos/order-flow')))
  await assertFails(get(ref(clientDb, 'pedidos')), 'usuário comum não enumera pedidos privados')

  await assertFails(set(ref(clientDb, 'pedidos/client-created'), {
    id: 'client-created',
    status: 'aberto',
    criador: actor(CLIENT, 'Cliente A'),
  }))
  for (const orderId of ['order-open', 'order-flow', 'order-final']) {
    await assertFails(remove(ref(clientDb, `pedidos/${orderId}`)), `cliente não exclui ${orderId}`)
    await assertFails(remove(ref(workerDb, `pedidos/${orderId}`)), `profissional não exclui ${orderId}`)
  }

  const openEditTime = Date.now()
  await assertSucceeds(update(ref(clientDb, 'pedidos/order-open'), {
    titulo: 'Pedido aberto editado',
    descricao: 'Descrição permitida',
    valor: 120,
    atualizadoEm: openEditTime,
    atualizadoEmServer: openEditTime,
  }))
  await assertFails(update(ref(workerDb, 'pedidos/order-open'), { titulo: 'alteração indevida' }))
  await assertFails(update(ref(clientDb, 'pedidos/order-flow'), { titulo: 'não edita após aceite' }))
  await assertFails(update(ref(clientDb, 'pedidos/order-flow'), { 'criador/id': OUTSIDER }))
  await assertFails(update(ref(workerDb, 'pedidos/order-flow'), { 'aceite/id': OUTSIDER }))
  await assertFails(update(ref(clientDb, 'pedidos/order-flow'), { campoInesperado: true }))
  await assertFails(update(ref(clientDb, 'pedidos/order-flow'), { status: 'finalizado' }))

  const chatTime = Date.now()
  await assertSucceeds(set(ref(clientDb, 'chats/order-chat/message-client'), message(CLIENT, 'Cliente A', chatTime)))
  await assertSucceeds(set(ref(workerDb, 'chats/order-chat/message-worker'), message(WORKER, 'Profissional B', chatTime + 1)))
  await assertFails(set(ref(outsiderDb, 'chats/order-chat/message-outsider'), message(OUTSIDER, 'Terceiro', chatTime + 2)))
  await assertFails(set(ref(clientDb, 'chats/order-chat/message-spoof'), message(WORKER, 'Profissional B', chatTime + 3)))

  const enRouteTime = Date.now()
  const enRouteActor = actor(WORKER, 'Profissional B')
  await assertFails(update(ref(workerDb), {
    'pedidos/order-flow/status': 'a_caminho',
    'pedidos/order-flow/atualizadoEm': enRouteTime,
  }))
  await assertSucceeds(update(ref(workerDb), {
    'pedidos/order-flow/status': 'a_caminho',
    'pedidos/order-flow/atendimento/aCaminhoEm': enRouteTime,
    'pedidos/order-flow/atendimento/aCaminhoPor': enRouteActor,
    'pedidos/order-flow/aCaminhoEm': enRouteTime,
    'pedidos/order-flow/aCaminhoPor': enRouteActor,
    'pedidos/order-flow/atualizadoEm': enRouteTime,
    'pedidos/order-flow/atualizadoEmServer': enRouteTime,
  }))
  await assertFails(update(ref(clientDb), {
    'pedidos/order-flow/status': 'chegou',
    'pedidos/order-flow/atendimento/chegouEm': enRouteTime + 1,
    'pedidos/order-flow/atendimento/chegouPor': actor(CLIENT, 'Cliente A'),
    'pedidos/order-flow/chegouEm': enRouteTime + 1,
    'pedidos/order-flow/chegouPor': actor(CLIENT, 'Cliente A'),
  }))

  const arrivedTime = enRouteTime + 2
  await assertSucceeds(update(ref(workerDb), {
    'pedidos/order-flow/status': 'chegou',
    'pedidos/order-flow/atendimento/chegouEm': arrivedTime,
    'pedidos/order-flow/atendimento/chegouPor': enRouteActor,
    'pedidos/order-flow/chegouEm': arrivedTime,
    'pedidos/order-flow/chegouPor': enRouteActor,
    'pedidos/order-flow/atualizadoEm': arrivedTime,
    'pedidos/order-flow/atualizadoEmServer': arrivedTime,
  }))

  const requestedTime = arrivedTime + 2
  await assertSucceeds(update(ref(workerDb), {
    'pedidos/order-flow/status': 'aguardando_confirmacao',
    'pedidos/order-flow/atendimento/finalizacaoSolicitadaEm': requestedTime,
    'pedidos/order-flow/atendimento/finalizacaoSolicitadaPor': enRouteActor,
    'pedidos/order-flow/finalizacaoSolicitadaEm': requestedTime,
    'pedidos/order-flow/finalizacaoSolicitadaPor': enRouteActor,
    'pedidos/order-flow/atualizadoEm': requestedTime,
    'pedidos/order-flow/atualizadoEmServer': requestedTime,
  }))
  await assertFails(update(ref(workerDb), {
    'pedidos/order-flow/status': 'finalizado',
    'pedidos/order-flow/atendimento/finalizadoEm': requestedTime + 1,
    'pedidos/order-flow/atendimento/finalizadoPor': enRouteActor,
    'pedidos/order-flow/finalizadoEm': requestedTime + 1,
    'pedidos/order-flow/finalizadoPor': enRouteActor,
    'pedidos/order-flow/avaliacaoPendente': true,
  }))

  const finalizedTime = requestedTime + 2
  const clientActor = actor(CLIENT, 'Cliente A')
  await assertSucceeds(update(ref(clientDb), {
    'pedidos/order-flow/status': 'finalizado',
    'pedidos/order-flow/atendimento/finalizadoEm': finalizedTime,
    'pedidos/order-flow/atendimento/finalizadoPor': clientActor,
    'pedidos/order-flow/finalizadoEm': finalizedTime,
    'pedidos/order-flow/finalizadoPor': clientActor,
    'pedidos/order-flow/avaliacaoPendente': true,
    'pedidos/order-flow/atualizadoEm': finalizedTime,
    'pedidos/order-flow/atualizadoEmServer': finalizedTime,
  }))
  await assertFails(update(ref(clientDb, 'pedidos/order-flow'), { descricao: 'mutação após finalização' }))
  await assertFails(remove(ref(clientDb, 'pedidos/order-flow')))

  const cancelTime = Date.now()
  await assertFails(update(ref(outsiderDb), {
    'pedidos/order-cancel/status': 'cancelado',
    'pedidos/order-cancel/canceladoEm': cancelTime,
  }))
  await assertSucceeds(update(ref(clientDb), {
    'pedidos/order-cancel/status': 'cancelado',
    'pedidos/order-cancel/atendimento/canceladoEm': cancelTime,
    'pedidos/order-cancel/atendimento/canceladoPor': clientActor,
    'pedidos/order-cancel/canceladoEm': cancelTime,
    'pedidos/order-cancel/canceladoPor': clientActor,
    'pedidos/order-cancel/canceladoNaEtapa': 'aceito',
    'pedidos/order-cancel/motivoCodigo': 'cliente_desistiu',
    'pedidos/order-cancel/motivo': 'Cliente desistiu do atendimento',
    'pedidos/order-cancel/atualizadoEm': cancelTime,
    'pedidos/order-cancel/atualizadoEmServer': cancelTime,
  }))
  await assertFails(set(ref(clientDb, 'chats/order-cancel/message-after-cancel'), message(CLIENT, 'Cliente A')))

  const forgedNotification = {
    id: 'forged',
    tipo: 'pedido_aceito',
    titulo: 'Título falso',
    mensagem: 'Mensagem falsa',
    pedidoId: 'order-flow',
    fromUid: WORKER,
    toUid: CLIENT,
    lida: false,
  }
  await assertFails(set(ref(workerDb, 'notifications/client-A/forged-worker'), forgedNotification))
  await assertFails(set(ref(clientDb, 'notifications/client-A/forged-recipient'), forgedNotification))
  await assertFails(set(ref(workerDb, 'notificacoes/client-A/forged-worker'), forgedNotification))
  await assertFails(set(ref(clientDb, 'notificacoes/client-A/forged-recipient'), forgedNotification))
  await assertFails(get(ref(outsiderDb, 'notifications/client-A/server-existing')))

  const readTime = Date.now()
  for (const rootName of ['notifications', 'notificacoes']) {
    await assertSucceeds(update(ref(clientDb, `${rootName}/client-A/server-existing`), {
      lida: true,
      read: true,
      lidaEm: readTime,
      vistoEm: readTime,
    }))
    await assertFails(update(ref(clientDb, `${rootName}/client-A/server-existing`), { titulo: 'Título alterado' }))
    await assertFails(remove(ref(clientDb, `${rootName}/client-A/server-existing`)))
  }

  const pushTokenKey = 'local-emulator-token-key'
  const pushRegistration = {
    [`users/${CLIENT}/notificacoes`]: true,
    [`users/${CLIENT}/push`]: {
      enabled: true,
      permission: 'granted',
      provider: 'firebase_messaging',
      tokenKey: pushTokenKey,
      updatedAt: serverTimestamp(),
      userAgent: 'Emulator',
      standalone: false,
      language: 'pt-BR',
      origin: 'https://staging.example.test',
    },
    [`users/${CLIENT}/profile/notificacoes`]: true,
    [`users/${CLIENT}/profile/pushNotifications`]: {
      enabled: true,
      permission: 'granted',
      provider: 'firebase_messaging',
      tokenKey: pushTokenKey,
      updatedAt: serverTimestamp(),
    },
    [`userPrivate/${CLIENT}/push`]: {
      enabled: true,
      permission: 'granted',
      provider: 'firebase_messaging',
      tokenKey: pushTokenKey,
      updatedAt: serverTimestamp(),
      userAgent: 'Emulator',
      standalone: false,
      language: 'pt-BR',
      origin: 'https://staging.example.test',
    },
    [`userPrivate/${CLIENT}/pushTokens/${pushTokenKey}`]: {
      token: 'fake-emulator-token-never-sent',
      enabled: true,
      active: true,
      provider: 'firebase_messaging',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      userAgent: 'Emulator',
      standalone: false,
      language: 'pt-BR',
      origin: 'https://staging.example.test',
    },
  }
  await assertSucceeds(update(ref(clientDb), pushRegistration))
  await assertFails(update(ref(workerDb), pushRegistration))
  await assertFails(get(ref(workerDb, `userPrivate/${CLIENT}/pushTokens/${pushTokenKey}`)))
  const ownPushToken = await assertSucceeds(get(ref(clientDb, `userPrivate/${CLIENT}/pushTokens/${pushTokenKey}`)))
  assert.equal(ownPushToken.val()?.token, 'fake-emulator-token-never-sent')

  const pushV2Uid = 'push-v2-owner'
  const pushV2TokenA = `push-v2-token-a-${'a'.repeat(48)}`
  const pushV2TokenB = `push-v2-token-b-${'b'.repeat(48)}`
  const [registeredA, registeredB] = await Promise.all([
    registerPushDevice({
      database: adminDatabase,
      uid: pushV2Uid,
      token: pushV2TokenA,
      device: { origin: 'https://staging.example.test', language: 'pt-BR' },
      now: baseTime + 20,
    }),
    registerPushDevice({
      database: adminDatabase,
      uid: pushV2Uid,
      token: pushV2TokenB,
      device: { origin: 'https://staging.example.test', language: 'pt-BR' },
      now: baseTime + 21,
    }),
  ])
  assert.notEqual(registeredA.deviceId, registeredB.deviceId)
  const concurrentPushState = await getPushDeviceState({
    database: adminDatabase,
    uid: pushV2Uid,
    deviceId: registeredA.deviceId,
  })
  assert.equal(concurrentPushState.activeDeviceCount, 2, 'duas ativações concorrentes preservam ambos os dispositivos')
  assert.equal(concurrentPushState.registered, true)

  const repeatedRegistration = await registerPushDevice({
    database: adminDatabase,
    uid: pushV2Uid,
    token: pushV2TokenA,
    device: { origin: 'https://staging.example.test', language: 'pt-BR' },
    now: baseTime + 22,
  })
  assert.equal(repeatedRegistration.deviceId, registeredA.deviceId)
  assert.equal(repeatedRegistration.idempotent, true)
  assert.equal(repeatedRegistration.activeDeviceCount, 2, 'registro repetido não duplica o dispositivo')

  const disabledA = await disablePushDevice({
    database: adminDatabase,
    uid: pushV2Uid,
    deviceId: registeredA.deviceId,
    now: baseTime + 23,
  })
  assert.equal(disabledA.activeDeviceCount, 1, 'desativação afeta somente o dispositivo informado')
  const deviceBState = await getPushDeviceState({
    database: adminDatabase,
    uid: pushV2Uid,
    deviceId: registeredB.deviceId,
  })
  assert.equal(deviceBState.registered, true)
  const repeatedDisable = await disablePushDevice({
    database: adminDatabase,
    uid: pushV2Uid,
    deviceId: registeredA.deviceId,
    now: baseTime + 24,
  })
  assert.equal(repeatedDisable.idempotent, true)
  assert.equal(repeatedDisable.activeDeviceCount, 1)

  const legacyPushUid = 'push-v2-legacy-owner'
  const legacyPushToken = `legacy-push-token-${'c'.repeat(48)}`
  await adminDatabase.ref(`userPrivate/${legacyPushUid}/pushTokens/legacy-token-key`).set({
    token: legacyPushToken,
    enabled: true,
    active: true,
    provider: 'firebase_messaging',
    createdAt: baseTime,
  })
  const upgradedLegacyDevice = await registerPushDevice({
    database: adminDatabase,
    uid: legacyPushUid,
    token: legacyPushToken,
    device: { origin: 'https://staging.example.test' },
    now: baseTime + 25,
  })
  assert.match(upgradedLegacyDevice.deviceId, /^[a-f0-9]{64}$/)
  const legacyTokensAfterRegistration = (
    await adminDatabase.ref(`userPrivate/${legacyPushUid}/pushTokens`).get()
  ).val()
  assert.deepEqual(Object.keys(legacyTokensAfterRegistration), ['legacy-token-key'])
  assert.equal(legacyTokensAfterRegistration['legacy-token-key'].token, legacyPushToken)
  assert.equal(legacyTokensAfterRegistration['legacy-token-key'].deviceId, upgradedLegacyDevice.deviceId)

  const recoverableUid = 'push-v2-recoverable-owner'
  const recoverableToken = `recoverable-push-token-${'d'.repeat(48)}`
  let failProjectionOnce = true
  const recoverableDatabase = {
    ref(path) {
      if (path !== undefined) return adminDatabase.ref(path)
      return {
        update: async (updates) => {
          if (failProjectionOnce) {
            failProjectionOnce = false
            throw new Error('simulated_projection_failure')
          }
          return adminDatabase.ref().update(updates)
        },
      }
    },
  }
  await assert.rejects(registerPushDevice({
    database: recoverableDatabase,
    uid: recoverableUid,
    token: recoverableToken,
    device: { origin: 'https://staging.example.test' },
    now: baseTime + 26,
  }), /simulated_projection_failure/)
  const recoveredRegistration = await registerPushDevice({
    database: recoverableDatabase,
    uid: recoverableUid,
    token: recoverableToken,
    device: { origin: 'https://staging.example.test' },
    now: baseTime + 27,
  })
  assert.equal(recoveredRegistration.idempotent, true)
  assert.equal(recoveredRegistration.activeDeviceCount, 1, 'repetição recupera projeção sem duplicar token')

  const finalSnapshot = await assertSucceeds(get(ref(clientDb, 'pedidos/order-flow/status')))
  assert.equal(finalSnapshot.val(), 'finalizado')
  console.log('Firebase Emulator: matriz A/B/C, estados, chat, notificações, push privado, recompensas e backend professionalServices OK; concorrência limitada a 12')
} finally {
  await deleteAdminApp(adminApp)
  await testEnv.cleanup()
}
