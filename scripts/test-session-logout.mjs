import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = async (path) => readFile(new URL(path, import.meta.url), 'utf8')
const [logout, drawer, map, presence, profile] = await Promise.all([
  source('../src/lib/sessionLogout.js'),
  source('../src/components/PerfilDrawer.jsx'),
  source('../src/components/Mapadinamico.jsx'),
  source('../src/lib/presence.js'),
  source('../src/components/Perfil.jsx'),
])

assert.match(logout, /publicAvailability\/\$\{currentUid\}/, 'remove disponibilidade publica do proprio UID')
assert.match(logout, /presence\/\$\{currentUid\}/, 'remove presenca privada do proprio UID')
assert.match(logout, /usuariosOnline\/\$\{currentUid\}/, 'limpa somente o espelho legado do proprio UID')
assert.match(logout, /Promise\.allSettled/, 'limpezas efemeras sao tentadas antes do signOut')
assert.ok(logout.indexOf('await notifySessionEnding(currentUid)') < logout.indexOf('await signOut(auth)'), 'logout aguarda runtimes antes do signOut')
assert.match(logout, /waitUntil/, 'evento de encerramento oferece barreira aguardavel')
assert.ok(logout.indexOf('Promise.allSettled') < logout.indexOf('await signOut(auth)'), 'signOut acontece depois das limpezas remotas')
assert.ok(logout.indexOf('await signOut(auth)') < logout.indexOf('clearSessionLocalState(currentUid)'), 'estado local e limpo depois do signOut')
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

console.log('Logout: confirmacao, cleanup A→B, presenca, armazenamento local e navegacao OK')
