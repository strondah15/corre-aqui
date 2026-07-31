'use client'

import { memo, useCallback, useRef } from 'react'
import FeaturedRequestCard from './FeaturedRequestCard'

const FeaturedRequestsSection = memo(function FeaturedRequestsSection({
  requests = [],
  onOpenRequest,
  onAcceptRequest,
  onViewAll,
  loading = false,
  error = '',
  showDevelopmentDiagnostics = false,
  testMode = false,
}) {
  const carouselRef = useRef(null)
  const scrollByPage = useCallback((direction) => {
    const node = carouselRef.current
    if (!node) return
    node.scrollBy({
      left: direction * Math.max(260, Math.round(node.clientWidth * 0.85)),
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [])

  if (loading) {
    return (
      <section className="mb-5 animate-pulse" aria-label="Carregando pedidos em destaque" aria-busy="true">
        <div className="h-6 w-48 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-64 rounded bg-slate-100" />
        <div className="mt-3 flex gap-3 overflow-hidden">
          <div className="h-44 w-[252px] shrink-0 rounded-[22px] bg-slate-100" />
          <div className="h-44 w-[252px] shrink-0 rounded-[22px] bg-slate-100" />
        </div>
      </section>
    )
  }

  if (!requests.length) {
    if (!showDevelopmentDiagnostics) return null
    return (
      <section className="mb-5 rounded-[20px] border border-dashed border-amber-300 bg-amber-50 px-4 py-4" aria-label="Diagnostico de pedidos em destaque">
        <h2 className="text-base font-black text-slate-950">Pedidos em destaque ainda nao configurados</h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {error === 'api_error'
            ? 'A consulta de destaques nao pode ser concluida.'
            : 'Nenhum impulso de pedido ativo foi encontrado.'}
        </p>
        <span className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-amber-800 ring-1 ring-amber-200">
          Visivel apenas em desenvolvimento.
        </span>
      </section>
    )
  }

  return (
    <section className="mb-5" aria-labelledby="featured-requests-title">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>
          <h2 id="featured-requests-title" className="text-lg font-black leading-tight text-slate-950 md:text-2xl">
            Pedidos em Destaque
          </h2>
          <p className="mt-0.5 text-[12px] font-bold leading-snug text-slate-500 md:text-sm">
            Pedidos impulsionados por clientes da sua regiao.
          </p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="hidden rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm transition hover:bg-slate-50 md:inline-flex"
        >
          Ver todos
        </button>
      </div>

      <div className="mt-3 rounded-[24px] border border-blue-100 bg-gradient-to-r from-blue-950 via-blue-900 to-slate-950 p-3 text-white shadow-[0_16px_34px_rgba(15,23,42,0.16)]">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
              {testMode ? 'Previa local' : 'Visibilidade paga'}
            </div>
            <p className="mt-0.5 text-xs font-semibold text-white/80">
              O impulso aumenta a exposicao, sem alterar a ordem organica abaixo.
            </p>
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#ffd91a] text-xl text-blue-950 shadow-[0_10px_24px_rgba(245,158,11,0.28)]" aria-hidden="true">
            🚀
          </div>
        </div>
      </div>

      <div className="relative mt-3">
        <div
          ref={carouselRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pr-1 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-flow-col md:auto-cols-[280px] md:overflow-x-auto [&::-webkit-scrollbar]:hidden"
          tabIndex={0}
          aria-label="Carrossel de pedidos em destaque"
        >
          {requests.map((request) => (
            <FeaturedRequestCard
              key={request.pedidoId || request.id}
              request={request}
              onOpen={onOpenRequest}
              onAccept={onAcceptRequest}
            />
          ))}
        </div>

        {requests.length > 2 ? (
          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm"
              aria-label="Pedidos anteriores"
            >
              ‹
            </button>
            <span className="h-1.5 w-12 rounded-full bg-slate-200" aria-hidden="true" />
            <button
              type="button"
              onClick={() => scrollByPage(1)}
              className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm"
              aria-label="Proximos pedidos"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
})

export default FeaturedRequestsSection
