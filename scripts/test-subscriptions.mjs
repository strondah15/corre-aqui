import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  addCalendarMonths,
  canCreateClientDirectRequest,
  canReusePendingSubscriptionCheckout,
  canCreateClientOrder,
  getClientSubscriptionStatus,
  getProfessionalSubscriptionStatus,
  isSubscriptionSessionCurrent,
} from '../src/lib/subscriptions.js'

const now = Date.UTC(2026, 7, 30, 12)

const pendingA = {
  uid: 'user-a',
  productId: 'CLIENT_ANNUAL',
  attemptId: 'attempt-a',
  createdAt: now - 1000,
}
assert.equal(canReusePendingSubscriptionCheckout(pendingA, 'user-a', now), true, 'mesmo UID pode retomar checkout')
assert.equal(canReusePendingSubscriptionCheckout(pendingA, 'user-b', now), false, 'UID B nao reutiliza checkout de A')
assert.equal(canReusePendingSubscriptionCheckout({ ...pendingA, uid: undefined }, 'user-a', now), false, 'pending legado sem UID falha fechado')
assert.equal(canReusePendingSubscriptionCheckout({ ...pendingA, attemptId: '' }, 'user-a', now), false, 'pending estruturalmente invalido falha fechado')
assert.equal(isSubscriptionSessionCurrent('user-a', 'user-b'), false, 'resposta async de A nao pertence a sessao B')
assert.equal(isSubscriptionSessionCurrent('user-a', ''), false, 'logout invalida operacao transitoria')

assert.equal(canCreateClientOrder({}, { now, hasExistingOrder: false }).reason, 'first_free_order')
assert.equal(canCreateClientDirectRequest({}, { now }).allowed, false, 'A/B: primeiro pedido gratis nao libera agendamento direto')
assert.equal(canCreateClientOrder({ clientFreeOrderUsed: true }, { now, hasOpenOrder: true }).reason, 'free_order_in_progress')
assert.equal(canCreateClientOrder({ clientFreeOrderUsed: true }, { now }).reason, 'client_subscription_required')
assert.equal(canCreateClientDirectRequest({ clientFreeOrderUsed: true }, { now }).allowed, false, 'C/D: uso do pedido gratis nao muda o bloqueio direto')

const activeUser = {
  clientFreeOrderUsed: true,
  subscriptions: { client: { status: 'active', plan: 'annual', expiresAt: now + 1000 } },
}
assert.equal(getClientSubscriptionStatus(activeUser, now).active, true)
assert.equal(canCreateClientOrder(activeUser, { now, hasExistingOrder: true }).allowed, true)
assert.equal(canCreateClientDirectRequest(activeUser, { now }).allowed, true, 'E: Plano Cliente anual ativo libera agendamento')
assert.equal(canCreateClientDirectRequest({
  subscriptions: { client: { status: 'active', plan: 'annual', expiresAt: now - 1 } },
}, { now }).allowed, false, 'F: Plano Cliente vencido bloqueia novo agendamento')
assert.equal(canCreateClientDirectRequest({
  subscriptions: { client: { status: 'active', plan: 'professional', expiresAt: now + 10_000 } },
}, { now }).allowed, false, 'produto/plano diferente nao libera contratacao Cliente')

const trialEndsAt = addCalendarMonths(now, 3)
assert.equal(
  addCalendarMonths(Date.UTC(2024, 0, 31, 12), 1),
  Date.UTC(2024, 1, 29, 12),
  'mes de calendario preserva o ultimo dia valido',
)
assert.equal(
  addCalendarMonths(Date.UTC(2024, 1, 29, 12), 12),
  Date.UTC(2025, 1, 28, 12),
  'ano de calendario trata corretamente ano bissexto',
)
const currentAnnualExpiry = Date.UTC(2027, 7, 30, 12)
assert.equal(
  addCalendarMonths(currentAnnualExpiry, 12),
  Date.UTC(2028, 7, 30, 12),
  'renovacao antecipada acrescenta um ano ao vencimento atual',
)
const trial = getProfessionalSubscriptionStatus({
  subscriptions: { professional: { status: 'trial', trialStartedAt: now, trialEndsAt } },
}, now + 1000)
assert.equal(trial.canUseProfessionalFeatures, true)
assert.equal(trial.status, 'trial')

const expired = getProfessionalSubscriptionStatus({
  subscriptions: { professional: { status: 'trial', trialStartedAt: now - 1000, trialEndsAt: now - 1 } },
}, now)
assert.equal(expired.status, 'expired')
assert.equal(expired.canUseProfessionalFeatures, false)

