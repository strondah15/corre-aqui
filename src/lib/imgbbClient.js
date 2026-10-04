const IMGBB_MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024
const IMGBB_MAX_SOURCE_PHOTO_BYTES = 8 * 1024 * 1024
const PROFILE_PHOTO_MAX_SIDE = 1280
const PROFILE_PHOTO_QUALITY = 0.82

export const PORTFOLIO_IMAGE_LIMITS = Object.freeze({
  maxSourceBytes: 8 * 1024 * 1024,
  maxUploadBytes: 2 * 1024 * 1024,
  maxSourcePixels: 24_000_000,
  maxSide: 1280,
  quality: 0.82,
  retryQuality: 0.74,
})

const PORTFOLIO_COMMON_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const PORTFOLIO_PRESERVE_TYPES = new Set(['image/gif', 'image/heic', 'image/heif'])

function imageError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function portfolioMime(file) {
  const type = String(file?.type || '').trim().toLowerCase()
  if (type === 'image/jpg') return 'image/jpeg'
  if (type) return type

  const extension = String(file?.name || '').split('.').pop()?.toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'gif') return 'image/gif'
  if (extension === 'heic') return 'image/heic'
  if (extension === 'heif') return 'image/heif'
  return ''
}

export function getPortfolioTargetDimensions(width, height, maxSide = PORTFOLIO_IMAGE_LIMITS.maxSide) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 0))
  const safeHeight = Math.max(1, Math.round(Number(height) || 0))
  const scale = Math.min(1, maxSide / Math.max(safeWidth, safeHeight))
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
    scale,
  }
}

function canCompressImage(file) {
  const type = String(file?.type || '').toLowerCase()
  return typeof window !== 'undefined' && /^image\/(png|jpe?g|webp)$/.test(type)
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image_load_failed'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('image_compress_failed'))
      },
      type,
      quality
    )
  })
}

function loadPortfolioImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({
        source: image,
        width: Number(image.naturalWidth || image.width || 0),
        height: Number(image.naturalHeight || image.height || 0),
        release: () => {
          image.src = ''
        },
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(imageError('portfolio_image_decode_failed'))
    }
    image.src = url
  })
}

async function decodePortfolioImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
        premultiplyAlpha: 'default',
        colorSpaceConversion: 'default',
      })
      return {
        source: bitmap,
        width: Number(bitmap.width || 0),
        height: Number(bitmap.height || 0),
        release: () => bitmap.close?.(),
      }
    } catch {
      throw imageError('portfolio_image_decode_failed')
    }
  }

  return loadPortfolioImageElement(file)
}

function canvasHasTransparency(context, width, height) {
  try {
    const pixels = context.getImageData(0, 0, width, height).data
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] < 255) return true
    }
    return false
  } catch {
    return true
  }
}

function portfolioFileName(file, outputType) {
  const extension = outputType === 'image/webp' ? 'webp' : outputType === 'image/png' ? 'png' : 'jpg'
  const baseName = String(file?.name || 'portfolio').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'portfolio'
  return `${baseName}.${extension}`
}

function portfolioMetrics({ file, info, outputFile, width, height, usedOriginal, reason, metadataRemoved }) {
  const originalBytes = Number(file?.size || 0)
  const optimizedBytes = Number(outputFile?.size || 0)
  return {
    original: {
      width: info.width || null,
      height: info.height || null,
      bytes: originalBytes,
      type: info.type || String(file?.type || ''),
    },
    optimized: {
      width: width || info.width || null,
      height: height || info.height || null,
      bytes: optimizedBytes,
      type: String(outputFile?.type || info.type || ''),
    },
    reductionPercent: originalBytes > 0
      ? Math.round((1 - optimizedBytes / originalBytes) * 1000) / 10
      : 0,
    usedOriginal,
    reason,
    metadataRemoved,
  }
}

function normalizeOriginalPortfolioFile(file, type) {
  if (String(file?.type || '').toLowerCase() === type) return file
  return new File([file], file.name || 'portfolio', {
    type,
    lastModified: Number(file?.lastModified || Date.now()),
  })
}

