import { getCanonicalCategoryId, getCategoryById } from '@/constants/categories'
import { findProfessionById, sanitizeCustomProfession } from '@/constants/professions'

export const PUBLIC_WORK_PROFILE_TYPES = {
  CORRE: 'corre',
  PROFESSIONAL: 'professional',
}

const BLOCKED_STATUSES = new Set([
  'blocked',
  'bloqueado',
  'suspended',
  'suspenso',
  'deleted',
  'deletado',
  'removed',
  'removido',
])

const PAUSED_STATUSES = new Set([
  'paused',
  'pausado',
  'draft',
  'rascunho',
  'incomplete',
  'incompleto',
  'hidden',
  'oculto',
])

const TRUE_VALUES = new Set(['true', '1', 'sim', 'yes', 'public', 'publico', 'visible', 'visivel', 'active', 'ativo'])
const FALSE_VALUES = new Set(['false', '0', 'nao', 'no', 'private', 'privado', 'hidden', 'oculto'])
const PUBLIC_PROFILE_PRIVATE_FIELDS = [
  'email',
  'telefone',
  'phone',
  'endereco',
  'address',
  'dataNascimento',
  'cpf',
  'cpfDigits',
  'cpfMasked',
  'cpfStatus',
  'cpfVerificacao',
  'documento',
  'documentoVerificacao',
  'admin',
  'role',
  'pushTokens',
  'reputation',
  'trust',
  'rating',
  'reviewCount',
  'avaliacaoMedia',
  'totalAvaliacoes',
  'servicosConcluidos',
  'completedServices',
  'xp',
  'moedas',
  'patente',
  'patenteCorre',
  'patenteProf',
  'verificado',
  'verified',
  'perfilVerificado',
  'destaque',
  'featured',
  'plano',
  'assinatura',
]

export function safePublicText(value, fallback = '') {
  return String(value ?? fallback).trim()
}

function compactPayload(value) {
  if (Array.isArray(value)) {
    return value.map(compactPayload).filter((entry) => entry !== undefined)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, compactPayload(entry)])
        .filter(([, entry]) => entry !== undefined)
    )
  }

  return value === undefined ? undefined : value
}

function normalizeFlag(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const text = safePublicText(value).toLowerCase()
  if (TRUE_VALUES.has(text)) return true
  if (FALSE_VALUES.has(text)) return false
  return fallback
}

export function clearPrivatePublicProfileFields(payload = {}) {
  return PUBLIC_PROFILE_PRIVATE_FIELDS.reduce(
    (acc, field) => ({
      ...acc,
      [field]: null,
    }),
    { ...payload }
  )
}

export function normalizeProfileStatus(profile = {}) {
  return safePublicText(
    profile.profileStatus ||
      profile.publicStatus ||
      profile.statusPerfil ||
      profile.statusPublico ||
      profile.status ||
      (profile.profileVisible === false || profile.visivel === false ? 'paused' : 'active')
  ).toLowerCase()
}

export function normalizeWorkProfileType(profile = {}, fallback = {}) {
  const raw = safePublicText(
    profile.profileType ||
      profile.workProfileType ||
      profile.tipoPerfilPublico ||
      profile.tipoTrabalho ||
      profile.tipoConta ||
      fallback.profileType ||
      fallback.tipoTrabalho ||
      fallback.tipoConta
  ).toLowerCase()

  if (raw.includes('ambos')) return 'both'
  if (raw.includes('prof')) return PUBLIC_WORK_PROFILE_TYPES.PROFESSIONAL
  if (raw.includes('corre') || raw.includes('worker') || raw.includes('trabalh')) return PUBLIC_WORK_PROFILE_TYPES.CORRE

  const isCorre = normalizeFlag(profile.isCorre ?? fallback.isCorre ?? profile.corre?.ativo ?? fallback.corre?.ativo)
  const isProfissional = normalizeFlag(
    profile.isProfissional ??
      fallback.isProfissional ??
      profile.profissional?.ativo ??
      fallback.profissional?.ativo
  )

  if (isCorre && isProfissional) return 'both'
  if (isProfissional) return PUBLIC_WORK_PROFILE_TYPES.PROFESSIONAL
  if (isCorre) return PUBLIC_WORK_PROFILE_TYPES.CORRE
  return ''
}

