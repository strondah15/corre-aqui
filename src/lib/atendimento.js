'use client'

import { ref, runTransaction } from 'firebase/database'

export const ATENDIMENTO_STATUS = Object.freeze({
  ABERTO: 'aberto',
  ACEITO: 'aceito',
  EM_ANDAMENTO: 'em_andamento',
  CHEGOU: 'chegou',
  AGUARDANDO_CONFIRMACAO: 'aguardando_confirmacao',
  FINALIZADO: 'finalizado',
  CANCELADO: 'cancelado',
})

const STATUS_ALIASES = {
  aguardando_inicio: ATENDIMENTO_STATUS.ACEITO,
  em_atendimento: ATENDIMENTO_STATUS.EM_ANDAMENTO,
  a_caminho: ATENDIMENTO_STATUS.EM_ANDAMENTO,
  em_deslocamento: ATENDIMENTO_STATUS.EM_ANDAMENTO,
  em_local: ATENDIMENTO_STATUS.CHEGOU,
  chegando: ATENDIMENTO_STATUS.CHEGOU,
  concluido: ATENDIMENTO_STATUS.FINALIZADO,
  avaliado: ATENDIMENTO_STATUS.FINALIZADO,
}

export function normalizeAtendimentoStatus(value) {
  const normalized = String(value || ATENDIMENTO_STATUS.ABERTO)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')

  return STATUS_ALIASES[normalized] || normalized
}

export function getAtendimentoStep(value) {
  const status = normalizeAtendimentoStatus(value)
  if (status === ATENDIMENTO_STATUS.EM_ANDAMENTO) return 1
  if (status === ATENDIMENTO_STATUS.CHEGOU) return 2
  if (status === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO || status === ATENDIMENTO_STATUS.FINALIZADO) return 3
  return 0
}

export function canTransitionAtendimento(currentValue, nextValue) {
  const current = normalizeAtendimentoStatus(currentValue)
  const next = normalizeAtendimentoStatus(nextValue)
  const transitions = {
    [ATENDIMENTO_STATUS.ABERTO]: [ATENDIMENTO_STATUS.ACEITO, ATENDIMENTO_STATUS.CANCELADO],
    [ATENDIMENTO_STATUS.ACEITO]: [ATENDIMENTO_STATUS.EM_ANDAMENTO, ATENDIMENTO_STATUS.CANCELADO],
    [ATENDIMENTO_STATUS.EM_ANDAMENTO]: [ATENDIMENTO_STATUS.CHEGOU, ATENDIMENTO_STATUS.CANCELADO],
    [ATENDIMENTO_STATUS.CHEGOU]: [ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO, ATENDIMENTO_STATUS.CANCELADO],
    [ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO]: [ATENDIMENTO_STATUS.FINALIZADO, ATENDIMENTO_STATUS.CANCELADO],
    [ATENDIMENTO_STATUS.FINALIZADO]: [],
    [ATENDIMENTO_STATUS.CANCELADO]: [],
  }

  return transitions[current]?.includes(next) || false
}

function getActorId(value) {
  return String(value?.id || value?.uid || '').trim()
}

export async function transitionAtendimento({
  database,
  pedidoId,
  actorUid,
  expectedStatus,
  nextStatus,
  atendimentoPatch = {},
  topLevelPatch = {},
}) {
  const id = String(pedidoId || '').trim()
  const actor = String(actorUid || '').trim()
  const expected = normalizeAtendimentoStatus(expectedStatus)
  const next = normalizeAtendimentoStatus(nextStatus)

  if (!database || !id || !actor) throw new Error('Atendimento inválido.')
  if (!canTransitionAtendimento(expected, next)) throw new Error('Essa etapa do atendimento não está disponível.')

  const result = await runTransaction(ref(database, `pedidos/${id}`), (current) => {
    if (!current) return

    const currentStatus = normalizeAtendimentoStatus(current.status)
    if (currentStatus !== expected || !canTransitionAtendimento(currentStatus, next)) return

    const creatorId = getActorId(current.criador)
    const workerId = getActorId(current.aceite)
    const acceptanceId = getActorId(topLevelPatch.aceite) || getActorId(atendimentoPatch.aceitoPor)
    const workerAction = next !== ATENDIMENTO_STATUS.FINALIZADO && next !== ATENDIMENTO_STATUS.CANCELADO
    const authorized = next === ATENDIMENTO_STATUS.CANCELADO
      ? creatorId === actor || workerId === actor
      : workerAction
        ? workerId === actor || (next === ATENDIMENTO_STATUS.ACEITO && acceptanceId === actor)
        : creatorId === actor

    if (!authorized) return
    if (next === ATENDIMENTO_STATUS.ACEITO && (workerId || !acceptanceId)) return

    return {
      ...current,
      ...topLevelPatch,
      status: next,
      atendimento: {
        ...(current.atendimento || {}),
        ...atendimentoPatch,
      },
      atualizadoEm: Date.now(),
    }
  })

  if (!result.committed) {
    throw new Error('O atendimento mudou. Atualize a tela e tente novamente.')
  }

  return result.snapshot.val()
}

export async function claimAtendimentoRewards({ database, pedidoId }) {
  const id = String(pedidoId || '').trim()
  if (!database || !id) return false

  const result = await runTransaction(ref(database, `pedidos/${id}/atendimento/recompensasContabilizadas`), (current) => {
    if (current === true) return
    return true
  })

  return result.committed
}
