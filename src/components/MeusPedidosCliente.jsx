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
  const [historicoFiltro, setHistoricoFiltro] = useState('todos')

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
  const totalCancelados = meusPedidos.filter((p) => String(p?.status || '').toLowerCase() === 'cancelado').length
  const totalProblemas = meusPedidos.filter((p) => !!p?.problemaServico).length
  const totalAvaliacoesPendentes = meusPedidos.filter(
    (p) => String(p?.status || '').toLowerCase() === 'concluido' && !p?.avaliacao
  ).length
  const pedidosFiltrados = meusPedidos.filter((p) => {
    const status = String(p?.status || 'aberto').toLowerCase()
    if (historicoFiltro === 'todos') return true
    if (historicoFiltro === 'andamento') return status === 'aceito'
    if (historicoFiltro === 'concluidos') return status === 'concluido'
    if (historicoFiltro === 'cancelados') return status === 'cancelado'
    return status === historicoFiltro
  })

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

  const getPedidoVisual = (pedidoOuStatus) => {
    const pedido = typeof pedidoOuStatus === 'object' ? pedidoOuStatus : { status: pedidoOuStatus }
    const s = String(pedido?.status || 'aberto').toLowerCase()

    if (pedido?.problemaServico) {
      return {
        icon: '🛡️',
        label: 'PROBLEMA',
        card: 'border-red-200 ring-1 ring-red-100',
        stripe: 'from-red-500 via-rose-400 to-orange-300',
        chip: 'border-red-200 bg-red-50 text-red-700',
        dot: 'bg-red-500',
      }
    }

    if (s === 'aceito') {
      return {
        icon: '⚡',
        label: 'EM ANDAMENTO',
        card: 'border-amber-200 ring-1 ring-amber-100',
        stripe: 'from-amber-400 via-yellow-300 to-blue-400',
        chip: 'border-amber-200 bg-amber-50 text-amber-700',
        dot: 'bg-amber-400',
      }
    }

    if (s === 'concluido') {
      return {
        icon: '✓',
        label: pedido?.avaliacao ? 'AVALIADO' : 'CONCLUÍDO',
        card: 'border-sky-200 ring-1 ring-sky-100',
        stripe: 'from-sky-500 via-blue-500 to-cyan-300',
        chip: 'border-sky-200 bg-sky-50 text-sky-700',
        dot: 'bg-sky-500',
      }
    }

    if (s === 'cancelado') {
      return {
        icon: '×',
        label: 'CANCELADO',
        card: 'border-slate-200',
        stripe: 'from-slate-400 via-slate-300 to-slate-200',
        chip: 'border-slate-200 bg-slate-100 text-slate-600',
        dot: 'bg-slate-400',
      }
    }

    return {
      icon: '●',
      label: 'ABERTO',
      card: 'border-emerald-200 ring-1 ring-emerald-100',
      stripe: 'from-emerald-500 via-teal-300 to-yellow-300',
      chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dot: 'bg-emerald-500',
    }
  }

  const badgeStatus = (pedidoOuStatus) => {
    const visual = getPedidoVisual(pedidoOuStatus)

    return (
      <span className={['inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] md:text-[11px]', visual.chip].join(' ')}>
        <span className={['h-2 w-2 rounded-full shadow-[0_0_12px_rgba(15,23,42,0.16)]', visual.dot].join(' ')} />
        {visual.label}
      </span>
    )
  }

  const resumoCards = [
    { label: 'Abertos', value: totalAbertos, icon: '●', tone: 'from-emerald-50 to-teal-50 text-emerald-700 border-emerald-100' },
    { label: 'Andamento', value: totalAceitos, icon: '⚡', tone: 'from-amber-50 to-yellow-50 text-amber-700 border-amber-100' },
    { label: 'Concluídos', value: totalConcluidos, icon: '✓', tone: 'from-sky-50 to-blue-50 text-blue-700 border-sky-100' },
    { label: 'Avaliar', value: totalAvaliacoesPendentes, icon: '★', tone: 'from-yellow-50 to-orange-50 text-orange-700 border-yellow-100' },
    { label: 'Problemas', value: totalProblemas, icon: '!', tone: 'from-red-50 to-rose-50 text-red-700 border-red-100' },
  ]

  const filtrosHistorico = [
    ['todos', 'Todos', meusPedidos.length],
    ['aberto', 'Abertos', totalAbertos],
    ['andamento', 'Em andamento', totalAceitos],
    ['concluidos', 'Concluídos', totalConcluidos],
    ['cancelados', 'Cancelados', totalCancelados],
  ]

  return (
    <div className="mt-1 overflow-hidden rounded-[28px] border border-white/70 bg-white text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.22)] md:mt-3 md:rounded-[34px]">
      <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#15b8d0_48%,#ffd91a_115%)] p-4 text-white md:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-[46px] bg-yellow-200/30 rotate-12 md:h-56 md:w-56 md:rounded-[64px]" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70 md:text-xs">Meus pedidos</div>
            <div className="mt-1 text-2xl font-black leading-none md:text-4xl">Histórico de serviços</div>
            <div className="mt-2 max-w-sm text-xs font-bold text-white/78 md:text-sm">
              Acompanhe cada etapa: aberto, em andamento, concluído, avaliação e suporte.
            </div>
          </div>
          <div className="shrink-0 rounded-[22px] bg-white/92 px-3 py-2 text-right text-blue-950 shadow-[0_14px_28px_rgba(15,23,42,0.16)] md:px-4 md:py-3">
            <div className="text-2xl font-black leading-none md:text-3xl">{meusPedidos.length}</div>
            <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              pedido{meusPedidos.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 p-3 md:p-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-3">
        {resumoCards.map((item) => (
          <div
            key={item.label}
            className={['rounded-[18px] border bg-gradient-to-br p-3 shadow-[0_10px_26px_rgba(15,23,42,0.07)] md:rounded-[22px] md:p-4', item.tone].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-base shadow-sm">{item.icon}</span>
              <span className="text-2xl font-black leading-none md:text-3xl">{item.value}</span>
            </div>
            <div className="mt-2 truncate text-[10px] font-black uppercase tracking-[0.12em] opacity-75 md:text-[11px]">
              {item.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:mt-5 [&::-webkit-scrollbar]:hidden">
        {filtrosHistorico.map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => setHistoricoFiltro(id)}
            className={[
              'shrink-0 rounded-full border px-3.5 py-2 text-[11px] font-black transition active:scale-[0.97] md:px-4 md:text-xs',
              historicoFiltro === id
                ? 'border-[#ffd91a] bg-[#ffd91a] text-blue-950 shadow-[0_10px_20px_rgba(250,204,21,0.20)]'
                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700',
            ].join(' ')}
          >
            {label} <span className="opacity-70">{count}</span>
          </button>
        ))}
      </div>

      {meusPedidos.length === 0 ? (
        <div className="mt-3 rounded-[22px] border border-dashed border-blue-200 bg-white p-4 text-sm font-black text-slate-600 md:p-5">
          Você ainda não criou pedidos.
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="mt-3 rounded-[22px] border border-dashed border-blue-200 bg-white p-4 text-sm font-black text-slate-600 md:p-5">
          Nenhum pedido nesse status.
        </div>
      ) : (
        <div className="mt-3 space-y-3 md:mt-5 md:space-y-4">
          {pedidosFiltrados.map((p, index) => {
            const visual = getPedidoVisual(p)

            return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
              whileHover={{ scale: 1.01, y: -2 }}
              whileTap={{ scale: 0.985 }}
              className={[
                'relative overflow-hidden rounded-[24px] border bg-white p-3 pl-4 text-slate-950 shadow-[0_14px_36px_rgba(15,23,42,0.08)] transition-colors duration-200 hover:bg-white select-none md:rounded-[28px] md:p-5 md:pl-6',
                visual.card,
              ].join(" ")}
            >
              <div className={['pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b', visual.stripe].join(' ')} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className={['mb-1.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] md:mb-2 md:gap-2 md:text-[10px] md:tracking-[0.18em]', visual.chip].join(' ')}>
                    <span className={['h-1.5 w-1.5 rounded-full', visual.dot].join(' ')} />
                    {visual.label}
                  </div>
                  <div className="line-clamp-2 break-words text-lg font-black leading-tight text-slate-950 md:line-clamp-1 md:text-2xl">
                    {p?.titulo || 'Pedido sem título'}
                  </div>

                  {p?.descricao && String(p.descricao).trim().toLowerCase() !== String(p?.titulo || '').trim().toLowerCase() ? (
                    <div className="mt-1 line-clamp-2 select-text text-sm font-semibold text-slate-500 md:text-base">
                      {p.descricao}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-500 md:gap-2 md:text-xs">
                    <span className="rounded-full bg-slate-100 px-2 py-1">Criado: <b className="text-slate-900">{formatDataHora(p?.criadoEm || p?.createdAt || p?.atualizadoEm)}</b></span>
                    {p?.aceite?.aceitoEm || p?.aceitoEm ? (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Aceito: <b>{formatDataHora(p?.aceite?.aceitoEm || p?.aceitoEm)}</b></span>
                    ) : null}
                    {p?.concluidoEm ? (
                      <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700">Concluído: <b>{formatDataHora(p?.concluidoEm)}</b></span>
                    ) : null}
                    {p?.avaliacao?.nota ? (
                      <span className="rounded-full bg-yellow-50 px-2 py-1 text-yellow-700">Avaliação: <b>{Number(p.avaliacao.nota).toFixed(1)}</b></span>
                    ) : null}
                  </div>
                </div>

                {badgeStatus(p)}
              </div>

              {p?.problemaServico ? (
                <div className="mt-3 rounded-[18px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black text-red-700 md:text-xs">
                  Problema registrado: {p.problemaServico?.status || 'aberto'}
                </div>
              ) : null}

              <div className="mt-3 rounded-[18px] border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-950 md:text-xs">
                <span className="font-black uppercase tracking-[0.14em] text-blue-700">Próximo passo</span>
                <span className="ml-2 font-bold text-slate-700">{proximoPassoPedido(p)}</span>
              </div>

              <StatusFluxoServico pedido={p} tone="light" className="mt-3 hidden md:block" />

              <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-bold text-slate-600 md:gap-2 md:text-sm">
                {p?.valor != null && Number.isFinite(Number(p.valor)) ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                    Valor <b>R$ {Number(p.valor).toFixed(2)}</b>
                  </span>
                ) : null}

                {p?.aceite?.nome ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">
                    Aceito por <b className="text-slate-950">{p.aceite.nome}</b>
                    {p?.aceite?.aceitoEm || p?.aceitoEm ? (
                      <> · <b className="text-amber-700">{formatDataHora(p?.aceite?.aceitoEm || p?.aceitoEm)}</b></>
                    ) : null}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">Aguardando alguém aceitar</span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {p?.aceite?.id ? (
                  <motion.button
                    className="rounded-full bg-blue-700 px-3.5 py-2 text-xs font-black text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)] transition hover:bg-blue-800 active:scale-[0.98] md:text-sm"
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
                    className="rounded-full border border-slate-200 bg-slate-100 px-3.5 py-2 text-xs font-black text-slate-500 transition active:scale-[0.98] md:text-sm"
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
                    className="rounded-full bg-emerald-600 px-3.5 py-2 text-xs font-black text-white shadow-[0_10px_22px_rgba(16,185,129,0.22)] transition hover:bg-emerald-700 active:scale-[0.98] md:text-sm"
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
                    className="rounded-full bg-[#ffd91a] px-3.5 py-2 text-xs font-black text-blue-950 shadow-[0_10px_22px_rgba(250,204,21,0.24)] transition hover:bg-yellow-300 active:scale-[0.98] md:text-sm"
                    onClick={() => onAvaliarServico?.(p)}
                    type="button"
                  >
                    Avaliar serviço
                  </motion.button>
                ) : null}

                {podeRelatarProblema(p) ? (
                  <motion.button
                    className="rounded-full border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 active:scale-[0.98] md:text-sm"
                    onClick={() => onProblemaServico?.(p)}
                    type="button"
                  >
                    Problema com serviço
                  </motion.button>
                ) : null}

                {p?.local?.lat != null && p?.local?.lng != null ? (
                  <motion.button
                    className="rounded-full border border-blue-100 bg-blue-50 px-3.5 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-100 active:scale-[0.98] md:text-sm"
                    onClick={() => onVerMapa?.(p)}
                    type="button"
                  >
                    Ver no mapa
                  </motion.button>
                ) : null}
              </div>
            </motion.div>
            )
          })}
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
    </div>
  )
}
