import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const availabilityHelperSource = await readFile(
  new URL('../src/lib/publicAvailability.js', import.meta.url),
  'utf8'
)
const availabilityHelper = await import(
  `data:text/javascript;base64,${Buffer.from(availabilityHelperSource).toString('base64')}`
)
const {
  buildPublicAvailabilityPayload,
  canPublishPublicAvailability,
  describePublicAvailabilityEligibility,
  describePublicAvailabilityPayload,
  getPublicAvailabilityEligibility,
  getPublicAvailabilityLocation,
  PUBLIC_AVAILABILITY_HEARTBEAT_MS,
  PUBLIC_AVAILABILITY_TTL_MS,
  toPublicAvailabilityGrid,
} = availabilityHelper

const rules = JSON.parse(
  await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')
).rules

const presence = rules.presence
const legacyPresence = rules.usuariosOnline
const availability = rules.publicAvailability

assert.equal(presence['.read'], undefined, 'presence nao pode ser enumeravel')
assert.equal(presence.$uid['.read'], 'auth != null && auth.uid === $uid')
assert.equal(presence.$uid['.write'], 'auth != null && auth.uid === $uid')
assert.equal(legacyPresence.$uid['.read'], 'auth != null && auth.uid === $uid')
assert.equal(availability['.read'], 'auth != null')
assert.equal(availability.$uid['.write'], 'auth != null && auth.uid === $uid')
assert.equal(availability.$uid.$other['.validate'], false)
for (const locationField of ['local', 'location', 'localizacao', 'geo', 'coordenadas', 'lat', 'lng', 'latitude', 'longitude']) {
  assert.match(rules.publicProfiles.$uid['.validate'], new RegExp(`!newData\\.child\\('${locationField}'\\)\\.exists`))
}

const ownsPath = (authUid, targetUid) => Boolean(authUid) && authUid === targetUid
assert.equal(ownsPath('A', 'A'), true, 'A escreve sua presenca')
assert.equal(ownsPath('A', 'B'), false, 'A nao escreve presenca de B')
assert.equal(ownsPath('B', 'A'), false, 'B nao escreve presenca de A')
assert.equal(ownsPath(null, 'A'), false, 'nao autenticado nao escreve presenca')
assert.equal(ownsPath('A', 'B'), false, 'A nao le presenca privada de B')
assert.equal(Boolean('A') && availability['.read'] === 'auth != null', true, 'A enumera apenas disponibilidade publica')

const precise = { lat: -23.5505199, lng: -46.6333094 }
assert.deepEqual(toPublicAvailabilityGrid(precise), { gridLat: -2355, gridLng: -4663 })
assert.deepEqual(getPublicAvailabilityLocation({ gridLat: -2355, gridLng: -4663 }), { lat: -23.55, lng: -46.63 })
const validPublicProfile = {
  uid: 'A',
  id: 'A',
  profileVisible: true,
  visivel: true,
  showOnlineStatus: true,
  isCorre: true,
  isProfissional: false,
}
const validEligibility = {
  mode: 'corre',
  available: true,
  onlinePreference: true,
  publicProfile: validPublicProfile,
  publicProfileReady: true,
}
assert.equal(canPublishPublicAvailability({ ...validEligibility, mode: 'cliente' }), false)
assert.equal(canPublishPublicAvailability(validEligibility), true)
assert.equal(canPublishPublicAvailability({ ...validEligibility, available: false }), false)
assert.equal(canPublishPublicAvailability({ ...validEligibility, available: true }), true, 'A reaparece ao religar disponibilidade')
assert.equal(canPublishPublicAvailability({
  ...validEligibility,
  publicProfile: { ...validPublicProfile, showOnlineStatus: false },
}), false)
assert.deepEqual(getPublicAvailabilityEligibility({
  ...validEligibility,
  publicProfile: { ...validPublicProfile, profileVisible: true, visivel: false },
}), { allowed: false, reason: 'visivel_false' })
assert.deepEqual(getPublicAvailabilityEligibility({
  ...validEligibility,
  publicProfile: {
    ...validPublicProfile,
    isCorre: undefined,
    isProfissional: undefined,
    profileType: 'corre',
  },
}), { allowed: false, reason: 'public_work_role_missing' })

