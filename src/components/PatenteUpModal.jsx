'use client'

import { motion, AnimatePresence } from 'framer-motion'
import Patente from './Patente'

export default function PatenteUpModal({
  open = false,
  patente = 'Corredor',
  tipo = 'corre',
  nivel = 2,
  onClose,
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.82, y: 25, rotate: -2 }}
            animate={{ scale: 1, y: 0, rotate: 0 }}
            exit={{ scale: 0.82, y: 25 }}
            transition={{ type: 'spring', stiffness: 180, damping: 18 }}
            className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-yellow-300/20 bg-[#071120]/95 p-6 text-center shadow-[0_30px_100px_rgba(250,204,21,0.18)]"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 0.35, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-yellow-300/25 blur-3xl"
            />
            <motion.div
              animate={{ rotate: [0, -6, 6, 0], scale: [1, 1.05, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="relative mx-auto grid h-24 w-24 place-items-center rounded-[30px] bg-gradient-to-br from-yellow-300 to-orange-500 text-5xl shadow-[0_20px_70px_rgba(250,204,21,0.28)]"
            >
              🏆
            </motion.div>

            <div className="relative mt-6 text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
              Nova patente
            </div>

            <h2 className="relative mt-2 text-4xl font-black text-white">
              {patente}
            </h2>

            <div className="relative mt-4 flex justify-center">
              <Patente tipo={tipo} nivel={nivel} />
            </div>

            <p className="relative mt-4 text-slate-300">
              Você desbloqueou uma nova evolução no Corre Aqui.
            </p>

            <button
              onClick={onClose}
              className="mt-7 w-full rounded-2xl bg-gradient-to-r from-yellow-300 to-orange-500 py-3 font-black text-slate-950"
            >
              Continuar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
