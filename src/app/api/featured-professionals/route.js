import { NextResponse } from 'next/server'
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDatabase,
  isFirebaseAdminConfigured,
} from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const safeText = (value) => String(value || '').trim()
const isDevelopment = process.env.NODE_ENV !== 'production'
const isTestModeEnabled = isDevelopment
  && process.env.FEATURED_PROFESSIONALS_TEST_MODE === 'true'

const featuredLog = (message, details = {}) => {
  if (!isDevelopment) return
  console.info(`[FEATURED] ${message}`, details)
}

const normalizeText = (value) => safeText(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

const asTimestamp = (value) => {
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

const normalizeEntitlement = (uid, raw, now) => {
  if (!raw || typeof raw !== 'object') {
    return { entitlement: null, reason: 'plano inativo' }
  }

  const startsAt = asTimestamp(raw.startsAt || raw.inicioEm)
  const expiresAt = asTimestamp(raw.expiresAt || raw.expiraEm || raw.validoAte)
  const status = safeText(raw.status).toLowerCase()
  const active = raw.active === true || raw.ativo === true
  const profileReleased = raw.profileReleased === true || raw.perfilLiberado === true
  const accountSuspended = raw.accountSuspended === true || raw.contaSuspensa === true

  if (accountSuspended || status === 'suspended') {
    return { entitlement: null, reason: 'conta suspensa' }
  }
  if (!active || status !== 'active' || !profileReleased) {
    return { entitlement: null, reason: 'plano inativo' }
  }
  if (startsAt && startsAt > now) {
    return { entitlement: null, reason: 'plano ainda não iniciado' }
  }
  if (!expiresAt || expiresAt <= now) {
    return { entitlement: null, reason: 'expirado' }
  }

  const radiusKm = Number(raw.radiusKm || raw.raioKm)
  const regions = Array.isArray(raw.regions || raw.regioes)
    ? (raw.regions || raw.regioes).map(safeText).filter(Boolean).slice(0, 20)
    : []

  return {
    entitlement: {
      uid,
      active: true,
      status: 'active',
      profileReleased: true,
      accountSuspended: false,
      startsAt: startsAt || null,
      expiresAt,
      radiusKm: Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm : null,
      regions,
      lastShownAt: asTimestamp(raw.lastShownAt || raw.ultimaExibicaoEm) || null,
      verifiedByServer: true,
      testMode: false,
    },
    reason: '',
  }
}

const profileRegion = (profile) => safeText(
  profile?.profCidadeAtende
    || profile?.correRegiao
    || profile?.regiao
    || profile?.cidade
)

const hasPublicOffering = (profile) => {
  const categories = [
    ...(Array.isArray(profile?.profCategorias) ? profile.profCategorias : []),
    ...(Array.isArray(profile?.correCategorias) ? profile.correCategorias : []),
  ].map(safeText).filter(Boolean)
  const portfolio = profile?.portfolio && typeof profile.portfolio === 'object'
    ? Object.values(profile.portfolio)
    : Array.isArray(profile?.profPortfolio)
      ? profile.profPortfolio
      : []

  return categories.length > 0
    || portfolio.some((service) => service && service.ativo !== false && service.active !== false)
}

const isPreviewProfileEligible = ({ uid, profile, requesterUid }) => {
  if (!uid || uid === requesterUid || !profile || typeof profile !== 'object') return false
  if (!safeText(profile.nome)) return false
  if (profile.profileVisible === false || profile.visivel === false) return false
  if (!profile.isCorre && !profile.isProfissional) return false
  if (
    profile.accountSuspended === true
    || profile.contaSuspensa === true
    || profile.suspended === true
    || profile.suspenso === true
    || safeText(profile.status).toLowerCase() === 'suspended'
  ) {
    return false
  }
  return hasPublicOffering(profile)
}

const regionMatches = (profile, viewerRegion) => {
  const normalizedViewerRegion = normalizeText(viewerRegion)
  const normalizedProfileRegion = normalizeText(profileRegion(profile))
  if (!normalizedViewerRegion || !normalizedProfileRegion) return true
  return normalizedViewerRegion.includes(normalizedProfileRegion)
    || normalizedProfileRegion.includes(normalizedViewerRegion)
}

const buildPreviewEntitlements = async ({ database, requesterUid, viewerRegion, now }) => {
  const publicProfilesSnapshot = await database.ref('publicProfiles').get()
  const profiles = Object.entries(publicProfilesSnapshot.val() || {})
    .filter(([uid, profile]) => isPreviewProfileEligible({ uid, profile, requesterUid }))
  const regionCompatible = profiles.filter(([, profile]) => regionMatches(profile, viewerRegion))

  if (viewerRegion && regionCompatible.length !== profiles.length) {
    featuredLog('excluído: região incompatível', {
      count: profiles.length - regionCompatible.length,
    })
  }

  const selected = (regionCompatible.length ? regionCompatible : profiles)
    .sort(([leftUid], [rightUid]) => leftUid.localeCompare(rightUid))
    .slice(0, 2)

  featuredLog('perfis elegíveis', {
    count: selected.length,
    testMode: true,
  })

  return selected.map(([uid]) => ({
    uid,
    active: true,
    status: 'active',
    profileReleased: true,
    accountSuspended: false,
    startsAt: now,
    expiresAt: now + 60 * 60 * 1000,
    radiusKm: null,
    regions: viewerRegion ? [viewerRegion] : [],
    lastShownAt: null,
    verifiedByServer: true,
    testMode: true,
  }))
}

export async function GET(request) {
  const headers = { 'Cache-Control': 'private, no-store' }
  const viewerRegion = safeText(request.nextUrl.searchParams.get('region')).slice(0, 120)
  featuredLog('request iniciada', { testMode: isTestModeEnabled })
  featuredLog('região recebida', {
    hasRegion: Boolean(viewerRegion),
    region: viewerRegion || null,
  })

  if (!isFirebaseAdminConfigured()) {
    featuredLog('resultado final', {
      count: 0,
      reason: 'firebase_admin_indisponível',
      testMode: false,
    })
    return NextResponse.json({
      entitlements: [],
      testMode: false,
      ...(isDevelopment ? { diagnostic: 'firebase_admin_unavailable' } : {}),
    }, { headers })
  }

  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) {
    return NextResponse.json({ error: 'missing_auth_token' }, { status: 401, headers })
  }

  try {
    const adminAuth = getFirebaseAdminAuth()
    const decodedToken = await adminAuth.verifyIdToken(idToken)
    const database = getFirebaseAdminDatabase()

    const snapshot = await database
      .ref('featuredProfessionalEntitlements')
      .get()
    const now = Date.now()
    const rawEntitlements = Object.entries(snapshot.val() || {})
    featuredLog('entitlements encontrados', { count: rawEntitlements.length })

    const entitlements = rawEntitlements.flatMap(([uid, value]) => {
      const result = normalizeEntitlement(uid, value, now)
      if (result.entitlement) return [result.entitlement]

      if (result.reason === 'plano inativo') {
        featuredLog('excluído: plano inativo', { uid })
      } else if (result.reason === 'expirado') {
        featuredLog('excluído: expirado', { uid })
      } else {
        featuredLog(`excluído: ${result.reason}`, { uid })
      }
      return []
    })

    const previewEntitlements = !entitlements.length && isTestModeEnabled
      ? await buildPreviewEntitlements({
          database,
          requesterUid: decodedToken.uid,
          viewerRegion,
          now,
        })
      : []
    const result = previewEntitlements.length ? previewEntitlements : entitlements
    const testMode = previewEntitlements.length > 0

    featuredLog('resultado final', {
      count: result.length,
      testMode,
    })

    return NextResponse.json({
      entitlements: result,
      testMode,
      ...(isDevelopment ? {
        diagnostic: result.length
          ? testMode ? 'local_preview' : 'active_entitlements'
          : 'no_active_entitlements',
      } : {}),
    }, { headers })
  } catch (error) {
    console.error('[featured-professionals] leitura segura falhou:', {
      code: error?.code,
      message: error?.message,
    })
    featuredLog('resultado final', {
      count: 0,
      reason: 'api_error',
      testMode: false,
    })
    return NextResponse.json({
      entitlements: [],
      testMode: false,
      ...(isDevelopment ? { diagnostic: 'api_error' } : {}),
    }, { headers })
  }
}
