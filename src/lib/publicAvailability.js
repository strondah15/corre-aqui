export const PUBLIC_LOCATION_GRID_SCALE = 100

export function canPublishPublicAvailability({
  mode,
  available,
  onlinePreference,
  showOnlineStatus,
  publicProfileReady,
} = {}) {
  return (
    mode === 'corre' &&
    available === true &&
    onlinePreference === true &&
    showOnlineStatus !== false &&
    publicProfileReady === true
  )
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
