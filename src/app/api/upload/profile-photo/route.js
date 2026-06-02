import { NextResponse } from 'next/server'
import { getFirebaseAdminAuth, isFirebaseAdminConfigured } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024

function jsonError(reason, status = 400, message = '') {
  return NextResponse.json({ ok: false, reason, message: message || reason }, { status })
}

function safeImageName(uid) {
  const safeUid = String(uid || 'user').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
  return `corre-aqui-profile-${safeUid}-${Date.now()}`
}

export async function POST(request) {
  const apiKey = String(process.env.IMGBB_API_KEY || process.env.NEXT_PUBLIC_IMGBB_API_KEY || '').trim()
  if (!apiKey) {
    return jsonError('imgbb_config_missing', 500, 'IMGBB_API_KEY nao esta configurada no servidor.')
  }

  if (!isFirebaseAdminConfigured()) {
    return jsonError('firebase_admin_not_configured', 500, 'Firebase Admin nao esta configurado no servidor.')
  }

  const authorization = request.headers.get('authorization') || ''
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!idToken) return jsonError('missing_auth_token', 401, 'Entre novamente para enviar a foto.')

  let formData
  try {
    formData = await request.formData()
  } catch {
    return jsonError('invalid_form_data', 400, 'Arquivo de imagem invalido.')
  }

  const uid = String(formData.get('uid') || '').trim()
  const image = formData.get('image')

  if (!uid) return jsonError('missing_uid', 400, 'Usuario nao informado.')
  if (!image || typeof image === 'string' || typeof image.arrayBuffer !== 'function') {
    return jsonError('missing_image', 400, 'Escolha uma imagem.')
  }
  if (!String(image.type || '').startsWith('image/')) {
    return jsonError('tipo_invalido', 400, 'Escolha um arquivo de imagem.')
  }
  if (Number(image.size || 0) > MAX_PROFILE_PHOTO_BYTES) {
    return jsonError('foto_grande', 413, 'Escolha uma imagem de ate 2 MB.')
  }

  let decoded
  try {
    decoded = await getFirebaseAdminAuth().verifyIdToken(idToken)
  } catch {
    return jsonError('invalid_auth_token', 401, 'Sessao expirada. Entre novamente.')
  }

  if (String(decoded.uid || '') !== uid) {
    return jsonError('forbidden_uid', 403, 'Sessao diferente do perfil aberto.')
  }

  const imgbbForm = new FormData()
  imgbbForm.append('image', image, image.name || 'avatar.jpg')
  imgbbForm.append('name', safeImageName(uid))

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    body: imgbbForm,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.success) {
    const message = data?.error?.message || data?.error?.code || `imgbb_http_${response.status}`
    return jsonError('imgbb_upload_failed', 502, String(message))
  }

  const uploaded = data.data || {}
  const url = uploaded.display_url || uploaded.url
  if (!url) return jsonError('imgbb_url_missing', 502, 'ImgBB nao retornou URL da imagem.')

  return NextResponse.json({
    ok: true,
    url,
    displayUrl: uploaded.display_url || url,
    imageId: uploaded.id || '',
    width: uploaded.width || null,
    height: uploaded.height || null,
  })
}