const commercialSource = await readFile(new URL('../src/lib/commercialServer.js', import.meta.url), 'utf8')
const checkoutRouteSource = await readFile(new URL('../src/app/api/planos/checkout/route.js', import.meta.url), 'utf8')
const statusRouteSource = await readFile(new URL('../src/app/api/subscriptions/status/route.js', import.meta.url), 'utf8')
const webhookRouteSource = await readFile(new URL('../src/app/api/mercado-pago/webhook/route.js', import.meta.url), 'utf8')
assert.match(commercialSource, /processedPaymentEvents/)
assert.match(commercialSource, /referenceKey\(`\$\{paymentId\}:\$\{status \|\| 'unknown'\}`\)/)
assert.match(commercialSource, /PAYMENT_EVENT_LEASE_MS/)
assert.match(commercialSource, /lockStatus === 'failed'/)
assert.match(commercialSource, /status: 'failed',[\s\S]*?reason: 'processing_error'/)
assert.match(commercialSource, /safeText\(plan\.paymentId\) === paymentId/)
assert.match(commercialSource, /currentExpiresAt > now[\s\S]*?currentExpiresAt[\s\S]*?: now/)
assert.match(checkoutRouteSource, /getAuthenticatedUid\(request\)/, 'checkout usa UID do token')
assert.match(checkoutRouteSource, /CLIENT_ANNUAL_PRODUCT_ID[\s\S]*PROFESSIONAL_ANNUAL_PRODUCT_ID/, 'checkout aceita os produtos anuais canonicos')
assert.match(checkoutRouteSource, /invalid_plan/, 'produto invalido e rejeitado')
assert.doesNotMatch(checkoutRouteSource, /body\?\.(?:uid|userId|amount|amountInCents|price|preco)/, 'checkout nao confia em UID ou preco do body')
assert.match(commercialSource, /unit_price: product\.amountInCents \/ 100/, 'preco da Preference vem do catalogo backend')
assert.match(webhookRouteSource, /verifyMercadoPagoSignature/, 'webhook valida assinatura')
assert.match(webhookRouteSource, /api\.mercadopago\.com\/v1\/payments/, 'webhook consulta o pagamento no Mercado Pago')
assert.ok(
  commercialSource.indexOf("if (status !== 'approved')") < commercialSource.indexOf('const activation = product.id'),
  'pagamento pendente ou rejeitado nao chega a ativacao',
)
assert.match(commercialSource, /activateAnnualSubscription\(\{ database, attempt, payment \}\)/, 'aprovado ativa somente pelo backend')
assert.match(statusRouteSource, /readSubscriptionSummary\(database, uid\)/, 'frontend confirma pelo status backend')

const subscriptionServerSource = await readFile(new URL('../src/lib/subscriptionServer.js', import.meta.url), 'utf8')
assert.match(subscriptionServerSource, /hasPaidSubscriptionHistory/)
assert.match(subscriptionServerSource, /canCreateClientDirectRequest/)
assert.match(subscriptionServerSource, /client_direct_subscription_required/)

