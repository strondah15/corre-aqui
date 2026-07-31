import crypto from 'crypto'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'
import {
  COMMERCIAL_CURRENCY,
  COMMERCIAL_PRICE_CENTS,
  PROFESSIONAL_FEATURED_PLAN_ID,
  REQUEST_BOOST_PRODUCT_ID,
  getCommercialProduct,
} from '@/lib/commercialProducts'

export const COMMERCIAL_SOURCE = 'mercado_pago'

export const safeText = (value) => String(value || '').trim()

export const normalizeText = (value) => safeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

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

export async function getAuthenticatedUid(request) {
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
  return decoded.uid
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

export function isMercadoPagoCheckoutEnabled() {
  return process.env.MERCADO_PAGO_CHECKOUT_ENABLED === 'true'
    && !!process.env.MERCADO_PAGO_ACCESS_TOKEN
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
  const id = safeText(event?.eventId) || database.ref('commercialAuditLogs').push().key
  await database.ref(`commercialAuditLogs/${id}`).set(cleanFirebasePayload({
    ...event,
    eventId: id,
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

export async function createCommercialCheckoutAttempt({
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
    checkoutStatus: isMercadoPagoCheckoutEnabled() ? 'provider_enabled' : 'provider_not_configured',
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

export async function maybeCreateMercadoPagoPreference({ product, attempt, payerEmail = '' }) {
  if (!isMercadoPagoCheckoutEnabled()) {
    return {
      checkoutAvailable: false,
      checkoutUrl: '',
      initPoint: '',
      reason: 'mercado_pago_not_configured',
    }
  }

  const siteUrl = safeText(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL)
  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
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
      notification_url: siteUrl ? `${siteUrl.replace(/\/$/, '')}/api/mercado-pago/webhook` : undefined,
      back_urls: siteUrl ? {
        success: `${siteUrl.replace(/\/$/, '')}/?checkout=success`,
        pending: `${siteUrl.replace(/\/$/, '')}/?checkout=pending`,
        failure: `${siteUrl.replace(/\/$/, '')}/?checkout=failure`,
      } : undefined,
      auto_return: siteUrl ? 'approved' : undefined,
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
    error.details = data
    throw error
  }

  return {
    checkoutAvailable: true,
    checkoutUrl: data?.init_point || data?.sandbox_init_point || '',
    initPoint: data?.init_point || data?.sandbox_init_point || '',
    preferenceId: data?.id || '',
  }
}

export function verifyMercadoPagoSignature({ rawBody, body, headers }) {
  const secret = safeText(process.env.MERCADO_PAGO_WEBHOOK_SECRET)
  if (!secret) return { ok: false, reason: 'missing_webhook_secret' }

  const signatureHeader = safeText(headers.get('x-signature'))
  const requestId = safeText(headers.get('x-request-id'))
  if (!signatureHeader || !requestId) return { ok: false, reason: 'missing_signature_headers' }

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=')
      return [key, rest.join('=')]
    })
  )
  const ts = safeText(parts.ts)
  const received = safeText(parts.v1)
  const dataId = safeText(body?.data?.id || body?.id || body?.resource)
  if (!ts || !received || !dataId) return { ok: false, reason: 'invalid_signature_payload' }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  try {
    const receivedBuffer = Buffer.from(received, 'hex')
    const expectedBuffer = Buffer.from(expected, 'hex')
    if (receivedBuffer.length !== expectedBuffer.length) {
      return { ok: false, reason: 'signature_mismatch' }
    }
    const ok = crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    return { ok, reason: ok ? '' : 'signature_mismatch', paymentId: dataId, rawBodyLength: rawBody.length }
  } catch {
    return { ok: false, reason: 'invalid_signature_format' }
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

async function endCommercialEntitlement({ database, attempt, payment, status }) {
  const now = Date.now()
  const paymentId = safeText(payment?.id)
  const statusAfter = status === 'charged_back' ? 'chargeback' : 'refunded'
  const auditType = status === 'charged_back' ? 'chargeback_received' : 'refund_received'
  const product = getCommercialProduct(attempt.productId)

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

export async function processApprovedCommercialPayment({ database, payment }) {
  const paymentId = safeText(payment?.id)
  const externalReference = safeText(payment?.external_reference)
  const status = safeText(payment?.status).toLowerCase()
  if (!paymentId || !externalReference) {
    return { ok: false, reason: 'missing_payment_reference' }
  }

  const parsed = parseExternalReference(externalReference)
  if (!parsed) return { ok: false, reason: 'invalid_external_reference' }

  const lockRef = database.ref(`processedPaymentEvents/${referenceKey(`${paymentId}:${status || 'unknown'}`)}`)
  let duplicate = false
  const transaction = await lockRef.transaction((current) => {
    if (current) {
      duplicate = true
      return current
    }
    return {
      paymentId,
      externalReference,
      paymentStatus: status || null,
      status: 'processing',
      createdAt: Date.now(),
    }
  })
  if (!transaction.committed || duplicate) {
    await writeCommercialAudit(database, {
      eventId: `webhook_ignored_duplicate_${referenceKey(`${paymentId}:${status || 'unknown'}`)}`,
      type: 'webhook_ignored_duplicate',
      paymentReference: externalReference,
      statusAfter: status || null,
    })
    return { ok: true, duplicate: true, reason: 'webhook_ignored_duplicate' }
  }

  const attemptSnapshot = await database.ref(`commercialCheckoutAttempts/${parsed.attemptId}`).get()
  const attempt = attemptSnapshot.val()
  if (!attempt || attempt.externalReference !== externalReference) {
    await lockRef.update({ status: 'ignored', reason: 'attempt_not_found', updatedAt: Date.now() })
    return { ok: false, reason: 'attempt_not_found' }
  }

  const product = getCommercialProduct(attempt.productId)
  const amountInCents = Math.round(Number(payment?.transaction_amount || 0) * 100)
  const currency = safeText(payment?.currency_id || payment?.currency)

  if (!product || product.amountInCents !== COMMERCIAL_PRICE_CENTS || product.currency !== COMMERCIAL_CURRENCY) {
    await lockRef.update({ status: 'ignored', reason: 'invalid_product', updatedAt: Date.now() })
    return { ok: false, reason: 'invalid_product' }
  }
  if (amountInCents !== product.amountInCents || currency !== product.currency) {
    await lockRef.update({ status: 'ignored', reason: 'invalid_amount_or_currency', updatedAt: Date.now() })
    return { ok: false, reason: 'invalid_amount_or_currency' }
  }
  if (status === 'refunded' || status === 'charged_back') {
    const ending = await endCommercialEntitlement({ database, attempt, payment, status })
    await database.ref(`commercialCheckoutAttempts/${attempt.id}`).update(cleanFirebasePayload({
      status: `payment_${status}`,
      paymentId,
      updatedAt: Date.now(),
    }))
    await lockRef.update(cleanFirebasePayload({
      status: 'processed',
      reason: ending.reason || null,
      ended: ending.ended === true,
      updatedAt: Date.now(),
    }))
    return { ok: true, ...ending }
  }
  if (status !== 'approved') {
    await database.ref(`commercialCheckoutAttempts/${attempt.id}`).update(cleanFirebasePayload({
      status: status ? `payment_${status}` : 'payment_not_approved',
      paymentId,
      updatedAt: Date.now(),
    }))
    await lockRef.update({ status: 'ignored', reason: 'payment_not_approved', paymentStatus: status, updatedAt: Date.now() })
    return { ok: true, activated: false, reason: 'payment_not_approved' }
  }

  const activation = product.id === PROFESSIONAL_FEATURED_PLAN_ID
    ? await activateProfessionalEntitlement({ database, attempt, payment })
    : await activateRequestBoost({ database, attempt, payment })

  await database.ref(`commercialCheckoutAttempts/${attempt.id}`).update(cleanFirebasePayload({
    status: activation.activated ? 'entitlement_activated' : 'entitlement_blocked',
    paymentId,
    activationReason: activation.reason || null,
    updatedAt: Date.now(),
  }))
  await lockRef.update(cleanFirebasePayload({
    status: activation.activated ? 'processed' : 'blocked',
    reason: activation.reason || null,
    updatedAt: Date.now(),
  }))

  return { ok: true, ...activation }
}
