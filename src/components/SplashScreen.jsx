'use client'

import { motion } from 'framer-motion'

export default function SplashScreen({ exiting = false }) {
  return (
    <motion.main
      className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#020617] px-5 text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1, scale: exiting ? 0.985 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      aria-busy="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />

      <section className="relative w-full max-w-sm text-center">
        <div className="relative mx-auto h-[240px] w-[240px] sm:h-[320px] sm:w-[320px]">
          <motion.div
            className="absolute inset-8 rounded-full bg-cyan-300/16 blur-3xl sm:inset-10"
            animate={{ scale: [0.92, 1.16, 0.92], opacity: [0.34, 0.68, 0.34] }}
            transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
          <motion.img
            src="/pin_vazio.png"
            alt="Pin Corre Aqui"
            className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_30px_58px_rgba(34,211,238,0.24)]"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6 }}
          />

          <motion.img
            src="/boneco_correndo.png"
            alt=""
            className="absolute left-[111px] top-[34px] w-[112px] object-contain drop-shadow-[0_16px_28px_rgba(0,0,0,0.34)] sm:left-[149px] sm:top-[45px] sm:w-[154px]"
            initial={{
              x: -310,
              y: 20,
              opacity: 1,
              scale: 1,
            }}
            animate={{
              x: -12,
              y: -12,
              opacity: 1,
              scale: 1,
            }}
            transition={{
              type: 'spring',
              stiffness: 90,
              damping: 12,
              delay: 0.35,
            }}
            aria-hidden="true"
          />

          <motion.div
            className="absolute -bottom-10 left-[53%] w-max -translate-x-1/2 text-center text-lg font-black tracking-normal text-white drop-shadow-[0_8px_22px_rgba(34,211,238,0.28)] sm:-bottom-12 sm:left-[54%] sm:text-2xl"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.35 }}
          >
            Corre Aqui
          </motion.div>
        </div>
      </section>
    </motion.main>
  )
}