function normalizeCategoryList(...values) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => {
          if (!value) return []
          if (Array.isArray(value)) return value
          if (typeof value === 'object') return Object.values(value)
          return [value]
        })
        .map((value) => getCanonicalCategoryId(value))
        .filter((value) => value && getCategoryById(value))
    )
  )
}

export function getPublicCategoryIds(profile = {}, fallback = {}) {
  const type = normalizeWorkProfileType(profile, fallback)
  const categories = normalizeCategoryList(
    profile.primaryCategoryId,
    profile.categoriaPrincipal,
    profile.categoriaId,
    profile.categoryId,
    profile.profCategorias,
    profile.correCategorias,
    fallback.primaryCategoryId,
    fallback.categoriaId,
    fallback.profCategorias,
    fallback.correCategorias,
    profile.profissional?.categoriaId,
    profile.profissional?.profCategorias,
    profile.corre?.categoriaId,
    profile.corre?.categorias
  )

  if (!categories.length && (type === PUBLIC_WORK_PROFILE_TYPES.CORRE || type === 'both')) {
    return ['servicos_gerais']
  }

  return categories
}

export function getPublicRegion(profile = {}, fallback = {}) {
  const city = safePublicText(
    profile.city ||
      profile.cidade ||
      profile.profCidadeAtende ||
      profile.profRegiao ||
      profile.correRegiao ||
      profile.regiao ||
      profile.profissional?.regiao ||
      profile.corre?.regiao ||
      fallback.city ||
      fallback.cidade ||
      fallback.regiao
  )

  const neighborhood = safePublicText(
    profile.neighborhood ||
      profile.bairro ||
      profile.area ||
      profile.areaAtendimento ||
      profile.profBairro ||
      profile.correBairro ||
      fallback.neighborhood ||
      fallback.bairro
  )

  const regionKeys = Array.from(new Set([city, neighborhood].map((value) => safePublicText(value).toLowerCase()).filter(Boolean)))

  return {
    city,
    neighborhood,
    regionKeys,
  }
}

export function isPublicWorkProfileReady(profile = {}, fallback = {}) {
  if (!profile || typeof profile !== 'object') {
    return { ready: false, reason: 'missing_profile' }
  }

  const uid = safePublicText(profile.uid || profile.id || fallback.uid || fallback.id)
  if (!uid) return { ready: false, reason: 'missing_uid' }

  const status = normalizeProfileStatus(profile)
  if (BLOCKED_STATUSES.has(status)) return { ready: false, reason: 'blocked_status' }
  if (PAUSED_STATUSES.has(status)) return { ready: false, reason: 'paused_status' }

  const visible = normalizeFlag(profile.profileVisible ?? profile.visivel ?? profile.visibility, true)
  if (!visible) return { ready: false, reason: 'profile_hidden' }

  const type = normalizeWorkProfileType(profile, fallback)
  if (!type) return { ready: false, reason: 'missing_work_type' }

  const categories = getPublicCategoryIds(profile, fallback)
  if (!categories.length) return { ready: false, reason: 'missing_category' }

  const region = getPublicRegion(profile, fallback)
  if (!region.city && !region.regionKeys.length) return { ready: false, reason: 'missing_region' }

  const name = safePublicText(profile.nome || profile.name || profile.displayName || fallback.nome || fallback.name)
  if (name.length < 2) return { ready: false, reason: 'missing_name' }

  return {
    ready: true,
    reason: 'ready',
    uid,
    type,
    categories,
    region,
    status,
    visible,
    name,
  }
}

export function hasPublicWorkProfile(profile = {}, fallback = {}) {
  return isPublicWorkProfileReady(profile, fallback).ready
}

export function canAppearInPublicDirectory(profile = {}, fallback = {}) {
  return isPublicWorkProfileReady(profile, fallback).ready
}

export function isPubliclyAvailableWorker(profile = {}, presence = {}, now = Date.now()) {
  if (!canAppearInPublicDirectory(profile, presence)) return false
  const lastSeen = Number(presence?.lastSeen || presence?.updatedAt || 0)
  return (
    presence?.online === true &&
    presence?.disponivel !== false &&
    presence?.showOnlineStatus !== false &&
    Number.isFinite(lastSeen) &&
    now - lastSeen <= 60_000
  )
}

