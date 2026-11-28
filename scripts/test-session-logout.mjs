import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [logout, drawer, map, presence, profile, cadastro] = await Promise.all([
  source('../src/lib/sessionLogout.js'),
  source('../src/components/PerfilDrawer.jsx'),
  source('../src/components/Mapadinamico.jsx'),
  source('../src/lib/presence.js'),
  source('../src/components/Perfil.jsx'),
  source('../src/app/cadastro/page.jsx'),
])

assert.match(logout, /publicAvailability\/\$\{currentUid\}/, 'remove disponibilidade publica do proprio UID')
assert.match(logout, /presence\/\$\{currentUid\}/, 'remove presenca privada do proprio UID')
assert.match(logout, /usuariosOnline\/\$\{currentUid\}/, 'limpa somente o espelho legado do proprio UID')
assert.match(logout, /Promise\.allSettled/, 'limpezas efemeras sao tentadas antes do signOut')
assert.match(logout, /waitUntil/, 'evento de encerramento oferece barreira aguardavel')
assert.ok(logout.indexOf('Promise.allSettled') < logout.indexOf('await signOut(auth)'), 'signOut acontece depois das limpezas remotas')
assert.ok(logout.indexOf('await signOut(auth)') < logout.indexOf('clearSessionLocalState(expectedUid)'), 'estado local e limpo depois do signOut')
assert.doesNotMatch(logout, /localStorage\.clear|sessionStorage\.clear/, 'logout nao apaga preferencias gerais do dispositivo')
assert.doesNotMatch(logout, /`(?:users|userPrivate|pedidos|conversas|publicProfiles)\//, 'logout nao apaga dados persistentes da conta')

assert.match(drawer, />Sair da conta<\//, 'acao aparece em Configuracoes')
assert.match(drawer, /Sair da conta\?/, 'confirmacao tem titulo solicitado')
assert.match(drawer, /precisar&aacute; entrar novamente para acessar o Corre Aqui/, 'confirmacao explica novo login')
assert.match(drawer, />\s*Cancelar\s*<\//, 'modal oferece Cancelar')
assert.match(drawer, /logoutSubmitting \? "Saindo\.\.\." : "Sair"/, 'modal oferece Sair com estado de progresso')
assert.match(drawer, /role="alertdialog"/)
assert.match(drawer, /aria-modal="true"/)
assert.match(drawer, /sm:w-auto sm:min-w-64/, 'acao e visivel no mobile sem virar botao gigante no desktop')
assert.doesNotMatch(drawer, /Deseja realmente sair da sua conta/, 'logout nao usa a confirmacao nativa antiga')
assert.match(drawer, /logoutFirebaseSession/)
assert.ok(cadastro.includes('await logoutFirebaseSession({ auth, database, uid'))
assert.equal(cadastro.includes('await signOut('), false, 'cadastro também usa a saída com prazo limitado')
assert.ok(cadastro.indexOf('if (!active || auth.currentUser !== user) return', cadastro.indexOf('const snap = await'))
  < cadastro.indexOf('setUserData(data)'), 'resposta atrasada do cadastro não substitui a nova conta')
assert.match(drawer, /router\.replace\("\/login"\)/, 'retorna para a tela de login')

assert.match(map, /subscribeSessionEnding\(meuId/, 'logout encerra listener e heartbeat de publicAvailability')
assert.match(map, /availabilityDisconnectOperation\?\.cancel/, 'onDisconnect publico e cancelado')
assert.match(map, /isAuthenticatedOwner/, 'publicAvailability exige o UID autenticado antes de escrever')
assert.match(map, /\.filter\(\(\[uid\]\) => String\(uid\) !== String\(meuId\)\)/, 'proprio UID nao aparece na lista/mapa')
assert.match(presence, /subscribeSessionEnding\(uid/, 'logout encerra heartbeat de presence')
assert.match(presence, /presenceDisconnectOperation\?\.cancel/, 'onDisconnect privado e cancelado')
assert.match(presence, /authenticatedUid !== targetUid \|\| endingPresenceUids\.has\(targetUid\)/, 'presence falha fechado sem auth correspondente ou durante logout')
assert.match(presence, /waitForPresenceWrites\(uid\)/, 'logout aguarda escritas de presence que ja estavam em voo')
assert.doesNotMatch(map, /update\(ref\(database, `presence\/\$\{meuId\}`\)/, 'Mapadinamico nao contorna o helper autenticado')
assert.doesNotMatch(profile, /onClick=\{sair\}/, 'nao resta botao com fluxo paralelo no Perfil')

const sessionA = {
  local: { meuId: 'A', meuNome: 'Pessoa A', fotoURL: 'avatar-a' },
  remote: { publicAvailability: { A: true }, presence: { A: true } },
  listeners: new Set(['A']),
}
sessionA.local = {}
delete sessionA.remote.publicAvailability.A
delete sessionA.remote.presence.A
sessionA.listeners.delete('A')
const sessionB = { uid: 'B', ...sessionA }
assert.deepEqual(sessionB.local, {}, 'B nao herda identidade/avatar local de A')
assert.equal(sessionB.remote.publicAvailability.A, undefined, 'B nao encontra disponibilidade de A')
assert.equal(sessionB.remote.presence.A, undefined, 'B nao herda presenca de A')
assert.equal(sessionB.listeners.has('A'), false, 'B nao herda listeners de A')

const visibleTo = (viewerUid, availability) => Object.keys(availability).filter((uid) => uid !== viewerUid)
assert.deepEqual(visibleTo('A', { A: true, B: true }), ['B'], 'A nao ve A na propria lista/mapa')
assert.deepEqual(visibleTo('B', { A: true }), ['A'], 'B ve A enquanto A esta online')

const mocks = new Map([
  ['firebase/auth', 'export const signOut = (auth) => globalThis.__testSessionSignOut(auth)'],
  ['@/lib/firebase', 'export const database = {}; export const auth = globalThis.__testCadastroAuth'],
  ['./firebaseDebug', 'export const ref = (_database, path) => path; export const remove = (path) => globalThis.__testSessionRemove(path); export const update = (path) => globalThis.__testCadastroUpdate(path); export const serverTimestamp = () => 1000'],
])
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = mocks.get(specifier)
    if (stub) return { url: 'data:text/javascript,' + encodeURIComponent(stub), shortCircuit: true }
    return nextResolve(specifier === './legacyAccountState' ? './legacyAccountState.js' : specifier, context)
  },
})
const { logoutFirebaseSession, subscribeSessionEnding } = await import('../src/lib/sessionLogout.js')
globalThis.__testCadastroAuth = { currentUser: null }
const { salvarCadastroPerfil } = await import('../src/lib/perfilCadastro.js')
hooks.deregister()

function storage(initial) {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    key: (index) => Array.from(data.keys())[index],
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
    getItem: (key) => data.get(key),
  }
}

function browser() {
  return Object.assign(new EventTarget(), {
    localStorage: storage({ meuId: 'A', 'correAqui:pushTokenKey:A': 'key-a', 'theme': 'light' }),
    sessionStorage: storage({ 'correAqui:returningToList': 'true' }),
  })
}

const userA = { uid: 'A' }
const userB = { uid: 'B' }
const signOutUids = []
const removed = []
const pathOrder = ['publicAvailability/A', 'presence/A', 'usuariosOnline/A']
globalThis.__testSessionSignOut = async (auth) => {
  signOutUids.push(auth.currentUser.uid)
  auth.currentUser = null
}

try {
  globalThis.window = browser()
  const auth = { currentUser: userA }
  const events = []
  subscribeSessionEnding('A', () => { events.push('stop-presence') })
  globalThis.__testSessionRemove = async (path) => { events.push(path) }
  await logoutFirebaseSession({ auth, database: {}, uid: 'A', removePushToken: async (uid, { canContinue }) => {
    assert.equal(canContinue(), true)
    events.push(`token/${uid}`)
  } })
  assert.deepEqual(events, ['stop-presence', ...pathOrder, 'token/A'])
  assert.deepEqual(signOutUids, ['A'])
  assert.equal(window.localStorage.getItem('meuId'), undefined)
  assert.equal(window.localStorage.getItem('theme'), 'light')
  assert.equal(window.sessionStorage.getItem('correAqui:returningToList'), undefined)

  globalThis.window = browser()
  auth.currentUser = userA
  globalThis.__testSessionRemove = (path) => {
    removed.push(path)
    return new Promise(() => {})
  }
  let mayCleanPush = () => true
  await logoutFirebaseSession({ auth, database: {}, uid: 'A', removePushToken: (_uid, { canContinue }) => {
    mayCleanPush = canContinue
    return new Promise(() => {})
  } })
  assert.deepEqual(removed, pathOrder, 'a limpeza remota foi tentada')
  assert.deepEqual(signOutUids, ['A', 'A'], 'perder rede nao impede o signOut local')
  assert.equal(mayCleanPush(), false, 'limpeza de push que retoma tarde perde a autorização local')
  assert.equal(window.localStorage.getItem('correAqui:pushTokenKey:A'), undefined)

  globalThis.window = browser()
  auth.currentUser = userA
  let releasePresence
  subscribeSessionEnding('A', () => new Promise((resolve) => { releasePresence = resolve }))
  const logout = logoutFirebaseSession({ auth, database: {}, uid: 'A' })
  auth.currentUser = userB
  releasePresence()
  await assert.rejects(logout, /A conta ativa mudou/)
  assert.deepEqual(removed, pathOrder, 'nenhuma exclusao antiga inicia apos troca de conta')
  assert.deepEqual(signOutUids, ['A', 'A'], 'nao desloga a conta que entrou durante a espera')
  assert.equal(window.localStorage.getItem('meuId'), 'A', 'estado compartilhado nao e limpo pela operacao obsoleta')
  await assert.rejects(logoutFirebaseSession({ auth, database: {}, uid: 'A' }), /A conta ativa mudou/)
  assert.equal(auth.currentUser, userB)

  globalThis.window = browser()
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage indisponivel') } })
  auth.currentUser = userB
  globalThis.__testSessionRemove = async () => {}
  await logoutFirebaseSession({ auth, database: {}, uid: 'B' })
  assert.equal(auth.currentUser, null, 'bloqueio de storage nao vira falha de logout apos o Firebase encerrar')
  assert.deepEqual(signOutUids, ['A', 'A', 'B'])
  assert.equal(window.sessionStorage.getItem('correAqui:returningToList'), undefined)
  globalThis.window = browser()
  window.localStorage.setItem('meuId', 'B')
  for (const delayedPath of ['users/A/profile', 'usuariosOnline/A']) {
    const writes = []
    let releaseWrite
    let announceWrite
    const delayedWriteStarted = new Promise((resolve) => { announceWrite = resolve })
    globalThis.__testCadastroAuth.currentUser = userA
    globalThis.__testCadastroUpdate = (path) => {
      writes.push(path)
      if (path !== delayedPath) return Promise.resolve()
      return new Promise((resolve) => {
        releaseWrite = resolve
        announceWrite()
      })
    }
    const staleSave = salvarCadastroPerfil({ uid: 'A', authUser: userA, form: { nome: 'Conta A', cidade: 'Recife' } })
    await delayedWriteStarted
    globalThis.__testCadastroAuth.currentUser = userB
    releaseWrite()
    await assert.rejects(staleSave, /A conta ativa mudou/)
    assert.deepEqual(writes, delayedPath === 'users/A/profile' ? ['users/A/profile'] : ['users/A/profile', 'users/A', 'usuariosOnline/A'])
    assert.equal(window.localStorage.getItem('meuId'), 'B', 'resposta antiga do cadastro não regrava a conta do navegador')
  }
} finally {
  delete globalThis.window
  delete globalThis.__testSessionRemove
  delete globalThis.__testSessionSignOut
  delete globalThis.__testCadastroAuth
  delete globalThis.__testCadastroUpdate
}

console.log('Logout: confirmação, presença, timeout sem rede, concorrência de conta, armazenamento e navegação OK')
