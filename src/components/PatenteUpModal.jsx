'use client'

import { motion, AnimatePresence } from 'framer-motion'

export default function PatenteUpModal({
  open = false,
  patente = 'Corredor',
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
            initial={{ scale: 0.82, y: 25 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.82, y: 25 }}
            transition={{ type: 'spring', stiffness: 180, damping: 18 }}
            className="w-full max-w-md rounded-[36px] border border-yellow-300/20 bg-[#071120]/95 p-8 text-center shadow-[0_30px_100px_rgba(250,204,21,0.18)]"
          >
            <div className="mx-auto grid h-24 w-24 place-items-center rounded-[30px] bg-gradient-to-br from-yellow-300 to-orange-500 text-5xl">
              🏆
            </div>

            <div className="mt-6 text-xs font-black uppercase tracking-[0.28em] text-yellow-300">
              Nova patente
            </div>

            <h2 className="mt-2 text-4xl font-black text-white">
              {patente}
            </h2>

            <p className="mt-3 text-slate-300">
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
