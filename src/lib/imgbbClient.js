const IMGBB_MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024

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

export async function uploadProfilePhotoToImgBB(file, { uid, idToken, onProgress } = {}) {
  if (!uid) throw new Error('auth_missing')
  if (!idToken) throw new Error('auth_missing')
  if (!file?.type?.startsWith('image/')) throw new Error('tipo_invalido')
  if (file.size > IMGBB_MAX_PROFILE_PHOTO_BYTES) throw new Error('foto_grande')

  const form = new FormData()
  form.append('uid', uid)
  form.append('image', file)

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
