import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { get, ref, remove, set, update } from 'firebase/database'

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

const CLIENT = 'client-A'
const WORKER = 'worker-B'
const OUTSIDER = 'outsider-C'
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
        },
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
  const anonymousDb = testEnv.unauthenticatedContext().database()

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

  const finalSnapshot = await assertSucceeds(get(ref(clientDb, 'pedidos/order-flow/status')))
  assert.equal(finalSnapshot.val(), 'finalizado')
  console.log('Firebase Emulator: matriz A/B/C, estados, chat, notificações e recompensas OK')
} finally {
  await testEnv.cleanup()
}
