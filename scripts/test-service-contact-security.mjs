import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const policySource = await read('../src/lib/serviceContactPolicy.js')
const policy = await import(`data:text/javascript;base64,${Buffer.from(policySource).toString('base64')}`)
const rules = JSON.parse(await read('../database.rules.json')).rules

const privateContactA = { uid: 'A', phone: '(21) 99999-0000', source: 'active_service' }
const privateContactB = { uid: 'B', phone: '5521988880000', source: 'active_service' }

assert.equal(policy.sanitizePhoneDigits('(21) 99999-0000'), '5521999990000')
assert.equal(policy.sanitizePhoneDigits('+55 (21) 98888-0000'), '5521988880000')
assert.equal(policy.sanitizePhoneDigits('123'), '', 'número inválido falha fechado')

assert.deepEqual(policy.getAuthorizedPhoneContact({
  serviceContact: privateContactB,
  pedidoStatus: 'aceito',
  isParticipant: true,
}), { href: 'tel:+5521988880000', source: 'active_service' }, 'A liga para B no atendimento ativo')
assert.deepEqual(policy.getAuthorizedPhoneContact({
  serviceContact: privateContactA,
  pedidoStatus: 'em_andamento',
  isParticipant: true,
}), { href: 'tel:+5521999990000', source: 'active_service' }, 'B liga para A no atendimento ativo')
assert.equal(policy.getAuthorizedPhoneContact({
  serviceContact: privateContactB,
  pedidoStatus: 'aceito',
  isParticipant: false,
}).href, '', 'C não obtém telefone de A/B')
assert.equal(policy.getAuthorizedPhoneContact({
  serviceContact: privateContactB,
  pedidoStatus: 'aberto',
  isParticipant: true,
}).href, '', 'antes do aceite o telefone privado não aparece')
assert.equal(policy.getAuthorizedPhoneContact({
  serviceContact: privateContactB,
  pedidoStatus: 'finalizado',
  isParticipant: true,
}).href, '', 'após finalizar o telefone privado não aparece')
const canonicalOrder = { criador: { id: 'A' }, aceite: { id: 'B' }, status: 'aceito' }
assert.equal(policy.isServiceParticipant(canonicalOrder, 'pedido', 'A'), true)
assert.equal(policy.isServiceParticipant(canonicalOrder, 'pedido', 'B'), true)
assert.equal(policy.isServiceParticipant(canonicalOrder, 'pedido', 'C'), false, 'C não fabrica participação')

const publicProfile = { allowPublicContact: true, profWhats: '21977770000' }
assert.equal(policy.getAuthorizedPhoneContact({
  publicProfile,
  pedidoStatus: 'em_andamento',
  isParticipant: true,
}).source, 'public_profile', 'contato público explícito continua separado e preservado')
assert.equal(policy.getAuthorizedPhoneContact({
  publicProfile: { ...publicProfile, allowPublicContact: false },
  pedidoStatus: 'em_andamento',
  isParticipant: true,
}).href, '', 'perfil sem contato público não libera telefone')

assert.equal(rules.serviceContacts, undefined, 'telefone temporário não é persistido no RTDB')

const [route, chatPage, chat, publicRequestsSource] = await Promise.all([
  read('../src/app/api/service-contact/route.js'),
  read('../src/app/chat/[pedidoId]/page.jsx'),
  read('../src/components/ChatMensagens.jsx'),
  read('../src/lib/publicRequests.js'),
])

assert.match(route, /verifyIdToken/, 'API valida a sessão Firebase')
assert.match(route, /isServiceParticipant/, 'API valida A/B no pedido canônico')
assert.match(route, /db\.ref\(`pedidos\/\$\{pedidoId\}`\)/, 'API consulta o pedido privado canônico')
assert.match(route, /sharePhoneDuringActiveJob === true/, 'telefone privado exige consentimento específico')
assert.match(route, /users\/\$\{otherId\}/, 'somente o servidor lê o cadastro do outro participante')
assert.match(route, /contact: \{ phone, source: 'active_service' \}/, 'API devolve contato efêmero ao participante legítimo')
assert.doesNotMatch(route, /serviceContacts|\.set\(|\.update\(/, 'telefone privado não é persistido')
assert.doesNotMatch(route, /publicRequests/, 'API não confia na projeção pública')
assert.doesNotMatch(route, /body\?\.(uid|status)|body\.(uid|status)/, 'cliente não escolhe identidade nem status')

assert.match(chatPage, /users\/\$\{authUser\.uid\}/, 'cliente lê somente o próprio cadastro')
assert.doesNotMatch(chatPage, /users\/\$\{outro/, 'cliente não lê /users do outro participante')
assert.match(chatPage, /requestAuthorizedServiceContact\(pedidoId\)/, 'chat solicita contato efêmero ao servidor')
assert.match(chatPage, /isServiceContactActiveStatus/, 'solicitação existe apenas durante atendimento ativo')
assert.match(chatPage, /mounted = false/, 'resposta assíncrona é descartada no cleanup')
assert.doesNotMatch(chatPage, /serviceContacts\/\$\{pedidoId\}/, 'chat não mantém listener de telefone')
assert.match(chat, /href=\{telefoneHref\}/, 'botão usa link tel: nativo')
assert.doesNotMatch(chat, /window\.open\([^\n]*(whatsapp|wa\.me)/i, 'não inicia WhatsApp ou chamada automática')

for (const projection of [rules.publicRequests, rules.publicAvailability]) {
  const serialized = JSON.stringify(projection)
  assert.doesNotMatch(serialized, /telefone|phone|profWhats|whatsapp/i, 'projeção pública não contém telefone privado')
}
assert.doesNotMatch(publicRequestsSource, /telefone\s*:|phone\s*:|whatsapp\s*:/, 'helper público não projeta contato')

console.log('Contato de serviço: matriz A/B/C, consentimento, resposta efêmera, tel: nativo e projeções públicas OK')
