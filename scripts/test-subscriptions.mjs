import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { commercialAuditKey } from '../src/lib/commercialAuditKey.js'
import {
  buildMercadoPagoSignatureDiagnostic,
  verifyMercadoPagoHmacSignature,
} from '../src/lib/mercadoPagoWebhookSignature.js'
import {
  subscriptionKindFromProduct,
  verifyAuthoritativeSubscriptionReturn,
} from '../src/lib/subscriptionReturn.js'
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

const webhookSecret = 'test-only-webhook-secret'
const webhookRequestId = 'request-test-123'
const webhookTimestamp = '1704908010'
function signedWebhookHeaders(dataId, signatureOverride = '') {
  const manifest = `id:${dataId};request-id:${webhookRequestId};ts:${webhookTimestamp};`
  const signature = signatureOverride || crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex')
  return new Headers({
    'x-request-id': webhookRequestId,
    'x-signature': `ts=${webhookTimestamp},v1=${signature}`,
  })
}

const validWebhookDataId = '123456789'
const validWebhookSignature = verifyMercadoPagoHmacSignature({
  secret: webhookSecret,
  dataId: validWebhookDataId,
  headers: signedWebhookHeaders(validWebhookDataId),
})
assert.equal(validWebhookSignature.ok, true, 'data.id autoritativo da query valida a assinatura')
assert.equal(validWebhookSignature.paymentId, validWebhookDataId)

const validWebhookHash = signedWebhookHeaders(validWebhookDataId).get('x-signature').split('v1=')[1]
const normalizedSignatureParts = verifyMercadoPagoHmacSignature({
  secret: webhookSecret,
  dataId: validWebhookDataId,
  headers: new Headers({
    'x-request-id': webhookRequestId,
    'x-signature': ` V1 = ${validWebhookHash} , TS = ${webhookTimestamp} `,
  }),
})
assert.equal(normalizedSignatureParts.ok, true, 'parser normaliza caixa e espacos dos componentes ts/v1')
assert.equal(normalizedSignatureParts.paymentId, validWebhookDataId)

