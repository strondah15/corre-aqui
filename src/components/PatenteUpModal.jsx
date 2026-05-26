'use client'

import { motion, AnimatePresence } from 'framer-motion'
import Patente, { getPatenteVisual } from './Patente'

export default function PatenteUpModal({
  open = false,
  patente = 'Corredor',
  tipo = 'corre',
  nivel = 2,
  animado = true,
  onClose,
}) {
  const visual = getPatenteVisual(tipo, nivel)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 md:p-6"
        >
          <motion.div
            initial={{ scale: 0.82, y: 25, rotate: -2 }}
            animate={{ scale: 1, y: 0, rotate: 0 }}
            exit={{ scale: 0.82, y: 25 }}
            transition={{ type: 'spring', stiffness: 180, damping: 18 }}
            className="relative w-full max-w-md overflow-hidden rounded-[22px] border border-yellow-300/20 bg-[#071120]/95 p-4 text-center shadow-[0_28px_85px_rgba(250,204,21,0.16)] md:rounded-[30px] md:p-6 md:shadow-[0_30px_100px_rgba(250,204,21,0.18)]"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 0.35, scale: 1 }}
              transition={{ duration: 0.5 }}
              className={`pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-gradient-to-br ${visual.cor} opacity-40 blur-3xl`}
            />
            <motion.div
              animate={animado ? { rotate: [0, -6, 6, 0], scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className={`relative mx-auto grid h-20 w-20 place-items-center rounded-[24px] bg-gradient-to-br ${visual.cor} text-4xl shadow-[0_18px_55px_rgba(250,204,21,0.24)] md:h-24 md:w-24 md:rounded-[30px] md:text-5xl md:shadow-[0_20px_70px_rgba(250,204,21,0.28)]`}
            >
              {visual.icon}
            </motion.div>

            <div className="relative mt-4 text-[11px] font-black uppercase tracking-[0.22em] text-yellow-300 md:mt-6 md:text-xs md:tracking-[0.28em]">
              Nova patente
            </div>

            <h2 className="relative mt-2 text-3xl font-black text-white md:text-4xl">
              {patente}
            </h2>

            <div className="relative mt-4 flex justify-center">
              <Patente tipo={tipo} nivel={nivel} />
            </div>

            <p className="relative mt-3 text-sm text-slate-300 md:mt-4 md:text-base">
              Você desbloqueou uma nova evolução no Corre Aqui.
            </p>

            <button
              onClick={onClose}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-yellow-300 to-orange-500 py-3 font-black text-slate-950 md:mt-7 md:rounded-2xl"
            >
              Continuar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
