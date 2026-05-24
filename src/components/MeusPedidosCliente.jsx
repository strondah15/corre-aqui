'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { database } from '@/lib/firebase'
import { ref, update, serverTimestamp } from 'firebase/database'
import StatusFluxoServico from '@/components/StatusFluxoServico'

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
  onProblemaServico,
  onAvaliarServico,
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

  const totalConcluidos = meusPedidos.filter((p) => String(p?.status || '').toLowerCase() === 'concluido').length
  const totalAceitos = meusPedidos.filter((p) => String(p?.status || '').toLowerCase() === 'aceito').length
  const totalAbertos = meusPedidos.filter((p) => String(p?.status || 'aberto').toLowerCase() === 'aberto').length
  const totalProblemas = meusPedidos.filter((p) => !!p?.problemaServico).length
  const totalAvaliacoesPendentes = meusPedidos.filter(
    (p) => String(p?.status || '').toLowerCase() === 'concluido' && !p?.avaliacao
  ).length

  const podeRelatarProblema = (p) => ['aceito', 'concluido'].includes(String(p?.status || '').toLowerCase())
  const podeAvaliar = (p) => String(p?.status || '').toLowerCase() === 'concluido' && !p?.avaliacao

  const proximoPassoPedido = (p) => {
    const status = String(p?.status || 'aberto').toLowerCase()

    if (p?.problemaServico) return 'Problema registrado. Acompanhe pelo chat até resolver.'
    if (status === 'aberto') return 'Aguardando alguém aceitar o pedido.'
    if (status === 'aceito') return 'Combine no chat e confirme quando o serviço terminar.'
    if (status === 'concluido' && !p?.avaliacao) return 'Avalie o serviço para fechar o ciclo.'
    if (status === 'concluido') return 'Serviço finalizado e avaliado.'
    if (status === 'cancelado') return 'Pedido cancelado.'
    return 'Acompanhe os próximos passos pelo chat.'
  }

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
    <div className="mt-3 rounded-[22px] p-3 bg-[#0f172a] border border-slate-700 shadow-2xl shadow-black/40 md:mt-4 md:rounded-[1.8rem] md:p-4">
      <div className="mb-3 flex items-center justify-between rounded-xl bg-[#1e293b] border border-slate-600 px-3 py-2 shadow-lg shadow-black/20 md:mb-4 md:rounded-2xl md:py-2.5">
        <div className="text-sm font-semibold text-white">
          Histórico de serviços
        </div>
        <div className="text-xs text-slate-400">
          {meusPedidos.length} pedido{meusPedidos.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5 md:mb-4 md:gap-2">
        <div className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 md:rounded-2xl md:px-3 md:py-3">
          <div className="text-base font-black text-white md:text-lg">{totalAbertos}</div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Abertos</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 md:rounded-2xl md:px-3 md:py-3">
          <div className="text-base font-black text-amber-300 md:text-lg">{totalAceitos}</div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Em andamento</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 md:rounded-2xl md:px-3 md:py-3">
          <div className="text-base font-black text-sky-300 md:text-lg">{totalConcluidos}</div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Concluídos</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 md:rounded-2xl md:px-3 md:py-3">
          <div className="text-base font-black text-amber-200 md:text-lg">{totalAvaliacoesPendentes}</div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">A avaliar</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 md:rounded-2xl md:px-3 md:py-3">
          <div className="text-base font-black text-red-300 md:text-lg">{totalProblemas}</div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Problemas</div>
        </div>
      </div>

      {meusPedidos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-600 bg-[#1e293b] p-3 text-sm font-semibold text-slate-200 md:rounded-2xl md:p-4">
          Você ainda não criou pedidos.
        </div>
      ) : (
        <div className="space-y-2.5 md:space-y-3">
          {meusPedidos.map((p, index) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
              whileHover={{ scale: 1.01, y: -2 }}
              whileTap={{ scale: 0.985 }}
              className={[
                "relative overflow-hidden rounded-xl p-3 bg-[#1e293b] border border-slate-600 transition-colors duration-200 hover:bg-[#263449] select-none shadow-lg shadow-black/30 md:rounded-2xl md:p-4",
                String(p?.status || 'aberto').toLowerCase() === 'aberto'
                  ? "border-emerald-500/50 ring-1 ring-emerald-500/30 shadow-lg shadow-emerald-900/30"
                  : "",
              ].join(" ")}
            >
              {String(p?.status || 'aberto').toLowerCase() === 'aberto' && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-lime-300 to-emerald-500" />
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-300 md:mb-2 md:gap-2 md:text-[10px] md:tracking-[0.18em]">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                    Pedido ativo
                  </div>
                  <div className="line-clamp-2 break-words text-base font-black leading-tight text-white md:line-clamp-1 md:text-lg">
                    {p?.titulo || 'Pedido sem título'}
                  </div>

                  {p?.descricao && String(p.descricao).trim().toLowerCase() !== String(p?.titulo || '').trim().toLowerCase() ? (
                    <div className="mt-1 line-clamp-2 select-text text-xs text-slate-200 md:text-sm">
                      {p.descricao}
                    </div>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-200 md:mt-3 md:gap-2 md:text-xs">
                    <span>🕒 Criado: <b className="text-white">{formatDataHora(p?.criadoEm || p?.createdAt || p?.atualizadoEm)}</b></span>
                    {p?.aceite?.aceitoEm || p?.aceitoEm ? (
                      <span>✅ Aceito: <b className="text-amber-300">{formatDataHora(p?.aceite?.aceitoEm || p?.aceitoEm)}</b></span>
                    ) : null}
                    {p?.concluidoEm ? (
                      <span>📦 Concluído: <b className="text-sky-300">{formatDataHora(p?.concluidoEm)}</b></span>
                    ) : null}
                    {p?.avaliacao?.nota ? (
                      <span>★ Avaliação: <b className="text-amber-300">{Number(p.avaliacao.nota).toFixed(1)}</b></span>
                    ) : null}
                  </div>
                </div>

                {badgeStatus(p?.status)}
              </div>

              {p?.problemaServico ? (
                <div className="mt-2.5 rounded-xl border border-red-400/25 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-100 md:mt-3 md:rounded-2xl md:px-3 md:py-2 md:text-xs">
                  Problema registrado: {p.problemaServico?.status || 'aberto'}
                </div>
              ) : null}

              <div className="mt-2.5 rounded-xl border border-sky-400/20 bg-sky-500/10 px-2.5 py-1.5 text-[11px] text-sky-100 md:mt-3 md:rounded-2xl md:px-3 md:py-2 md:text-xs">
                <span className="font-black uppercase tracking-[0.14em] text-sky-300">Próximo passo</span>
                <span className="ml-2 font-semibold text-slate-100">{proximoPassoPedido(p)}</span>
              </div>

              <StatusFluxoServico pedido={p} tone="dark" className="mt-3" />

              <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs text-slate-200 md:mt-3 md:gap-2 md:text-sm">
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

              <div className="mt-2.5 flex flex-wrap gap-1.5 md:mt-3 md:gap-2">
                {p?.aceite?.id ? (
                  <motion.button
                    className="rounded-xl bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98] md:px-3 md:text-sm"
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
                    className="rounded-xl bg-gradient-to-r from-fuchsia-600 to-blue-600 px-2.5 py-1.5 text-xs font-black text-white shadow-md shadow-blue-500/25 transition hover:brightness-110 active:scale-[0.98] md:px-3 md:text-sm"
                    onClick={() =>
                      avisar({
                        type: 'info',
                        title: 'Recurso em breve',
                        message: 'Impulsionar e emergência serão liberados quando o app tiver mais movimento.',
                      })
                    }
                    disabled
                    type="button"
                  >
                    ⚡ Melhorar alcance (breve)
                  </motion.button>
                ) : null}

                {String(p?.status || '').toLowerCase() === 'aceito' && p?.criador?.id === meuId ? (
                  <motion.button
                    className="rounded-xl bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 active:scale-[0.98] md:px-3 md:text-sm"
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

                {podeAvaliar(p) ? (
                  <motion.button
                    className="rounded-xl bg-amber-400 px-2.5 py-1.5 text-xs font-black text-slate-950 shadow-md shadow-amber-500/20 transition hover:bg-amber-300 active:scale-[0.98] md:px-3 md:text-sm"
                    onClick={() => onAvaliarServico?.(p)}
                    type="button"
                  >
                    Avaliar serviço
                  </motion.button>
                ) : null}

                {podeRelatarProblema(p) ? (
                  <motion.button
                    className="rounded-xl border border-red-400/25 bg-red-500/15 px-2.5 py-1.5 text-xs font-black text-red-100 transition hover:bg-red-500/20 active:scale-[0.98] md:px-3 md:text-sm"
                    onClick={() => onProblemaServico?.(p)}
                    type="button"
                  >
                    Problema com serviço
                  </motion.button>
                ) : null}

                {p?.local?.lat != null && p?.local?.lng != null ? (
                  <motion.button
                    className="rounded-xl border border-slate-600 bg-slate-700 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-600 active:scale-[0.98] md:px-3 md:text-sm"
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
            className="w-full max-w-md overflow-hidden rounded-[22px] border border-white/12 bg-[#07111f]/95 p-4 text-white shadow-[0_30px_120px_rgba(0,0,0,0.65)] md:rounded-[30px] md:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-black">⚡ Melhorar alcance (breve)</div>
                <div className="mt-1 text-sm text-slate-400">
                  Disponível em breve. Vamos liberar quando houver mais profissionais e pedidos ativos no app.
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
              <div className="line-clamp-2 break-words text-sm font-black leading-tight text-white md:line-clamp-1">{pedidoAlcance?.titulo || 'Pedido'}</div>
              <div className="mt-1 text-xs text-slate-400 line-clamp-2">{pedidoAlcance?.descricao || 'Sem descrição'}</div>
            </div>

            <div className="mt-5 space-y-3">
              <button
                type="button"
                disabled
                onClick={() => {}}
                className="w-full rounded-3xl border border-fuchsia-400/25 bg-fuchsia-500/12 p-4 text-left hover:bg-fuchsia-500/18 disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-black text-fuchsia-100">🚀 Impulsionar — em breve</div>
                  <div className="rounded-2xl bg-white/10 px-3 py-1 text-sm font-black text-white">Breve</div>
                </div>
                <div className="mt-1 text-xs text-slate-400">Será liberado quando houver mais movimento no app.</div>
              </button>

              <button
                type="button"
                disabled
                onClick={() => {}}
                className="w-full rounded-3xl border border-red-400/25 bg-red-500/12 p-4 text-left hover:bg-red-500/18 disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-black text-red-100">🚨 Emergência — em breve</div>
                  <div className="rounded-2xl bg-white/10 px-3 py-1 text-sm font-black text-white">Breve</div>
                </div>
                <div className="mt-1 text-xs text-slate-400">Alerta de urgência será liberado numa próxima fase.</div>
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}

    </div>
  )
}