function originalPortfolioResult(file, info, reason) {
  if (Number(file?.size || 0) > PORTFOLIO_IMAGE_LIMITS.maxUploadBytes) {
    throw imageError('portfolio_original_too_large')
  }
  const outputFile = normalizeOriginalPortfolioFile(file, info.type)
  return {
    file: outputFile,
    metrics: portfolioMetrics({
      file,
      info,
      outputFile,
      width: info.width,
      height: info.height,
      usedOriginal: true,
      reason,
      metadataRemoved: false,
    }),
  }
}

export async function optimizePortfolioPhoto(file) {
  const type = portfolioMime(file)
  if (!file || (!PORTFOLIO_COMMON_TYPES.has(type) && !PORTFOLIO_PRESERVE_TYPES.has(type))) {
    throw imageError('tipo_invalido')
  }
  if (Number(file.size || 0) > PORTFOLIO_IMAGE_LIMITS.maxSourceBytes) {
    throw imageError('portfolio_source_too_large')
  }

  const info = { type, width: 0, height: 0 }

  if (PORTFOLIO_PRESERVE_TYPES.has(type)) {
    return originalPortfolioResult(file, info, type === 'image/gif' ? 'animated_original' : 'unsupported_original')
  }

  if (typeof document === 'undefined') return originalPortfolioResult(file, info, 'browser_canvas_unavailable')

  let decoded = null
  let canvas = null
  try {
    decoded = await decodePortfolioImage(file)
    info.width = decoded.width
    info.height = decoded.height
    if (!info.width || !info.height) throw imageError('portfolio_image_decode_failed')
    if (info.width * info.height > PORTFOLIO_IMAGE_LIMITS.maxSourcePixels) {
      throw imageError('portfolio_dimensions_too_large')
    }
    const target = getPortfolioTargetDimensions(decoded.width, decoded.height)
    canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: type === 'image/png' })
    if (!context) throw imageError('portfolio_canvas_unavailable')
    context.drawImage(decoded.source, 0, 0, target.width, target.height)

    const hasTransparency = type === 'image/png'
      ? canvasHasTransparency(context, target.width, target.height)
      : false
    let outputType = 'image/webp'
    let blob = await canvasToBlob(canvas, outputType, PORTFOLIO_IMAGE_LIMITS.quality)
    if (String(blob.type || '').toLowerCase() !== 'image/webp') {
      outputType = type === 'image/png' && hasTransparency ? 'image/png' : 'image/jpeg'
      blob = await canvasToBlob(canvas, outputType, PORTFOLIO_IMAGE_LIMITS.quality)
    }
    if (String(blob.type || '').toLowerCase() !== outputType) throw imageError('portfolio_encode_failed')
    if (blob.size > PORTFOLIO_IMAGE_LIMITS.maxUploadBytes && outputType !== 'image/png') {
      blob = await canvasToBlob(canvas, outputType, PORTFOLIO_IMAGE_LIMITS.retryQuality)
      if (String(blob.type || '').toLowerCase() !== outputType) throw imageError('portfolio_encode_failed')
    }

    const optimizedFile = new File([blob], portfolioFileName(file, outputType), {
      type: outputType,
      lastModified: Date.now(),
    })
    if (optimizedFile.size > PORTFOLIO_IMAGE_LIMITS.maxUploadBytes) {
      return originalPortfolioResult(file, info, 'optimized_too_large')
    }

    if (optimizedFile.size >= file.size && file.size <= PORTFOLIO_IMAGE_LIMITS.maxUploadBytes) {
      return originalPortfolioResult(file, info, 'original_smaller')
    }
    return {
      file: optimizedFile,
      metrics: portfolioMetrics({
        file,
        info,
        outputFile: optimizedFile,
        width: target.width,
        height: target.height,
        usedOriginal: false,
        reason: 'optimized',
        metadataRemoved: true,
      }),
    }
  } catch (error) {
    if (String(error?.code || error?.message || '').includes('too_large')) throw error
    return originalPortfolioResult(file, info, 'optimization_failed')
  } finally {
    decoded?.release?.()
    if (canvas) {
      const context = canvas.getContext('2d')
      context?.clearRect?.(0, 0, canvas.width, canvas.height)
      canvas.width = 1
      canvas.height = 1
    }
  }
}

