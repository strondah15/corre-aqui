'use client'

import { auth } from '@/lib/firebase'

const ALLOWED_SYSTEM_CHAT_EVENTS = new Set([
  'atendimento_intro',
  'pedido_aceito',
  'atendimento_iniciado',
  'atendimento_chegou',
  'finalizacao_solicitada',
  'atendimento_finalizado',
  'agendamento_solicitado',
  'agendamento_aceito',
  'agendamento_recusado',
])

export async function registrarMensagemSistemaConfiavel({ pedidoId, eventType }) {
  const id = String(pedidoId || '').trim()
  const evento = String(eventType || '').trim()

  if (!id || !ALLOWED_SYSTEM_CHAT_EVENTS.has(evento)) {
    throw new Error('evento_chat_sistema_invalido')
  }

  const currentUser = auth.currentUser
  if (!currentUser?.getIdToken) {
    throw new Error('sessao_chat_sistema_invalida')
  }

  const idToken = await currentUser.getIdToken()
  const response = await fetch('/api/chat/system', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pedidoId: id, eventType: evento }),
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data?.error || 'mensagem_sistema_recusada')
    error.code = data?.error || 'mensagem_sistema_recusada'
    throw error
  }

  return data
}

