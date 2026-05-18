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
    <main className="min-h-screen w-full bg-[#050914] px-4 py-6 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-5">
          <div className="inline-flex rounded-full border border-cyan-300/15 bg-cyan-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100">
            Corre Aqui
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight">
            O que você precisa agora?
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Escolha um caminho. Você pode trocar depois quando quiser.
          </p>
        </div>

        <div className="relative grid grid-cols-2 rounded-[24px] border border-white/10 bg-white/[0.045] p-1.5">
          <motion.div
            layout
            className="absolute bottom-1.5 top-1.5 w-[calc(50%-6px)] rounded-[18px] bg-white/10"
            style={{ left: selectedMode === 'cliente' ? 6 : 'calc(50% + 0px)' }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          />

          {Object.entries(modes).map(([id, mode]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedMode(id)}
              className={`relative z-10 h-14 rounded-[18px] text-sm font-black transition ${
                selectedMode === id ? 'text-white' : 'text-white/55'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <section className="mt-4 rounded-[30px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[22px] border border-white/10 bg-white/[0.065] text-2xl">
              {current.icon}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-white">{current.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">
                {current.description}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {current.bullets.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-2 text-xs font-bold text-slate-300"
              >
                {item}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={continuar}
            className="mt-5 h-14 w-full rounded-[22px] bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-black text-white shadow-[0_18px_48px_rgba(37,99,235,0.35)] transition active:scale-[0.98]"
          >
            Entrar como {current.label}
          </button>

          <button
            type="button"
            onClick={() => setOpenPerfilGlobal(true)}
            className="mt-3 h-12 w-full rounded-[20px] border border-white/10 bg-white/[0.035] text-sm font-bold text-white/70 transition hover:bg-white/[0.06]"
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