const publicPayload = buildPublicAvailabilityPayload({ uid: 'A', location: precise, now: 1_700_000_000_000 })
assert.deepEqual(publicPayload, {
  uid: 'A',
  id: 'A',
  online: true,
  disponivel: true,
  lastSeen: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  modoAtual: 'corre',
  showOnlineStatus: true,
  gridLat: -2355,
  gridLng: -4663,
})
assert.deepEqual(Object.keys(buildPublicAvailabilityPayload({
  uid: 'A',
  location: {
    ...precise,
    nome: 'legado',
    email: 'legado@example.invalid',
    latitude: precise.lat,
    longitude: precise.lng,
  },
  now: 1_700_000_000_000,
})), Object.keys(publicPayload))
assert.deepEqual(describePublicAvailabilityPayload(publicPayload).gridLat, { type: 'number', integer: true })
assert.equal(PUBLIC_AVAILABILITY_HEARTBEAT_MS, 15_000)
assert.equal(PUBLIC_AVAILABILITY_TTL_MS, 60_000)
const eligibilityDiagnostic = describePublicAvailabilityEligibility({
  uid: 'A',
  eligibility: { allowed: false, reason: 'public_work_role_missing' },
  mode: 'corre',
  available: true,
  onlinePreference: true,
  publicProfile: { profileType: 'corre', profileVisible: true, visivel: true },
})
assert.deepEqual(Object.keys(eligibilityDiagnostic), [
  'uid', 'eligible', 'reason', 'modoAtual', 'isCorre', 'isProfissional',
  'profileVisible', 'visivel', 'showOnlineStatus', 'onlinePreference', 'availabilityToggle',
])
for (const forbiddenField of ['email', 'telefone', 'location', 'local', 'token']) {
  assert.equal(Object.hasOwn(eligibilityDiagnostic, forbiddenField), false, `diagnostico nao expoe ${forbiddenField}`)
}

const publicAvailabilityWriteAllowed = ({ authUid, targetUid, nextData, profile }) => {
  if (!authUid || authUid !== targetUid) return false
  if (nextData === null) return true
  const allowedKeys = new Set([
    'uid', 'id', 'online', 'disponivel', 'lastSeen', 'updatedAt', 'modoAtual',
    'showOnlineStatus', 'gridLat', 'gridLng',
  ])
  const hasRequired = ['uid', 'id', 'online', 'disponivel', 'lastSeen', 'updatedAt', 'modoAtual', 'showOnlineStatus']
    .every((field) => Object.hasOwn(nextData, field))
  const gridPair = Object.hasOwn(nextData, 'gridLat') === Object.hasOwn(nextData, 'gridLng')
  return Boolean(
    profile && profile.profileVisible !== false && profile.visivel !== false && profile.showOnlineStatus !== false
    && (profile.isCorre === true || profile.isProfissional === true)
    && hasRequired && Object.keys(nextData).every((field) => allowedKeys.has(field))
    && nextData.uid === targetUid && nextData.id === targetUid
    && nextData.online === true && nextData.disponivel === true
    && Number.isFinite(nextData.lastSeen) && Number.isFinite(nextData.updatedAt)
    && nextData.modoAtual === 'corre' && nextData.showOnlineStatus === true
    && gridPair
    && (!gridPair || (
      Number.isInteger(nextData.gridLat) && nextData.gridLat >= -9000 && nextData.gridLat <= 9000
      && Number.isInteger(nextData.gridLng) && nextData.gridLng >= -18000 && nextData.gridLng <= 18000
    ))
  )
}
assert.equal(publicAvailabilityWriteAllowed({ authUid: 'A', targetUid: 'A', nextData: publicPayload, profile: validPublicProfile }), true, 'profissional online grava schema publico')
assert.equal(publicAvailabilityWriteAllowed({ authUid: 'A', targetUid: 'A', nextData: null, profile: validPublicProfile }), true, 'offline/remove permitido ao dono')
assert.equal(publicAvailabilityWriteAllowed({ authUid: 'A', targetUid: 'A', nextData: null, profile: validPublicProfile }), true, 'onDisconnect.remove permitido ao dono')
assert.equal(publicAvailabilityWriteAllowed({ authUid: 'B', targetUid: 'A', nextData: publicPayload, profile: validPublicProfile }), false, 'terceiro nao grava UID alheio')
assert.equal(publicAvailabilityWriteAllowed({ authUid: 'B', targetUid: 'A', nextData: null, profile: validPublicProfile }), false, 'terceiro nao remove UID alheio')

const mapSource = await readFile(new URL('../src/components/Mapadinamico.jsx', import.meta.url), 'utf8')
const onlineSource = await readFile(new URL('../src/components/UsuariosOnline.js', import.meta.url), 'utf8')
const presenceSource = await readFile(new URL('../src/lib/presence.js', import.meta.url), 'utf8')
const publicProfileSource = await readFile(new URL('../src/lib/publicWorkProfile.js', import.meta.url), 'utf8')
const legacyAccountSource = await readFile(new URL('../src/lib/legacyAccountState.js', import.meta.url), 'utf8')
const legacyAccountUrl = `data:text/javascript;base64,${Buffer.from(legacyAccountSource).toString('base64')}`
const testablePublicProfileSource = publicProfileSource
  .replace(/^import \{ getCanonicalCategoryId, getCategoryById \} from .*$/m, `
    const getCanonicalCategoryId = (value) => String(value || '').trim()
    const getCategoryById = (id) => ['servicos_gerais', 'eletrica'].includes(id) ? { id, label: id } : null
  `)
  .replace(/^import \{ findProfessionById, sanitizeCustomProfession \} from .*$/m, `
    const findProfessionById = () => null
    const sanitizeCustomProfession = (value) => String(value || '').trim()
  `)
  .replace(
    /^import \{ resolveLegacyAccountState \} from .*$/m,
    `import { resolveLegacyAccountState } from '${legacyAccountUrl}'`,
  )
  .replace(/^import \{ getPublicAvailabilityLocation, PUBLIC_AVAILABILITY_TTL_MS \} from .*$/m, `
    const getPublicAvailabilityLocation = () => null
    const PUBLIC_AVAILABILITY_TTL_MS = 60000
  `)
