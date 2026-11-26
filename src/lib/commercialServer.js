import crypto from 'crypto'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import {
  COMMERCIAL_CURRENCY,
  PROFESSIONAL_FEATURED_PLAN_ID,
  REQUEST_BOOST_PRODUCT_ID,
  getCommercialProduct,
} from '@/lib/commercialProducts'
import {
  ANNUAL_PLAN_MONTHS,
  CLIENT_ANNUAL_PRODUCT_ID,
  PROFESSIONAL_ANNUAL_PRODUCT_ID,
  addCalendarMonths,
  getProfessionalSubscriptionStatus,
  isRecurringSubscriptionProduct,
  subscriptionKindForProduct,
} from '@/lib/subscriptions'
import {
  RECURRING_PROVIDER,
  SUBSCRIPTION_CHECKOUT_LEASE_MS,
  buildRecurringPreapprovalPayload,
  isCanceledProviderStatus,
  isTerminalRecurringCancellation,
  isValidPayerEmail,
  nextQuarterlyExpiration,
  paymentRenewalStatus,
  providerRenewalStatus,
  recurringCheckoutAmountInCents,
  shouldApplyProviderUpdate,
  validateRecurringPreapproval,
} from '@/lib/recurringSubscriptions'
import { commercialAuditKey } from '@/lib/commercialAuditKey'
import { verifyMercadoPagoHmacSignature } from '@/lib/mercadoPagoWebhookSignature'
import { assessMercadoPagoCheckoutConfiguration, resolveMercadoPagoRecurringBuyer } from '@/lib/commercialRuntimeConfig'
import { materializeSubscriptionNotification } from '@/lib/subscriptionNotifications'
import { ensureProfessionalTrial } from '@/lib/subscriptionServer'

export const COMMERCIAL_SOURCE = 'mercado_pago'
const PAYMENT_EVENT_LEASE_MS = 5 * 60 * 1000

export const safeText = (value) => String(value || '').trim()

export const normalizeText = (value) => safeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

async function notifySubscriptionEventSafely({ database, ...event }) {
  try {
    return await materializeSubscriptionNotification({ database, ...event })
  } catch (error) {
    console.error('[commercial] subscription notification failed', {
      code: safeText(error?.code || error?.message || 'unknown').slice(0, 120),
      type: safeText(event.type).slice(0, 64),
    })
    return { ok: false, reason: 'subscription_notification_failed' }
  }
}

export const asTimestamp = (value) => {
  if (!value) return 0
  if (typeof value === 'object' && Number.isFinite(Number(value.seconds))) {
    return Number(value.seconds) * 1000
  }
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function cleanFirebasePayload(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanFirebasePayload(item))
      .filter((item) => item !== undefined)
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, cleanFirebasePayload(item)])
      .filter(([, item]) => item !== undefined)
    return Object.fromEntries(entries)
  }
  return value === undefined ? undefined : value
}

export function referenceKey(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64url')
    .slice(0, 180)
}

export async function getAuthenticatedIdentity(request) {
  if (!isFirebaseAdminConfigured()) {
    const error = new Error('Firebase Admin nao configurado.')
    error.status = 503
    throw error
  }

  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) {
    const error = new Error('missing_auth_token')
    error.status = 401
    throw error
  }

  const decoded = await getFirebaseAdminAuth().verifyIdToken(idToken)
  return {
    uid: decoded.uid,
    email: safeText(decoded.email).toLowerCase(),
    emailVerified: decoded.email_verified === true,
  }
}

export async function getAuthenticatedUid(request) {
  const identity = await getAuthenticatedIdentity(request)
  return identity.uid
}

export function getCommercialDatabase() {
  if (!isFirebaseAdminConfigured()) {
    const error = new Error('Firebase Admin nao configurado.')
    error.status = 503
    throw error
  }
  return getFirebaseAdminDatabase()
}

export function isProduction() {
  return process.env.NODE_ENV === 'production'
}

export function getMercadoPagoCheckoutReadiness() {
  return assessMercadoPagoCheckoutConfiguration(process.env)
}

export function getMercadoPagoSubscriptionManagementReadiness() {
  return assessMercadoPagoCheckoutConfiguration(process.env, { requireCheckoutEnabled: false })
}

export function isMercadoPagoCheckoutEnabled() {
  return getMercadoPagoCheckoutReadiness().ready
}

export function isCommercialHighlightsEnabled() {
  return process.env.COMMERCIAL_HIGHLIGHTS_ENABLED === 'true'
}

export function isFeaturedRequestsPreviewEnabled() {
  if (isProduction()) return false
  return process.env.FEATURED_REQUESTS_TEST_MODE === 'true'
}

export function getPedidoOwnerUid(pedido) {
  return safeText(
    pedido?.criador?.id
      || pedido?.criadorUid
      || pedido?.clienteId
      || pedido?.ownerUid
      || pedido?.uid
  )
}

export function normalizePedidoStatus(value) {
  return safeText(value || 'aberto').toLowerCase()
}

export function getPedidoCategoryId(pedido) {
  return safeText(pedido?.categoriaId || pedido?.categoria || pedido?.categoriaNome)
}

export function getPedidoRegionKeys(pedido) {
  const candidates = [
    pedido?.regiao,
    pedido?.cidade,
    pedido?.bairro,
    pedido?.local?.cidade,
    pedido?.local?.bairro,
    pedido?.endereco?.cidade,
    pedido?.endereco?.bairro,
  ]
  return Array.from(new Set(candidates.map(normalizeText).filter(Boolean))).slice(0, 12)
}

export function getProfileRegionKeys(profile = {}) {
  const candidates = [
    profile?.profCidadeAtende,
    profile?.correRegiao,
    profile?.regiao,
    profile?.cidade,
    profile?.profile?.cidade,
    profile?.profile?.regiao,
  ]
  return Array.from(new Set(candidates.map(normalizeText).filter(Boolean))).slice(0, 12)
}

export function hasActiveRequestBoost(entitlement, now = Date.now()) {
  if (!entitlement || typeof entitlement !== 'object') return false
  if (entitlement.active !== true) return false
  if (safeText(entitlement.status).toLowerCase() !== 'active') return false
  if (safeText(entitlement.productId) !== REQUEST_BOOST_PRODUCT_ID) return false
  const startsAt = asTimestamp(entitlement.startsAt)
  const expiresAt = asTimestamp(entitlement.expiresAt)
  if (startsAt && startsAt > now) return false
  return !!expiresAt && expiresAt > now
}

export function isPedidoEligibleForBoost({ pedido, uid, entitlement = null, now = Date.now() }) {
  if (!pedido || typeof pedido !== 'object') {
    return { ok: false, reason: 'pedido_nao_encontrado' }
  }
  if (getPedidoOwnerUid(pedido) !== uid) {
    return { ok: false, reason: 'pedido_de_outro_usuario' }
  }
  const status = normalizePedidoStatus(pedido.status)
  if (status !== 'aberto') {
    return { ok: false, reason: 'pedido_nao_aberto' }
  }
  if (pedido?.aceite?.id || pedido?.aceitoPor || pedido?.aceitadorId) {
    return { ok: false, reason: 'pedido_ja_aceito' }
  }
  if (pedido?.bloqueado || pedido?.blocked || pedido?.moderado || pedido?.moderation?.blocked) {
    return { ok: false, reason: 'pedido_bloqueado' }
  }
  if (!getPedidoCategoryId(pedido)) {
    return { ok: false, reason: 'categoria_ausente' }
  }
  if (!getPedidoRegionKeys(pedido).length && !(pedido?.local?.lat != null && pedido?.local?.lng != null)) {
    return { ok: false, reason: 'regiao_ausente' }
  }
  if (hasActiveRequestBoost(entitlement, now)) {
    return { ok: false, reason: 'impulso_ativo' }
  }
  return { ok: true, reason: '' }
}