const subscriptionPaywallSource = await readFile(new URL('../src/components/SubscriptionPaywallHost.jsx', import.meta.url), 'utf8')
assert.match(subscriptionPaywallSource, /Seu primeiro pedido foi grátis\./)
assert.match(subscriptionPaywallSource, /Seu período gratuito de 3 meses terminou\./)
assert.match(subscriptionPaywallSource, /Pagamento aprovado!/)
assert.match(subscriptionPaywallSource, /Estamos confirmando seu pagamento/)
assert.match(subscriptionPaywallSource, /Para agendar diretamente com um profissional, ative o Plano Cliente\./)
assert.match(subscriptionPaywallSource, /await getSubscriptionStatus\(\)/)
assert.match(subscriptionPaywallSource, /onAuthStateChanged\(auth/)
assert.match(subscriptionPaywallSource, /readPendingSubscriptionCheckout\(sessionUid\)/)
assert.match(subscriptionPaywallSource, /isSubscriptionSessionCurrent\(expectedUid, auth\.currentUser\?\.uid\)/)
assert.match(subscriptionPaywallSource, /if \(!nextUid\) clearPendingSubscriptionCheckout\(\)/)
assert.doesNotMatch(subscriptionPaywallSource, /set\([^\n]*subscriptions/)

const subscriptionStatusCardSource = await readFile(new URL('../src/components/SubscriptionStatusCard.jsx', import.meta.url), 'utf8')
assert.match(subscriptionStatusCardSource, /Válida até:/)
assert.match(subscriptionStatusCardSource, /dias restantes/)
assert.match(subscriptionStatusCardSource, /Renovar assinatura/)

const subscriptionClientSource = await readFile(new URL('../src/lib/subscriptionClient.js', import.meta.url), 'utf8')
assert.match(subscriptionClientSource, /baselineExpiresAt/)
assert.match(subscriptionClientSource, /uid: checkoutUid/)
assert.match(subscriptionClientSource, /canReusePendingSubscriptionCheckout\(value, expectedUid\)/)
assert.match(subscriptionClientSource, /isSubscriptionSessionCurrent\(checkoutUid, auth\.currentUser\?\.uid\)/)
assert.match(subscriptionClientSource, /\/api\/subscriptions\/status/)
assert.match(subscriptionClientSource, /ensureClientDirectRequestAccess/)
assert.doesNotMatch(subscriptionClientSource, /update\([^\n]*subscriptions/)

const privateCreateRouteSource = await readFile(new URL('../src/app/api/private-requests/create/route.js', import.meta.url), 'utf8')
const privateRequestsSource = await readFile(new URL('../src/lib/privateRequests.js', import.meta.url), 'utf8')
const mapSource = await readFile(new URL('../src/components/Mapadinamico.jsx', import.meta.url), 'utf8')
for (const existingFlowRoute of [
  '../src/app/api/private-requests/respond/route.js',
  '../src/app/api/private-requests/transition/route.js',
  '../src/app/api/private-requests/conversation/route.js',
  '../src/app/api/private-requests/rating/route.js',
]) {
  const source = await readFile(new URL(existingFlowRoute, import.meta.url), 'utf8')
  assert.doesNotMatch(source, /ensureClientDirectRequestAccess/, `G: ${existingFlowRoute} nao bloqueia solicitacao existente apos vencimento`)
}
assert.match(privateCreateRouteSource, /getAuthenticatedUid\(request\)/, 'H: chamada direta exige autenticacao backend')
assert.match(privateCreateRouteSource, /ensureClientDirectRequestAccess\(database, uid, now\)/, 'H: chamada direta sem assinatura e bloqueada')
assert.match(privateCreateRouteSource, /claimedClientUid && claimedClientUid !== uid/, 'I: UID C nao cria em nome de A')
assert.match(privateCreateRouteSource, /database\.ref\(\)\.update\(\{[\s\S]*privateRequests[\s\S]*privateRequestInbox/, 'criacao permitida grava principal e indices atomicamente')
assert.match(privateRequestsSource, /fetch\('\/api\/private-requests\/create'/, 'cliente nao cria privateRequest pelo SDK Firebase')
assert.doesNotMatch(privateRequestsSource, /update\(ref\(database, requestPath\), request\)/, 'frontend nao possui writer direto antigo')
assert.match(mapSource, /criarPedidoDiretoPortfolio[\s\S]*confirmarAcessoContratacaoDireta/, 'J: pedido direto do perfil/portfolio possui preflight')
assert.match(mapSource, /abrirAgendaCliente[\s\S]*confirmarAcessoContratacaoDireta/, 'J: botao Agendar possui preflight antes do formulario')

const rules = JSON.parse(await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')).rules
assert.match(rules.users.$uid['.write'], /newData\.child\('subscriptions'\)\.exists\(\) === data\.child\('subscriptions'\)\.exists\(\)/)
assert.equal(rules.users.$uid.subscriptions['.validate'], false)
assert.match(rules.users.$uid['.write'], /newData\.child\('clientFreeOrderUsed'\)\.val\(\) === data\.child\('clientFreeOrderUsed'\)\.val\(\)/)
assert.doesNotMatch(rules.pedidos.$pedidoId['.write'], /!data\.exists\(\) && newData\.exists\(\)/)
assert.equal(rules.privateRequests.$requestId.status['.write'], false)
assert.doesNotMatch(rules.privateRequests.$requestId['.write'], /!data\.exists\(\) && newData\.exists\(\)/, 'Rules fecham bypass de criacao client-side')
assert.match(rules.agendamentos.$agendamentoId['.write'], /subscriptions\/professional\/trialEndsAt/)

console.log('subscription/payment/direct-request policy tests passed')