const legacyWebhookResource = 'https://api.mercadopago.com/v1/payments/123456'
const invalidWebhookAuditEventId = `webhook_received_${legacyWebhookResource}`
assert.match(
  invalidWebhookAuditEventId,
  /[.#$[\]\/]/,
  'resource URL reproduz o identificador invalido recebido pelo audit do webhook',
)
const safeWebhookAuditKey = commercialAuditKey(invalidWebhookAuditEventId)
assert.doesNotMatch(
  safeWebhookAuditKey,
  /[.#$[\]\/]/,
  'chave derivada do resource nao contem caracteres proibidos pelo RTDB',
)
assert.equal(
  commercialAuditKey(invalidWebhookAuditEventId),
  safeWebhookAuditKey,
  'mesmo evento preserva uma chave deterministica para o audit',
)
assert.notEqual(
  commercialAuditKey('webhook_received_https://api.mercadopago.com/v1/payments/123457'),
  safeWebhookAuditKey,
  'resources diferentes nao colidem na chave do audit',
)
assert.equal(
  commercialAuditKey('checkout_created_firebase-push-key'),
  'checkout_created_firebase-push-key',
  'event IDs internos ja validos permanecem inalterados',
)

const mismatchedBodyRequest = new Request(`https://preview.example/api/mercado-pago/webhook?data.id=${validWebhookDataId}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { id: 'body-id-forjado' } }),
})
const mismatchedBody = await mismatchedBodyRequest.clone().json()
const authoritativeQueryDataId = new URL(mismatchedBodyRequest.url).searchParams.get('data.id')
const mismatchedBodySignature = verifyMercadoPagoHmacSignature({
  secret: webhookSecret,
  dataId: authoritativeQueryDataId,
  headers: signedWebhookHeaders(authoritativeQueryDataId),
})
assert.notEqual(mismatchedBody.data.id, authoritativeQueryDataId)
assert.equal(mismatchedBodySignature.ok, true, 'ID divergente do body nao substitui o data.id assinado da query')
assert.equal(mismatchedBodySignature.paymentId, authoritativeQueryDataId)

assert.deepEqual(
  verifyMercadoPagoHmacSignature({
    secret: webhookSecret,
    dataId: '',
    headers: signedWebhookHeaders(validWebhookDataId),
  }),
  { ok: false, reason: 'missing_signature_data_id' },
  'query data.id ausente falha fechado',
)
assert.equal(
  verifyMercadoPagoHmacSignature({
    secret: webhookSecret,
    dataId: validWebhookDataId,
    headers: signedWebhookHeaders(validWebhookDataId, '0'.repeat(64)),
  }).reason,
  'signature_mismatch',
  'assinatura incorreta e rejeitada',
)
assert.equal(
  verifyMercadoPagoHmacSignature({
    secret: webhookSecret,
    dataId: validWebhookDataId,
    headers: new Headers(),
  }).reason,
  'missing_signature_headers',
  'headers obrigatorios ausentes sao rejeitados',
)

const diagnosticSecretMarkers = {
  requestId: 'request-id-must-not-be-logged',
  signature: 'signature-must-not-be-logged',
  queryDataId: 'QUERY-ID-MUST-NOT-BE-LOGGED',
}
const safeSignatureDiagnostic = buildMercadoPagoSignatureDiagnostic({
  reason: 'signature_mismatch',
  headers: new Headers({
    'x-request-id': diagnosticSecretMarkers.requestId,
    'x-signature': `ts=${webhookTimestamp},v1=${diagnosticSecretMarkers.signature}`,
  }),
  queryDataId: diagnosticSecretMarkers.queryDataId,
  body: {
    type: 'payment',
    live_mode: false,
    data: { id: diagnosticSecretMarkers.queryDataId },
  },
})
assert.deepEqual(safeSignatureDiagnostic, {
  event: 'mercado_pago_webhook_signature_rejected',
  reason: 'signature_mismatch',
  hasSignatureHeader: true,
  hasRequestIdHeader: true,
  hasQueryDataId: true,
  hasTimestamp: true,
  hasV1: true,
  hasLegacyIdQuery: false,
  hasLegacyTopicQuery: false,
  hasBodyDataId: true,
  hasBodyResource: false,
  canCompareQueryAndBodyDataId: true,
  queryDataIdMatchesBodyDataId: true,
  queryDataIdNeedsLowercase: true,
  isPaymentNotification: true,
  isTestNotification: true,
  looksLegacyIpn: false,
})
const serializedSignatureDiagnostic = JSON.stringify(safeSignatureDiagnostic)
for (const sensitiveValue of Object.values(diagnosticSecretMarkers)) {
  assert.doesNotMatch(
    serializedSignatureDiagnostic,
    new RegExp(sensitiveValue),
    'diagnostico nao inclui valores de headers ou identificadores',
  )
}

const legacySignatureDiagnostic = buildMercadoPagoSignatureDiagnostic({
  reason: 'missing_signature_data_id',
  headers: new Headers(),
  queryDataId: '',
  legacyQueryId: 'legacy-id-must-not-be-logged',
  legacyQueryTopic: 'payment',
  body: { resource: 'resource-url-must-not-be-logged' },
})
assert.equal(legacySignatureDiagnostic.looksLegacyIpn, true, 'formato legado/IPN e identificado sem expor valores')
assert.equal(legacySignatureDiagnostic.hasLegacyIdQuery, true)
assert.equal(legacySignatureDiagnostic.hasLegacyTopicQuery, true)
assert.equal(legacySignatureDiagnostic.hasBodyResource, true)
assert.doesNotMatch(JSON.stringify(legacySignatureDiagnostic), /must-not-be-logged/)

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
assert.equal(canReusePendingSubscriptionCheckout({ ...pendingA, productId: 'UNKNOWN' }, 'user-a', now), false, 'produto invalido nao restaura checkout')
assert.equal(canReusePendingSubscriptionCheckout({ ...pendingA, createdAt: now + 1 }, 'user-a', now), false, 'pending com data futura falha fechado')
assert.equal(canReusePendingSubscriptionCheckout({ ...pendingA, createdAt: now - (24 * 60 * 60 * 1000) - 1 }, 'user-a', now), false, 'pending expirado nao e reutilizado')
assert.equal(isSubscriptionSessionCurrent('user-a', 'user-b'), false, 'resposta async de A nao pertence a sessao B')
assert.equal(isSubscriptionSessionCurrent('user-a', ''), false, 'logout invalida operacao transitoria')

function statusResult(kind, plan, otherPlan = {}) {
  const otherKind = kind === 'client' ? 'professional' : 'client'
  return {
    subscriptions: {
      [kind]: plan,
      [otherKind]: otherPlan,
    },
  }
}

function testClock(initial = 0) {
  let current = initial
  return {
    now: () => current,
    wait: async (delay) => { current += delay },
  }
}

const checkoutCreatedAt = now - 5_000
let activeStatusReads = 0
const alreadyActiveReturn = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => {
    activeStatusReads += 1
    return statusResult('client', { active: true, startedAt: now - 1_000, expiresAt: now + 31_536_000_000 })
  },
  expectedKind: 'client',
  checkoutCreatedAt,
  automatic: true,
})
assert.equal(alreadyActiveReturn.state, 'approved', 'approved + backend ativo confirma imediatamente')
assert.equal(activeStatusReads, 1, 'backend ja ativo exige uma unica consulta')

const delayedClock = testClock()
let delayedStatusReads = 0
const delayedReturn = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => {
    delayedStatusReads += 1
    return statusResult(
      'professional',
      delayedStatusReads >= 3
        ? { active: true, startedAt: now, expiresAt: now + 31_536_000_000 }
        : { active: false },
      { active: true, startedAt: now, expiresAt: now + 31_536_000_000 },
    )
  },
  expectedKind: 'professional',
  checkoutCreatedAt,
  automatic: true,
  timeoutMs: 10_000,
  intervalMs: 1_000,
  requestTimeoutMs: 50,
  now: delayedClock.now,
  wait: delayedClock.wait,
})
assert.equal(delayedReturn.state, 'approved', 'webhook atrasado e reconhecido por polling autoritativo')
assert.equal(delayedStatusReads, 3, 'polling para quando o plano correto fica ativo')

const timeoutClock = testClock()
let timeoutStatusReads = 0
const timedOutReturn = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => {
    timeoutStatusReads += 1
    return statusResult('client', { active: false })
  },
  expectedKind: 'client',
  checkoutCreatedAt,
  automatic: true,
  timeoutMs: 3_000,
  intervalMs: 1_000,
  requestTimeoutMs: 50,
  now: timeoutClock.now,
  wait: timeoutClock.wait,
})
assert.equal(timedOutReturn.state, 'pending', 'webhook nunca confirmado termina em estado recuperavel')
assert.equal(timedOutReturn.reason, 'confirmation_timeout')
assert.equal(timedOutReturn.timedOut, true)
assert.equal(timeoutStatusReads, 3, 'polling possui limite deterministico')

const networkErrorReturn = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => { throw new Error('network unavailable') },
  expectedKind: 'client',
  checkoutCreatedAt,
})
assert.equal(networkErrorReturn.state, 'pending', 'erro de status sai do loading')
assert.equal(networkErrorReturn.reason, 'status_error')

const hangingStatusReturn = await verifyAuthoritativeSubscriptionReturn({
  readStatus: () => new Promise(() => {}),
  expectedKind: 'client',
  checkoutCreatedAt,
  requestTimeoutMs: 5,
})
assert.equal(hangingStatusReturn.state, 'pending', 'status pendurado nao deixa spinner infinito')
assert.equal(hangingStatusReturn.reason, 'status_timeout')

const recoveredAfterError = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => statusResult('client', { active: true, startedAt: now, expiresAt: now + 31_536_000_000 }),
  expectedKind: 'client',
  checkoutCreatedAt,
})
assert.equal(recoveredAfterError.state, 'approved', 'verificar novamente consulta status e recupera depois de erro')

const refreshPending = { ...pendingA }
const refreshClock = testClock()
const beforeRefresh = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => statusResult('client', { active: false }),
  expectedKind: 'client',
  checkoutCreatedAt,
  automatic: true,
  timeoutMs: 1_000,
  intervalMs: 500,
  requestTimeoutMs: 50,
  now: refreshClock.now,
  wait: refreshClock.wait,
})
assert.equal(beforeRefresh.state, 'pending')
assert.equal(canReusePendingSubscriptionCheckout(refreshPending, 'user-a', now), true, 'refresh preserva tentativa valida do mesmo UID')
const afterRefresh = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => statusResult('client', { active: true, startedAt: now, expiresAt: now + 31_536_000_000 }),
  expectedKind: 'client',
  checkoutCreatedAt,
})
assert.equal(afterRefresh.state, 'approved', 'nova montagem pode confirmar tentativa preservada')

let obsoleteStatusReads = 0
const obsoleteReturn = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => {
    obsoleteStatusReads += 1
    return statusResult('client', { active: true, startedAt: now, expiresAt: now + 31_536_000_000 })
  },
  expectedKind: 'client',
  checkoutCreatedAt,
  shouldContinue: () => false,
})
assert.equal(obsoleteReturn.state, 'cancelled', 'retorno duplicado obsoleto e cancelado')
assert.equal(obsoleteStatusReads, 0, 'execucao obsoleta nao consulta nem sobrescreve estado')

let switchedSessionReads = 0
const switchedSessionReturn = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => {
    switchedSessionReads += 1
    return statusResult('client', { active: true, startedAt: now, expiresAt: now + 31_536_000_000 })
  },
  expectedKind: 'client',
  checkoutCreatedAt,
  shouldContinue: () => isSubscriptionSessionCurrent('user-a', 'user-b'),
})
assert.equal(switchedSessionReturn.state, 'cancelled', 'A para B cancela confirmacao de A')
assert.equal(switchedSessionReads, 0, 'B nunca consulta ou aplica retorno pendente de A')

assert.equal(subscriptionKindFromProduct('CLIENT_ANNUAL'), 'client')
assert.equal(subscriptionKindFromProduct('PROFESSIONAL_ANNUAL'), 'professional')
const independentPlansReturn = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => statusResult(
    'client',
    { active: false },
    { active: true, startedAt: now, expiresAt: now + 31_536_000_000 },
  ),
  expectedKind: 'client',
  checkoutCreatedAt,
})
assert.equal(independentPlansReturn.state, 'pending', 'Profissional ativo nao confirma checkout Cliente')

const earlyRenewalBaseline = now + 31_536_000_000
const earlyRenewalReturn = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => statusResult('client', {
    active: true,
    startedAt: now - 31_536_000_000,
    expiresAt: earlyRenewalBaseline + 31_536_000_000,
  }),
  expectedKind: 'client',
  baselineExpiresAt: earlyRenewalBaseline,
  checkoutCreatedAt,
})
assert.equal(earlyRenewalReturn.state, 'approved', 'renovacao antecipada confirma somente quando validade aumenta')

const redirectOnlyReturn = await verifyAuthoritativeSubscriptionReturn({
  readStatus: async () => ({
    collection_status: 'approved',
    subscriptions: { client: { active: false } },
  }),
  expectedKind: 'client',
  checkoutCreatedAt,
})
assert.equal(redirectOnlyReturn.state, 'pending', 'redirect approved sozinho nunca ativa assinatura no frontend')

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
assert.match(
  commercialSource,
  /const id = eventId[\s\S]*?commercialAuditKey\(eventId\)[\s\S]*?commercialAuditLogs\/\$\{id\}/,
  'audit usa chave RTDB segura para eventId externo',
)
assert.match(
  commercialSource,
  /eventId: eventId \|\| id/,
  'audit preserva o identificador original como valor rastreavel',
)
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
assert.match(
  webhookRouteSource,
  /console\.warn\(JSON\.stringify\(signatureDiagnostic\)\)/,
  'rejeicao registra somente diagnostico seguro serializado',
)
assert.match(webhookRouteSource, /request\.nextUrl\.searchParams\.get\('data\.id'\)/, 'webhook le o data.id autoritativo da query')
assert.match(webhookRouteSource, /dataId:\s*signatureDataId/, 'webhook passa explicitamente o data.id da query para validacao')
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
const subscriptionReturnSource = await readFile(new URL('../src/lib/subscriptionReturn.js', import.meta.url), 'utf8')
assert.match(subscriptionPaywallSource, /Seu primeiro pedido foi grátis\./)
assert.match(subscriptionPaywallSource, /Seu período gratuito de 3 meses terminou\./)
assert.match(subscriptionPaywallSource, /Pagamento confirmado!/)
assert.match(subscriptionPaywallSource, /Estamos confirmando seu pagamento/)
assert.match(subscriptionPaywallSource, /Pagamento em processamento/)
assert.match(subscriptionPaywallSource, /Para agendar diretamente com um profissional, ative o Plano Cliente\./)
assert.match(subscriptionPaywallSource, /verifyAuthoritativeSubscriptionReturn\(/)
assert.match(subscriptionPaywallSource, /readStatus: getSubscriptionStatus/)
assert.match(subscriptionPaywallSource, /onAuthStateChanged\(auth/)
assert.match(subscriptionPaywallSource, /readPendingSubscriptionCheckout\(sessionUid\)/)
assert.match(subscriptionPaywallSource, /isSubscriptionSessionCurrent\(expectedUid, auth\.currentUser\?\.uid\)/)
assert.match(subscriptionPaywallSource, /verificationAbortRef\.current\?\.abort\(\)/, 'troca de execucao aborta consulta anterior')
assert.match(subscriptionPaywallSource, /replaceState\(window\.history\.state/, 'limpeza da URL preserva estado do router')
assert.match(subscriptionPaywallSource, /cleanCheckoutParams\(url\)[\s\S]*clearPendingSubscriptionCheckout\(\)[\s\S]*state: 'approved'/, 'confirmacao limpa URL antes do pending')
assert.doesNotMatch(subscriptionPaywallSource, /if \(!nextUid\) clearPendingSubscriptionCheckout\(\)/, 'auth null transitorio nao apaga tentativa vinculada ao UID')
assert.doesNotMatch(subscriptionPaywallSource, /set\([^\n]*subscriptions/)
assert.doesNotMatch(subscriptionReturnSource, /collection_status|payment_id|external_reference/, 'redirect nao participa da confirmacao autoritativa')
assert.doesNotMatch(subscriptionReturnSource, /planos\/checkout|startAnnualSubscriptionCheckout/, 'verificacao nunca cria nova cobranca')

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
assert.match(subscriptionClientSource, /signal: options\.signal/, 'consulta de status suporta cancelamento')
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
