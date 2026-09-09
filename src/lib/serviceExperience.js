import { ATENDIMENTO_STATUS, normalizeAtendimentoStatus } from '@/lib/atendimento'
import { getAuthorizedPhoneContact, sanitizePhoneDigits } from '@/lib/serviceContactPolicy'

const PHONE_ENABLED_STATUSES = new Set([
  ATENDIMENTO_STATUS.ACEITO,
  ATENDIMENTO_STATUS.EM_ANDAMENTO,
  ATENDIMENTO_STATUS.A_CAMINHO,
  ATENDIMENTO_STATUS.CHEGOU,
  ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO,
  'agendado',
])

export { sanitizePhoneDigits }

export function getAuthorizedPhoneHref({ publicProfile, serviceContact, pedidoStatus, isParticipant }) {
  if (!PHONE_ENABLED_STATUSES.has(normalizeAtendimentoStatus(pedidoStatus))) return ''
  return getAuthorizedPhoneContact({
    publicProfile,
    serviceContact,
    pedidoStatus,
    isParticipant,
  }).href
}

export function getPrimaryAttendanceAction({ status, isClient, isWorker, hasRating = false }) {
  const normalized = normalizeAtendimentoStatus(status)

  if (isWorker && normalized === ATENDIMENTO_STATUS.EM_ANDAMENTO) {
    return { id: 'en_route', label: 'Estou a caminho', nextStatus: ATENDIMENTO_STATUS.A_CAMINHO, confirm: true }
  }
  if (isWorker && normalized === ATENDIMENTO_STATUS.A_CAMINHO) {
    return { id: 'arrived', label: 'Cheguei', nextStatus: ATENDIMENTO_STATUS.CHEGOU }
  }
  if (isWorker && normalized === ATENDIMENTO_STATUS.CHEGOU) {
    return { id: 'request_completion', label: 'Solicitar conclusão', nextStatus: ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO, confirm: true }
  }
  if (isClient && normalized === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) {
    return { id: 'confirm_completion', label: 'Confirmar serviço', nextStatus: ATENDIMENTO_STATUS.FINALIZADO, clientDecision: true }
  }
  if (isClient && normalized === ATENDIMENTO_STATUS.FINALIZADO && !hasRating) {
    return { id: 'rate', label: 'Avaliar atendimento' }
  }
  return null
}
