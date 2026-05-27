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
    <main className="min-h-[100dvh] bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_120%)] px-3 py-4 text-white md:px-4 md:py-6">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col items-center justify-center text-center md:min-h-[calc(100dvh-3rem)]">
        <div className="rounded-[24px] border border-white/35 bg-white/92 p-4 text-slate-950 shadow-[0_22px_70px_rgba(37,99,235,0.22)] backdrop-blur-2xl md:rounded-[32px] md:p-6">
          <LogoCorreAqui className="mx-auto h-16 w-16 rounded-[18px] bg-white shadow-[0_14px_34px_rgba(37,99,235,0.18)] md:h-20 md:w-20 md:rounded-[22px]" />
          <h1 className="mt-3 text-xl font-black text-blue-950 md:mt-4 md:text-2xl">Criar pedido</h1>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-600 md:mt-2 md:text-sm">
            Descreva o serviço, escolha a categoria e publique para quem estiver disponível perto de você.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center md:mt-5">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="h-11 rounded-2xl bg-[#ffd91a] px-5 text-sm font-black text-blue-950 shadow-[0_16px_44px_rgba(245,158,11,0.22)] transition hover:bg-yellow-300 active:scale-[0.98] md:h-12"
            >
              Abrir criação
            </button>
            <button
              type="button"
              onClick={voltarInicio}
              className="h-11 rounded-2xl border border-blue-100 bg-blue-50 px-5 text-sm font-black text-blue-700 transition hover:bg-blue-100 active:scale-[0.98] md:h-12"
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
