'use client'

import { ref, runTransaction } from 'firebase/database'
import { calcularPatentePorServicos } from '@/components/Patente'
import { claimAtendimentoRewards } from '@/lib/atendimento'

function dayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Credits the worker only once, after the customer confirms the service.
 * The claim transaction is the guard shared by every completion entry point.
 */
export async function contabilizarAtendimentoFinalizado({ database, pedido, uid }) {
  if (!database || !pedido?.id || !uid) return { contabilizado: false, patente: null }

  const contabilizado = await claimAtendimentoRewards({ database, pedidoId: pedido.id })
  if (!contabilizado) return { contabilizado: false, patente: null }

  let patente = null
  await runTransaction(ref(database, `users/${uid}`), (current) => {
    const user = current || {}
    const servicosCorreAntes = Number(user.servicosCorre ?? user['servicosCorre'] ?? user['serviçosCorre'] ?? 0)
    const servicosProfAntes = Number(user.servicosProf ?? user['servicosProf'] ?? user['serviçosProf'] ?? 0)
    const isProfissionalUser = Boolean(user.isProfissional || user?.profile?.isProfissional || user?.profissional?.ativo)
    const isProfissionalPedido = String(pedido?.modoPedido || 'geral').toLowerCase() === 'profissional' && isProfissionalUser
    const servicosCorre = isProfissionalPedido ? servicosCorreAntes : servicosCorreAntes + 1
    const servicosProf = isProfissionalPedido ? servicosProfAntes + 1 : servicosProfAntes
    const patenteCorreAntes = calcularPatentePorServicos(servicosCorreAntes)
    const patenteProfAntes = calcularPatentePorServicos(servicosProfAntes)
    const patenteCorre = calcularPatentePorServicos(servicosCorre)
    const patenteProf = isProfissionalUser ? calcularPatentePorServicos(servicosProf) : 0

    patente = {
      tipo: isProfissionalPedido ? 'prof' : 'corre',
      patenteAntes: isProfissionalPedido ? patenteProfAntes : patenteCorreAntes,
      patenteDepois: isProfissionalPedido ? patenteProf : patenteCorre,
      subiu: isProfissionalPedido ? patenteProf > patenteProfAntes : patenteCorre > patenteCorreAntes,
    }

    return {
      ...user,
      servicosCorre,
      servicosProf,
      ['servicosCorre']: servicosCorre,
      ['servicosProf']: servicosProf,
      ['serviçosCorre']: servicosCorre,
      ['serviçosProf']: servicosProf,
      patenteCorre,
      patenteProf,
      xp: Number(user.xp || 0) + 10,
      moedas: Number(user.moedas || 0) + 4,
      patenteAtualizadaEm: Date.now(),
      missaoAtualizadaEm: Date.now(),
    }
  })

  await runTransaction(ref(database, `missoes/${uid}/${dayKey()}`), (current) => {
    const mission = current || { aceitou: 0, entregou: 0, boostou: 0, xp: 0, moedas: 0, updatedAt: 0 }
    return {
      ...mission,
      entregou: Number(mission.entregou || 0) + 1,
      xp: Number(mission.xp || 0) + 10,
      moedas: Number(mission.moedas || 0) + 4,
      updatedAt: Date.now(),
    }
  })

  return { contabilizado: true, patente }
}
