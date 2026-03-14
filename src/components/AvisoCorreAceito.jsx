'use client'

import { useEffect, useMemo, useState } from 'react'

export default function AvisoCorreAceito({
  meuId,
  corres = [],
  onAbrirChat,
  onVerMapa,
  showToast,
}) {
  const [fechados, setFechados] = useState({})
  const [ultimoToast, setUltimoToast] = useState('')

  const pedidoAceito = useMemo(() => {
    if (!meuId) return null
    if (!Array.isArray(corres)) return null

    const lista = corres.filter((p) => {
      const marker = `${p?.id || ''}:${p?.aceite?.id || ''}`

      return (
        p?.criador?.id === meuId &&
        String(p?.status || '').toLowerCase() === 'aceito' &&
        !!p?.aceite?.id &&
        !fechados[marker]
      )
    })

    if (!lista.length) return null

    lista.sort((a, b) => {
      const ta = Number(a?.aceite?.aceitoEm || a?.atualizadoEm || 0)
      const tb = Number(b?.aceite?.aceitoEm || b?.atualizadoEm || 0)
      return tb - ta
    })

    return lista[0]
  }, [corres, meuId, fechados])

  useEffect(() => {
    if (!pedidoAceito) return

    const marker = `${pedidoAceito.id}:${pedidoAceito?.aceite?.id || ''}`
    if (ultimoToast === marker) return

    setUltimoToast(marker)

    if (typeof showToast === 'function') {
      showToast({
        type: 'success',
        title: 'Seu corre foi aceito! 🚀',
        message: `${pedidoAceito?.aceite?.nome || 'Alguém'} aceitou seu pedido.`,
      })
    }
  }, [pedidoAceito, ultimoToast, showToast])

  if (!pedidoAceito) return null

  const marker = `${pedidoAceito.id}:${pedidoAceito?.aceite?.id || ''}`

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[9999] w-[92%] max-w-md">
      <div className="rounded-2xl p-4 bg-emerald-500/15 border border-emerald-400/20 backdrop-blur-md shadow-xl shadow-black/30">
        <div className="text-sm font-bold text-emerald-100">
          🚀 Seu corre foi aceito
        </div>

        <div className="text-sm text-emerald-50 mt-1">
          <b>{pedidoAceito?.aceite?.nome || 'Alguém'}</b> aceitou:
          {' '}
          <span className="text-white">
            {pedidoAceito?.titulo || 'Seu pedido'}
          </span>
        </div>

        <div className="mt-3 flex gap-2 flex-wrap">
          <button
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition active:scale-[0.98]"
            onClick={() => onAbrirChat?.(pedidoAceito)}
            type="button"
          >
            Abrir conversa
          </button>

          <button
            className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-sm transition active:scale-[0.98]"
            onClick={() => onVerMapa?.(pedidoAceito)}
            type="button"
          >
            Ver no mapa
          </button>

          <button
            className="px-3 py-2 rounded-xl bg-black/20 hover:bg-black/30 border border-white/10 text-white text-sm transition active:scale-[0.98]"
            onClick={() =>
              setFechados((prev) => ({
                ...prev,
                [marker]: true,
              }))
            }
            type="button"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}