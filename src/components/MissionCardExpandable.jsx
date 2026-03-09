'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * MissionCardExpandable
 * - Card compacto na lista
 * - Ao clicar: animação "layout" para fullscreen
 * - Overlay escurece fundo
 * - Escape fecha
 *
 * Props:
 * - item: { id, title, creator, price, status, feePct, distanceText, cityText }
 * - onAccept?: (item) => void
 * - onChat?: (item) => void
 */
export default function MissionCardExpandable({ item, onAccept, onChat }) {
  const [open, setOpen] = useState(false)

  const layoutId = useMemo(() => `mission-${item?.id}`, [item?.id])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const statusLabel = (item?.status || 'ABERTO').toUpperCase()

  return (
    <>
      {/* CARD COMPACTO */}
      <motion.button
        layoutId={layoutId}
        onClick={() => setOpen(true)}
        className="
          w-full text-left
          rounded-2xl
          border border-white/10
          bg-white/[0.04]
          shadow-[0_10px_40px_rgba(0,0,0,0.35)]
          backdrop-blur-xl
          p-4
          hover:bg-white/[0.06]
          transition
        "
        whileTap={{ scale: 0.99 }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-3xl font-semibold tracking-tight">
              {formatBRL(item?.price ?? 50)}
            </div>
            <div className="mt-1 text-lg font-medium text-white/90">
              {item?.title || 'Ajuda com compras no mercado'}
            </div>
            <div className="mt-2 text-sm text-white/60">
              Criado por <span className="text-white/80">{item?.creator || 'jesus'}</span>
            </div>

            <div className="mt-2 text-xs text-white/55">
              Taxa estimada: {item?.feePct ?? 10}%
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <span
              className="
                inline-flex items-center gap-2
                rounded-full px-3 py-1 text-xs
                border border-emerald-400/20
                bg-emerald-400/10 text-emerald-200
              "
            >
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              {statusLabel}
            </span>

            <div className="flex gap-2">
              <MiniBtn
                label="Chat"
                onClick={(e) => {
                  e.stopPropagation()
                  onChat?.(item)
                }}
              />
              <PrimaryMiniBtn
                label="Aceitar"
                onClick={(e) => {
                  e.stopPropagation()
                  onAccept?.(item)
                }}
              />
            </div>
          </div>
        </div>
      </motion.button>

      {/* FULLSCREEN EXPANDIDO */}
      <AnimatePresence>
        {open && (
          <>
            {/* overlay */}
            <motion.div
              className="fixed inset-0 z-[80] bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />

            <motion.div
              layoutId={layoutId}
              className="
                fixed inset-0 z-[90]
                p-4 sm:p-6
                flex items-center justify-center
              "
            >
              <motion.div
                className="
                  w-full max-w-2xl
                  rounded-3xl
                  border border-white/10
                  bg-[#0B0F1A]/80
                  shadow-[0_30px_120px_rgba(0,0,0,0.65)]
                  backdrop-blur-2xl
                  overflow-hidden
                "
                initial={{ borderRadius: 24 }}
                animate={{ borderRadius: 24 }}
                exit={{ borderRadius: 24 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* header */}
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                      <span className="text-sm text-white/80">CA</span>
                    </div>
                    <div>
                      <div className="text-base font-semibold text-white/90">
                        {item?.title || 'Ajuda com compras no mercado'}
                      </div>
                      <div className="text-xs text-white/55">
                        Criado por {item?.creator || 'jesus'} • Taxa {item?.feePct ?? 10}%
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setOpen(false)}
                    className="
                      rounded-full px-3 py-2
                      bg-white/5 hover:bg-white/10
                      border border-white/10
                      text-white/80
                    "
                    aria-label="Fechar"
                  >
                    ✕
                  </button>
                </div>

                {/* content */}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-4xl font-semibold tracking-tight">
                        {formatBRL(item?.price ?? 50)}
                      </div>
                      <div className="mt-1 text-sm text-white/60">
                        {item?.distanceText || '2 km de distância'} {item?.cityText ? `(${item.cityText})` : ''}
                      </div>
                    </div>

                    <span
                      className="
                        inline-flex items-center gap-2
                        rounded-full px-3 py-1 text-xs
                        border border-emerald-400/20
                        bg-emerald-400/10 text-emerald-200
                      "
                    >
                      <span className="h-2 w-2 rounded-full bg-emerald-300" />
                      {statusLabel}
                    </span>
                  </div>

                  {/* MAPA (placeholder pronto pra você plugar seu MapinhaModal/Leaflet) */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                    <div className="h-56 w-full flex items-center justify-center text-white/40 text-sm">
                      MAPA AQUI (plugar seu componente do mapa)
                    </div>
                  </div>

                  {/* ações */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onChat?.(item)}
                      className="
                        flex-1 rounded-2xl px-4 py-3
                        bg-white/5 hover:bg-white/10
                        border border-white/10
                        text-white/80
                      "
                    >
                      Abrir chat
                    </button>

                    <button
                      onClick={() => onAccept?.(item)}
                      className="
                        flex-1 rounded-2xl px-4 py-3
                        bg-gradient-to-r from-sky-500/70 to-cyan-400/70
                        hover:from-sky-500/80 hover:to-cyan-400/80
                        text-white font-semibold
                        shadow-[0_12px_40px_rgba(56,189,248,0.18)]
                        border border-white/10
                      "
                    >
                      Aceitar missão
                    </button>
                  </div>

                  <div className="text-xs text-white/45">
                    Dica: aperte <span className="text-white/70">ESC</span> para fechar.
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

/* ---------- UI helpers ---------- */
function MiniBtn({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="
        rounded-xl px-4 py-2 text-sm
        bg-white/5 hover:bg-white/10
        border border-white/10
        text-white/80
      "
    >
      {label}
    </button>
  )
}

function PrimaryMiniBtn({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="
        rounded-xl px-4 py-2 text-sm
        bg-sky-500/30 hover:bg-sky-500/40
        border border-sky-300/20
        text-white/90
      "
    >
      {label}
    </button>
  )
}

function formatBRL(value) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)
  } catch {
    return `R$ ${value}`
  }
}
