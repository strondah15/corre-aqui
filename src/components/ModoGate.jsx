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
    label: 'Corres + Pro',
    icon: '⚡',
    description: 'Ative seus corres rápidos e seus serviços profissionais no mesmo lugar.',
    bullets: ['Corres rápidos', 'Serviços profissionais', 'Agenda e chat'],
  },
}

const LIST_STATE_PREFIX = 'correAqui:listState:v2'
const LIST_RETURN_FLAG = 'correAqui:returningToList'

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

  useEffect(() => {
    try {
      const returningKey = sessionStorage.getItem(LIST_RETURN_FLAG) || ''
      const clienteKey = `${LIST_STATE_PREFIX}:cliente`
      const correKey = `${LIST_STATE_PREFIX}:corre`
      if (returningKey === clienteKey || returningKey === correKey) {
        const mode = returningKey === clienteKey ? 'cliente' : 'corre'
        setSelectedMode(mode)
        setStage('app')
      }
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
    <main className="relative min-h-[100dvh] w-full overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_100%)] px-3 py-4 text-white md:px-4 md:py-6">
      <div className="pointer-events-none absolute -right-20 top-16 h-80 w-80 rounded-[80px] bg-yellow-200/28 rotate-12" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/16" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-center md:min-h-[calc(100vh-3rem)]">
        <div className="mb-3 md:mb-5">
          <div className="inline-flex rounded-full border border-white/35 bg-white/18 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white">
            Corre Aqui
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight md:mt-4 md:text-3xl">
            O que você precisa agora?
          </h1>
          <p className="mt-1.5 text-xs leading-snug text-white/80 md:mt-2 md:text-sm md:leading-relaxed">
            Escolha se vai pedir ajuda ou trabalhar. Você pode trocar depois quando quiser.
          </p>
        </div>

        <div className="relative grid grid-cols-2 rounded-[20px] border border-white/35 bg-white/20 p-1 shadow-[0_14px_34px_rgba(37,99,235,0.16)] backdrop-blur-xl md:rounded-[24px] md:p-1.5">
          <motion.div
            layout
            className="absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-[16px] bg-[#ffd91a] shadow-[0_10px_24px_rgba(245,158,11,0.18)] md:bottom-1.5 md:top-1.5 md:w-[calc(50%-6px)] md:rounded-[18px]"
            style={{ left: selectedMode === 'cliente' ? 4 : 'calc(50% + 0px)' }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          />

          {Object.entries(modes).map(([id, mode]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSelectedMode(id)}
              className={`relative z-10 h-11 rounded-[16px] text-xs font-black transition md:h-14 md:rounded-[18px] md:text-sm ${
                selectedMode === id ? 'text-blue-950' : 'text-white/70'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <section className="mt-3 rounded-[22px] border border-white/30 bg-white/90 p-3.5 text-slate-950 shadow-[0_20px_60px_rgba(37,99,235,0.2)] md:mt-4 md:rounded-[30px] md:p-5">
          <div className="flex items-start gap-3 md:gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[18px] border border-blue-100 bg-blue-50 text-xl md:h-14 md:w-14 md:rounded-[22px] md:text-2xl">
              {current.icon}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-blue-950 md:text-lg">{current.title}</h2>
              <p className="mt-1 text-xs leading-snug text-slate-600 md:text-sm md:leading-relaxed">
                {current.description}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-1.5 md:mt-4 md:gap-2">
            {current.bullets.map((item) => (
              <div
                key={item}
                className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-800 md:rounded-2xl md:py-2 md:text-xs"
              >
                {item}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={continuar}
            className="mt-4 h-12 w-full rounded-[18px] bg-[#ffd91a] text-sm font-black text-blue-950 shadow-[0_16px_38px_rgba(245,158,11,0.24)] transition active:scale-[0.98] md:mt-5 md:h-14 md:rounded-[22px]"
          >
            {selectedMode === 'cliente' ? 'Entrar como cliente' : 'Entrar para trabalhar'}
          </button>
        </section>

        <button
          type="button"
          onClick={() => setOpenPerfilGlobal(true)}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[18px] border border-white/35 bg-white/16 text-xs font-black text-white shadow-[0_12px_30px_rgba(15,23,42,0.14)] backdrop-blur-xl transition hover:bg-white/22 active:scale-[0.98] md:h-12 md:rounded-[20px] md:text-sm"
        >
          <span aria-hidden="true">⚙</span>
          <span>Configurações</span>
        </button>

        <PerfilDrawer
          open={openPerfilGlobal}
          onClose={() => setOpenPerfilGlobal(false)}
          uid={uid}
        />
      </div>
    </main>
  )
}
