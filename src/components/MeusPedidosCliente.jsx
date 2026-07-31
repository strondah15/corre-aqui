'use client'

import { useCallback, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ATENDIMENTO_STATUS, normalizeAtendimentoStatus } from '@/lib/atendimento'

const CLIENTE_LIST_STATE_KEY = 'correAqui:listState:v2:cliente'
const COMMERCIAL_HIGHLIGHTS_UI_ENABLED = false

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
  const number = Number(normalized)
  return Number.isFinite(number) ? number : 0
}

function formatMoney(value) {
  const number = getValorPedido(value)
  if (!number) return 'Combinar'
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

  const number = Number(raw)
  if (Number.isFinite(number)) return `${number.toFixed(number >= 10 ? 0 : 1).replace('.', ',')} km`
  return String(raw)
}

function getStatusKey(pedido) {
  const status = normalizeAtendimentoStatus(pedido?.status)
  if (pedido?.problemaServico) return 'problema'
  if (status === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) return 'aguardando_confirmacao'
  if (
    status === 'aceito' ||
    status === 'aguardando_inicio' ||
    status === 'em_atendimento' ||
    status === 'agendado' ||
    status === 'em_andamento' ||
    status === 'andamento'
  ) return 'aceito'
  if (status === 'concluido' || status === 'finalizado' || status === 'feito') return 'concluido'
  if (status === 'cancelado' || status === 'recusado') return 'cancelado'
  return 'aberto'
}

function hasActiveCommercialBoost(pedido) {
  const candidates = [
    pedido?.featuredBoost,
    pedido?.featuredRequestEntitlement,
    pedido?.boost,
  ]

  return candidates.some((boost) => {
    if (!boost || typeof boost !== 'object') return false
    const active = boost.active === true || boost.ativo === true || String(boost.status || '').toLowerCase() === 'active'
    if (!active) return false
    const expiresAt = getMs(boost.expiresAt || boost.expiraEm || boost.validoAte || boost.until)
    return !expiresAt || expiresAt > Date.now()
  })
}

function canBoostPedido(pedido, meuId) {
  if (!pedido || pedido.privateRequest) return false
  if (String(pedido?.criador?.id || '') !== String(meuId || '')) return false
  if (getStatusKey(pedido) !== 'aberto') return false
  if (pedido?.aceite?.id || pedido?.aceitoPor || pedido?.aceitadorId) return false
  if (pedido?.bloqueado || pedido?.blocked || pedido?.moderado || pedido?.moderation?.blocked) return false
  if (hasActiveCommercialBoost(pedido)) return false
  return true
}

function getStatusMeta(pedido) {
  const key = getStatusKey(pedido)

  const map = {
    aberto: {
      label: 'ABERTO',
      next: 'Pedidos aguardando profissionais',
      pill: 'border-blue-100 bg-blue-50 text-blue-700',
      dot: 'bg-blue-500',
      value: 'text-blue-700',
    },
    aceito: {
      label: 'ACEITO',
      next: 'Profissional ja aceitou',
      pill: 'border-amber-100 bg-amber-50 text-amber-700',
      dot: 'bg-amber-500',
      value: 'text-amber-700',
    },
    aguardando_confirmacao: {
      label: 'CONFIRMACAO PENDENTE',
      next: 'Confirme a conclusao solicitada pelo profissional',
      pill: 'border-yellow-100 bg-yellow-50 text-yellow-700',
      dot: 'bg-yellow-500',
      value: 'text-yellow-700',
    },
    concluido: {
      label: 'CONCLUIDO',
      next: pedido?.avaliacao ? 'Servico avaliado' : 'Aguardando avaliacao',
      pill: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      dot: 'bg-emerald-500',
      value: 'text-emerald-700',
    },
    cancelado: {
      label: 'CANCELADO',
      next: 'Pedido encerrado',
      pill: 'border-slate-200 bg-slate-100 text-slate-600',
      dot: 'bg-slate-400',
      value: 'text-slate-600',
    },
    problema: {
      label: 'PROBLEMA',
      next: 'Acompanhe pelo chat',
      pill: 'border-red-100 bg-red-50 text-red-700',
      dot: 'bg-red-500',
      value: 'text-red-700',
    },
  }

  return map[key] || map.aberto
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M7.5 18.5 4 20l1.1-3.2A7.7 7.7 0 0 1 3.5 12C3.5 7.6 7.3 4 12 4s8.5 3.6 8.5 8-3.8 8-8.5 8a9 9 0 0 1-4.5-1.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path d="M8 11.8h8M8 14.4h5.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  )
}

