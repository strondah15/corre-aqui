'use client'

import { motion } from 'framer-motion'

export default function TesteMotionPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-white"
      >
        <div className="text-2xl font-semibold">Framer Motion OK ✅</div>
        <div className="mt-2 text-white/60">Se apareceu animando, está instalado.</div>
      </motion.div>
    </div>
  )
}