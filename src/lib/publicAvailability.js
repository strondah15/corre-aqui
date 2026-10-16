export const PUBLIC_LOCATION_GRID_SCALE = 100
export const PUBLIC_AVAILABILITY_HEARTBEAT_MS = 15_000
export const PUBLIC_AVAILABILITY_TTL_MS = 60_000

export function getPublicAvailabilityEligibility({
  mode,
  available,
  onlinePreference,
  publicProfile,
  publicProfileReady,
} = {}) {
  if (mode !== 'corre') return { allowed: false, reason: 'mode_not_corre' }
  if (available !== true) return { allowed: false, reason: 'availability_disabled' }
  if (onlinePreference !== true) return { allowed: false, reason: 'online_preference_disabled' }
  if (!publicProfile || typeof publicProfile !== 'object') {
    return { allowed: false, reason: 'public_profile_missing' }
  }
  if (publicProfileReady !== true) return { allowed: false, reason: 'public_profile_not_ready' }
  if (publicProfile.profileVisible === false) return { allowed: false, reason: 'profile_visible_false' }
  if (publicProfile.visivel === false) return { allowed: false, reason: 'visivel_false' }
  if (publicProfile.showOnlineStatus === false) return { allowed: false, reason: 'show_online_status_false' }
  if (publicProfile.isCorre !== true && publicProfile.isProfissional !== true) {
    return { allowed: false, reason: 'public_work_role_missing' }
  }

  return { allowed: true, reason: 'allowed' }
}

export function canPublishPublicAvailability({
  mode,
  available,
  onlinePreference,
  publicProfile,
  publicProfileReady,
} = {}) {
  return getPublicAvailabilityEligibility({
    mode,
    available,
    onlinePreference,
    publicProfile,
    publicProfileReady,
  }).allowed
}

export function describePublicAvailabilityEligibility({
  uid,
  eligibility,
  mode,
  available,
  onlinePreference,
  publicProfile,
} = {}) {
  const booleanOrNull = (value) => (typeof value === 'boolean' ? value : null)

  return {
    uid: String(uid || ''),
    eligible: eligibility?.allowed === true,
    reason: String(eligibility?.reason || 'unknown'),
    modoAtual: String(mode || ''),
    isCorre: booleanOrNull(publicProfile?.isCorre),
    isProfissional: booleanOrNull(publicProfile?.isProfissional),
    profileVisible: booleanOrNull(publicProfile?.profileVisible),
    visivel: booleanOrNull(publicProfile?.visivel),
    showOnlineStatus: booleanOrNull(publicProfile?.showOnlineStatus),
    onlinePreference: onlinePreference === true,
    availabilityToggle: available === true,
  }
}

export function toPublicAvailabilityGrid(location) {
  const lat = Number(location?.lat)
  const lng = Number(location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

  return {
    gridLat: Math.round(lat * PUBLIC_LOCATION_GRID_SCALE),
    gridLng: Math.round(lng * PUBLIC_LOCATION_GRID_SCALE),
  }
}

export function buildPublicAvailabilityPayload({ uid, location, now = Date.now() } = {}) {
  const safeUid = String(uid || '').trim()
  const safeNow = Number(now)
  if (!safeUid) throw new TypeError('publicAvailability exige uid')
  if (!Number.isFinite(safeNow)) throw new TypeError('publicAvailability exige timestamp numerico')

  return {
    uid: safeUid,
    id: safeUid,
    online: true,
    disponivel: true,
    lastSeen: safeNow,
    updatedAt: safeNow,
    modoAtual: 'corre',
    showOnlineStatus: true,
    ...(toPublicAvailabilityGrid(location) || {}),
  }
}

export function describePublicAvailabilityPayload(payload = {}) {
  const describe = (field) => ({
    type: typeof payload[field],
    ...(typeof payload[field] === 'boolean' ? { value: payload[field] } : {}),
    ...(field === 'modoAtual' ? { value: payload[field] } : {}),
    ...(['lastSeen', 'updatedAt'].includes(field) ? { numeric: Number.isFinite(payload[field]) } : {}),
    ...(['gridLat', 'gridLng'].includes(field) ? { integer: Number.isInteger(payload[field]) } : {}),
  })

  return Object.fromEntries(Object.keys(payload).map((field) => [field, describe(field)]))
}

export function getPublicAvailabilityLocation(availability = {}) {
  const gridLat = Number(availability?.gridLat)
  const gridLng = Number(availability?.gridLng)
  if (!Number.isInteger(gridLat) || !Number.isInteger(gridLng)) return null
  if (gridLat < -9000 || gridLat > 9000 || gridLng < -18000 || gridLng > 18000) return null

  return {
    lat: gridLat / PUBLIC_LOCATION_GRID_SCALE,
    lng: gridLng / PUBLIC_LOCATION_GRID_SCALE,
  }
}
