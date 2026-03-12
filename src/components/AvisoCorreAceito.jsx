'use client'

import { useMemo } from 'react'

export default function AvisoCorreAceito({
  meuId,
  corres = [],
  onAbrirChat,
  onVerMapa,
}) {
  const pedidoAceito = useMemo(() => {
    if (!meuId) return null
    if (!Array.isArray(corres)) return null

    const lista = corres.filter((p) => {
      return (
        p?.criador?.id === meuId &&
        String(p?.status || '').toLowerCase() === 'aceito' &&
        p?.aceite?.id
      )
    })

    if (!lista.length) return null

    return lista[0]
  }, [corres, meuId])

  if (!pedidoAceito) return null

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[9999] w-[92%] max-w-md">
      <div className="rounded-2xl p-4 bg-emerald-500/15 border border-emerald-400/20 backdrop-blur-md shadow-xl">
        
        <div className="text-sm font-bold text-emerald-100">
          🚀 Seu corre foi aceito
        </div>

        <div className="text-sm text-emerald-50 mt-1">
          <b>{pedidoAceito?.aceite?.nome || 'Alguém'}</b> aceitou seu pedido
        </div>

        <div className="mt-3 flex gap-2">

          <button
            className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm"
            onClick={() => onAbrirChat?.(pedidoAceito)}
          >
            Abrir conversa
          </button>

          <button
            className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-white text-sm"
            onClick={() => onVerMapa?.(pedidoAceito)}
          >
            Ver no mapa
          </button>

        </div>

      </div>
    </div>
  )
}