export function isProfileEligibleForFeaturedPlan(profile = {}) {
  if (!profile || typeof profile !== 'object') {
    return { ok: false, reason: 'perfil_publico_ausente' }
  }
  if (!safeText(profile.nome)) return { ok: false, reason: 'nome_ausente' }
  if (profile.profileVisible === false || profile.visivel === false) {
    return { ok: false, reason: 'perfil_privado' }
  }
  if (
    profile.accountSuspended === true
    || profile.contaSuspensa === true
    || profile.suspended === true
    || profile.suspenso === true
    || safeText(profile.status).toLowerCase() === 'suspended'
  ) {
    return { ok: false, reason: 'conta_suspensa' }
  }
  if (!profile.isCorre && !profile.isProfissional) {
    return { ok: false, reason: 'modo_profissional_ausente' }
  }

  const categories = [
    ...(Array.isArray(profile.profCategorias) ? profile.profCategorias : []),
    ...(Array.isArray(profile.correCategorias) ? profile.correCategorias : []),
  ].map(safeText).filter(Boolean)
  const portfolio = profile.portfolio && typeof profile.portfolio === 'object'
    ? Object.values(profile.portfolio)
    : []
  const hasPortfolio = portfolio.some((service) => service && service.ativo !== false && service.active !== false)

  if (!categories.length && !hasPortfolio) {
    return { ok: false, reason: 'servico_ou_categoria_ausente' }
  }
  if (!getProfileRegionKeys(profile).length) {
    return { ok: false, reason: 'regiao_ausente' }
  }

  return { ok: true, reason: '' }
}

export async function loadPublicProfile(database, uid) {
  const publicSnapshot = await database.ref(`publicProfiles/${uid}`).get()
  if (publicSnapshot.exists()) return publicSnapshot.val()

  const userSnapshot = await database.ref(`users/${uid}`).get()
  const user = userSnapshot.val() || null
  if (!user || typeof user !== 'object') return null
  return {
    ...user,
    ...(user.profile && typeof user.profile === 'object' ? user.profile : {}),
    uid,
  }
}

export async function writeCommercialAudit(database, event) {
  const eventId = safeText(event?.eventId)
  const id = eventId
    ? commercialAuditKey(eventId)
    : database.ref('commercialAuditLogs').push().key
  await database.ref(`commercialAuditLogs/${id}`).set(cleanFirebasePayload({
    ...event,
    eventId: eventId || id,
    createdAt: Date.now(),
    source: event?.source || COMMERCIAL_SOURCE,
  }))
}

export function createExternalReference({ userId, productId, targetId, attemptId }) {
  const nonce = crypto.randomBytes(8).toString('hex')
  return [
    safeText(productId),
    safeText(userId),
    safeText(targetId || 'profile'),
    safeText(attemptId),
    nonce,
  ].join(':')
}

export function parseExternalReference(externalReference) {
  const [productId, userId, targetId, attemptId] = safeText(externalReference).split(':')
  if (!productId || !userId || !targetId || !attemptId) return null
  return { productId, userId, targetId, attemptId }
}

async function createCommercialCheckoutAttempt({
  database,
  userId,
  product,
  targetId = '',
  targetType = '',
  targetSummary = {},
}) {
  const attemptRef = database.ref('commercialCheckoutAttempts').push()
  const attemptId = attemptRef.key
  const externalReference = createExternalReference({
    userId,
    productId: product.id,
    targetId,
    attemptId,
  })
  const now = Date.now()
  const attempt = cleanFirebasePayload({
    id: attemptId,
    userId,
    productId: product.id,
    type: product.type,
    targetId,
    targetType,
    targetSummary,
    amountInCents: product.amountInCents,
    currency: product.currency,
    status: 'checkout_created',
    checkoutStatus: 'provider_enabled',
    provider: COMMERCIAL_SOURCE,
    externalReference,
    createdAt: now,
    updatedAt: now,
  })

  await attemptRef.set(attempt)
  await database.ref(`commercialCheckoutAttemptsByUser/${userId}/${attemptId}`).set(true)
  await database.ref(`commercialCheckoutAttemptsByExternalReference/${referenceKey(externalReference)}`).set(attemptId)
  await writeCommercialAudit(database, {
    eventId: `checkout_created_${attemptId}`,
    type: 'checkout_created',
    userId,
    productId: product.id,
    pedidoId: product.id === REQUEST_BOOST_PRODUCT_ID ? targetId : null,
    paymentReference: externalReference,
    statusAfter: 'checkout_created',
  })

  return attempt
}

function checkoutConfigurationError(readiness) {
  const error = new Error('checkout_configuration_incomplete')
  error.code = 'checkout_configuration_incomplete'
  error.status = 503
  error.configurationIssues = Array.from(readiness?.issues || [])
  return error
}

function mercadoPagoError(data, status, fallback = 'mercado_pago_request_failed') {
  const error = new Error(safeText(data?.message || data?.error || fallback))
  error.code = safeText(data?.code || fallback)
  error.status = status >= 400 && status < 500 ? 409 : 502
  return error
}

function mercadoPagoRecurringCheckoutError(data, status, fallback) {
  const causes = Array.isArray(data?.cause) ? data.cause.map((cause) => cause?.description) : []
  const mismatch = [data?.message, data?.error, ...causes].some((detail) =>
    /both\s+payer\s+and\s+collector\s+must\s+be\s+real\s+or\s+test\s+users/i.test(safeText(detail)))
  const error = mercadoPagoError(null, status, mismatch ? 'mercado_pago_payer_collector_mismatch' : fallback)
  error.userMessage = mismatch && process.env.CORRE_AQUI_ENV === 'staging'
    ? 'O Mercado Pago recusou a combinação de contas. Use a conta compradora de teste, diferente da conta vendedora de teste.'
    : 'O Mercado Pago não conseguiu abrir a assinatura. Confira a conta usada no checkout e tente novamente.'
  return error
}

