'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Mapadinamico from '@/components/Mapadinamico'
import PerfilDrawer from '@/components/PerfilDrawer'
import { auth } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'

const modes = {
  cliente: {
    title: 'Preciso de ajuda',
    label: 'Cliente',
    icon: '🎯',
    description: 'Crie um pedido e encontre alguém perto para resolver.',
    bullets: ['Pedido rápido', 'Chat direto', 'Mapa limpo'],
  },
  corre: {
    title: 'Quero trabalhar',
    label: 'Corre',
    icon: '⚡',
    description: 'Fique disponível, aceite pedidos e combine o serviço.',
    bullets: ['Disponibilidade', 'Pedidos perto', '100% do combinado'],
  },
}

export default function ModoGate() {
  const [selectedMode, setSelectedMode] = useState('cliente')
  const [stage, setStage] = useState('select')
  const [openPerfilGlobal, setOpenPerfilGlobal] = useState(false)
  const [uid, setUid] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null)
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('modoApp')
      if (saved === 'cliente' || saved === 'corre') setSelectedMode(saved)
    } catch {}
  }, [])

  const continuar = () => {
    try {
      localStorage.setItem('modoApp', selectedMode)
    } catch {}
    setStage('app')
  }

  const voltarParaAbas = () => {
    setStage('select')
  }

  if (stage === 'app') {
    return <Mapadinamico initialMode={selectedMode} onBackToMode={voltarParaAbas} />
  }

  const current = modes[selectedMode]

  return (
    <main className="min-h-[100dvh] w-full bg-[#050914] px-3 py-4 text-white md:px-4 md:py-6">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-center md:min-h-[calc(100vh-3rem)]">
        <div className="mb-3 md:mb-5">
          <div className="inline-flex rounded-full border border-cyan-300/15 bg-cyan-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">
            Corre Aqui
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight md:mt-4 md:text-3xl">
            O que você precisa agora?
          </h1>
          <p className="mt-1.5 text-xs leading-snug text-slate-400 md:mt-2 md:text-sm md:leading-relaxed">
            Escolha um caminho. Você pode trocar depois quando quiser.
          </p>
        </div>

        <div className="relative grid grid-cols-2 rounded-[20px] border border-white/10 bg-white/[0.045] p-1 md:rounded-[24px] md:p-1.5">
          <motion.div
            layout
            className="absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-[16px] bg-white/10 md:bottom-1.5 md:top-1.5 md:w-[calc(50%-6px)] md:rounded-[18px]"
            style={{ left: selectedMode === 'cliente' ? 4 : 'calc(50% + 0px)' }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          />

          {Object.entries(modes).map(([id, mode]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedMode(id)}
              className={`relative z-10 h-11 rounded-[16px] text-xs font-black transition md:h-14 md:rounded-[18px] md:text-sm ${
                selectedMode === id ? 'text-white' : 'text-white/55'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <section className="mt-3 rounded-[22px] border border-white/10 bg-white/[0.045] p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.24)] md:mt-4 md:rounded-[30px] md:p-5 md:shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="flex items-start gap-3 md:gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[18px] border border-white/10 bg-white/[0.065] text-xl md:h-14 md:w-14 md:rounded-[22px] md:text-2xl">
              {current.icon}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-white md:text-lg">{current.title}</h2>
              <p className="mt-1 text-xs leading-snug text-slate-400 md:text-sm md:leading-relaxed">
                {current.description}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-1.5 md:mt-4 md:gap-2">
            {current.bullets.map((item) => (
              <div
                key={item}
                className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-1.5 text-[11px] font-bold text-slate-300 md:rounded-2xl md:py-2 md:text-xs"
              >
                {item}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={continuar}
            className="mt-4 h-12 w-full rounded-[18px] bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-black text-white shadow-[0_16px_38px_rgba(37,99,235,0.32)] transition active:scale-[0.98] md:mt-5 md:h-14 md:rounded-[22px] md:shadow-[0_18px_48px_rgba(37,99,235,0.35)]"
          >
            Entrar como {current.label}
          </button>

          <button
            type="button"
            onClick={() => setOpenPerfilGlobal(true)}
            className="mt-2 h-10 w-full rounded-[16px] border border-white/10 bg-white/[0.035] text-xs font-bold text-white/70 transition hover:bg-white/[0.06] md:mt-3 md:h-12 md:rounded-[20px] md:text-sm"
          >
            Perfil e configurações
          </button>
        </section>

        <PerfilDrawer
          open={openPerfilGlobal}
          onClose={() => setOpenPerfilGlobal(false)}
          uid={uid}
        />
      </div>
    </main>
  )
}
