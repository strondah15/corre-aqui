import {
  getProfessionalServicePhotoUrls,
  isSafeProfessionalServicePhotoUrl,
} from './professionalServiceModel.js'

export const PROFESSIONAL_SERVICE_PHOTO_STATUS = Object.freeze({
  PREVIEW: 'preview',
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  FAILED: 'failed',
})

export function createProfessionalServiceDraft(service = {}, defaults = {}) {
  return {
    id: String(service?.id || ''),
    revision: Number.isSafeInteger(Number(service?.revision)) ? Number(service.revision) : 0,
    nome: String(service?.nome || ''),
    categoriaId: String(service?.categoriaId || ''),
    categoriaNome: String(service?.categoriaNome || ''),
    faixaPreco: String(service?.faixaPreco || ''),
    descricao: String(service?.descricao || ''),
    tempoMedio: String(service?.tempoMedio || ''),
    regiao: String(service?.regiao || defaults.regiao || ''),
    atendeDomicilio: service?.atendeDomicilio !== false,
    urgente: service?.urgente === true,
    ativo: service?.ativo !== false,
  }
}

export function createUploadedPhotoEntries(service = {}) {
  return getProfessionalServicePhotoUrls(service).slice(0, 5).map((url, index) => ({
    key: `remote_${index}_${url}`,
    previewUrl: url,
    url,
    status: PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADED,
    progress: 100,
    errorCode: '',
    file: null,
    local: false,
  }))
}

export function getProfessionalServiceFormIssue({ draft, photos = [], submitting = false } = {}) {
  if (submitting) return 'professional_service_submitting'
  if (!String(draft?.nome || '').trim()) return 'professional_service_name_required'
  if (!String(draft?.categoriaId || '').trim() || !String(draft?.categoriaNome || '').trim()) {
    return 'professional_service_category_required'
  }
  if (!String(draft?.faixaPreco || '').trim()) return 'professional_service_price_required'
  if (photos.length > 5) return 'professional_service_photos_limit_exceeded'

  for (const photo of photos) {
    if (photo?.status === PROFESSIONAL_SERVICE_PHOTO_STATUS.FAILED) return 'professional_service_photo_failed'
    if (
      photo?.status === PROFESSIONAL_SERVICE_PHOTO_STATUS.PREVIEW
      || photo?.status === PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADING
    ) {
      return 'professional_service_photo_uploading'
    }
    if (
      photo?.status !== PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADED
      || !isSafeProfessionalServicePhotoUrl(photo?.url)
    ) {
      return 'professional_service_photo_invalid'
    }
  }
  return ''
}

export function getProfessionalServiceFormIssueMessage(code) {
  const messages = {
    professional_service_submitting: 'Aguarde o salvamento terminar.',
    professional_service_name_required: 'Informe o nome do serviço.',
    professional_service_category_required: 'Escolha uma categoria.',
    professional_service_price_required: 'Informe o preço ou a faixa de preço.',
    professional_service_photos_limit_exceeded: 'Você pode adicionar no máximo cinco fotos.',
    professional_service_photo_failed: 'Remova a foto com falha ou tente enviá-la novamente.',
    professional_service_photo_uploading: 'Aguarde o envio das fotos terminar.',
    professional_service_photo_invalid: 'Uma foto ainda não foi enviada com segurança.',
  }
  return messages[code] || ''
}

export function buildProfessionalServicePayload(draft = {}, photos = []) {
  const urls = photos
    .filter((photo) => photo?.status === PROFESSIONAL_SERVICE_PHOTO_STATUS.UPLOADED)
    .map((photo) => String(photo?.url || '').trim())
    .filter(isSafeProfessionalServicePhotoUrl)
    .slice(0, 5)

  return {
    nome: String(draft.nome || '').trim(),
    descricao: String(draft.descricao || '').trim(),
    categoriaId: String(draft.categoriaId || '').trim(),
    categoriaNome: String(draft.categoriaNome || '').trim(),
    faixaPreco: String(draft.faixaPreco || '').trim(),
    tempoMedio: String(draft.tempoMedio || '').trim(),
    regiao: String(draft.regiao || '').trim(),
    atendeDomicilio: draft.atendeDomicilio !== false,
    urgente: draft.urgente === true,
    ativo: draft.ativo !== false,
    fotos: Object.fromEntries(urls.map((url, index) => [String(index), url])),
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

export function professionalServiceOperationFingerprint({ action, serviceId = '', revision = 0, payload = null }) {
  return JSON.stringify(stableValue({ action, serviceId, revision, payload }))
}

export function getPortfolioPhotoUploadMessage(error) {
  const code = String(error?.code || error?.message || '')
  if (code === 'imgbb_request_timeout') return 'A foto demorou para enviar. Tente novamente.'
  if (code === 'imgbb_request_aborted') return 'O envio da foto foi interrompido. Tente novamente.'
  if (code === 'imgbb_config_missing') return 'O envio de fotos não está configurado neste ambiente.'
  if (code === 'firebase_admin_not_configured') return 'O envio seguro de fotos está temporariamente indisponível.'
  if (code === 'portfolio_format_not_supported' || code === 'portfolio_image_decode_failed') {
    return 'Este formato não pôde ser lido. Escolha JPEG, PNG, WebP, HEIC ou HEIF.'
  }
  if (
    code === 'portfolio_source_too_large'
    || code === 'portfolio_dimensions_too_large'
    || code === 'portfolio_original_too_large'
    || code === 'foto_grande'
  ) return 'A imagem é muito grande. Escolha uma foto menor.'
  if (code === 'tipo_invalido') return 'Escolha uma imagem JPEG, PNG, WebP, GIF, HEIC ou HEIF.'
  if (/auth|permission/i.test(code)) return 'Sua sessão expirou. Entre novamente para anexar a foto.'
  return 'Não foi possível enviar a foto. Tente novamente.'
}

export function countLegacyPortfolioServices(value) {
  if (Array.isArray(value)) return value.filter(Boolean).length
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean).length
  return 0
}
