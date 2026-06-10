'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'

function getMs(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000
  return 0
}

function getValorPedido(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

function formatMoney(value) {
  const n = getValorPedido(value)
  if (!n) return 'Combinar'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatTempo(value) {
  const ms = getMs(value)
  if (!ms) return 'Agora'
  const diff = Math.max(0, Date.now() - ms)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Agora'
  if (min < 60) return `${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `${horas} h`
  if (horas < 48) return 'Ontem'
  return `${Math.floor(horas / 24)} d`
}

function formatData(value) {
  const ms = getMs(value)
  if (!ms) return ''
  return new Date(ms).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

function getCategoria(pedido) {
  return (
    pedido?.categoriaNome ||
    pedido?.categoriaLabel ||
    pedido?.categoriaId ||
    pedido?.categoria ||
    pedido?.tipo ||
    'Servico'
  )
}

function getDistancia(pedido) {
  const raw =
    pedido?.distanciaKm ??
    pedido?.distancia_km ??
    pedido?.distancia ??
    pedido?.local?.distanciaKm ??
    pedido?.local?.distancia

  if (raw == null || raw === '') return pedido?.local?.lat != null && pedido?.local?.lng != null ? 'Mapa' : 'Local a combinar'
  if (typeof raw === 'string' && raw.toLowerCase().includes('km')) return raw

  const n = Number(raw)
  if (Number.isFinite(n)) return `${n.toFixed(n >= 10 ? 0 : 1).replace('.', ',')} km`
  return String(raw)
}

function getStatusKey(pedido) {
  const status = String(pedido?.status || 'aberto').toLowerCase()
  if (pedido?.problemaServico) return 'problema'
  if (status === 'aceito' || status === 'em_andamento' || status === 'andamento') return 'aceito'
  if (status === 'concluido' || status === 'finalizado' || status === 'feito') return 'concluido'
  if (status === 'cancelado') return 'cancelado'
  return 'aberto'
}

function getStatusMeta(pedido) {
  const key = getStatusKey(pedido)

  const map = {
    aberto: {
      label: 'ABERTO',
      next: 'Aguardando profissional',
      pill: 'border-emerald-400/25 bg-emerald-400/12 text-emerald-300',
      dot: 'bg-emerald-400',
      value: 'text-emerald-300',
    },
    aceito: {
      label: 'ACEITO',
      next: 'Profissional a caminho',
      pill: 'border-blue-400/25 bg-blue-500/18 text-blue-200',
      dot: 'bg-blue-400',
      value: 'text-[#ffd91a]',
    },
    concluido: {
      label: 'CONCLUIDO',
      next: pedido?.avaliacao ? 'Servico avaliado' : 'Aguardando avaliacao',
      pill: 'border-emerald-400/25 bg-emerald-400/14 text-emerald-200',
      dot: 'bg-emerald-300',
      value: 'text-emerald-300',
    },
    cancelado: {
      label: 'CANCELADO',
      next: 'Pedido encerrado',
      pill: 'border-slate-500/30 bg-slate-500/18 text-slate-300',
      dot: 'bg-slate-400',
      value: 'text-slate-300',
    },
    problema: {
      label: 'PROBLEMA',
      next: 'Acompanhe pelo chat',
      pill: 'border-red-400/30 bg-red-500/16 text-red-200',
      dot: 'bg-red-400',
      value: 'text-red-200',
    },
  }

  return map[key] || map.aberto
}

function chatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M7.5 18.5 4 20l1.1-3.2A7.7 7.7 0 0 1 3.5 12C3.5 7.6 7.3 4 12 4s8.5 3.6 8.5 8-3.8 8-8.5 8a9 9 0 0 1-4.5-1.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8 11.8h8M8 14.4h5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
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
  const router = useRouter()
  const [filtro, setFiltro] = useState('todos')

  const meusPedidos = useMemo(() => {
    return (corres || [])
      .filter((p) => String(p?.criador?.id || '') === String(meuId || ''))
      .sort((a, b) => {
        const ta = getMs(a?.criadoEm || a?.createdAt || a?.atualizadoEm || 0)
        const tb = getMs(b?.criadoEm || b?.createdAt || b?.atualizadoEm || 0)
        return tb - ta
      })
  }, [corres, meuId])

  const totals = useMemo(() => {
    return meusPedidos.reduce(
      (acc, pedido) => {
        const key = getStatusKey(pedido)
        acc.todos += 1
        if (key === 'aberto') acc.abertos += 1
        if (key === 'aceito') acc.andamento += 1
        if (key === 'concluido') acc.concluidos += 1
        if (key === 'cancelado') acc.cancelados += 1
        if (key === 'problema') acc.problemas += 1
        return acc
      },
      { todos: 0, abertos: 0, andamento: 0, concluidos: 0, cancelados: 0, problemas: 0 },
    )
  }, [meusPedidos])

  const pedidosFiltrados = useMemo(() => {
    return meusPedidos.filter((pedido) => {
      const key = getStatusKey(pedido)
      if (filtro === 'todos') return true
      if (filtro === 'andamento') return key === 'aceito'
      if (filtro === 'concluidos') return key === 'concluido'
      if (filtro === 'cancelados') return key === 'cancelado'
      return key === filtro
    })
  }, [filtro, meusPedidos])

  const filtros = [
    ['todos', 'Todos', totals.todos],
    ['andamento', 'Em andamento', totals.andamento],
    ['concluidos', 'Concluidos', totals.concluidos],
    ['cancelados', 'Cancelados', totals.cancelados],
  ]

  const abrirDetalhes = (pedido) => {
    if (!pedido?.id) return
    router.push(`/pedido/${encodeURIComponent(String(pedido.id))}?voltar=cliente`)
  }

  const avisarEmBreve = (titulo, message) => {
    if (typeof onToast === 'function') {
      onToast({ type: 'info', title: titulo, message })
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-[24px] border border-white/10 bg-[#07111f] text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:rounded-[30px]">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#07111f]/95 px-4 py-4 backdrop-blur md:px-6 md:py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ffd91a]">Historico</p>
            <h2 className="mt-1 text-xl font-black leading-none md:text-2xl">Meus pedidos</h2>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-right">
            <div className="text-lg font-black leading-none text-[#ffd91a]">{totals.todos}</div>
            <div className="mt-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">total</div>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filtros.map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={[
                'shrink-0 rounded-xl px-3 py-2 text-[11px] font-black transition active:scale-[0.97] md:px-4 md:text-xs',
                filtro === id
                  ? 'bg-[#ffd91a] text-[#07111f] shadow-[0_12px_28px_rgba(250,204,21,0.22)]'
                  : 'border border-white/10 bg-white/[0.055] text-slate-300 hover:bg-white/[0.09]',
              ].join(' ')}
            >
              {label}
              <span className={filtro === id ? 'ml-1 text-[#07111f]/70' : 'ml-1 text-slate-500'}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 p-3 md:p-5">
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Abertos', totals.abertos, 'bg-[#ffd91a] text-[#07111f]'],
            ['Andamento', totals.andamento, 'bg-blue-500/18 text-blue-100'],
            ['Finalizados', totals.concluidos, 'bg-emerald-500/16 text-emerald-100'],
          ].map(([label, value, tone]) => (
            <div key={label} className={`rounded-2xl border border-white/10 px-3 py-2 ${tone}`}>
              <div className="text-lg font-black leading-none md:text-2xl">{value}</div>
              <div className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] opacity-75">{label}</div>
            </div>
          ))}
        </div>

        {meusPedidos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] p-4 text-sm font-bold text-slate-300">
            Voce ainda nao criou pedidos.
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] p-4 text-sm font-bold text-slate-300">
            Nenhum pedido nesse status.
          </div>
        ) : (
          <div className="space-y-3">
            {pedidosFiltrados.map((pedido, index) => {
              const meta = getStatusMeta(pedido)
              const criadoEm = pedido?.criadoEm || pedido?.createdAt || pedido?.atualizadoEm
              const statusKey = getStatusKey(pedido)
              const localOk = pedido?.local?.lat != null && pedido?.local?.lng != null
              const podeAbrirChat = !!pedido?.aceite?.id || statusKey === 'aceito' || statusKey === 'concluido'
              const podeConcluir = statusKey === 'aceito' && String(pedido?.criador?.id || '') === String(meuId || '')
              const podeAvaliar = statusKey === 'concluido' && !pedido?.avaliacao
              const podeRelatar = statusKey === 'aceito' || statusKey === 'concluido'

              return (
                <motion.article
                  key={pedido.id || index}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.025, ease: 'easeOut' }}
                  className="overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.075),rgba(255,255,255,0.035))] p-3 shadow-[0_16px_36px_rgba(0,0,0,0.22)] md:rounded-[22px] md:p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${meta.pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400">{formatTempo(criadoEm)}</span>
                      </div>

                      <h3 className="mt-2 line-clamp-2 break-words text-base font-black leading-tight text-white md:text-lg">
                        {pedido?.titulo || 'Pedido sem titulo'}
                      </h3>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-400 md:text-xs">
                        <span>{getCategoria(pedido)}</span>
                        <span className="text-slate-600">•</span>
                        <span>{getDistancia(pedido)}</span>
                        {formatData(criadoEm) ? (
                          <>
                            <span className="text-slate-600">•</span>
                            <span>{formatData(criadoEm)}</span>
                          </>
                        ) : null}
                      </div>

                      <p className="mt-2 line-clamp-1 text-[12px] font-semibold text-slate-300">{meta.next}</p>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className={`text-sm font-black leading-none md:text-base ${meta.value}`}>{formatMoney(pedido?.valor)}</div>
                      {pedido?.aceite?.nome ? (
                        <div className="mt-2 max-w-[96px] truncate text-[10px] font-bold text-slate-500">{pedido.aceite.nome}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr_42px] gap-2 md:grid-cols-[1fr_46px]">
                    <button
                      type="button"
                      onClick={() => abrirDetalhes(pedido)}
                      className="h-10 rounded-xl border border-white/10 bg-white/[0.055] px-3 text-left text-xs font-black text-white transition hover:bg-white/[0.1] active:scale-[0.99] md:h-11"
                    >
                      Ver detalhes
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (podeAbrirChat) onAbrirChat?.(pedido)
                        else avisarEmBreve('Chat liberado apos aceite', 'Quando alguem aceitar o pedido, a conversa aparece aqui.')
                      }}
                      className={[
                        'grid h-10 place-items-center rounded-xl border transition active:scale-[0.97] md:h-11',
                        podeAbrirChat
                          ? 'border-white/10 bg-white/[0.06] text-slate-100 hover:bg-white/[0.11]'
                          : 'border-white/10 bg-white/[0.03] text-slate-500',
                      ].join(' ')}
                      aria-label="Abrir conversa"
                    >
                      {chatIcon()}
                    </button>
                  </div>

                  {(podeConcluir || podeAvaliar || podeRelatar || localOk) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {podeConcluir ? (
                        <button
                          type="button"
                          onClick={() => onConfirmarServicoFeito?.(pedido)}
                          className="rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-black text-[#07111f] transition active:scale-[0.98]"
                        >
                          Concluir
                        </button>
                      ) : null}

                      {podeAvaliar ? (
                        <button
                          type="button"
                          onClick={() => onAvaliarServico?.(pedido)}
                          className="rounded-xl bg-[#ffd91a] px-3 py-2 text-[11px] font-black text-[#07111f] transition active:scale-[0.98]"
                        >
                          Avaliar
                        </button>
                      ) : null}

                      {localOk ? (
                        <button
                          type="button"
                          onClick={() => onVerMapa?.(pedido)}
                          className="rounded-xl border border-blue-300/20 bg-blue-500/12 px-3 py-2 text-[11px] font-black text-blue-100 transition active:scale-[0.98]"
                        >
                          Mapa
                        </button>
                      ) : null}

                      {podeRelatar ? (
                        <button
                          type="button"
                          onClick={() => onProblemaServico?.(pedido)}
                          className="rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-[11px] font-black text-red-100 transition active:scale-[0.98]"
                        >
                          Problema
                        </button>
                      ) : null}
                    </div>
                  )}
                </motion.article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
