'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Mapadinamico from '@/components/Mapadinamico'
import PerfilDrawer from '@/components/PerfilDrawer'
import { auth } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'

export default function ModoGate() {
  const [selectedMode, setSelectedMode] = useState('cliente') // 'cliente' | 'corre'
  const [stage, setStage] = useState('select') // 'select' | 'app'
  const [openPerfilGlobal, setOpenPerfilGlobal] = useState(false)
  const [uid, setUid] = useState(null)


  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null)
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    // só pra lembrar a última escolha (mas SEM pular a tela)
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
    // Se você quiser obrigar escolher sempre do zero, descomenta:
    // try { localStorage.removeItem('modoApp') } catch {}

    setStage('select')
  }

  // ✅ Depois que escolher e continuar, abre o app
  if (stage === 'app') {
    return (
      <Mapadinamico
        initialMode={selectedMode}
        onBackToMode={voltarParaAbas}
      />
    )
  }

  // ✅ SEMPRE mostrar as duas abas primeiro
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4 py-6 bg-[#0B0F1A] text-white">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-[24px] bg-white/10 border border-white/10 flex items-center justify-center text-2xl">
            ⚡
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
            Escolha o modo
          </h1>
          <p className="mt-2 text-sm text-white/70">
            Escolha seu modo.
          </p>
        </div>

        {/* ✅ ABAS (Cliente / Corre) */}
        <div className="mt-3 relative flex rounded-2xl border border-white/10 bg-white/5 p-1">
          <motion.div
            layout
            className="absolute top-1 bottom-1 w-1/2 rounded-xl bg-white/10"
            style={{ left: selectedMode === 'cliente' ? 4 : '50%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          />

          <button
            type="button"
            onClick={() => setSelectedMode('cliente')}
            className={`relative z-10 w-1/2 py-3 rounded-xl text-sm font-semibold ${
              selectedMode === 'cliente' ? 'text-white' : 'text-white/60'
            }`}
          >
            Cliente
          </button>

          <button
            type="button"
            onClick={() => setSelectedMode('corre')}
            className={`relative z-10 w-1/2 py-3 rounded-xl text-sm font-semibold ${
              selectedMode === 'corre' ? 'text-white' : 'text-white/60'
            }`}
          >
            Corre
          </button>
        </div>

        {/* Conteúdo de cada modo */}
        <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
          {selectedMode === 'cliente' ? (
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-400/20 flex items-center justify-center text-2xl">
                🧑
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold">Modo Cliente</div>
                <div className="text-sm text-white/70 mt-0.5">
                  Você cria pedidos e encontra quem vai resolver.
                </div>
                <div className="mt-2 text-[11px] text-white/55">
                  • Criar missão • Chat • Mapa
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-yellow-300/15 border border-yellow-300/20 flex items-center justify-center text-2xl">
                ⚡
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold">Modo Corre</div>
                <div className="text-sm text-white/70 mt-0.5">
                  Você trabalha: aparece disponível e aceita missões.
                </div>
                <div className="mt-2 text-[11px] text-white/55">
                  • Online • Mensagens • Pedidos
                </div>
              </div>
            </div>
          )}

          <button
            onClick={continuar}
            className="
              
              mt-3 w-full rounded-[20px] py-3 font-black
              text-white tracking-[0.01em]
              bg-gradient-to-r from-sky-500 via-blue-500 to-cyan-400
              hover:from-sky-400 hover:via-blue-400 hover:to-cyan-300
              border border-cyan-300/20
              shadow-[0_0_18px_rgba(56,189,248,0.28),0_14px_40px_rgba(37,99,235,0.30)]
              hover:shadow-[0_0_26px_rgba(56,189,248,0.40),0_18px_50px_rgba(37,99,235,0.40)]
              transition-all duration-300
              active:scale-[0.985]
            "
          >
            Continuar como {selectedMode === 'cliente' ? 'Cliente' : 'Corre'}
          </button>


          <button
            type="button"
            onClick={() => setOpenPerfilGlobal(true)}
            className="
              
              mt-2 w-full rounded-[18px] py-2.5 font-semibold
              bg-white/[0.035] hover:bg-white/[0.06]
              border border-white/5
              text-white/60
              shadow-[0_6px_18px_rgba(0,0,0,0.10)]
              transition-all duration-300
            "
          >
            👤 Perfil e configurações
          </button>
        </div>

        <div className="
w-full mt-2 rounded-[16px]
bg-white/[0.03]
hover:bg-white/[0.05]
text-white/60
font-semibold
py-2.5
border border-white/5
shadow-[0_6px_18px_rgba(0,0,0,0.12)]
transition-all duration-300
">
          Dica: pra testar MVP rápido, use <b>Corre</b> primeiro.
        </div>

        <PerfilDrawer
          open={openPerfilGlobal}
          onClose={() => setOpenPerfilGlobal(false)}
          uid={uid}
        />
      </div>
    </div>
  )
}