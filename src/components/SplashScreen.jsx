'use client'

import { motion } from 'framer-motion'

function BluePin() {
  return (
    <svg viewBox="0 0 512 512" className="h-full w-full drop-shadow-[0_32px_70px_rgba(37,99,235,0.36)]" aria-hidden="true">
      <defs>
        <linearGradient id="splash-pin-blue" x1="96" x2="418" y1="48" y2="438" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0b73ff" />
          <stop offset="0.54" stopColor="#18bfd2" />
          <stop offset="1" stopColor="#0646a8" />
        </linearGradient>
      </defs>
      <path
        d="M256 24C153.9 24 71 106.5 71 208.2c0 131.6 154.9 244.8 176.9 260.2a14.3 14.3 0 0 0 16.2 0C286.1 453 441 339.8 441 208.2 441 106.5 358.1 24 256 24Z"
        fill="url(#splash-pin-blue)"
      />
      <circle cx="256" cy="205" r="121" fill="#ffffff" opacity="0.94" />
      <circle cx="256" cy="205" r="96" fill="#eaf7ff" />
    </svg>
  )
}

function YellowRunner({ className = '' }) {
  return (
    <svg viewBox="0 0 220 220" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="splash-runner-yellow" x1="30" x2="190" y1="30" y2="190" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff173" />
          <stop offset="0.55" stopColor="#ffd91a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#splash-runner-yellow)" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="132" cy="45" r="18" fill="url(#splash-runner-yellow)" stroke="none" />
        <path d="M116 76 91 121" strokeWidth="27" />
        <path d="M110 86 64 81" strokeWidth="21" />
        <path d="M114 86 153 103 178 83" strokeWidth="21" />
        <path d="M91 121 55 169 30 200" strokeWidth="24" />
        <path d="M92 122 143 148 125 199" strokeWidth="24" />
      </g>
    </svg>
  )
}

export default function SplashScreen({ exiting = false, status = 'Conectando perto de você...' }) {
  return (
    <motion.main
      className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_100%)] px-5 text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: exiting ? 0 : 1, scale: exiting ? 0.985 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      aria-busy="true"
    >
      <div className="pointer-events-none absolute -right-24 top-12 h-80 w-80 rounded-[80px] bg-yellow-200/30 rotate-12" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/16" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.2),transparent_38%)]" />

      <section className="relative w-full max-w-sm text-center">
        <div className="relative mx-auto h-[240px] w-[240px] sm:h-[320px] sm:w-[320px]">
          <motion.div
            className="absolute inset-8 rounded-full bg-blue-700/18 blur-3xl sm:inset-10"
            animate={{ scale: [0.92, 1.16, 0.92], opacity: [0.34, 0.68, 0.34] }}
            transition={{ duration: 1.15, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
          <motion.div
            className="absolute inset-0"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <BluePin />
          </motion.div>

          <motion.div
            className="absolute left-[94px] top-[42px] w-[94px] drop-shadow-[0_16px_28px_rgba(0,0,0,0.28)] sm:left-[126px] sm:top-[56px] sm:w-[126px]"
            initial={{
              x: -310,
              y: 30,
              opacity: 1,
              scale: 1,
            }}
            animate={{
              x: 8,
              y: 6,
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
          >
            <YellowRunner className="h-full w-full" />
          </motion.div>

          <motion.div
            className="absolute -bottom-10 left-1/2 w-max -translate-x-1/2 text-center text-2xl font-black tracking-tight text-white drop-shadow-[0_8px_22px_rgba(37,99,235,0.28)] sm:-bottom-14 sm:text-4xl"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.35 }}
          >
            Corre Aqui
          </motion.div>
        </div>

        <motion.div
          className="mt-16 text-xs font-black uppercase tracking-[0.18em] text-blue-950/70 sm:mt-20"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.35 }}
        >
          {status}
        </motion.div>
      </section>
    </motion.main>
  )
}
