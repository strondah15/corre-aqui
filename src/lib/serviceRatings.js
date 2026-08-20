import { ref, serverTimestamp, update } from '@/lib/firebaseDebug'

export const SERVICE_RATING_COMMENT_LIMIT = 500

export function buildServiceRatingPayload({ pedido, clienteId, clienteNome, nota, comentario }) {
  const pedidoId = String(pedido?.id || '').trim()
  const avaliadoId = String(pedido?.aceite?.id || '').trim()
  const clientId = String(clienteId || '').trim()
  if (!pedidoId || !avaliadoId || !clientId) throw new Error('Dados da avaliação incompletos.')

  return {
    pedidoId,
    nota: Math.max(1, Math.min(5, Math.trunc(Number(nota) || 5))),
    comentario: String(comentario || '').trim().slice(0, SERVICE_RATING_COMMENT_LIMIT),
    cliente: { id: clientId, nome: String(clienteNome || 'Cliente').trim().slice(0, 80) || 'Cliente' },
    avaliado: {
      id: avaliadoId,
      nome: String(pedido?.aceite?.nome || 'Corre').trim().slice(0, 80) || 'Corre',
    },
    criadoEm: Date.now(),
    criadoEmServer: serverTimestamp(),
    origem: 'pos_servico',
  }
}

export async function saveCanonicalServiceRating({ database, pedido, clienteId, clienteNome, nota, comentario }) {
  if (pedido?.avaliacao) throw new Error('Este atendimento já foi avaliado.')
  const payload = buildServiceRatingPayload({ pedido, clienteId, clienteNome, nota, comentario })

  await update(ref(database), {
    [`avaliacoes/${payload.pedidoId}`]: payload,
    [`pedidos/${payload.pedidoId}/avaliacao`]: payload,
    [`pedidos/${payload.pedidoId}/avaliacaoPendente`]: false,
    [`pedidos/${payload.pedidoId}/atualizadoEm`]: serverTimestamp(),
    [`pedidos/${payload.pedidoId}/atualizadoEmServer`]: serverTimestamp(),
  })

  return payload
}