export async function mercadoPagoApiRequest(path, { method = 'GET', body, signal } = {}) {
  const accessToken = safeText(process.env.MERCADO_PAGO_ACCESS_TOKEN)
  if (!accessToken) {
    const error = new Error('missing_mercado_pago_access_token')
    error.status = 503
    throw error
  }
  const response = await globalThis.fetch(`https://api.mercadopago.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(9_000)]) : AbortSignal.timeout(9_000),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const fallback = `mercado_pago_${response.status}`
    const error = path === '/preapproval' && method === 'POST'
      ? mercadoPagoRecurringCheckoutError(data, response.status, fallback)
      : mercadoPagoError(data, response.status, fallback)
    error.providerHttpStatus = response.status
    throw error
  }
  return data
}

async function findRecurringPreapprovalByReference(externalReference) {
  const data = await mercadoPagoApiRequest(`/preapproval/search?q=${encodeURIComponent(externalReference)}`)
  return Array.isArray(data?.results)
    ? data.results.find((item) => safeText(item?.external_reference) === externalReference) || null
    : null
}

function assertCurrentRecurringCheckoutPrice(attempt, product) {
  if (recurringCheckoutAmountInCents(attempt, product.id) === product.amountInCents) return
  const error = new Error('subscription_checkout_previous_price')
  error.status = 409
  error.userMessage = 'Existe uma autorização com o valor anterior. Para contratar pelo valor atual, cancele a autorização anterior na tela Assinatura.'
  throw error
}

async function loadReusableRecurringCheckout({ database, lock, product, userId }) {
  const preapprovalId = safeText(lock?.preapprovalId)
  if (!preapprovalId) throw pendingRecurringCheckoutError()
  const attemptSnapshot = await database.ref(`commercialCheckoutAttempts/${safeText(lock?.attemptId)}`).get()
  const attempt = attemptSnapshot.val()
  if (!attempt || attempt.productId !== product.id || attempt.userId !== userId) {
    throw pendingRecurringCheckoutError()
  }
  const subscription = await mercadoPagoApiRequest(`/preapproval/${encodeURIComponent(preapprovalId)}`)
  const validation = validateRecurringPreapproval({ subscription, attempt, product })
  if (!validation.valid) throw pendingRecurringCheckoutError()
  if (isTerminalRecurringCancellation(subscription?.status)) return null
  assertCurrentRecurringCheckoutPrice(attempt, product)
  const checkoutUrl = safeText(subscription?.init_point || subscription?.sandbox_init_point || lock?.checkoutUrl)
  if (!checkoutUrl || safeText(subscription?.status) !== 'pending') throw pendingRecurringCheckoutError()
  return {
    attempt,
    checkout: {
      checkoutAvailable: true,
      checkoutUrl,
      initPoint: checkoutUrl,
      preapprovalId,
      providerStatus: safeText(subscription?.status),
      reused: true,
    },
  }
}

function pendingRecurringCheckoutError() {
  const error = new Error('subscription_checkout_pending_confirmation')
  error.status = 409
  error.userMessage = 'Já existe uma tentativa de assinatura. Confira seu estado em Assinatura antes de tentar novamente.'
  return error
}

async function acquireRecurringCheckoutLease({ database, userId, kind, product }) {
  const lockRef = database.ref(`subscriptionCheckoutLocks/${userId}/${kind}`)
  const existingSnapshot = await lockRef.get()
  const existing = existingSnapshot.val() || {}
  if (safeText(existing.status) === 'ready' && safeText(existing.productId) === product.id) {
    const reusable = await loadReusableRecurringCheckout({ database, lock: existing, product, userId })
    if (reusable) return { reused: reusable }
  }

  const now = Date.now()
  const processingToken = crypto.randomUUID()
  const transaction = await lockRef.transaction((current) => {
    const lock = current && typeof current === 'object' ? current : {}
    const status = safeText(lock.status).toLowerCase()
    const updatedAt = asTimestamp(lock.updatedAt || lock.createdAt)
    if (status === 'processing' && updatedAt > now - SUBSCRIPTION_CHECKOUT_LEASE_MS) return undefined
    return cleanFirebasePayload({
      ...lock,
      status: 'processing',
      processingToken,
      productId: product.id,
      createdAt: Number(lock.createdAt || 0) || now,
      updatedAt: now,
    })
  })
  if (!transaction.committed || transaction.snapshot.val()?.processingToken !== processingToken) {
    const error = new Error('subscription_checkout_in_progress')
    error.status = 409
    throw error
  }
  return { lockRef, lock: transaction.snapshot.val(), processingToken }
}

function subscriptionCheckoutFirstChargeAt({ currentPlan = {}, kind, now }) {
  const currentExpiresAt = asTimestamp(currentPlan.expiresAt)
  const trialEndsAt = asTimestamp(currentPlan.trialEndsAt)
  return Math.max(
    now,
    currentExpiresAt > now ? currentExpiresAt : 0,
    kind === 'professional' && trialEndsAt > now ? trialEndsAt : 0,
  )
}

function hasUnexpiredProfessionalTrial(plan, kind, now) {
  return kind === 'professional' && asTimestamp(plan.trialStartedAt) > 0 && asTimestamp(plan.trialEndsAt) > now
}

async function createLockedRecurringAttempt({ database, lockRef, userId, product }) {
  const attempt = await createCommercialCheckoutAttempt({
    database,
    userId,
    product,
    targetId: userId,
    targetType: 'recurring_subscription',
  })
  await database.ref(`commercialCheckoutAttempts/${attempt.id}`).update({ providerSubmissionState: 'unsubmitted' })
  await lockRef.update({ attemptId: attempt.id, preapprovalId: null, checkoutUrl: null, updatedAt: Date.now() })
  return { ...attempt, providerSubmissionState: 'unsubmitted' }
}

async function persistPendingRecurringSubscription({
  database,
  userId,
  kind,
  product,
  attempt,
  subscription,
  firstChargeAt,
}) {
  const now = Date.now()
  const subscriptionRef = database.ref(`users/${userId}/subscriptions/${kind}`)
  await subscriptionRef.transaction((current) => {
    const plan = current && typeof current === 'object' ? current : {}
    const currentExpiresAt = asTimestamp(plan.expiresAt)
    const keepPaidAccess = ['active', 'canceled'].includes(safeText(plan.status).toLowerCase()) && currentExpiresAt > now
    let status = subscription.status === 'authorized' ? 'pending_payment' : 'pending_authorization'
    if (hasUnexpiredProfessionalTrial(plan, kind, now)) status = 'trial'
    if (keepPaidAccess) status = 'active'
    return cleanFirebasePayload({
      ...plan,
      status,
      plan: keepPaidAccess ? (safeText(plan.plan) || 'annual') : 'quarterly',
      pendingPlan: 'quarterly',
      recurringProductId: product.id,
      preapprovalId: safeText(subscription.id),
      providerStatus: safeText(subscription.status || 'pending').toLowerCase(),
      providerLastModifiedAt: asTimestamp(subscription.last_modified || subscription.date_created) || now,
      autoRenew: safeText(subscription.status).toLowerCase() === 'authorized',
      renewalStatus: providerRenewalStatus(subscription.status),
      nextPaymentDate: asTimestamp(subscription.next_payment_date) || firstChargeAt || null,
      firstChargeAt: firstChargeAt || null,
      checkoutAttemptId: attempt.id,
      updatedAt: now,
      source: RECURRING_PROVIDER,
    })
  })
}

export async function createMercadoPagoRecurringCheckout({
  database,
  userId,
  product,
  authenticatedEmail,
}) {
  const readiness = getMercadoPagoCheckoutReadiness()
  if (!readiness.ready) throw checkoutConfigurationError(readiness)
  if (!isRecurringSubscriptionProduct(product?.id) || product?.billingMode !== 'quarterly_recurring') {
    const error = new Error('invalid_recurring_product')
    error.status = 400
    throw error
  }
  const payerEmail = resolveMercadoPagoRecurringBuyer(process.env, readiness, authenticatedEmail)
  if (!isValidPayerEmail(payerEmail)) {
    const sandbox = readiness.environment === 'staging'
    const error = new Error(sandbox ? 'mercado_pago_staging_buyer_unavailable' : 'verified_email_required')
    error.status = sandbox ? 503 : 409
    error.userMessage = sandbox
      ? 'A conta compradora de teste ainda não está configurada neste Preview. Avise a equipe do Corre Aqui.'
      : 'Sua conta precisa ter um e-mail verificado para autorizar a assinatura.'
    throw error
  }
  const kind = subscriptionKindForProduct(product.id)
  if (kind === 'professional') await ensureProfessionalTrial(database, userId)
  const currentSnapshot = await database.ref(`users/${userId}/subscriptions/${kind}`).get()
  let currentPlan = currentSnapshot.val() || {}
  if (
    currentPlan.autoRenew === true
    && safeText(currentPlan.preapprovalId)
    && !isCanceledProviderStatus(currentPlan.providerStatus)
  ) {
    const error = new Error('subscription_already_active')
    error.status = 409
    throw error
  }

  const lease = await acquireRecurringCheckoutLease({ database, userId, kind, product })
  if (lease.reused) return lease.reused
  const { lockRef, lock, processingToken } = lease
  let attempt = null
  try {
    const latestPlanSnapshot = await database.ref(`users/${userId}/subscriptions/${kind}`).get()
    currentPlan = latestPlanSnapshot.val() || {}
    if (
      currentPlan.autoRenew === true
      && safeText(currentPlan.preapprovalId)
      && !isCanceledProviderStatus(currentPlan.providerStatus)
    ) {
      const error = new Error('subscription_already_active')
      error.status = 409
      throw error
    }
    const existingAttemptId = safeText(lock?.attemptId)
    if (existingAttemptId) {
      const existingAttemptSnapshot = await database.ref(`commercialCheckoutAttempts/${existingAttemptId}`).get()
      attempt = existingAttemptSnapshot.val()
    }
    if (!attempt || attempt.productId !== product.id || attempt.userId !== userId) {
      attempt = await createLockedRecurringAttempt({ database, lockRef, userId, product })
    }

    const now = Date.now()
    const firstChargeAt = subscriptionCheckoutFirstChargeAt({ currentPlan, kind, now })
    let subscription = safeText(attempt.preapprovalId)
      ? await mercadoPagoApiRequest(`/preapproval/${encodeURIComponent(attempt.preapprovalId)}`)
      : await findRecurringPreapprovalByReference(attempt.externalReference)

    if (!subscription || isTerminalRecurringCancellation(subscription.status)) {
      if (subscription || recurringCheckoutAmountInCents(attempt, product.id) !== product.amountInCents) {
        if (attempt.providerSubmissionState !== 'unsubmitted' && !subscription) throw pendingRecurringCheckoutError()
        attempt = await createLockedRecurringAttempt({ database, lockRef, userId, product })
      }
      const payload = buildRecurringPreapprovalPayload({
        product,
        attempt,
        payerEmail,
        siteOrigin: readiness.siteOrigin,
        firstChargeAt,
        now,
      })
      if (attempt.providerSubmissionState !== 'unsubmitted') throw pendingRecurringCheckoutError()
      const attemptRef = database.ref(`commercialCheckoutAttempts/${attempt.id}`)
      // The search can lag a successful POST. Mark the attempt before sending
      // it so a timeout or lost response cannot create a second subscription.
      await attemptRef.update({ providerSubmissionState: 'submitted', providerSubmissionAt: Date.now(), firstChargeAt })
      try {
        subscription = await mercadoPagoApiRequest('/preapproval', { method: 'POST', body: payload })
      } catch (error) {
        if ([400, 401, 403, 422].includes(error?.providerHttpStatus)) {
          await attemptRef.update({ providerSubmissionState: 'unsubmitted', providerSubmissionAt: null })
        }
        throw error
      }
    }

    const validation = validateRecurringPreapproval({ subscription, attempt, product })
    if (!validation.valid) {
      const error = new Error(`invalid_recurring_preapproval:${validation.errors.join(',')}`)
      error.status = 502
      throw error
    }
    if (!safeText(subscription.collector_id) || !safeText(subscription.application_id)) {
      throw pendingRecurringCheckoutError()
    }
    assertCurrentRecurringCheckoutPrice(attempt, product)
    const checkoutUrl = safeText(subscription.init_point || subscription.sandbox_init_point)
    if (!checkoutUrl && subscription.status === 'pending') {
      const error = new Error('mercado_pago_checkout_url_missing')
      error.status = 502
      throw error
    }

    const preapprovalId = safeText(subscription.id)
    const providerData = cleanFirebasePayload({
      preapprovalId,
      collectorId: safeText(subscription.collector_id),
      applicationId: safeText(subscription.application_id),
      payerId: safeText(subscription.payer_id),
      providerStatus: safeText(subscription.status),
      checkoutUrl,
      firstChargeAt,
      updatedAt: Date.now(),
    })
    await database.ref(`commercialCheckoutAttempts/${attempt.id}`).update(providerData)
    await database.ref(`commercialCheckoutAttemptsBySubscription/${referenceKey(preapprovalId)}`).set(attempt.id)
    await persistPendingRecurringSubscription({
      database,
      userId,
      kind,
      product,
      attempt,
      subscription,
      firstChargeAt,
    })
    await lockRef.update({
      ...providerData,
      status: 'ready',
      processingToken: null,
    })
    await writeCommercialAudit(database, {
      eventId: `recurring_checkout_ready_${attempt.id}`,
      type: 'recurring_checkout_ready',
      userId,
      productId: product.id,
      paymentReference: attempt.externalReference,
      statusAfter: safeText(subscription.status),
    })

    return {
      attempt,
      checkout: {
        checkoutAvailable: true,
        checkoutUrl: subscription.status === 'pending' ? checkoutUrl : '',
        initPoint: subscription.status === 'pending' ? checkoutUrl : '',
        preapprovalId,
        providerStatus: safeText(subscription.status),
        firstChargeAt,
        reused: false,
      },
    }
  } catch (error) {
    await lockRef.update({
      status: 'failed',
      processingToken,
      errorCode: (error?.code || error?.message) === 'subscription_already_active'
        ? 'subscription_already_active'
        : 'recurring_checkout_failed',
      updatedAt: Date.now(),
    }).catch(() => {})
    throw error
  }
}

async function createMercadoPagoPreference({
  product,
  attempt,
  payerEmail = '',
}) {
  const readiness = getMercadoPagoCheckoutReadiness()
  if (!readiness.ready) throw checkoutConfigurationError(readiness)

  const siteUrl = readiness.siteOrigin
  const response = await globalThis.fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${safeText(process.env.MERCADO_PAGO_ACCESS_TOKEN)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{
        id: product.id,
        title: product.name,
        quantity: 1,
        currency_id: product.currency,
        unit_price: product.amountInCents / 100,
      }],
      payer: payerEmail ? { email: payerEmail } : undefined,
      external_reference: attempt.externalReference,
      notification_url: `${siteUrl}/api/mercado-pago/webhook`,
      back_urls: {
        success: `${siteUrl}/?checkout=success`,
        pending: `${siteUrl}/?checkout=pending`,
        failure: `${siteUrl}/?checkout=failure`,
      },
      auto_return: 'approved',
      metadata: {
        attempt_id: attempt.id,
        product_id: product.id,
        target_id: attempt.targetId || '',
      },
    }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.message || `mercado_pago_${response.status}`)
    error.status = 502
    throw error
  }

  const checkoutUrl = readiness.environment === 'staging'
    ? safeText(data?.sandbox_init_point)
    : safeText(data?.init_point)
  if (!checkoutUrl) {
    const error = new Error('mercado_pago_checkout_url_missing')
    error.code = 'mercado_pago_checkout_url_missing'
    error.status = 502
    throw error
  }

  return {
    checkoutAvailable: true,
    checkoutUrl,
    initPoint: checkoutUrl,
    preferenceId: data?.id || '',
  }
}

export async function createMercadoPagoCheckout({
  database,
  userId,
  product,
  targetId = '',
  targetType = '',
  targetSummary = {},
  payerEmail = '',
}) {
  const readiness = getMercadoPagoCheckoutReadiness()
  if (!readiness.ready) throw checkoutConfigurationError(readiness)

  const attempt = await createCommercialCheckoutAttempt({
    database,
    userId,
    product,
    targetId,
    targetType,
    targetSummary,
  })
  const checkout = await createMercadoPagoPreference({
    product,
    attempt,
    payerEmail,
  })

  await database.ref(`commercialCheckoutAttempts/${attempt.id}`).update({
    preferenceId: checkout.preferenceId || null,
    checkoutUrl: checkout.checkoutUrl,
    updatedAt: Date.now(),
  })

  return { attempt, checkout }
}

export function verifyMercadoPagoSignature({ rawBody, dataId, headers }) {
  const verification = verifyMercadoPagoHmacSignature({
    secret: process.env.MERCADO_PAGO_WEBHOOK_SECRET,
    dataId,
    headers,
  })
  if (!verification.ok) return verification

  return {
    ...verification,
    rawBodyLength: rawBody.length,
  }
}

async function activateProfessionalEntitlement({ database, attempt, payment }) {
  const product = getCommercialProduct(PROFESSIONAL_FEATURED_PLAN_ID)
  const now = Date.now()
  const profile = await loadPublicProfile(database, attempt.userId)
  const eligibility = isProfileEligibleForFeaturedPlan(profile)
  if (!eligibility.ok) {
    await writeCommercialAudit(database, {
      eventId: `professional_entitlement_blocked_${attempt.id}`,
      type: 'professional_entitlement_blocked',
      userId: attempt.userId,
      productId: product.id,
      paymentReference: attempt.externalReference,
      statusAfter: eligibility.reason,
    })
    return { activated: false, reason: eligibility.reason }
  }

  const currentSnapshot = await database.ref(`featuredProfessionalEntitlements/${attempt.userId}`).get()
  const current = currentSnapshot.val() || {}
  const currentExpiresAt = asTimestamp(current.expiresAt)
  const baseStart = current.active === true && safeText(current.status).toLowerCase() === 'active' && currentExpiresAt > now
    ? currentExpiresAt
    : now
  const expiresAt = baseStart + product.durationDays * 24 * 60 * 60 * 1000
  const regions = getProfileRegionKeys(profile)

  await database.ref(`featuredProfessionalEntitlements/${attempt.userId}`).set(cleanFirebasePayload({
    active: true,
    status: 'active',
    planId: product.id,
    profileReleased: true,
    accountSuspended: false,
    startsAt: now,
    expiresAt,
    regions,
    radiusKm: current.radiusKm || null,
    lastShownAt: current.lastShownAt || null,
    createdAt: current.createdAt || now,
    updatedAt: now,
    source: COMMERCIAL_SOURCE,
    paymentReference: attempt.externalReference,
    paymentId: safeText(payment?.id),
  }))

  await writeCommercialAudit(database, {
    eventId: `${currentExpiresAt > now ? 'professional_entitlement_renewed' : 'professional_entitlement_activated'}_${attempt.id}`,
    type: currentExpiresAt > now ? 'professional_entitlement_renewed' : 'professional_entitlement_activated',
    userId: attempt.userId,
    productId: product.id,
    paymentReference: attempt.externalReference,
    statusBefore: current.status || null,
    statusAfter: 'active',
  })

  return { activated: true, expiresAt }
}

async function activateRequestBoost({ database, attempt, payment }) {
  const product = getCommercialProduct(REQUEST_BOOST_PRODUCT_ID)
  const now = Date.now()
  const pedidoId = safeText(attempt.targetId)
  const pedidoSnapshot = await database.ref(`pedidos/${pedidoId}`).get()
  const pedido = pedidoSnapshot.val()
  const currentEntitlementSnapshot = await database.ref(`featuredRequestEntitlements/${pedidoId}`).get()
  const currentEntitlement = currentEntitlementSnapshot.val() || null
  const eligibility = isPedidoEligibleForBoost({
    pedido,
    uid: attempt.userId,
    entitlement: currentEntitlement,
    now,
  })

  if (!eligibility.ok) {
    await writeCommercialAudit(database, {
      eventId: `request_boost_blocked_${attempt.id}`,
      type: 'request_boost_blocked',
      userId: attempt.userId,
      pedidoId,
      productId: product.id,
      paymentReference: attempt.externalReference,
      statusAfter: eligibility.reason,
    })
    return { activated: false, reason: eligibility.reason }
  }

  const expiresAt = now + product.durationHours * 60 * 60 * 1000
  await database.ref(`featuredRequestEntitlements/${pedidoId}`).set(cleanFirebasePayload({
    active: true,
    status: 'active',
    productId: product.id,
    pedidoId,
    ownerUid: attempt.userId,
    startsAt: now,
    expiresAt,
    endsWhenAccepted: true,
    createdAt: now,
    updatedAt: now,
    source: COMMERCIAL_SOURCE,
    paymentReference: attempt.externalReference,
    paymentId: safeText(payment?.id),
    regionKeys: getPedidoRegionKeys(pedido),
    categoryId: getPedidoCategoryId(pedido),
    lastShownAt: null,
  }))

  await writeCommercialAudit(database, {
    eventId: `request_boost_activated_${attempt.id}`,
    type: 'request_boost_activated',
    userId: attempt.userId,
    pedidoId,
    productId: product.id,
    paymentReference: attempt.externalReference,
    statusBefore: currentEntitlement?.status || null,
    statusAfter: 'active',
  })

  return { activated: true, expiresAt }
}

async function activateAnnualSubscription({ database, attempt, payment }) {
  const kind = attempt.productId === CLIENT_ANNUAL_PRODUCT_ID ? 'client' : 'professional'
  const subscriptionRef = database.ref(`users/${attempt.userId}/subscriptions/${kind}`)
  const now = Date.now()
  const paymentId = safeText(payment?.id)
  let duplicatePayment = false
  let expiresAt = addCalendarMonths(now, ANNUAL_PLAN_MONTHS)
  const result = await subscriptionRef.transaction((current) => {
    const plan = current && typeof current === 'object' ? current : {}
    const currentExpiresAt = asTimestamp(plan.expiresAt)
    if (paymentId && safeText(plan.paymentId) === paymentId) {
      duplicatePayment = true
      expiresAt = currentExpiresAt || expiresAt
      return plan
    }
    const base = String(plan.status || '').toLowerCase() === 'active' && currentExpiresAt > now
      ? currentExpiresAt
      : now
    expiresAt = addCalendarMonths(base, ANNUAL_PLAN_MONTHS)
    return cleanFirebasePayload({
      ...plan,
      status: 'active',
      plan: 'annual',
      startedAt: now,
      expiresAt,
      updatedAt: now,
      source: COMMERCIAL_SOURCE,
      paymentReference: attempt.externalReference,
      paymentId,
    })
  })

  if (!result.committed) return { activated: false, reason: 'subscription_transaction_failed' }
  await writeCommercialAudit(database, {
    eventId: `${duplicatePayment ? 'annual_subscription_duplicate_ignored' : 'annual_subscription_activated'}_${attempt.id}`,
    type: duplicatePayment ? 'annual_subscription_duplicate_ignored' : 'annual_subscription_activated',
    userId: attempt.userId,
    productId: attempt.productId,
    paymentReference: attempt.externalReference,
    statusAfter: 'active',
  })
  return { activated: true, expiresAt, subscriptionKind: kind, duplicate: duplicatePayment }
}

async function writeSubscriptionPaymentHistory({ database, attempt, payment }) {
  if (!isRecurringSubscriptionProduct(attempt.productId)) return
  const kind = subscriptionKindForProduct(attempt.productId)
  const paymentId = safeText(payment?.id)
  if (!kind || !paymentId) return
  const historyRef = database.ref(`subscriptionPaymentHistory/${attempt.userId}/${kind}/${referenceKey(paymentId)}`)
  const status = safeText(payment?.status).toLowerCase()
  const now = Date.now()
  await historyRef.transaction((current) => {
    const existing = current && typeof current === 'object' ? current : {}
    if (['refunded', 'charged_back'].includes(safeText(existing.status)) && !['refunded', 'charged_back'].includes(status)) {
      return existing
    }
    if (safeText(existing.status).toLowerCase() === 'approved' && !['refunded', 'charged_back'].includes(status)) {
      return existing
    }
    return cleanFirebasePayload({
      ...existing,
      id: paymentId,
      status,
      amountInCents: Math.round(Number(payment?.transaction_amount || 0) * 100),
      currency: safeText(payment?.currency_id || payment?.currency),
      paidAt: asTimestamp(payment?.date_approved) || existing.paidAt || null,
      createdAt: asTimestamp(payment?.date_created) || existing.createdAt || now,
      updatedAt: asTimestamp(payment?.date_last_updated) || now,
      productId: attempt.productId,
      attemptId: attempt.id,
      preapprovalId: safeText(attempt.preapprovalId),
    })
  })
}

async function activateQuarterlySubscription({ database, attempt, payment }) {
  const kind = subscriptionKindForProduct(attempt.productId)
  if (!kind) return { activated: false, reason: 'invalid_subscription_kind' }
  const subscriptionRef = database.ref(`users/${attempt.userId}/subscriptions/${kind}`)
  const now = Date.now()
  const paymentId = safeText(payment?.id)
  const paymentKey = referenceKey(paymentId)
  const paidAt = asTimestamp(payment?.date_approved || payment?.date_created) || now
  const paymentEventAt = asTimestamp(payment?.date_last_updated || payment?.date_approved || payment?.date_created) || now
  let duplicatePayment = false
  let obsoletePayment = false
  let earlierPaidPeriod = false
  let expiresAt = nextQuarterlyExpiration(now)
  const result = await subscriptionRef.transaction((current) => {
    const plan = current && typeof current === 'object' ? current : {}
    const processedPayments = plan.processedPayments && typeof plan.processedPayments === 'object'
      ? plan.processedPayments
      : {}
    obsoletePayment = (Boolean(plan.preapprovalId) && safeText(plan.preapprovalId) !== safeText(attempt.preapprovalId))
      || ['refunded', 'charged_back'].includes(processedPayments[paymentKey]?.status)
    duplicatePayment = false
    earlierPaidPeriod = false
    if (obsoletePayment) return undefined
    const currentExpiresAt = asTimestamp(plan.expiresAt)
    if (processedPayments[paymentKey]?.paymentId === paymentId || safeText(plan.paymentId) === paymentId) {
      duplicatePayment = true
      expiresAt = currentExpiresAt || expiresAt
      return plan
    }
    const nextProcessedPayments = {
      ...processedPayments,
      [paymentKey]: { paymentId, approvedAt: paidAt },
    }
    // A late earlier installment belongs to its original quarter. It cannot
    // extend the already-applied newer period or replace its payment reference.
    earlierPaidPeriod = paidAt < asTimestamp(plan.lastPaymentAt)
    if (earlierPaidPeriod) {
      expiresAt = currentExpiresAt || null
      return { ...plan, processedPayments: nextProcessedPayments }
    }
    const base = Math.max(currentExpiresAt, paidAt)
    expiresAt = nextQuarterlyExpiration(base)
    return cleanFirebasePayload({
      ...plan,
      status: 'active',
      plan: 'quarterly',
      pendingPlan: null,
      recurringProductId: attempt.productId,
      preapprovalId: safeText(attempt.preapprovalId || plan.preapprovalId),
      startedAt: asTimestamp(plan.startedAt) || paidAt,
      expiresAt,
      autoRenew: safeText(plan.providerStatus) === 'authorized',
      renewalStatus: providerRenewalStatus(plan.providerStatus),
      lastPaymentStatus: 'approved',
      lastPaymentAt: paidAt,
      lastPaymentEventAt: paymentEventAt,
      updatedAt: now,
      source: RECURRING_PROVIDER,
      paymentReference: attempt.externalReference,
      paymentId,
      processedPayments: nextProcessedPayments,
    })
  })

  if (!result.committed) {
    if (!obsoletePayment) throw new Error('subscription_transaction_failed')
    await writeSubscriptionPaymentHistory({ database, attempt, payment })
    return { activated: false, reason: 'obsolete_subscription_payment' }
  }
  await writeSubscriptionPaymentHistory({ database, attempt, payment })
  if (earlierPaidPeriod) return { activated: false, reason: 'earlier_paid_period_recorded', subscriptionKind: kind }
  await writeCommercialAudit(database, {
    eventId: `${duplicatePayment ? 'quarterly_subscription_duplicate_ignored' : 'quarterly_subscription_activated'}_${attempt.id}_${referenceKey(paymentId)}`,
    type: duplicatePayment ? 'quarterly_subscription_duplicate_ignored' : 'quarterly_subscription_activated',
    userId: attempt.userId,
    productId: attempt.productId,
    paymentReference: attempt.externalReference,
    statusAfter: 'active',
  })
  if (!duplicatePayment) {
    await notifySubscriptionEventSafely({
      database,
      uid: attempt.userId,
      kind,
      type: 'payment_approved',
      reference: paymentId,
      occurredAt: asTimestamp(payment?.date_approved) || now,
      accessUntil: expiresAt,
      nextPaymentDate: asTimestamp(result.snapshot.val()?.nextPaymentDate),
    })
  }
  return { activated: true, expiresAt, subscriptionKind: kind, duplicate: duplicatePayment }
}

async function endCommercialEntitlement({ database, attempt, payment, status }) {
  const now = Date.now()
  const paymentId = safeText(payment?.id)
  const statusAfter = status === 'charged_back' ? 'chargeback' : 'refunded'
  const auditType = status === 'charged_back' ? 'chargeback_received' : 'refund_received'
  const product = getCommercialProduct(attempt.productId)

  if (subscriptionKindForProduct(attempt.productId)) {
    const kind = subscriptionKindForProduct(attempt.productId)
    const subscriptionRef = database.ref(`users/${attempt.userId}/subscriptions/${kind}`)
    const recurring = isRecurringSubscriptionProduct(attempt.productId)
    let current = {}
    let ownsCurrentSubscription = false
    await subscriptionRef.transaction((value) => {
      current = value || {}
      ownsCurrentSubscription = recurring
        ? safeText(current.paymentId) === paymentId
        : safeText(current.paymentReference) === attempt.externalReference || safeText(current.paymentId) === paymentId
      const next = { ...current }
      if (recurring) {
        const key = referenceKey(paymentId)
        const processed = current.processedPayments || {}
        next.processedPayments = { ...processed, [key]: { ...processed[key], paymentId, status } }
      }
      if (!ownsCurrentSubscription) return recurring ? next : undefined
      return {
        ...next,
        status: hasUnexpiredProfessionalTrial(next, kind, now) ? 'trial' : statusAfter,
        expiresAt: now,
        autoRenew: false,
        renewalStatus: statusAfter,
        lastPaymentStatus: status,
        endedAt: now,
        endedReason: statusAfter,
        updatedAt: now,
      }
    })
    await writeCommercialAudit(database, {
      eventId: `${auditType}_${attempt.id}_${referenceKey(paymentId)}`,
      type: auditType,
      userId: attempt.userId,
      productId: product?.id || attempt.productId,
      paymentReference: attempt.externalReference,
      statusBefore: current.status || null,
      statusAfter: ownsCurrentSubscription ? 'expired' : current.status || statusAfter,
    })
    await writeSubscriptionPaymentHistory({ database, attempt, payment })
    if (ownsCurrentSubscription) {
      await notifySubscriptionEventSafely({
        database,
        uid: attempt.userId,
        kind,
        type: 'subscription_expired',
        reference: `${paymentId}:${statusAfter}`,
        occurredAt: now,
      })
    }
    return { activated: false, ended: ownsCurrentSubscription, reason: statusAfter }
  }

  if (attempt.productId === PROFESSIONAL_FEATURED_PLAN_ID) {
    const entitlementRef = database.ref(`featuredProfessionalEntitlements/${attempt.userId}`)
    const snapshot = await entitlementRef.get()
    const current = snapshot.val() || {}
    const ownsCurrentEntitlement =
      safeText(current.paymentReference) === attempt.externalReference ||
      safeText(current.paymentId) === paymentId

    if (ownsCurrentEntitlement) {
      await entitlementRef.update(cleanFirebasePayload({
        active: false,
        status: statusAfter,
        endedAt: now,
        endedReason: statusAfter,
        updatedAt: now,
      }))
    }

    await writeCommercialAudit(database, {
      eventId: `${auditType}_${attempt.id}`,
      type: auditType,
      userId: attempt.userId,
      productId: product?.id || attempt.productId,
      paymentReference: attempt.externalReference,
      statusBefore: current.status || null,
      statusAfter,
    })

    return { activated: false, ended: ownsCurrentEntitlement, reason: statusAfter }
  }

  if (attempt.productId === REQUEST_BOOST_PRODUCT_ID) {
    const pedidoId = safeText(attempt.targetId)
    const entitlementRef = database.ref(`featuredRequestEntitlements/${pedidoId}`)
    const snapshot = await entitlementRef.get()
    const current = snapshot.val() || {}
    const ownsCurrentEntitlement =
      safeText(current.paymentReference) === attempt.externalReference ||
      safeText(current.paymentId) === paymentId

    if (ownsCurrentEntitlement) {
      await entitlementRef.update(cleanFirebasePayload({
        active: false,
        status: statusAfter,
        endedAt: now,
        endedReason: statusAfter,
        updatedAt: now,
      }))
    }

    await writeCommercialAudit(database, {
      eventId: `${auditType}_${attempt.id}`,
      type: auditType,
      userId: attempt.userId,
      pedidoId,
      productId: product?.id || attempt.productId,
      paymentReference: attempt.externalReference,
      statusBefore: current.status || null,
      statusAfter,
    })

    return { activated: false, ended: ownsCurrentEntitlement, reason: statusAfter }
  }

  return { activated: false, ended: false, reason: 'unsupported_product' }
}

export async function processApprovedCommercialPayment({ database, payment, recurringInvoicePreapprovalId = '' }) {
  const paymentId = safeText(payment?.id)
  let externalReference = safeText(payment?.external_reference)
  if (!externalReference && recurringInvoicePreapprovalId) {
    const index = await database.ref(`commercialCheckoutAttemptsBySubscription/${referenceKey(recurringInvoicePreapprovalId)}`).get()
    if (safeText(index.val())) {
      const record = await database.ref(`commercialCheckoutAttempts/${index.val()}`).get()
      externalReference = safeText(record.val()?.externalReference)
    }
  }
  const status = safeText(payment?.status).toLowerCase()
  if (!paymentId || !externalReference) {
    return { ok: false, reason: 'missing_payment_reference' }
  }

  const parsed = parseExternalReference(externalReference)
  if (!parsed) return { ok: false, reason: 'invalid_external_reference' }

  const lockRef = database.ref(`processedPaymentEvents/${referenceKey(`${paymentId}:${status || 'unknown'}`)}`)
  const processingToken = crypto.randomUUID()
  const lockNow = Date.now()
  const transaction = await lockRef.transaction((current) => {
    if (current && typeof current === 'object') {
      const lockStatus = safeText(current.status).toLowerCase()
      const lockUpdatedAt = asTimestamp(current.updatedAt || current.createdAt)
      const retryable = lockStatus === 'failed'
        || (lockStatus === 'processing' && lockUpdatedAt <= lockNow - PAYMENT_EVENT_LEASE_MS)
      if (!retryable) return undefined
    }
    return {
      ...(current && typeof current === 'object' ? current : {}),
      paymentId,
      externalReference,
      paymentStatus: status || null,
      status: 'processing',
      processingToken,
      retryCount: Number(current?.retryCount || 0) + (current ? 1 : 0),
      createdAt: Number(current?.createdAt || 0) || lockNow,
      updatedAt: lockNow,
    }
  })
  if (!transaction.committed || transaction.snapshot.val()?.processingToken !== processingToken) {
    if (transaction.snapshot.val()?.status === 'processing') {
      return { ok: false, duplicate: true, retryable: true, reason: 'payment_processing_in_progress' }
    }
    await writeCommercialAudit(database, {
      eventId: `webhook_ignored_duplicate_${referenceKey(`${paymentId}:${status || 'unknown'}`)}`,
      type: 'webhook_ignored_duplicate',
      paymentReference: externalReference,
      statusAfter: status || null,
    })
    return { ok: true, duplicate: true, reason: 'webhook_ignored_duplicate' }
  }

  try {
    const attemptSnapshot = await database.ref(`commercialCheckoutAttempts/${parsed.attemptId}`).get()
    const attempt = attemptSnapshot.val()
    if (!attempt || attempt.externalReference !== externalReference) {
      await lockRef.update({ status: 'ignored', reason: 'attempt_not_found', updatedAt: Date.now() })
      return { ok: false, reason: 'attempt_not_found' }
    }

    const attemptIdentityMatches =
      safeText(attempt.id) === parsed.attemptId
      && safeText(attempt.userId) === parsed.userId
      && safeText(attempt.productId) === parsed.productId
      && safeText(attempt.targetId || 'profile') === parsed.targetId
    if (!attemptIdentityMatches) {
      await lockRef.update({ status: 'ignored', reason: 'attempt_identity_mismatch', updatedAt: Date.now() })
      return { ok: false, reason: 'attempt_identity_mismatch' }
    }

  const product = getCommercialProduct(attempt.productId)
  const amountInCents = Math.round(Number(payment?.transaction_amount || 0) * 100)
  const currency = safeText(payment?.currency_id || payment?.currency)

  if (!product || product.currency !== COMMERCIAL_CURRENCY) {
    await lockRef.update({ status: 'ignored', reason: 'invalid_product', updatedAt: Date.now() })
    return { ok: false, reason: 'invalid_product' }
  }
  const recurring = isRecurringSubscriptionProduct(product.id)
  const invoiceMismatch = recurringInvoicePreapprovalId && (
    !recurring || safeText(attempt.preapprovalId) !== recurringInvoicePreapprovalId
  )
  const providerApplicationMismatch = recurring && safeText(payment?.application_id)
    && safeText(attempt.applicationId) && safeText(attempt.applicationId) !== safeText(payment.application_id)
  const providerPayerMismatch = recurring && safeText(payment?.payer?.id)
    && safeText(attempt.payerId) && safeText(attempt.payerId) !== safeText(payment.payer.id)
  if (invoiceMismatch || providerApplicationMismatch || providerPayerMismatch) {
    await lockRef.update({ status: 'failed', reason: 'payment_subscription_identity_mismatch', updatedAt: Date.now() })
    return { ok: false, reason: 'payment_subscription_identity_mismatch' }
  }
  const expectedAmountInCents = recurring ? recurringCheckoutAmountInCents(attempt, product.id) : product.amountInCents
  const validAmount = recurring
    ? expectedAmountInCents !== null && Number(payment?.transaction_amount) === expectedAmountInCents / 100
    : amountInCents === expectedAmountInCents
  if (!validAmount || currency !== product.currency) {
    await lockRef.update({ status: 'ignored', reason: 'invalid_amount_or_currency', updatedAt: Date.now() })
    return { ok: false, reason: 'invalid_amount_or_currency' }
  }
  if (
    recurring
    && safeText(attempt.collectorId)
    && safeText(payment?.collector_id) !== safeText(attempt.collectorId)
  ) {
    await lockRef.update({ status: 'ignored', reason: 'collector_mismatch', updatedAt: Date.now() })
    return { ok: false, reason: 'collector_mismatch' }
  }
  if (status === 'refunded' || status === 'charged_back') {
    const ending = await endCommercialEntitlement({ database, attempt, payment, status })
    if (!recurring || ending.ended) {
      await database.ref(`commercialCheckoutAttempts/${attempt.id}`).update(cleanFirebasePayload({
        status: `payment_${status}`,
        paymentId,
        updatedAt: Date.now(),
      }))
    }
    await lockRef.update(cleanFirebasePayload({
      status: 'processed',
      reason: ending.reason || null,
      ended: ending.ended === true,
      updatedAt: Date.now(),
    }))
    return { ok: true, ...ending }
  }
  if (status !== 'approved') {
    if (isRecurringSubscriptionProduct(product.id)) {
      await writeSubscriptionPaymentHistory({ database, attempt, payment })
      const kind = subscriptionKindForProduct(product.id)
      const subscriptionRef = database.ref(`users/${attempt.userId}/subscriptions/${kind}`)
      const paymentEventAt = asTimestamp(payment?.date_last_updated || payment?.date_created || payment?.date_approved) || Date.now()
      await subscriptionRef.transaction((current) => {
        const plan = current && typeof current === 'object' ? current : {}
        if (plan.preapprovalId && safeText(plan.preapprovalId) !== safeText(attempt.preapprovalId)) return undefined
        if (plan.processedPayments?.[referenceKey(paymentId)]?.status) return undefined
        if (safeText(plan.paymentId) === paymentId && safeText(plan.lastPaymentStatus) === 'approved') return plan
        const currentPaymentEventAt = asTimestamp(plan.lastPaymentEventAt || plan.lastPaymentAt)
        if (currentPaymentEventAt && paymentEventAt < currentPaymentEventAt) return plan
        return cleanFirebasePayload({
          ...plan,
          lastPaymentStatus: status || 'unknown',
          lastPaymentEventAt: paymentEventAt,
          renewalStatus: paymentRenewalStatus(status),
          updatedAt: Date.now(),
        })
      })
      if (paymentRenewalStatus(status) === 'payment_failed') {
        await notifySubscriptionEventSafely({
          database,
          uid: attempt.userId,
          kind,
          type: 'payment_failed',
          reference: paymentId,
          occurredAt: asTimestamp(payment?.date_last_updated || payment?.date_created) || Date.now(),
        })
      }
    }
    await database.ref(`commercialCheckoutAttempts/${attempt.id}`).update(cleanFirebasePayload({
      status: status ? `payment_${status}` : 'payment_not_approved',
      paymentId,
      updatedAt: Date.now(),
    }))
    await lockRef.update({ status: 'ignored', reason: 'payment_not_approved', paymentStatus: status, updatedAt: Date.now() })
    return { ok: true, activated: false, reason: 'payment_not_approved' }
  }

  const activation = isRecurringSubscriptionProduct(product.id)
    ? await activateQuarterlySubscription({ database, attempt, payment })
    : product.id === CLIENT_ANNUAL_PRODUCT_ID || product.id === PROFESSIONAL_ANNUAL_PRODUCT_ID
    ? await activateAnnualSubscription({ database, attempt, payment })
    : product.id === PROFESSIONAL_FEATURED_PLAN_ID
      ? await activateProfessionalEntitlement({ database, attempt, payment })
      : await activateRequestBoost({ database, attempt, payment })

  const paidHistoryOnly = recurring && ['earlier_paid_period_recorded', 'obsolete_subscription_payment'].includes(activation.reason)
  if (!paidHistoryOnly) {
    await database.ref(`commercialCheckoutAttempts/${attempt.id}`).update(cleanFirebasePayload({
      status: activation.activated ? 'entitlement_activated' : 'entitlement_blocked',
      paymentId,
      activationReason: activation.reason || null,
      updatedAt: Date.now(),
    }))
  }
  await lockRef.update(cleanFirebasePayload({
    status: activation.activated || paidHistoryOnly ? 'processed' : 'blocked',
    reason: activation.reason || null,
    updatedAt: Date.now(),
  }))

    return { ok: true, ...activation }
  } catch (error) {
    await lockRef.update({
      status: 'failed',
      reason: 'processing_error',
      errorCode: 'payment_processing_failed',
      updatedAt: Date.now(),
    }).catch(() => {})
    throw error
  }
}

export async function processRecurringPreapprovalUpdate({ database, subscription, force = false }) {
  const externalReference = safeText(subscription?.external_reference)
  const parsed = parseExternalReference(externalReference)
  if (!parsed) return { ok: false, reason: 'invalid_external_reference' }
  const attemptSnapshot = await database.ref(`commercialCheckoutAttempts/${parsed.attemptId}`).get()
  const attempt = attemptSnapshot.val()
  if (!attempt || attempt.externalReference !== externalReference) return { ok: false, reason: 'attempt_not_found' }
  if (
    safeText(attempt.id) !== parsed.attemptId
    || safeText(attempt.userId) !== parsed.userId
    || safeText(attempt.productId) !== parsed.productId
    || safeText(attempt.targetId || 'profile') !== parsed.targetId
  ) return { ok: false, reason: 'attempt_identity_mismatch' }
  const product = getCommercialProduct(attempt.productId)
  if (!product || !isRecurringSubscriptionProduct(product.id)) return { ok: false, reason: 'invalid_recurring_product' }
  const validation = validateRecurringPreapproval({ subscription, attempt, product })
  if (!validation.valid) return { ok: false, reason: validation.errors[0] || 'invalid_recurring_preapproval' }

  const kind = subscriptionKindForProduct(product.id)
  const now = Date.now()
  const providerStatus = safeText(subscription.status).toLowerCase()
  if (!['pending', 'authorized', 'paused', 'canceled', 'cancelled'].includes(providerStatus)) {
    return { ok: false, reason: 'invalid_provider_status' }
  }
  const subscriptionRef = database.ref(`users/${attempt.userId}/subscriptions/${kind}`)
  let ignoredOutOfOrder = false
  let duplicate = false
  const incomingModifiedAt = asTimestamp(subscription.last_modified || subscription.date_created)
  const result = await subscriptionRef.transaction((current) => {
    const plan = current && typeof current === 'object' ? current : {}
    const matchesCurrent = !plan.preapprovalId || safeText(plan.preapprovalId) === safeText(subscription.id)
    const forceConfirmedCancellation = force && isTerminalRecurringCancellation(providerStatus)
    ignoredOutOfOrder = !matchesCurrent || (!forceConfirmedCancellation && !shouldApplyProviderUpdate(plan, subscription))
    duplicate = false
    if (ignoredOutOfOrder) return undefined
    duplicate = !force && Boolean(plan.preapprovalId)
      && plan.providerStatus === providerStatus
      && incomingModifiedAt === asTimestamp(plan.providerLastModifiedAt)
    if (duplicate) return undefined
    const expiresAt = asTimestamp(plan.expiresAt)
    const hasPaidAccess = ['active', 'canceled'].includes(safeText(plan.status).toLowerCase()) && expiresAt > now
    let status = hasPaidAccess ? 'active' : 'pending_authorization'
    if (providerStatus === 'authorized' && !hasPaidAccess) status = 'pending_payment'
    if (isCanceledProviderStatus(providerStatus) && !hasPaidAccess) status = 'canceled'
    if (!hasPaidAccess && hasUnexpiredProfessionalTrial(plan, kind, now)) status = 'trial'
    return cleanFirebasePayload({
      ...plan,
      status,
      plan: hasPaidAccess ? (safeText(plan.plan) || 'quarterly') : 'quarterly',
      pendingPlan: hasPaidAccess ? plan.pendingPlan || null : 'quarterly',
      recurringProductId: product.id,
      preapprovalId: safeText(subscription.id),
      providerStatus,
      providerLastModifiedAt: Math.max(asTimestamp(plan.providerLastModifiedAt), incomingModifiedAt) || now,
      nextPaymentDate: isTerminalRecurringCancellation(providerStatus)
        ? null
        : asTimestamp(subscription.next_payment_date) || plan.nextPaymentDate || null,
      autoRenew: providerStatus === 'authorized',
      renewalStatus: plan.providerStatus === providerStatus && plan.renewalStatus
        ? plan.renewalStatus : providerRenewalStatus(providerStatus),
      canceledAt: isCanceledProviderStatus(providerStatus) ? (asTimestamp(subscription.last_modified) || now) : plan.canceledAt || null,
      updatedAt: now,
      source: RECURRING_PROVIDER,
    })
  })
  if (duplicate) return { ok: true, updated: false, duplicate: true, subscriptionKind: kind, providerStatus }
  if (!result.committed && !ignoredOutOfOrder) {
    return { ok: false, retryable: true, reason: 'subscription_transaction_unavailable' }
  }

  if (!ignoredOutOfOrder) {
    await database.ref(`commercialCheckoutAttempts/${attempt.id}`).update(cleanFirebasePayload({
      preapprovalId: safeText(subscription.id),
      providerStatus,
      collectorId: safeText(subscription.collector_id),
      applicationId: safeText(subscription.application_id),
      ...(safeText(subscription.payer_id) ? { payerId: safeText(subscription.payer_id) } : {}),
      updatedAt: now,
    }))
  }
  await writeCommercialAudit(database, {
    eventId: `subscription_status_${attempt.id}_${referenceKey(`${providerStatus}:${subscription.last_modified || ''}`)}`,
    type: ignoredOutOfOrder ? 'subscription_status_out_of_order_ignored' : 'subscription_status_updated',
    userId: attempt.userId,
    productId: product.id,
    paymentReference: externalReference,
    statusAfter: providerStatus,
  })
  return { ok: true, updated: !ignoredOutOfOrder, ignoredOutOfOrder, subscriptionKind: kind, providerStatus }
}

export async function cancelMercadoPagoRecurringSubscription({ database, userId, kind }) {
  if (!['client', 'professional'].includes(kind)) {
    const error = new Error('invalid_subscription_kind')
    error.status = 400
    throw error
  }
  const planSnapshot = await database.ref(`users/${userId}/subscriptions/${kind}`).get()
  const plan = planSnapshot.val() || {}
  const preapprovalId = safeText(plan.preapprovalId)
  const productId = safeText(plan.recurringProductId)
  if (!preapprovalId || !isRecurringSubscriptionProduct(productId) || subscriptionKindForProduct(productId) !== kind) {
    const error = new Error('recurring_subscription_not_found')
    error.status = 409
    throw error
  }
  const attemptId = safeText(plan.checkoutAttemptId)
    || safeText((await database.ref(`commercialCheckoutAttemptsBySubscription/${referenceKey(preapprovalId)}`).get()).val())
  const attemptSnapshot = await database.ref(`commercialCheckoutAttempts/${attemptId}`).get()
  const attempt = attemptSnapshot.val()
  const reference = parseExternalReference(attempt?.externalReference)
  if (
    !attempt
    || attempt.id !== attemptId
    || attempt.userId !== userId
    || attempt.productId !== productId
    || (safeText(attempt.preapprovalId) && safeText(attempt.preapprovalId) !== preapprovalId)
    || reference?.attemptId !== attemptId
    || reference?.userId !== userId
    || reference?.productId !== productId
    || reference?.targetId !== safeText(attempt.targetId || 'profile')
  ) {
    const error = new Error('subscription_ownership_mismatch')
    error.status = 409
    throw error
  }
  const product = getCommercialProduct(productId)
  const providerPath = `/preapproval/${encodeURIComponent(preapprovalId)}`
  const invalidProviderReason = (subscription) => {
    const validation = validateRecurringPreapproval({ subscription, attempt, product })
    if (!validation.valid) return `invalid_recurring_preapproval:${validation.errors.join(',')}`
    if (safeText(subscription.id) !== preapprovalId) return 'preapproval_id_mismatch'
    return ''
  }
  let providerSubscription = await mercadoPagoApiRequest(providerPath)
  const invalidInitialReason = invalidProviderReason(providerSubscription)
  if (invalidInitialReason) {
    const error = new Error(invalidInitialReason)
    error.status = 409
    throw error
  }
  const alreadyCanceled = isTerminalRecurringCancellation(providerSubscription.status)
  if (!alreadyCanceled) {
    const cancelAtProvider = (status) => mercadoPagoApiRequest(providerPath, { method: 'PUT', body: { status } })
    try {
      providerSubscription = await cancelAtProvider('canceled')
    } catch (error) {
      const rejectedSandboxSpelling = error?.providerHttpStatus === 400
        && error.message === 'Invalid preapproval status param: canceled'
        && safeText(process.env.CORRE_AQUI_ENV) === 'staging'
        && safeText(process.env.MERCADO_PAGO_CREDENTIAL_ENV) === 'test'
      providerSubscription = rejectedSandboxSpelling
        ? await cancelAtProvider('cancelled').catch(() => null)
        : null
    }
    if (!isTerminalRecurringCancellation(providerSubscription?.status) || invalidProviderReason(providerSubscription)) {
      // A write with an uncertain outcome must only be reconciled by reading the provider.
      providerSubscription = await mercadoPagoApiRequest(providerPath).catch(() => null)
    }
  }
  if (!isTerminalRecurringCancellation(providerSubscription?.status) || invalidProviderReason(providerSubscription)) {
    const error = new Error('subscription_cancellation_not_confirmed')
    error.status = 502
    throw error
  }
  const result = await processRecurringPreapprovalUpdate({
    database,
    subscription: providerSubscription,
    force: true,
  })
  if (!result.ok) {
    const error = new Error(result.reason || 'subscription_cancellation_sync_failed')
    error.status = 502
    throw error
  }
  await notifySubscriptionEventSafely({
    database,
    uid: userId,
    kind,
    type: 'cancellation_confirmed',
    reference: preapprovalId,
    occurredAt: asTimestamp(providerSubscription.last_modified) || Date.now(),
    accessUntil: asTimestamp(plan.expiresAt),
  })
  return {
    canceled: true,
    alreadyCanceled,
    accessUntil: asTimestamp(plan.expiresAt) || null,
    providerStatus: safeText(providerSubscription.status),
  }
}
