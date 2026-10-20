export const ATENDIMENTO_STATUS = Object.freeze({
  ABERTO: 'aberto',
  ACEITO: 'aceito',
  EM_ANDAMENTO: 'em_andamento',
  A_CAMINHO: 'a_caminho',
  CHEGOU: 'chegou',
  AGUARDANDO_CONFIRMACAO: 'aguardando_confirmacao',
  FINALIZADO: 'finalizado',
  CANCELADO: 'cancelado',
})

const STATUS_ALIASES = Object.freeze({
  aguardando_inicio: ATENDIMENTO_STATUS.ACEITO,
  em_atendimento: ATENDIMENTO_STATUS.A_CAMINHO,
  em_deslocamento: ATENDIMENTO_STATUS.A_CAMINHO,
  em_local: ATENDIMENTO_STATUS.CHEGOU,
  chegando: ATENDIMENTO_STATUS.CHEGOU,
  concluido: ATENDIMENTO_STATUS.FINALIZADO,
  avaliado: ATENDIMENTO_STATUS.FINALIZADO,
})

export const ACTIVE_ATTENDANCE_STATUSES = Object.freeze([
  ATENDIMENTO_STATUS.ACEITO,
  ATENDIMENTO_STATUS.EM_ANDAMENTO,
  ATENDIMENTO_STATUS.A_CAMINHO,
  ATENDIMENTO_STATUS.CHEGOU,
  ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO,
  ATENDIMENTO_STATUS.FINALIZADO,
])

export const PRIVATE_ATTENDANCE_STORED_STATUSES = Object.freeze([
  ATENDIMENTO_STATUS.ACEITO,
  'agendado',
  ATENDIMENTO_STATUS.EM_ANDAMENTO,
  ATENDIMENTO_STATUS.A_CAMINHO,
  ATENDIMENTO_STATUS.CHEGOU,
  ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO,
  ATENDIMENTO_STATUS.FINALIZADO,
  ATENDIMENTO_STATUS.CANCELADO,
])

export const ATTENDANCE_CANCELLATION_REASONS = Object.freeze([
  { code: 'sem_acordo', label: 'Não chegamos a um acordo' },
  { code: 'valor_nao_combinado', label: 'Valor não combinado' },
  { code: 'horario_incompativel', label: 'Horário não serviu' },
  { code: 'servico_divergente', label: 'Serviço diferente do descrito' },
  { code: 'nao_consigo_realizar', label: 'Não consigo realizar o serviço' },
  { code: 'cliente_desistiu', label: 'Cliente desistiu' },
  { code: 'profissional_desistiu', label: 'Profissional desistiu' },
  { code: 'outro', label: 'Outro' },
])

const CANCELLATION_REASON_CODES = new Set(ATTENDANCE_CANCELLATION_REASONS.map((reason) => reason.code))

export function normalizeAtendimentoStatus(value) {
  const normalized = String(value || ATENDIMENTO_STATUS.ABERTO)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')

  return STATUS_ALIASES[normalized] || normalized
}

export function normalizeServiceAttendanceStatus({ status, kind = 'pedido', type = '', record = null } = {}) {
  const raw = String(status || '').trim().toLowerCase()
  const normalized = normalizeAtendimentoStatus(status)
  const privateKind = kind === 'privateRequest'
  if (privateKind && String(type || '').toLowerCase() === 'agendamento' && normalized === 'agendado') {
    return ATENDIMENTO_STATUS.EM_ANDAMENTO
  }
  if (normalized === ATENDIMENTO_STATUS.ACEITO) return ATENDIMENTO_STATUS.EM_ANDAMENTO
  if (raw === ATENDIMENTO_STATUS.EM_ANDAMENTO && record) {
    const legacyDepartureMarker = record?.atendimentoIniciadoEm
      || record?.atendimento?.iniciadoEm
      || record?.atendimento?.iniciadoPor?.id
    if (legacyDepartureMarker) return ATENDIMENTO_STATUS.A_CAMINHO
  }
  return normalized
}

