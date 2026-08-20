import { get, onValue, ref, update } from './firebaseDebug'

const cleanId = (value) => String(value || '').trim()

export function buildAgendaParticipantIndex(agendamento = {}) {
  const id = cleanId(agendamento.id || agendamento.agendamentoId)
  if (!id) throw new Error('Agendamento sem identificador.')
  return {
    agendamentoId: id,
    status: cleanId(agendamento.status || 'pendente').toLowerCase(),
    atualizadoEm: Number(agendamento.atualizadoEm || agendamento.criadoEm || Date.now()),
  }
}

export function subscribeParticipantAgendamentos({ database, uid, onChange, onError }) {
  const participantId = cleanId(uid)
  if (!database || !participantId) {
    onChange?.([])
    return () => {}
  }

  let active = true
  let revision = 0
  const indexRef = ref(database, `agendamentosPorUsuario/${participantId}`)
  const off = onValue(indexRef, async (snapshot) => {
    const currentRevision = ++revision
    const entries = Object.entries(snapshot.val() || {})
      .map(([key, value]) => cleanId(value?.agendamentoId || key))
      .filter(Boolean)

    try {
      const loaded = await Promise.all(entries.map(async (agendamentoId) => {
        const itemSnapshot = await get(ref(database, `agendamentos/${agendamentoId}`))
        if (!itemSnapshot.exists()) return null
        const item = { id: agendamentoId, ...(itemSnapshot.val() || {}) }
        return item.clienteId === participantId || item.profissionalId === participantId ? item : null
      }))
      if (active && currentRevision === revision) onChange?.(loaded.filter(Boolean))
    } catch (error) {
      if (active && currentRevision === revision) onError?.(error)
    }
  }, onError)

  return () => {
    active = false
    off()
  }
}

export async function respondLegacyAgendamento({ database, agendamento = {}, actorUid, status }) {
  const id = cleanId(agendamento.id || agendamento.agendamentoId)
  const actor = cleanId(actorUid)
  const nextStatus = cleanId(status).toLowerCase()
  const clienteId = cleanId(agendamento.clienteId)
  const profissionalId = cleanId(agendamento.profissionalId)
  if (!database || !id || !actor || !clienteId || !profissionalId) throw new Error('Agendamento inválido.')
  if (actor !== profissionalId || !['aceito', 'recusado'].includes(nextStatus)) {
    throw new Error('Somente o profissional vinculado pode responder a esta solicitação.')
  }

  const agora = Date.now()
  const index = buildAgendaParticipantIndex({ id, status: nextStatus, atualizadoEm: agora })
  await update(ref(database), {
    [`agendamentos/${id}/status`]: nextStatus,
    [`agendamentos/${id}/respondidoEm`]: agora,
    [`agendamentos/${id}/atualizadoEm`]: agora,
    [`agendamentosPorUsuario/${clienteId}/${id}`]: index,
    [`agendamentosPorUsuario/${profissionalId}/${id}`]: index,
  })
}
