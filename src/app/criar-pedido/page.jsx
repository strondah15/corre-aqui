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
    <main className="min-h-[100dvh] bg-[#050914] px-4 py-6 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-3xl flex-col items-center justify-center text-center">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.055] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <LogoCorreAqui className="mx-auto h-20 w-20 rounded-[22px]" />
          <h1 className="mt-4 text-2xl font-black">Criar pedido</h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
            Descreva o serviço, escolha a categoria e publique para quem estiver disponível perto de você.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="h-12 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-[0_16px_44px_rgba(37,99,235,0.28)] transition hover:bg-blue-500 active:scale-[0.98]"
            >
              Abrir criação
            </button>
            <button
              type="button"
              onClick={voltarInicio}
              className="h-12 rounded-2xl border border-white/10 bg-white/[0.055] px-5 text-sm font-black text-slate-200 transition hover:bg-white/[0.09] active:scale-[0.98]"
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