async function compressProfilePhoto(file) {
  if (!canCompressImage(file)) return file

  const img = await loadImageFromFile(file)
  const width = Number(img.naturalWidth || img.width || 0)
  const height = Number(img.naturalHeight || img.height || 0)
  if (!width || !height) return file

  const scale = Math.min(1, PROFILE_PHOTO_MAX_SIDE / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

  const outputType = file.type === 'image/png' ? 'image/jpeg' : file.type || 'image/jpeg'
  const blob = await canvasToBlob(canvas, outputType, PROFILE_PHOTO_QUALITY)
  if (!blob || blob.size >= file.size) return file

  const ext = outputType.includes('webp') ? 'webp' : outputType.includes('png') ? 'png' : 'jpg'
  const baseName = String(file.name || 'avatar').replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.${ext}`, { type: outputType })
}

function normalizeUploadResponse(data, status = 200) {
  if (data?.ok === false) {
    const error = new Error(data?.message || data?.reason || `imgbb_http_${status}`)
    error.code = data?.reason || 'imgbb_upload_failed'
    throw error
  }

  const url = data?.url || data?.displayUrl
  if (!url) throw new Error('imgbb_url_missing')

  return {
    url,
    displayUrl: data.displayUrl || url,
    imageId: data.imageId || '',
    width: data.width || null,
    height: data.height || null,
  }
}

function uploadWithProgress(form, { idToken, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.open('POST', '/api/upload/profile-photo')
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const percent = Math.round((event.loaded / event.total) * 68) + 8
      onProgress?.(Math.max(8, Math.min(76, percent)))
    }

    xhr.onload = () => {
      let data = {}
      try {
        data = JSON.parse(xhr.responseText || '{}')
      } catch {}

      if (xhr.status < 200 || xhr.status >= 300 || data?.ok === false) {
        const error = new Error(data?.message || data?.reason || `imgbb_http_${xhr.status}`)
        error.code = data?.reason || 'imgbb_upload_failed'
        reject(error)
        return
      }

      try {
        onProgress?.(88)
        resolve(normalizeUploadResponse(data, xhr.status))
      } catch (error) {
        reject(error)
      }
    }

    xhr.onerror = () => {
      const error = new Error('imgbb_network_error')
      error.code = 'imgbb_upload_failed'
      reject(error)
    }

    onProgress?.(8)
    xhr.send(form)
  })
}

export async function uploadProfilePhotoToImgBB(file, { uid, idToken, onProgress, skipCompression = false } = {}) {
  if (!uid) throw new Error('auth_missing')
  if (!idToken) throw new Error('auth_missing')
  if (!file?.type?.startsWith('image/')) throw new Error('tipo_invalido')
  if (file.size > IMGBB_MAX_SOURCE_PHOTO_BYTES) throw new Error('foto_grande')

  onProgress?.(4)
  const uploadFile = skipCompression ? file : await compressProfilePhoto(file).catch(() => file)
  if (uploadFile.size > IMGBB_MAX_PROFILE_PHOTO_BYTES) throw new Error('foto_grande')

  const form = new FormData()
  form.append('uid', uid)
  form.append('image', uploadFile)

  if (typeof XMLHttpRequest !== 'undefined') {
    return uploadWithProgress(form, { idToken, onProgress })
  }

  onProgress?.(12)
  const response = await fetch('/api/upload/profile-photo', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    body: form,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok || data?.ok === false) {
    const error = new Error(data?.message || data?.reason || `imgbb_http_${response.status}`)
    error.code = data?.reason || 'imgbb_upload_failed'
    throw error
  }

  onProgress?.(88)
  return normalizeUploadResponse(data, response.status)
}

export function uploadPortfolioPhotoToImgBB(file, options = {}) {
  return uploadProfilePhotoToImgBB(file, { ...options, skipCompression: true })
}
