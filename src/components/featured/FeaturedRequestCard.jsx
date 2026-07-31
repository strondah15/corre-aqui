'use client'

import { memo, useCallback } from 'react'
import {
  formatFeaturedRequestAge,
  formatFeaturedRequestValue,
} from '@/lib/featuredRequests'

const safeText = (value) => String(value || '').trim()

const FeaturedRequestCard = memo(function FeaturedRequestCard({
  request,
  onOpen,
  onAccept,
}) {
  const handleOpen = useCallback(() => onOpen?.(request), [onOpen, request])
  const handleAccept = useCallback(() => onAccept?.(request), [onAccept, request])
  const badge = request?.testMode ? 'Previa' : 'Destaque'

  return (
    <article className="flex w-[252px] shrink-0 snap-start flex-col rounded-[22px] border border-amber-300 bg-white p-3.5 text-slate-950 shadow-[0_16px_34px_rgba(15,23,42,0.12)] md:w-[280px]">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-amber-800">
          <span aria-hidden="true">⚡</span>
          {badge}
        </span>
        {request?.urgencia ? (
          <span className="rounded-full bg-red-50 px-2 py-1 text-[9px] font-black uppercase text-red-600">
            Urgente
          </span>
        ) : null}
      </div>

      <h3 className="mt-3 line-clamp-2 min-h-[42px] text-[17px] font-black leading-tight text-blue-950">
        {safeText(request?.titulo) || 'Pedido em destaque'}
      </h3>

      <div className="mt-2 space-y-1.5 text-[11px] font-bold text-slate-600">
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true">{request?.categoriaEmoji || '⚡'}</span>
          <span className="line-clamp-1">{safeText(request?.categoriaNome) || 'Pedido'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true">💰</span>
          <span className="font-black text-emerald-700">{formatFeaturedRequestValue(request?.valor)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true">⏱</span>
          <span>{formatFeaturedRequestAge(request?.criadoEm)}</span>
        </div>
        {request?.distancia ? (
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true">📍</span>
            <span>{request.distancia}</span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleOpen}
          className="h-9 rounded-xl border border-blue-100 bg-blue-50 text-[11px] font-black text-blue-700 transition hover:bg-blue-100 active:scale-[0.98]"
          aria-label={`Ver pedido ${safeText(request?.titulo) || ''}`}
        >
          Ver pedido
        </button>
        <button
          type="button"
          onClick={handleAccept}
          className="h-9 rounded-xl bg-[#ffd91a] text-[11px] font-black text-blue-950 shadow-[0_8px_18px_rgba(245,158,11,0.18)] transition hover:bg-yellow-300 active:scale-[0.98]"
          aria-label={`Aceitar pedido ${safeText(request?.titulo) || ''}`}
        >
          Aceitar
        </button>
      </div>
    </article>
  )
})

export default FeaturedRequestCard
