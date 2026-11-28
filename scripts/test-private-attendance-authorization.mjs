import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const state = { entries: new Map(), calls: [] }
const snapshot = (value) => ({
  exists: () => value !== null && value !== undefined,
  val: () => structuredClone(value ?? null),
})

state.database = {
  ref(path = '') {
    return {
      async get() {
        state.calls.push(['get', path])
        return snapshot(state.entries.get(path))
      },
      async transaction(change) {
        state.calls.push(['transaction', path])
        state.beforeTransaction?.(path)
        const current = snapshot(state.entries.get(path)).val()
        const updated = change(current)
        if (updated === undefined) return { committed: false, snapshot: snapshot(current) }
        state.entries.set(path, updated)
        return { committed: true, snapshot: snapshot(updated) }
      },
      async set(value) {
        state.calls.push(['set', path])
        state.entries.set(path, value)
      },
      async update(changes) {
        state.calls.push(['update', path])
        for (const [key, value] of Object.entries(changes)) state.entries.set(key, value)
      },
    }
  },
}

const key = Symbol.for('corre-aqui.private-attendance-route-test')
globalThis[key] = state
const testStateSource = "const state = globalThis[Symbol.for('corre-aqui.private-attendance-route-test')]"
const mocks = {
  '@/lib/firebaseAdmin': `${testStateSource}
    export const isFirebaseAdminConfigured = () => true
    export const getFirebaseAdminDatabase = () => state.database
    export const getFirebaseAdminAuth = () => ({
      async verifyIdToken(token) {
        if (!/^test-token-[A-D]$/.test(token)) throw new Error('invalid test token')
        return { uid: token.at(-1) }
      },
    })
  `,
  '@/lib/subscriptionServer': `${testStateSource}
    export async function ensureProfessionalFeatureAccess(database, uid) {
      if (database !== state.database) throw new Error('unexpected database')
      state.calls.push(['professional-feature', uid])
      if (state.denyProfessionalAccess) throw Object.assign(new Error('trial ended'), { status: 402 })
    }
  `,
  '@/lib/attendanceRewardsServer': `${testStateSource}
    export const isAttendanceGamificationEnabled = () => false
    export const parseAttendanceRewardsEnabledFrom = () => null
    export async function grantAttendanceRewards() { state.calls.push(['reward']); return {} }
  `,
}
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context)
    if (mocks[specifier]) {
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}` }
    }
    if (specifier.startsWith('@/')) {
      return { shortCircuit: true, url: new URL(`../src/${specifier.slice(2)}.js`, import.meta.url).href }
    }
    return nextResolve(specifier, context)
  },
})

const previousNodeEnv = process.env.NODE_ENV
process.env.NODE_ENV = 'production'
const requestId = 'isolated-agenda-test'
const requestPath = `privateRequests/${requestId}`
const markerPath = `privateRequestResponses/${requestId}`
const initial = { id: requestId, clienteId: 'A', profissionalId: 'B', tipo: 'agendamento', status: 'pendente' }

function reset(record = initial) {
  state.entries = new Map(record ? [[requestPath, record]] : [])
  state.calls = []
  state.beforeTransaction = null
  state.denyProfessionalAccess = false
}

async function call(handler, uid, body) {
  const result = await handler(new Request('https://localhost.invalid/test', {
    method: 'POST',
    headers: { Authorization: `Bearer test-token-${uid}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, ...body }),
  }))
  return { status: result.status, body: await result.json() }
}

