'use client'

import { motion, AnimatePresence } from 'framer-motion'

export default function XpToast({
  open = false,
  xp = 10,
  texto = 'XP recebido',
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.92 }}
          transition={{ duration: 0.28 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[99999]"
        >
          <div className="rounded-[28px] border border-cyan-300/20 bg-[#071120]/95 px-6 py-5 shadow-[0_20px_70px_rgba(34,211,238,0.24)] backdrop-blur-2xl">
            <div className="flex items-center gap-4">
              <motion.div
                animate={{
                  boxShadow: [
                    '0 0 0 rgba(34,211,238,0)',
                    '0 0 28px rgba(34,211,238,0.45)',
                    '0 0 0 rgba(34,211,238,0)',
                  ],
                }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                }}
                className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 text-2xl"
              >
                ⚡
              </motion.div>

              <div>
                <div className="text-sm font-black uppercase tracking-[0.22em] text-cyan-300">
                  XP recebido
                </div>

                <div className="mt-1 text-2xl font-black text-white">
                  +{xp} XP
                </div>

                <div className="text-sm text-slate-300">
                  {texto}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
