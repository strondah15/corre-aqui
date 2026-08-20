import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules
const agendamentos = rules.agendamentos
const agenda = agendamentos.$agendamentoId
const index = rules.agendamentosPorUsuario.$uid
const privateRequest = rules.privateRequests.$requestId
const inbox = rules.privateRequestInbox.$uid.$requestId

assert.match(agendamentos['.read'], /admins/, 'a raiz privada de agendamentos nao e enumeravel por autenticado comum')
assert.match(agenda['.read'], /clienteId/)
assert.match(agenda['.read'], /profissionalId/)
assert.match(index['.read'], /auth\.uid === \$uid/)
assert.equal(index.$agendamentoId.$other['.validate'], false, 'indice por participante possui esquema fechado')
assert.match(index.$agendamentoId['.validate'], /root\.child\('agendamentos'\)/, 'indice precisa espelhar agendamento existente')
assert.match(agenda['.write'], /privateRequestId/, 'criacao legada requer vinculo privado existente')
assert.match(agenda['.write'], /data\.child\('profissionalId'\)\.val\(\) === auth\.uid/, 'somente o profissional responde pendente')
assert.match(agenda.status['.validate'], /pendente/)
assert.match(agenda.status['.validate'], /aceito/)
assert.match(agenda.status['.validate'], /recusado/)

for (const identity of ['clienteId', 'profissionalId', 'pedidoId', 'privateRequestId', 'criadoPor']) {
  assert.match(agenda[identity]['.validate'], /newData\.val\(\) === data\.val\(\)/, `${identity} permanece imutavel`)
}
for (const privateField of ['data', 'hora', 'horario', 'inicio', 'fim', 'endereco', 'local', 'latitude', 'longitude', 'telefone']) {
  assert.match(agenda[privateField]['.validate'], /newData\.val\(\) === data\.val\(\)/, `${privateField} nao muda silenciosamente apos criar`)
}
assert.match(privateRequest['.write'], /newData\.child\('profissionalId'\)\.val\(\) !== auth\.uid/, 'cliente nao agenda para si')
assert.match(privateRequest['.write'], /publicProfiles/, 'agendamento requer profissional publico existente')
assert.match(privateRequest['.write'], /data\.child\('status'\)\.val\(\) === 'pendente'/, 'cancelamento por delete limita-se a pendente')
assert.match(inbox['.validate'], /root\.child\('privateRequests'\)/, 'inbox precisa apontar para solicitacao principal legitima')

const canReadSchedule = ({ authUid, clienteId, profissionalId }) => Boolean(authUid) && [clienteId, profissionalId].includes(authUid)
const canReadIndex = ({ authUid, indexUid }) => Boolean(authUid) && authUid === indexUid
const canRespond = ({ authUid, profissionalId, previous, next }) => authUid === profissionalId && previous === 'pendente' && ['aceito', 'recusado'].includes(next)
assert.equal(canReadSchedule({ authUid: 'A', clienteId: 'A', profissionalId: 'B' }), true, 'A le A/B')
assert.equal(canReadSchedule({ authUid: 'B', clienteId: 'A', profissionalId: 'B' }), true, 'B le A/B')
assert.equal(canReadSchedule({ authUid: 'C', clienteId: 'A', profissionalId: 'B' }), false, 'C nao le A/B')
assert.equal(canReadSchedule({ authUid: null, clienteId: 'A', profissionalId: 'B' }), false, 'nao autenticado nao le')
assert.equal(canReadIndex({ authUid: 'A', indexUid: 'A' }), true, 'A le apenas indice A')
assert.equal(canReadIndex({ authUid: 'C', indexUid: 'A' }), false, 'C nao le indice A')
assert.equal(canRespond({ authUid: 'B', profissionalId: 'B', previous: 'pendente', next: 'aceito' }), true, 'B aceita')
assert.equal(canRespond({ authUid: 'C', profissionalId: 'B', previous: 'pendente', next: 'aceito' }), false, 'C nao aceita')
assert.equal(canRespond({ authUid: 'B', profissionalId: 'B', previous: 'aceito', next: 'recusado' }), false, 'B nao troca estado terminal')

for (const sourcePath of [
  '../src/components/AgendaPanel.jsx',
  '../src/components/AgendaProfissional.jsx',
  '../src/components/Mapadinamico.jsx',
]) {
  const source = await readFile(new URL(sourcePath, import.meta.url), 'utf8')
  assert.match(source, /subscribeParticipantAgendamentos/, `${sourcePath} usa indice por participante`)
  assert.doesNotMatch(source, /ref\(database, ['"]agendamentos['"]\)/, `${sourcePath} nao enumera a raiz privada`)
}

const privateRequestsSource = await readFile(new URL('../src/lib/privateRequests.js', import.meta.url), 'utf8')
assert.match(privateRequestsSource, /await update\(ref\(database\), payload\)/, 'espelhos de agenda usam update multipath atomico')
assert.match(privateRequestsSource, /\[`privateRequests\/\$\{requestId\}`\]: request/, 'criacao grava principal e inbox no mesmo update')

console.log('C4 estatico: matriz A/B/C, indice privado, status, identidade e multipath OK')
