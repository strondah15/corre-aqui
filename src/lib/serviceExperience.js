import { ATENDIMENTO_STATUS, normalizeAtendimentoStatus } from '@/lib/atendimento'

const PHONE_ENABLED_STATUSES = new Set([
  ATENDIMENTO_STATUS.ACEITO,
  ATENDIMENTO_STATUS.EM_ANDAMENTO,
  ATENDIMENTO_STATUS.CHEGOU,
  ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO,
  'agendado',
])

export function sanitizePhoneDigits(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length >= 12 && digits.length <= 15 ? digits : ''
}

export function getAuthorizedPhoneHref({ publicProfile, pedidoStatus, isParticipant }) {
  if (!isParticipant || publicProfile?.allowPublicContact !== true) return ''
  if (!PHONE_ENABLED_STATUSES.has(normalizeAtendimentoStatus(pedidoStatus))) return ''

  const digits = sanitizePhoneDigits(
    publicProfile?.profWhats || publicProfile?.profissional?.whatsapp,
  )
  return digits ? `tel:+${digits}` : ''
}

export function getPrimaryAttendanceAction({ status, isClient, isWorker, hasRating = false }) {
  const normalized = normalizeAtendimentoStatus(status)

  if (isWorker && normalized === ATENDIMENTO_STATUS.ACEITO) {
    return { id: 'start', label: 'Estou a caminho', nextStatus: ATENDIMENTO_STATUS.EM_ANDAMENTO }
  }
  if (isWorker && normalized === ATENDIMENTO_STATUS.EM_ANDAMENTO) {
    return { id: 'arrived', label: 'Cheguei ao local', nextStatus: ATENDIMENTO_STATUS.CHEGOU }
  }
  if (isWorker && normalized === ATENDIMENTO_STATUS.CHEGOU) {
    return { id: 'request_completion', label: 'Finalizar serviço', nextStatus: ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO, confirm: true }
  }
  if (isClient && normalized === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) {
    return { id: 'confirm_completion', label: 'Confirmar conclusão', nextStatus: ATENDIMENTO_STATUS.FINALIZADO, clientDecision: true }
  }
  if (isClient && normalized === ATENDIMENTO_STATUS.FINALIZADO && !hasRating) {
    return { id: 'rate', label: 'Avaliar atendimento' }
  }
  return null
}