export function getAtendimentoStep(value) {
  const status = normalizeAtendimentoStatus(value)
  if (status === ATENDIMENTO_STATUS.EM_ANDAMENTO) return 1
  if (status === ATENDIMENTO_STATUS.A_CAMINHO) return 2
  if (status === ATENDIMENTO_STATUS.CHEGOU) return 3
  if (status === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) return 4
  if (status === ATENDIMENTO_STATUS.FINALIZADO) return 5
  return 0
}

export function canTransitionAtendimento(currentValue, nextValue) {
  const current = normalizeAtendimentoStatus(currentValue)
  const next = normalizeAtendimentoStatus(nextValue)
  const transitions = {
    [ATENDIMENTO_STATUS.ABERTO]: [ATENDIMENTO_STATUS.ACEITO, ATENDIMENTO_STATUS.CANCELADO],
    [ATENDIMENTO_STATUS.ACEITO]: [ATENDIMENTO_STATUS.A_CAMINHO, ATENDIMENTO_STATUS.CANCELADO],
    [ATENDIMENTO_STATUS.EM_ANDAMENTO]: [ATENDIMENTO_STATUS.A_CAMINHO, ATENDIMENTO_STATUS.CANCELADO],
    [ATENDIMENTO_STATUS.A_CAMINHO]: [ATENDIMENTO_STATUS.CHEGOU, ATENDIMENTO_STATUS.CANCELADO],
    [ATENDIMENTO_STATUS.CHEGOU]: [ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO, ATENDIMENTO_STATUS.CANCELADO],
    [ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO]: [ATENDIMENTO_STATUS.FINALIZADO, ATENDIMENTO_STATUS.CANCELADO],
    [ATENDIMENTO_STATUS.FINALIZADO]: [],
    [ATENDIMENTO_STATUS.CANCELADO]: [],
  }

  return transitions[current]?.includes(next) || false
}

export function isPrivateAttendanceStatus(value) {
  return PRIVATE_ATTENDANCE_STORED_STATUSES.includes(normalizeAtendimentoStatus(value))
}

export function validateAttendanceCancellation({ reasonCode, reason } = {}) {
  const code = String(reasonCode || '').trim().toLowerCase()
  const detail = String(reason || '').trim().slice(0, 160)
  if (!CANCELLATION_REASON_CODES.has(code)) return { ok: false, reason: 'invalid_cancellation_reason_code' }
  if (!detail) return { ok: false, reason: 'cancellation_reason_required' }
  return { ok: true, reasonCode: code, reason: detail }
}

export function authorizePrivateAttendanceTransition({
  record,
  actorUid,
  expectedStatus,
  nextStatus,
  responseAuthorized = false,
} = {}) {
  if (!responseAuthorized) return { ok: false, reason: 'private_response_unverified' }

  const clienteId = String(record?.clienteId || '').trim().slice(0, 128)
  const profissionalId = String(record?.profissionalId || '').trim().slice(0, 128)
  if (!clienteId || !profissionalId || clienteId === profissionalId) {
    return { ok: false, reason: 'participant_identity_invalid' }
  }

  const currentStatus = normalizeServiceAttendanceStatus({
    status: record?.status,
    kind: 'privateRequest',
    type: record?.tipo,
    record,
  })
  const expected = normalizeAtendimentoStatus(expectedStatus)
  const next = normalizeAtendimentoStatus(nextStatus)
  if (currentStatus !== expected) {
    return { ok: false, reason: 'status_mismatch', currentStatus, clienteId, profissionalId }
  }
  if (!canTransitionAtendimento(currentStatus, next)) {
    return { ok: false, reason: 'invalid_transition', currentStatus, clienteId, profissionalId }
  }

  const actor = String(actorUid || '').trim()
  const actorAuthorized = next === ATENDIMENTO_STATUS.CANCELADO
    ? actor === clienteId || actor === profissionalId
    : next === ATENDIMENTO_STATUS.FINALIZADO
      ? actor === clienteId
      : actor === profissionalId
  if (!actorAuthorized) {
    return { ok: false, reason: 'wrong_actor', currentStatus, clienteId, profissionalId }
  }

  return { ok: true, currentStatus, clienteId, profissionalId }
}
