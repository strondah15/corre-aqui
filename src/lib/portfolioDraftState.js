export const PORTFOLIO_PHOTO_STATUS = Object.freeze({
  PREVIEW: 'preview',
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  FAILED: 'failed',
})

const KNOWN_PHOTO_STATUSES = new Set(Object.values(PORTFOLIO_PHOTO_STATUS))

export function isLocalPortfolioPreview(value) {
  return String(value || '').trim().toLowerCase().startsWith('blob:')
}

export function getPortfolioPhotoStatus(value, photoStates = {}) {
  const url = String(value || '').trim()
  const explicitStatus = String(photoStates?.[url]?.status || '')
  if (KNOWN_PHOTO_STATUSES.has(explicitStatus)) return explicitStatus
  return isLocalPortfolioPreview(url)
    ? PORTFOLIO_PHOTO_STATUS.PREVIEW
    : PORTFOLIO_PHOTO_STATUS.UPLOADED
}

export function getPortfolioSaveBlocker({
  name,
  photos = [],
  photoStates = {},
  uploadInProgress = false,
} = {}) {
  if (uploadInProgress) return 'portfolio_photo_uploading'
  if (!String(name || '').trim()) return 'portfolio_name_required'

  for (const photo of photos) {
    const status = getPortfolioPhotoStatus(photo, photoStates)
    if (status === PORTFOLIO_PHOTO_STATUS.FAILED) return 'portfolio_photo_failed'
    if (
      status === PORTFOLIO_PHOTO_STATUS.PREVIEW ||
      status === PORTFOLIO_PHOTO_STATUS.UPLOADING ||
      isLocalPortfolioPreview(photo)
    ) {
      return 'portfolio_photo_uploading'
    }
  }

  return ''
}

export function withoutLocalPortfolioPreviews(photos = []) {
  return Array.from(new Set(
    photos
      .map((photo) => String(photo || '').trim())
      .filter((photo) => photo && !isLocalPortfolioPreview(photo)),
  )).slice(0, 5)
}
