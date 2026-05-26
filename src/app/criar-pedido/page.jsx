'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LoginGate from '@/components/LoginGate'
import ModalIA from '@/components/ModalIA'
import LogoCorreAqui from '@/components/LogoCorreAqui'

function CriarPedidoEntrada() {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  const voltarInicio = () => {
    setOpen(false)
    router.replace('/')
  }

  return (
    <main className="min-h-[100dvh] bg-[#050914] px-3 py-4 text-white md:px-4 md:py-6">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col items-center justify-center text-center md:min-h-[calc(100dvh-3rem)]">
        <div className="rounded-[22px] border border-white/10 bg-white/[0.055] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.34)] md:rounded-[30px] md:p-6 md:shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <LogoCorreAqui className="mx-auto h-16 w-16 rounded-[18px] md:h-20 md:w-20 md:rounded-[22px]" />
          <h1 className="mt-3 text-xl font-black md:mt-4 md:text-2xl">Criar pedido</h1>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-400 md:mt-2 md:text-sm">
            Descreva o serviço, escolha a categoria e publique para quem estiver disponível perto de você.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center md:mt-5">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-[0_16px_44px_rgba(37,99,235,0.28)] transition hover:bg-blue-500 active:scale-[0.98] md:h-12"
            >
              Abrir criação
            </button>
            <button
              type="button"
              onClick={voltarInicio}
              className="h-11 rounded-2xl border border-white/10 bg-white/[0.055] px-5 text-sm font-black text-slate-200 transition hover:bg-white/[0.09] active:scale-[0.98] md:h-12"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>

      <ModalIA open={open} onClose={voltarInicio} abrirCriacaoManual={() => setOpen(true)} />
    </main>
  )
}

export default function CriarPedidoPage() {
  return (
    <LoginGate>
      <CriarPedidoEntrada />
    </LoginGate>
  )
}
