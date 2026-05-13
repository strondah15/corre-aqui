'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { database } from '@/lib/firebase'
import { ref, update, serverTimestamp } from 'firebase/database'

function getMs(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const parsed = Date.parse(v)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000
  return 0
}

function formatDataHora(v) {
  const ms = getMs(v)
  if (!ms) return 'Sem horário'

  const d = new Date(ms)
  const hoje = new Date()
  const ontem = new Date()
  ontem.setDate(hoje.getDate() - 1)

  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (d.toDateString() === hoje.toDateString()) return `Hoje às ${hora}`
  if (d.toDateString() === ontem.toDateString()) return `Ontem às ${hora}`

  return (
    d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }) + ` às ${hora}`
  )
}

export default function MeusPedidosCliente({
  meuId,
  corres = [],
  onAbrirChat,
  onVerMapa,
  onConfirmarServicoFeito,
  onToast,
}) {
  const [pedidoAlcance, setPedidoAlcance] = useState(null)
  const [aplicandoAlcance, setAplicandoAlcance] = useState(false)

  const avisar = (payload) => {
    if (typeof onToast === 'function') onToast(payload)
  }

  const aplicarAlcance = async (tipo) => {
    if (!pedidoAlcance?.id || aplicandoAlcance) return

    try {
      setAplicandoAlcance(true)
      const agora = Date.now()
      const payload = {
        atualizadoEm: serverTimestamp(),
        boost: {
          level: tipo === 'emergencia' ? 2 : 1,
          tipo,
          label: tipo === 'emergencia' ? 'Emergência' : 'Destaque',
          preco: tipo === 'emergencia' ? 4.99 : 2.99,
          until: agora + (tipo === 'emergencia' ? 20 : 30) * 60 * 1000,
          createdAt: agora,
          by: { id: meuId || null },
        },
      }

      if (tipo === 'emergencia') {
        payload.emergencia = true
        payload.destaque = false
        payload.urgencia = 'emergencia'
        payload.prioridade = 'alta'
        payload.alertaCorres = {
          ativo: true,
          tipo: 'emergencia',
          titulo: '🚨 Pedido urgente perto de você',
          criadoEm: agora,
          lidoPor: {},
        }
      } else {
        payload.destaque = true
        payload.emergencia = false
        payload.urgencia = null
        payload.prioridade = 'media'
      }

      await update(ref(database, `pedidos/${pedidoAlcance.id}`), payload)
      avisar({
        type: 'success',
        title: tipo === 'emergencia' ? 'Emergência ativada!' : 'Pedido destacado!',
        message: tipo === 'emergencia' ? 'Seu pedido foi marcado como urgente.' : 'Seu pedido ganhou mais alcance.',
      })
      setPedidoAlcance(null)
    } catch (e) {
      avisar({ type: 'error', title: 'Não consegui atualizar', message: e?.message || 'Tente novamente.' })
    } finally {
      setAplicandoAlcance(false)
    }
  }

  const meusPedidos = (corres || [])
    .filter((p) => p?.criador?.id === meuId)
    .sort((a, b) => {
      const ta = getMs(a?.criadoEm || a?.createdAt || a?.atualizadoEm || 0)
      const tb = getMs(b?.criadoEm || b?.createdAt || b?.atualizadoEm || 0)
      return tb - ta
    })

  const badgeStatus = (status) => {
    const s = String(status || 'aberto').toLowerCase()

    if (s === 'aberto') {
      return (
        <span className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-[11px] font-black uppercase tracking-[0.12em] shadow-[0_0_22px_rgba(16,185,129,0.45)] animate-pulse overflow-hidden">
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-70" />
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.95)]" />
          </span>
          <span className="relative ">ABERTO</span>
        </span>
      )
    }

    if (s === 'aceito') {
      return (
        <span className="text-[11px] px-2 py-1 rounded-full bg-amber-400/15 border border-amber-400/20 text-amber-300 font-semibold">
          ACEITO
        </span>
      )
    }

    if (s === 'concluido') {
      return (
        <span className="text-[11px] px-2 py-1 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-300 font-semibold">
          ENTREGUE
        </span>
      )
    }

    return (
      <span className="text-[11px] px-2 py-1 rounded-full bg-slate-700 border border-slate-600 text-white font-semibold">
        {s.toUpperCase()}
      </span>
    )
  }

  return (
    <div className="mt-4 rounded-[1.8rem] p-4 bg-[#0f172a] border border-slate-700 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between mb-4 rounded-2xl bg-[#1e293b] border border-slate-600 px-3 py-2.5 shadow-lg shadow-black/20">
        <div className="text-sm font-semibold text-white">
          📦 Meus pedidos
        </div>
        <div className="text-xs text-slate-400">
          {meusPedidos.length} pedido{meusPedidos.length === 1 ? '' : 's'}
        </div>
      </div>

      {meusPedidos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-600 bg-[#1e293b] p-4 text-sm font-semibold text-slate-200">
          Você ainda não criou pedidos.
        </div>
      ) : (
        <div className="space-y-3">
          {meusPedidos.map((p, index) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
              whileHover={{ scale: 1.01, y: -2 }}
              whileTap={{ scale: 0.985 }}
              className={[
                "relative overflow-hidden rounded-2xl p-4 bg-[#1e293b] border border-slate-600 transition-colors duration-200 hover:bg-[#263449] select-none shadow-lg shadow-black/30",
                String(p?.status || 'aberto').toLowerCase() === 'aberto'
                  ? "border-emerald-500/50 ring-1 ring-emerald-500/30 shadow-lg shadow-emerald-900/30"
                  : "",
              ].join(" ")}
            >
              {String(p?.status || 'aberto').toLowerCase() === 'aberto' && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-500" />
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300 mb-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                    Pedido ativo
                  </div>
                  <div className="text-lg font-black text-white truncate">
                    {p?.titulo || 'Pedido sem título'}
                  </div>

                  {p?.descricao && String(p.descricao).trim().toLowerCase() !== String(p?.titulo || '').trim().toLowerCase() ? (
                    <div className="text-sm text-slate-200 mt-1 line-clamp-2 select-text">
                      {p.descricao}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-200">
                    <span>🕒 Criado: <b className="text-white">{formatDataHora(p?.criadoEm || p?.createdAt || p?.atualizadoEm)}</b></span>
                    {p?.aceite?.aceitoEm || p?.aceitoEm ? (
                      <span>✅ Aceito: <b className="text-amber-300">{formatDataHora(p?.aceite?.aceitoEm || p?.aceitoEm)}</b></span>
                    ) : null}
                    {p?.concluidoEm ? (
                      <span>📦 Concluído: <b className="text-sky-300">{formatDataHora(p?.concluidoEm)}</b></span>
                    ) : null}
                  </div>
                </div>

                {badgeStatus(p?.status)}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-200">
                {p?.valor != null && Number.isFinite(Number(p.valor)) ? (
                  <span>
                    💰 <b className="text-white">R$ {Number(p.valor).toFixed(2)}</b>
                  </span>
                ) : null}

                {p?.aceite?.nome ? (
                  <span>
                    🙋 Aceito por <b className="text-white">{p.aceite.nome}</b>
                    {p?.aceite?.aceitoEm || p?.aceitoEm ? (
                      <> · <b className="text-amber-300">{formatDataHora(p?.aceite?.aceitoEm || p?.aceitoEm)}</b></>
                    ) : null}
                  </span>
                ) : (
                  <span>⏳ Aguardando alguém aceitar</span>
                )}
              </div>

              <div className="mt-3 flex gap-2 flex-wrap">
                {p?.aceite?.id ? (
                  <motion.button
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition active:scale-[0.98]"
                    onClick={() => {
                      setPedidoAlcance(null)
                      onAbrirChat?.(p)
                    }}
                    type="button"
                  >
                    Abrir conversa
                  </motion.button>
                ) : null}

                {String(p?.status || 'aberto').toLowerCase() === 'aberto' && !p?.aceite?.id ? (
                  <motion.button
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-blue-600 hover:brightness-110 text-white text-sm font-black shadow-md shadow-blue-500/25 transition active:scale-[0.98]"
                    onClick={() => setPedidoAlcance(p)}
                    type="button"
                  >
                    ⚡ Melhorar alcance
                  </motion.button>
                ) : null}

                {String(p?.status || '').toLowerCase() === 'aceito' && p?.criador?.id === meuId ? (
                  <motion.button
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 transition active:scale-[0.98]"
                    onClick={() => {
                      if (typeof onConfirmarServicoFeito === 'function') {
                        onConfirmarServicoFeito(p)
                      } else {
                        console.warn('Confirmação ainda não conectada no componente pai.')
                      }
                    }}
                    type="button"
                  >
                    Confirmar serviço feito
                  </motion.button>
                ) : null}

                {p?.local?.lat != null && p?.local?.lng != null ? (
                  <motion.button
                    className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white text-sm font-semibold transition active:scale-[0.98]"
                    onClick={() => onVerMapa?.(p)}
                    type="button"
                  >
                    Ver no mapa
                  </motion.button>
                ) : null}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {pedidoAlcance ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/75 backdrop-blur-md p-3">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-md overflow-hidden rounded-[30px] border border-white/12 bg-[#07111f]/95 p-5 text-white shadow-[0_30px_120px_rgba(0,0,0,0.65)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-black">⚡ Melhorar alcance</div>
                <div className="mt-1 text-sm text-slate-400">
                  Use quando seu pedido ainda estiver aberto e ninguém aceitou.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPedidoAlcance(null)}
                className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/10 hover:bg-white/15"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
              <div className="text-sm font-black text-white truncate">{pedidoAlcance?.titulo || 'Pedido'}</div>
              <div className="mt-1 text-xs text-slate-400 line-clamp-2">{pedidoAlcance?.descricao || 'Sem descrição'}</div>
            </div>

            <div className="mt-5 space-y-3">
              <button
                type="button"
                disabled={aplicandoAlcance}
                onClick={() => aplicarAlcance('destaque')}
                className="w-full rounded-3xl border border-fuchsia-400/25 bg-fuchsia-500/12 p-4 text-left hover:bg-fuchsia-500/18 disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-black text-fuchsia-100">🚀 Destacar por 30 minutos</div>
                  <div className="rounded-2xl bg-white/10 px-3 py-1 text-sm font-black text-white">R$ 2,99</div>
                </div>
                <div className="mt-1 text-xs text-slate-400">Coloca o pedido em destaque e sobe ele na lista dos corres.</div>
              </button>

              <button
                type="button"
                disabled={aplicandoAlcance}
                onClick={() => aplicarAlcance('emergencia')}
                className="w-full rounded-3xl border border-red-400/25 bg-red-500/12 p-4 text-left hover:bg-red-500/18 disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-black text-red-100">🚨 Tornar urgente</div>
                  <div className="rounded-2xl bg-white/10 px-3 py-1 text-sm font-black text-white">R$ 4,99</div>
                </div>
                <div className="mt-1 text-xs text-slate-400">Prioridade máxima, card urgente e alerta para os corres. Sem alterar o mapa por enquanto.</div>
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}

    </div>
  )
}