function SummaryIcon({ type }) {
  if (type === 'clock') {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7.8v4.7l3 1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    )
  }

  if (type === 'check') {
    return (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.16" />
        <path d="m8 12.3 2.5 2.5L16.4 9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M4 7.5c0-1.1.9-2 2-2h4l1.8 2H18c1.1 0 2 .9 2 2v7c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2v-9Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function SummaryCard({ icon, value, title, subtitle, tone }) {
  const tones = {
    blue: 'border-blue-100 bg-blue-50/80 text-blue-700',
    amber: 'border-amber-100 bg-amber-50/80 text-amber-700',
    emerald: 'border-emerald-100 bg-emerald-50/80 text-emerald-700',
  }

  return (
    <div className={`flex min-h-[86px] items-center gap-3 rounded-[18px] border px-3 py-3 md:min-h-[98px] md:gap-4 md:px-4 ${tones[tone]}`}>
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-current/15 bg-white/65 md:h-14 md:w-14">
        <SummaryIcon type={icon} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-black leading-none text-slate-950">{value}</div>
        <div className="mt-1 text-sm font-black text-current">{title}</div>
        <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">{subtitle}</div>
      </div>
    </div>
  )
}

export default function MeusPedidosCliente({
  meuId,
  corres = [],
  privateRequests = [],
  onAbrirChat,
  onVerMapa,
  onConfirmarServicoFeito,
  onProblemaServico,
  onAvaliarServico,
  onBoostPedido,
  onToast,
}) {
  const router = useRouter()
  const [filtro, setFiltro] = useState('todos')

  const meusPedidos = useMemo(() => {
    const pedidosPublicos = (corres || [])
      .filter((pedido) => String(pedido?.criador?.id || '') === String(meuId || ''))
    const pedidosPrivados = (Array.isArray(privateRequests) ? privateRequests : [])
      .filter((pedido) => String(pedido?.clienteId || '') === String(meuId || ''))
      .map((pedido) => {
        const status = String(pedido?.status || 'pendente').toLowerCase()
        const aceito = status === 'aceito' || status === 'aguardando_inicio' || status === 'em_atendimento' || status === 'agendado'
        return {
          ...pedido,
          id: pedido?.privateRequestId || pedido?.id,
          privateRequest: true,
          titulo: pedido?.servicoTitulo || pedido?.titulo || (pedido?.tipo === 'agendamento' ? 'Agendamento solicitado' : 'Pedido direto'),
          categoriaNome: pedido?.tipo === 'agendamento' ? 'Agendamento' : 'Pedido direto',
          status: status === 'pendente' ? 'aberto' : status,
          criadoEm: pedido?.criadoEm,
          atualizadoEm: pedido?.atualizadoEm,
          criador: { id: pedido?.clienteId, nome: pedido?.clienteNome || 'Cliente' },
          aceite: aceito ? { id: pedido?.profissionalId, nome: pedido?.profissionalNome || 'Profissional' } : null,
        }
      })

    return [...pedidosPublicos, ...pedidosPrivados]
      .sort((a, b) => {
        const ta = getMs(a?.criadoEm || a?.createdAt || a?.atualizadoEm || 0)
        const tb = getMs(b?.criadoEm || b?.createdAt || b?.atualizadoEm || 0)
        return tb - ta
      })
  }, [corres, meuId, privateRequests])

  const totals = useMemo(() => {
    return meusPedidos.reduce(
      (acc, pedido) => {
        const key = getStatusKey(pedido)
        acc.todos += 1
        if (key === 'aberto') acc.abertos += 1
        if (key === 'aceito' || key === 'aguardando_confirmacao') acc.andamento += 1
        if (key === 'concluido') acc.concluidos += 1
        if (key === 'cancelado') acc.cancelados += 1
        if (key === 'problema') acc.problemas += 1
        return acc
      },
      { todos: 0, abertos: 0, andamento: 0, concluidos: 0, cancelados: 0, problemas: 0 }
    )
  }, [meusPedidos])

  const pedidosFiltrados = useMemo(() => {
    return meusPedidos.filter((pedido) => {
      const key = getStatusKey(pedido)
      if (filtro === 'todos') return true
      if (filtro === 'andamento') return key === 'aceito' || key === 'aguardando_confirmacao'
      if (filtro === 'concluidos') return key === 'concluido'
      if (filtro === 'cancelados') return key === 'cancelado'
      return key === filtro
    })
  }, [filtro, meusPedidos])

  const filtros = useMemo(
    () => [
      ['todos', 'Todos', totals.todos],
      ['andamento', 'Em andamento', totals.andamento],
      ['concluidos', 'Concluidos', totals.concluidos],
      ['cancelados', 'Cancelados', totals.cancelados],
    ],
    [totals.andamento, totals.cancelados, totals.concluidos, totals.todos]
  )

  const avisarEmBreve = useCallback((title, message) => {
    if (typeof onToast === 'function') {
      onToast({ type: 'info', title, message })
    }
  }, [onToast])

  const abrirDetalhes = useCallback((pedido) => {
    if (!pedido?.id) return
    if (pedido?.privateRequest) {
      const statusKey = getStatusKey(pedido)
      if (statusKey === 'aceito' || statusKey === 'concluido') {
        onAbrirChat?.(pedido)
        return
      }
      avisarEmBreve(
        pedido?.status === 'recusado' ? 'Pedido recusado' : 'Pedido enviado',
        pedido?.status === 'recusado'
          ? 'Esse profissional recusou a solicitação. Você pode procurar outro perfil.'
          : 'O profissional recebeu sua solicitação e ainda vai responder.'
      )
      return
    }
    try {
      if (process.env.NODE_ENV !== 'production') console.time('open-card')
      sessionStorage.setItem(
        CLIENTE_LIST_STATE_KEY,
        JSON.stringify({
          modoApp: 'cliente',
          clientePainelBaixo: 'meusPedidos',
          scrollY: window.scrollY || document.documentElement.scrollTop || 0,
          ts: Date.now(),
        })
      )
    } catch {}
    router.push(`/pedido/${encodeURIComponent(String(pedido.id))}?voltar=cliente`)
    if (process.env.NODE_ENV !== 'production') {
      window.requestAnimationFrame(() => console.timeEnd('open-card'))
    }
  }, [avisarEmBreve, onAbrirChat, router])

  return (
    <section className="mx-auto w-full max-w-[1440px] overflow-hidden rounded-[22px] border border-slate-200 bg-white text-slate-950 shadow-[0_18px_60px_rgba(15,23,42,0.08)] md:rounded-[28px]">
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 py-4 backdrop-blur md:px-6 md:py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Meus pedidos</p>
            <h2 className="mt-1 text-2xl font-black leading-none text-slate-950 md:text-3xl">Meus pedidos</h2>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-center shadow-sm">
            <div className="text-2xl font-black leading-none text-blue-700">{totals.todos}</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-blue-700">total</div>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filtros.map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFiltro(id)}
              className={[
                'shrink-0 rounded-xl px-4 py-2.5 text-[11px] font-black transition active:scale-[0.97] md:min-w-[132px] md:text-xs',
                filtro === id
                  ? 'bg-blue-600 text-white shadow-[0_12px_28px_rgba(37,99,235,0.22)]'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-blue-50',
              ].join(' ')}
            >
              {label}
              <span className={filtro === id ? 'ml-1 text-white/75' : 'ml-1 text-slate-500'}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-4 md:p-6">
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard icon="folder" value={totals.abertos} title="Abertos" subtitle="Pedidos aguardando profissionais" tone="blue" />
          <SummaryCard icon="clock" value={totals.andamento} title="Em andamento" subtitle="Profissional ja aceitou" tone="amber" />
          <SummaryCard icon="check" value={totals.concluidos} title="Finalizados" subtitle="Servicos concluidos" tone="emerald" />
        </div>

        {meusPedidos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
            Voce ainda nao criou pedidos.
          </div>
        ) : pedidosFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
            Nenhum pedido nesse status.
          </div>
        ) : (
          <div className="space-y-3">
            {pedidosFiltrados.map((pedido, index) => {
              const meta = getStatusMeta(pedido)
              const criadoEm = pedido?.criadoEm || pedido?.createdAt || pedido?.atualizadoEm
              const statusKey = getStatusKey(pedido)
              const localOk = pedido?.local?.lat != null && pedido?.local?.lng != null
              const podeAbrirChat = !!pedido?.aceite?.id || statusKey === 'aceito' || statusKey === 'aguardando_confirmacao' || statusKey === 'concluido'
              const podeConcluir = statusKey === 'aguardando_confirmacao' && String(pedido?.criador?.id || '') === String(meuId || '')
              const podeAvaliar = statusKey === 'concluido' && !pedido?.avaliacao
              const podeRelatar = statusKey === 'aceito' || statusKey === 'aguardando_confirmacao' || statusKey === 'concluido'
              const podeImpulsionar = COMMERCIAL_HIGHLIGHTS_UI_ENABLED && canBoostPedido(pedido, meuId)

              return (
                <motion.article
                  key={pedido.id || index}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.025, ease: 'easeOut' }}
                  className="overflow-hidden rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_12px_34px_rgba(15,23,42,0.07)] md:rounded-[22px] md:p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${meta.pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                        <span className="text-[11px] font-bold text-slate-500">{formatTempo(criadoEm)}</span>
                      </div>

                      <h3 className="mt-3 line-clamp-2 break-words text-base font-black leading-tight text-slate-950 md:text-lg">
                        {pedido?.titulo || 'Pedido sem titulo'}
                      </h3>

                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold text-slate-500 md:text-xs">
                        <span>{getCategoria(pedido)}</span>
                        <span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden="true" />
                        <span>{getDistancia(pedido)}</span>
                        {formatData(criadoEm) ? (
                          <>
                            <span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden="true" />
                            <span>{formatData(criadoEm)}</span>
                          </>
                        ) : null}
                      </div>

                      <p className="mt-3 line-clamp-1 text-[12px] font-black text-slate-800">{meta.next}</p>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className={`text-lg font-black leading-none md:text-xl ${meta.value}`}>{formatMoney(pedido?.valor)}</div>
                      {pedido?.aceite?.nome ? (
                        <div className="mt-3 max-w-[110px] truncate text-[11px] font-bold text-slate-500">{pedido.aceite.nome}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr_42px] gap-2 md:grid-cols-[1fr_46px]">
                    <button
                      type="button"
                      onClick={() => abrirDetalhes(pedido)}
                      className="h-10 rounded-xl border border-blue-100 bg-blue-50/65 px-3 text-left text-xs font-black text-blue-700 transition hover:bg-blue-50 active:scale-[0.99] md:h-11"
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
                          ? 'border-blue-100 bg-white text-blue-700 hover:bg-blue-50'
                          : 'border-slate-200 bg-slate-50 text-slate-400',
                      ].join(' ')}
                      aria-label="Abrir conversa"
                    >
                      <ChatIcon />
                    </button>
                  </div>

                  {(podeImpulsionar || podeConcluir || podeAvaliar || podeRelatar || localOk) ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {podeImpulsionar ? (
                        <button
                          type="button"
                          onClick={() => onBoostPedido?.(pedido)}
                          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-700 transition active:scale-[0.98]"
                        >
                          Impulsionar pedido
                        </button>
                      ) : null}

                      {podeConcluir ? (
                        <button
                          type="button"
                          onClick={() => onConfirmarServicoFeito?.(pedido)}
                          className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black text-white transition active:scale-[0.98]"
                        >
                          Concluir
                        </button>
                      ) : null}

                      {podeAvaliar ? (
                        <button
                          type="button"
                          onClick={() => onAvaliarServico?.(pedido)}
                          className="rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black text-white transition active:scale-[0.98]"
                        >
                          Avaliar
                        </button>
                      ) : null}

                      {localOk ? (
                        <button
                          type="button"
                          onClick={() => onVerMapa?.(pedido)}
                          className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black text-blue-700 transition active:scale-[0.98]"
                        >
                          Mapa
                        </button>
                      ) : null}

                      {podeRelatar ? (
                        <button
                          type="button"
                          onClick={() => onProblemaServico?.(pedido)}
                          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black text-red-600 transition active:scale-[0.98]"
                        >
                          Problema
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </motion.article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
