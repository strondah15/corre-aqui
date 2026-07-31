'use client'

import { memo, useCallback, useRef } from 'react'
import FeaturedProfessionalCard from './FeaturedProfessionalCard'
import FeaturedProfessionalsBanner from './FeaturedProfessionalsBanner'

const FeaturedProfessionalsSection = memo(function FeaturedProfessionalsSection({
  professionals = [],
  onOpenProfile,
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
      <section
        className="mt-6 min-h-[250px] animate-pulse md:mt-8"
        aria-label="Carregando profissionais em destaque"
        aria-busy="true"
      >
        <div className="h-7 w-64 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-52 rounded bg-slate-100" />
        <div className="mt-3 h-20 rounded-[22px] bg-slate-100" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="h-40 rounded-[20px] bg-slate-100" />
          <div className="h-40 rounded-[20px] bg-slate-100" />
        </div>
      </section>
    )
  }

  if (!professionals.length) {
    if (!showDevelopmentDiagnostics) return null

    return (
      <section
        className="mt-6 rounded-[20px] border border-dashed border-amber-300 bg-amber-50 px-4 py-5 md:mt-8"
        aria-label="Diagnóstico de profissionais em destaque"
      >
        <h2 className="text-base font-black text-slate-950">
          Destaques ainda não configurados
        </h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {error === 'api_error'
            ? 'A consulta de destaques não pôde ser concluída.'
            : 'Nenhum plano de destaque ativo foi encontrado.'}
        </p>
        <span className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-amber-800 ring-1 ring-amber-200">
          Visível apenas em desenvolvimento.
        </span>
      </section>
    )
  }

  return (
    <section className="mt-6 md:mt-8" aria-labelledby="featured-professionals-title">
      <div>
        <h2 id="featured-professionals-title" className="text-xl font-black leading-tight text-slate-950 md:text-3xl">
          Profissionais em Destaque
        </h2>
        <p className="mt-1 text-[13px] font-semibold leading-snug text-slate-500 md:text-sm">
          Profissionais com mais visibilidade na sua região.
        </p>
      </div>

      <FeaturedProfessionalsBanner onViewAll={onViewAll} testMode={testMode} />

      <div className="relative">
        <div
          ref={carouselRef}
          className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pr-1 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-flow-col md:auto-cols-[280px] [&::-webkit-scrollbar]:hidden"
          tabIndex={0}
          aria-label="Carrossel de profissionais em destaque"
        >
          {professionals.map((professional) => (
            <FeaturedProfessionalCard
              key={professional.uid}
              professional={professional}
              onOpen={onOpenProfile}
              testMode={testMode}
            />
          ))}
        </div>

        {professionals.length > 2 ? (
          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm"
              aria-label="Profissionais anteriores"
            >
              ‹
            </button>
            <span className="h-1.5 w-12 rounded-full bg-slate-200" aria-hidden="true" />
            <button
              type="button"
              onClick={() => scrollByPage(1)}
              className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm"
              aria-label="Proximos profissionais"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
})

export default FeaturedProfessionalsSection