try {
  const { POST: respond } = await import('../src/app/api/private-requests/respond/route.js')
  const { POST: transition } = await import('../src/app/api/private-requests/transition/route.js')
  const travel = { expectedStatus: 'em_andamento', nextStatus: 'a_caminho' }
  reset(null)
  const deniedResponse = await call(respond, 'C', { decision: 'accept' })
  const deniedTransition = await call(transition, 'C', travel)
  assert.equal(deniedResponse.status, 403)
  assert.equal(deniedResponse.body.currentStatus, null)
  assert.equal(deniedTransition.status, 403)
  assert.deepEqual(state.calls, [['get', requestPath], ['get', requestPath]])

  for (const status of ['pendente', 'agendado', 'recusado', 'finalizado']) {
    for (const uid of ['A', 'C']) {
      for (const decision of ['accept', 'reject']) {
        reset({ ...initial, status })
        assert.deepEqual(await call(respond, uid, { decision }), deniedResponse)
        assert.deepEqual(state.calls, [['get', requestPath]], 'rejeição vem antes de trial, leituras privadas auxiliares e escrita')
      }
    }
  }

  reset()
  state.denyProfessionalAccess = true
  assert.equal((await call(respond, 'B', { decision: 'accept' })).status, 402)
  assert.deepEqual(state.calls, [['get', requestPath], ['professional-feature', 'B']])
  const declined = await call(respond, 'B', { decision: 'reject' })
  assert.equal(declined.status, 200)
  assert.equal(declined.body.responseConfirmed, true)
  assert.equal(state.entries.get(requestPath).status, 'recusado')
  assert.equal(state.entries.get(markerPath).committed, true)
  assert.equal(state.calls.filter(([event]) => event === 'professional-feature').length, 1, 'recusa independe de assinatura')
  const lateAccept = await call(respond, 'B', { decision: 'accept' })
  assert.equal(lateAccept.status, 409)
  assert.equal(lateAccept.body.currentStatus, 'recusado')

  reset()
  assert.equal((await call(respond, 'B', { decision: 'accept' })).body.status, 'agendado')
  assert.equal((await call(respond, 'B', { decision: 'accept' })).body.responseConfirmed, true)
  assert.equal(state.calls.filter(([event]) => event === 'professional-feature').length, 1)
  state.calls.length = 0
  assert.deepEqual(await call(transition, 'C', travel), deniedTransition)
  assert.deepEqual(state.calls, [['get', requestPath]], 'terceiro não consulta marcador ou índices de conversa')
  const wrongRole = await call(transition, 'A', travel)
  assert.equal(wrongRole.status, 403)
  assert.deepEqual(await call(transition, 'A', { ...travel, expectedStatus: 'chegou' }), wrongRole)
  assert.equal((await call(transition, 'B', { ...travel, expectedStatus: 'chegou' })).status, 409)
  assert.equal((await call(transition, 'B', travel)).body.status, 'a_caminho')
  assert.equal((await call(transition, 'A', {
    expectedStatus: 'a_caminho', nextStatus: 'cancelado', reasonCode: 'sem_acordo', reason: 'Sem acordo',
  })).body.status, 'cancelado')
  assert.equal(state.entries.get(requestPath).canceladoPor.id, 'A')

  reset({ ...initial, status: 'agendado' })
  state.entries.set(`conversas/A/${requestId}`, { pedidoId: requestId, outroId: 'B' })
  state.entries.set(`conversas/B/${requestId}`, { pedidoId: requestId, outroId: 'A' })
  assert.equal((await call(transition, 'B', travel)).body.status, 'a_caminho', 'par legado mantém acesso')

  reset()
  state.beforeTransaction = (path) => {
    if (path === requestPath) state.entries.set(requestPath, { ...initial, profissionalId: 'D' })
  }
  assert.deepEqual(await call(respond, 'B', { decision: 'accept' }), deniedResponse)
  assert.equal(state.entries.get(requestPath).status, 'pendente')
  assert.equal(state.entries.get(markerPath).committed, false)

  reset()
  assert.equal((await call(respond, 'B', { decision: 'accept' })).status, 200)
  state.calls.length = 0
  state.beforeTransaction = (path) => {
    if (path === requestPath) state.entries.set(requestPath, { ...state.entries.get(path), profissionalId: 'D' })
  }
  assert.equal((await call(transition, 'B', travel)).status, 409)
  assert.equal(state.entries.get(requestPath).status, 'agendado')
  assert.ok(state.calls.every(([operation]) => operation === 'get' || operation === 'transaction'))
} finally {
  hooks.deregister()
  delete globalThis[key]
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = previousNodeEnv
}

console.log('APIs de Agenda e atendimento privado: autorização antes de efeitos, recusa, retry, concorrência e legado OK')