export function mergePublicProfileWithPresence(publicProfile = {}, presence = {}, now = Date.now()) {
  const uid = safePublicText(publicProfile.uid || publicProfile.id || presence.uid || presence.id)
  if (!uid) return null
  if (!canAppearInPublicDirectory(publicProfile, presence)) return null

  const online = isPubliclyAvailableWorker(publicProfile, presence, now)
  const merged = {
    ...publicProfile,
    uid,
    id: uid,
    online,
    disponivel: online,
    lastSeen: presence?.lastSeen ?? publicProfile.lastSeen ?? null,
    updatedAt: publicProfile.updatedAt ?? presence?.updatedAt ?? null,
    local: presence?.local || publicProfile.local || null,
    latitude: presence?.latitude ?? publicProfile.latitude,
    longitude: presence?.longitude ?? publicProfile.longitude,
    modoAtual: presence?.modoAtual || publicProfile.modoAtual || '',
    publicProfileReady: true,
  }

  return compactPayload(merged)
}

export function buildQuickPublicWorkProfilePayload({ uid, account = {}, form = {}, now = Date.now() }) {
  const cleanUid = safePublicText(uid || account.uid || account.id)
  const name = safePublicText(form.nome || account.nome || account.displayName || account.profile?.nome)
  const type = form.profileType === PUBLIC_WORK_PROFILE_TYPES.PROFESSIONAL ? PUBLIC_WORK_PROFILE_TYPES.PROFESSIONAL : PUBLIC_WORK_PROFILE_TYPES.CORRE
  const catalogProfession = findProfessionById(form.professionId)
  const professionName = sanitizeCustomProfession(form.professionName || form.customProfession || catalogProfession?.name)
  const professionId = catalogProfession?.id || ''
  const professionSource = form.professionSource === 'custom' && professionName ? 'custom' : professionId ? 'catalog' : ''
  const categoryId = getCanonicalCategoryId(catalogProfession?.categoryId || form.categoriaId || form.primaryCategoryId || '')
  const category = getCategoryById(categoryId)
  const city = safePublicText(form.cidade || form.city || account.cidade || account.profile?.cidade)
  const neighborhood = safePublicText(form.bairro || form.neighborhood || account.bairro || account.profile?.bairro)
  const photoURL = safePublicText(form.fotoURL || account.fotoURL || account.photoURL || account.profile?.fotoURL || account.profile?.photoURL)
  const isCorre = type === PUBLIC_WORK_PROFILE_TYPES.CORRE
  const isProfissional = type === PUBLIC_WORK_PROFILE_TYPES.PROFESSIONAL
  const workTitle = professionName || category?.label || (isProfissional ? 'Profissional local' : 'Corre rapido')

  return compactPayload(clearPrivatePublicProfileFields({
    uid: cleanUid,
    id: cleanUid,
    nome: name,
    displayName: name,
    fotoURL: photoURL || null,
    photoURL: photoURL || null,
    avatar: photoURL || safePublicText(account.avatarEmoji || account.profile?.avatarEmoji),
    avatarEmoji: safePublicText(account.avatarEmoji || account.profile?.avatarEmoji),
    profileType: type,
    workProfileType: type,
    isCorre,
    isProfissional,
    primaryCategoryId: categoryId,
    categoriaId: categoryId,
    categoriaNome: category?.label || '',
    professionId: professionId || null,
    professionName: professionName || null,
    professionSource: professionSource || null,
    profissaoId: professionId || null,
    profissaoNome: professionName || null,
    customProfession: professionSource === 'custom' ? professionName : undefined,
    correProfessionId: isCorre ? professionId : undefined,
    correTitulo: isCorre ? workTitle : undefined,
    profTitulo: isProfissional ? workTitle : undefined,
    correCategorias: isCorre ? [categoryId] : [],
    profCategorias: isProfissional ? [categoryId] : [],
    cidade: city,
    city,
    bairro: neighborhood,
    neighborhood,
    regiao: neighborhood ? `${neighborhood}, ${city}` : city,
    regionKeys: [city, neighborhood].map((value) => safePublicText(value).toLowerCase()).filter(Boolean),
    visibility: 'public',
    profileVisible: true,
    visivel: true,
    profileStatus: 'active',
    publicProfileVersion: 1,
    onboardingStatus: 'quick_complete',
    workProfileCreated: true,
    createdAt: now,
    updatedAt: now,
    atualizadoEm: now,
  }))
}
