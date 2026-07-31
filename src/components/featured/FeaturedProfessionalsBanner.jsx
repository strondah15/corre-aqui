'use client'

import { memo } from 'react'

const FeaturedProfessionalsBanner = memo(function FeaturedProfessionalsBanner({
  onViewAll,
  testMode = false,
}) {
  return (
    <div className="relative mt-3 overflow-hidden rounded-[22px] bg-[#071b46] px-4 py-4 text-white shadow-[0_16px_34px_rgba(7,27,70,0.18)] md:flex md:items-center md:justify-between md:px-6 md:py-5">
      <div className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full border-[22px] border-amber-300/15" aria-hidden="true" />
      <div className="relative flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#ffd91a] text-blue-950 shadow-[0_8px_18px_rgba(245,158,11,0.24)]">
          <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true">
            <path d="m5 11 6 5 5-9 5 9 6-5-2.2 13H7.2L5 11Z" fill="currentColor" />
            <path d="M8 27h16" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-black md:text-lg">
            {testMode ? 'Prévia local de visibilidade' : 'Visibilidade na sua região'}
          </div>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-blue-100 md:text-sm">
            {testMode
              ? 'Perfis reais usados somente para validar esta seção.'
              : 'Perfis com destaque comercial ativo aparecem por aqui.'}
          </p>
        </div>
      </div>
      <div className="relative mt-3 md:mt-0">
        <button
          type="button"
          onClick={onViewAll}
          className="h-9 rounded-xl border border-white/15 bg-white/10 px-4 text-xs font-black text-white transition hover:bg-white/15 active:scale-[0.98] md:min-w-28"
        >
          Ver todos
        </button>
      </div>
    </div>
  )
})

export default FeaturedProfessionalsBanner