const publicProfileHelper = await import(
  `data:text/javascript;base64,${Buffer.from(testablePublicProfileSource).toString('base64')}`
)
const legacyOwnerProfile = {
  uid: 'OLD',
  visivel: true,
  privacy: { profileVisible: true, showOnlineStatus: true },
  profile: {
    nome: 'Conta Antiga',
    tipoContaInicial: 'corre',
    cidade: 'Cidade Teste',
    bairro: 'Centro',
    corre: { ativo: true, categorias: ['servicos_gerais'], regiao: 'Centro' },
  },
}
const legacyNormalization = publicProfileHelper.getOwnPublicAvailabilityProfileNormalization({}, {
  uid: 'OLD',
  ownerProfile: legacyOwnerProfile,
  now: 1_700_000_000_000,
})
assert.equal(legacyNormalization.required, true, 'perfil antigo legitimo e normalizado a partir do proprio users/{uid}')
assert.equal(legacyNormalization.patch.isCorre, true)
assert.equal(legacyNormalization.patch.isProfissional, false)
assert.equal(legacyNormalization.patch.profileVisible, true)
assert.equal(legacyNormalization.patch.visivel, true)
assert.equal(legacyNormalization.patch.showOnlineStatus, true)
assert.equal(legacyNormalization.patch.nome, 'Conta Antiga')
assert.equal(legacyNormalization.patch.primaryCategoryId, 'servicos_gerais')
assert.equal(legacyNormalization.patch.cidade, 'Cidade Teste')
for (const [patch, reason] of [
  [{ isCorre: false }, 'canonical_work_role_disabled'],
  [{ visivel: false }, 'visivel_false'],
  [{ profileVisible: false }, 'profile_visible_false'],
  [{ privacy: { profileVisible: true, showOnlineStatus: false } }, 'show_online_status_false'],
]) {
  const result = publicProfileHelper.getOwnPublicAvailabilityProfileNormalization({}, {
    uid: 'OLD',
    ownerProfile: { ...legacyOwnerProfile, ...patch },
    now: 1_700_000_000_000,
  })
  assert.equal(result.required, false, `${reason} nao e sobrescrito pela normalizacao`)
  assert.equal(result.reason, reason)
}
assert.doesNotMatch(mapSource, /ref\(database, ['"]presence['"]\)/)
assert.doesNotMatch(onlineSource, /ref\(database, ['"]presence['"]\)/)
assert.match(mapSource, /ref\(database, 'publicAvailability'\)/)
assert.match(onlineSource, /ref\(database, 'publicAvailability'\)/)
assert.match(mapSource, /ref\(database, `publicProfiles\/\$\{meuId\}`\)/, 'perfil proprio nao depende da janela global de 300')
assert.match(mapSource, /get\(ref\(database, `publicProfiles\/\$\{uid\}`\)\)/, 'perfil de cada disponibilidade ausente e buscado uma vez')
assert.match(mapSource, /getOwnPublicAvailabilityProfileNormalization/, 'perfil legado proprio e normalizado antes de publicar')
assert.match(mapSource, /getOwnPublicAvailabilityProfileNormalization\(ownAvailabilityProfile \|\| \{\}/, 'normalizacao tambem roda quando a projecao publica ainda nao existe')
assert.match(mapSource, /getOwnPublicAvailabilityProfileNormalization\(current \|\| \{\}/, 'transacao pode criar a projecao sanitizada do proprio perfil legado')
assert.match(mapSource, /console\.log\('\[PUBLIC_AVAILABILITY\]'/, 'motivo seguro de elegibilidade e logado em development')
assert.match(presenceSource, /ONLINE_TTL_MS = PUBLIC_AVAILABILITY_TTL_MS/, 'filtro visual usa o mesmo TTL publico')
assert.ok(
  presenceSource.indexOf('const usuariosOnlineLista') < presenceSource.indexOf('const usuariosOnlineMapa'),
  'sem grid permanece na lista antes do filtro exclusivo do mapa'
)
assert.match(presenceSource, /usuariosOnlineLista\.filter\(hasValidUserLocation\)/, 'com grid valido recebe marcador no mapa')
for (const alias of [
  'profileType', 'workProfileType', 'tipoPerfilPublico', 'tipoTrabalho', 'tipoConta',
  'tipoContaInicial', 'isProf', 'corre.ativo', 'profissional.ativo',
]) {
  assert.match(publicProfileSource, new RegExp(`['"]${alias.replace('.', '\\\.')}['"]`), `alias legado ${alias} inventariado`)
}
assert.match(publicProfileSource, /showOnlineStatus: true/, 'novo perfil de trabalho nasce com preferencia online canonica')

console.log('C2 estatico: matriz A/B/C, enumeracao e grade publica aproximada OK')
