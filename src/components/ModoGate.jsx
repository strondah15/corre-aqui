'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Mapadinamico from '@/components/Mapadinamico'

export default function ModoGate() {
  const [selectedMode, setSelectedMode] = useState('cliente') // 'cliente' | 'corre'
  const [stage, setStage] = useState('select') // 'select' | 'app'

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
    <div className="min-h-screen w-full flex items-center justify-center px-4 py-10 bg-[#0B0F1A] text-white">
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-3xl bg-white/10 border border-white/10 flex items-center justify-center text-2xl">
            ⚡
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
            Escolha o modo
          </h1>
          <p className="mt-2 text-sm text-white/70">
            Você pode escolher sempre que entrar.
          </p>
        </div>

        {/* ✅ ABAS (Cliente / Corre) */}
        <div className="mt-6 relative flex rounded-2xl border border-white/10 bg-white/5 p-1">
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
        <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
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
                  • Criar missão • Acompanhar no chat • Ver no mapa
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
                  • Ficar online • Receber mensagens • Aceitar pedidos
                </div>
              </div>
            </div>
          )}

          <button
            onClick={continuar}
            className="
              mt-6 w-full rounded-2xl py-3 font-semibold
              bg-gradient-to-r from-sky-500/70 to-cyan-400/70
              hover:from-sky-500/80 hover:to-cyan-400/80
              border border-white/10
              shadow-[0_12px_40px_rgba(56,189,248,0.18)]
            "
          >
            Continuar como {selectedMode === 'cliente' ? 'Cliente' : 'Corre'}
          </button>

          <button
            onClick={() => {
              try {
                localStorage.removeItem('modoApp')
              } catch {}
              setSelectedMode('cliente')
            }}
            className="mt-3 w-full rounded-2xl py-3 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-white/70"
          >
            Resetar escolha (opcional)
          </button>
        </div>

        <div className="mt-6 text-center text-[11px] text-white/50">
          Dica: pra testar MVP rápido, use <b>Corre</b> primeiro.
        </div>
      </div>
    </div>
  )
}