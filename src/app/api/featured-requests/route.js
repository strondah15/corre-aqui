import { NextResponse } from 'next/server'
import {
  REQUEST_BOOST_PRODUCT_ID,
} from '@/lib/commercialProducts'
import {
  asTimestamp,
  getAuthenticatedUid,
  getCommercialDatabase,
  getPedidoCategoryId,
  getPedidoOwnerUid,
  getPedidoRegionKeys,
  hasActiveRequestBoost,
  isFeaturedRequestsPreviewEnabled,
  normalizePedidoStatus,
  safeText,
} from '@/lib/commercialServer'
import {
  normalizeFeaturedRequest,
  requestMatchesCategory,
  requestMatchesRegion,
} from '@/lib/featuredRequests'

export const runtime = 'nodejs'

const isDevelopment = process.env.NODE_ENV !== 'production'
const responseHeaders = { 'Cache-Control': 'private, no-store' }

const featuredRequestsLog = (message, details = {}) => {
  if (!isDevelopment) return
  console.info(`[FEATURED_REQUESTS] ${message}`, details)
}

const stableHash = (value) => {
  let hash = 2166136261
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const isPedidoPubliclyBoostable = (pedido, now) => {
  const status = normalizePedidoStatus(pedido?.status)
  if (status !== 'aberto') return false
  if (pedido?.aceite?.id || pedido?.aceitoPor || pedido?.aceitadorId) return false
  if (pedido?.bloqueado || pedido?.blocked || pedido?.moderado || pedido?.moderation?.blocked) return false
  if (asTimestamp(pedido?.expiraEm || pedido?.expiresAt) && asTimestamp(pedido?.expiraEm || pedido?.expiresAt) <= now) return false
  return true
}

const buildPreviewEntitlements = async ({ database, requesterUid, regionKeys, categoryId, now }) => {
  const pedidosSnapshot = await database.ref('pedidos').orderByChild('status').equalTo('aberto').limitToLast(60).get()
  const pedidos = Object.entries(pedidosSnapshot.val() || {})
    .map(([id, pedido]) => ({ id, ...(pedido || {}) }))
    .filter((pedido) => getPedidoOwnerUid(pedido) !== requesterUid)
    .filter((pedido) => isPedidoPubliclyBoostable(pedido, now))
    .filter((pedido) => requestMatchesCategory({ categoriaId: getPedidoCategoryId(pedido) }, categoryId))
    .filter((pedido) => requestMatchesRegion(pedido, regionKeys))
    .sort((left, right) => (
      stableHash(`${left.id}:${Math.floor(now / (2 * 60 * 60 * 1000))}`)
      - stableHash(`${right.id}:${Math.floor(now / (2 * 60 * 60 * 1000))}`)
    ))
    .slice(0, 8)

  featuredRequestsLog('pedidos reais usados na previa local', { count: pedidos.length })

  return pedidos.map((pedido) => ({
    pedido,
    entitlement: {
      active: true,
      status: 'active',
      productId: REQUEST_BOOST_PRODUCT_ID,
      pedidoId: pedido.id,
      ownerUid: getPedidoOwnerUid(pedido),
      startsAt: now,
      expiresAt: now + 60 * 60 * 1000,
      endsWhenAccepted: true,
      regionKeys: getPedidoRegionKeys(pedido),
      categoryId: getPedidoCategoryId(pedido),
      verifiedByServer: true,
      testMode: true,
    },
  }))
}

export async function GET(request) {
  const now = Date.now()
  const categoryId = safeText(request.nextUrl.searchParams.get('categoryId'))
  const region = safeText(request.nextUrl.searchParams.get('region')).slice(0, 120)
  const regionKeys = region ? [region] : []

  featuredRequestsLog('request iniciada', { testMode: isFeaturedRequestsPreviewEnabled() })
  featuredRequestsLog('regiao recebida', { hasRegion: Boolean(region), region: region || null })

  try {
    const uid = await getAuthenticatedUid(request)
    const database = getCommercialDatabase()
    const entitlementsSnapshot = await database.ref('featuredRequestEntitlements').get()
    const rawEntitlements = Object.entries(entitlementsSnapshot.val() || {})
    featuredRequestsLog('entitlements encontrados', { count: rawEntitlements.length })

    const activeEntitlements = rawEntitlements.flatMap(([pedidoId, raw]) => {
      const entitlement = { pedidoId, ...(raw || {}) }
      if (!hasActiveRequestBoost(entitlement, now)) return []
      return [{ pedidoId, entitlement }]
    })

    const hydrated = await Promise.all(activeEntitlements.map(async ({ pedidoId, entitlement }) => {
      const pedidoSnapshot = await database.ref(`pedidos/${pedidoId}`).get()
      const pedido = pedidoSnapshot.val()
      if (!pedido || typeof pedido !== 'object') return null
      const withId = { id: pedidoId, ...pedido }
      if (!isPedidoPubliclyBoostable(withId, now)) return null
      if (!requestMatchesCategory({ categoriaId: getPedidoCategoryId(withId) }, categoryId)) return null
      if (!requestMatchesRegion(withId, regionKeys.length ? regionKeys : entitlement.regionKeys)) return null
      return { pedido: withId, entitlement }
    }))

    const eligible = hydrated.filter(Boolean)
    const preview = !eligible.length && isFeaturedRequestsPreviewEnabled()
      ? await buildPreviewEntitlements({ database, requesterUid: uid, regionKeys, categoryId, now })
      : []
    const source = preview.length ? preview : eligible
    const requests = source
      .sort((left, right) => (
        stableHash(`${left.pedido.id}:${Math.floor(now / (2 * 60 * 60 * 1000))}`)
        - stableHash(`${right.pedido.id}:${Math.floor(now / (2 * 60 * 60 * 1000))}`)
      ))
      .slice(0, 12)
      .map(({ pedido, entitlement }) => normalizeFeaturedRequest(pedido, entitlement, { testMode: entitlement?.testMode === true }))

    featuredRequestsLog('resultado final', {
      count: requests.length,
      testMode: preview.length > 0,
    })

    return NextResponse.json({
      requests,
      testMode: preview.length > 0,
      ...(isDevelopment ? {
        diagnostic: requests.length
          ? preview.length ? 'local_preview' : 'active_entitlements'
          : 'no_active_entitlements',
      } : {}),
    }, { headers: responseHeaders })
  } catch (error) {
    console.error('[featured-requests] leitura segura falhou:', {
      code: error?.code,
      message: error?.message,
      status: error?.status,
    })
    return NextResponse.json({
      requests: [],
      testMode: false,
      ...(isDevelopment ? { diagnostic: 'api_error' } : {}),
    }, { status: error?.status || 500, headers: responseHeaders })
  }
}
