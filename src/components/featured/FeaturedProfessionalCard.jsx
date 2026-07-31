'use client'

import { memo, useCallback, useMemo } from 'react'
import {
  buildProfessionalReputation,
  formatProfessionalResponseTime,
} from '@/lib/professionalReputation'
import {
  formatFeaturedDistance,
  getFeaturedProfessionLabel,
} from '@/lib/featuredProfessionals'

const safeText = (value) => String(value || '').trim()

const safeImageUrl = (value) => {
  const url = safeText(value)
  return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(url) ? url : ''
}

const FeaturedProfessionalCard = memo(function FeaturedProfessionalCard({
  professional,
  onOpen,
  testMode = false,
}) {
  const nome = safeText(professional?.nome)
  const profession = getFeaturedProfessionLabel(professional)
  const reputation = useMemo(() => buildProfessionalReputation(professional), [professional])
  const responseLabel = formatProfessionalResponseTime(
    reputation.averageResponseTimeMs,
    reputation.responseSamples
  )
  const distanceLabel = formatFeaturedDistance(professional?.featuredDistanceKm)
  const photoUrl = safeImageUrl(professional?.fotoURL)
  const initials = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'CA'
  const avatarStyle = useMemo(
    () => (photoUrl ? { backgroundImage: `url("${photoUrl}")` } : undefined),
    [photoUrl]
  )
  const handleOpen = useCallback(() => onOpen?.(professional), [onOpen, professional])

  return (
    <article className="flex w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-[20px] border border-amber-300 bg-white p-3.5 shadow-[0_14px_30px_rgba(15,23,42,0.10)] md:w-[280px] md:rounded-[22px] md:p-4">
      <div className="flex min-w-0 items-start gap-2.5">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-950 bg-cover bg-center text-sm font-black text-white ring-2 ring-amber-300"
          style={avatarStyle}
          aria-label={`Foto de ${nome}`}
        >
          {!photoUrl ? professional?.avatarEmoji || initials : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <h3 className="line-clamp-1 text-[15px] font-black leading-tight text-blue-950 md:text-base">
              {nome}
            </h3>
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-amber-800">
              {testMode || professional?.featuredEntitlement?.testMode ? 'Prévia' : 'Destaque'}
            </span>
          </div>
          {profession ? (
            <p className="mt-0.5 line-clamp-2 min-h-8 text-[11px] font-bold leading-[1.35] text-slate-600 md:text-xs">
              {profession}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-[11px] font-bold leading-tight text-slate-600">
        {reputation.rating && reputation.reviewCount > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="text-amber-500" aria-hidden="true">★</span>
            <span>{`${reputation.rating.toFixed(1)} (${reputation.reviewCount})`}</span>
          </div>
        ) : null}
        {distanceLabel ? (
          <div className="flex items-center gap-1.5">
            <span className="text-blue-600" aria-hidden="true">●</span>
            <span>{distanceLabel} de distância</span>
          </div>
        ) : null}
        {responseLabel ? (
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-600" aria-hidden="true">●</span>
            <span>{responseLabel}</span>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={handleOpen}
        className="mt-auto h-9 w-full rounded-xl bg-[#ffd91a] px-3 text-xs font-black text-blue-950 shadow-[0_8px_18px_rgba(245,158,11,0.18)] transition active:scale-[0.98]"
      >
        Ver perfil
      </button>
    </article>
  )
})

export default FeaturedProfessionalCard
