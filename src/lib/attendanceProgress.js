import { ATENDIMENTO_STATUS, normalizeAtendimentoStatus } from './attendanceState.js'

export const ATTENDANCE_PROGRESS_STEPS = Object.freeze([
  { id: 'accepted', label: 'Aceito' },
  { id: 'combining', label: 'Combinando' },
  { id: 'en_route', label: 'A caminho' },
  { id: 'arrived', label: 'Cheguei' },
  { id: 'confirm', label: 'Concluir' },
  { id: 'finished', label: 'Finalizado' },
])

const ACTION_STEP = Object.freeze({
  en_route: 2,
  arrived: 3,
  request_completion: 4,
  confirm_completion: 4,
})

const ACTION_SHORT_LABEL = Object.freeze({
  en_route: 'A caminho',
  arrived: 'Cheguei',
  request_completion: 'Solicitar',
  confirm_completion: 'Confirmar',
})

export function getAttendanceProgressModel(statusValue, action = null) {
  const status = normalizeAtendimentoStatus(statusValue)
  const cancelled = status === ATENDIMENTO_STATUS.CANCELADO
  const statusIndex = status === ATENDIMENTO_STATUS.FINALIZADO
    ? 5
    : status === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
      ? 4
      : status === ATENDIMENTO_STATUS.CHEGOU
        ? 3
        : status === ATENDIMENTO_STATUS.A_CAMINHO
          ? 2
          : status === ATENDIMENTO_STATUS.EM_ANDAMENTO
            ? 1
            : 0
  const actionIndex = action ? ACTION_STEP[action.id] ?? -1 : -1

  return ATTENDANCE_PROGRESS_STEPS.map((step, index) => ({
    ...step,
    index,
    completed: !cancelled && (status === ATENDIMENTO_STATUS.FINALIZADO || index < statusIndex),
    current: !cancelled && status !== ATENDIMENTO_STATUS.FINALIZADO && index === statusIndex,
    actionable: !cancelled && actionIndex === index,
    cancelled,
    label: actionIndex === index ? ACTION_SHORT_LABEL[action.id] || step.label : step.label,
  }))
}
