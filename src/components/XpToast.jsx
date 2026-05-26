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
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="pointer-events-none fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.15rem)] z-[99970] mx-auto max-w-[340px] md:bottom-24 md:max-w-none"
        >
          <div className="relative overflow-hidden rounded-[20px] border border-cyan-300/20 bg-[#071120]/95 px-3.5 py-3 shadow-[0_18px_54px_rgba(34,211,238,0.2)] backdrop-blur-2xl md:rounded-[28px] md:px-6 md:py-5 md:shadow-[0_20px_70px_rgba(34,211,238,0.24)]">
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '120%' }}
              transition={{ duration: 1.4, ease: 'easeInOut' }}
              className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/12 to-transparent"
            />
            <div className="flex items-center gap-3 md:gap-4">
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
                className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 text-xl md:h-14 md:w-14 md:text-2xl"
              >
                ✨
              </motion.div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300 md:text-sm md:tracking-[0.22em]">
                  XP recebido
                </div>

                <div className="mt-0.5 text-xl font-black text-white md:mt-1 md:text-2xl">
                  +{xp} XP
                </div>

                <div className="line-clamp-2 text-xs text-slate-300 md:text-sm">
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
