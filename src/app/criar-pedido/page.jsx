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
    <main className="min-h-[100dvh] overflow-hidden bg-[#07111f] px-3 py-4 text-white md:px-4 md:py-6">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[54vh] bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_48%,#ffe01b_132%)] opacity-95" />
      <div className="pointer-events-none fixed -right-20 top-10 h-80 w-56 rotate-12 rounded-[70px] bg-yellow-100/30" />
      <div className="pointer-events-none fixed -left-24 top-20 h-72 w-72 rounded-full bg-white/10" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col items-center justify-center text-center md:min-h-[calc(100dvh-3rem)]">
        <div className="w-full overflow-hidden rounded-[28px] bg-white text-slate-950 shadow-[0_24px_80px_rgba(2,8,23,0.32)] md:rounded-[36px]">
          <div className="relative min-h-44 bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_48%,#ffe01b_132%)] p-5 text-left md:min-h-56 md:p-8">
            <div className="pointer-events-none absolute -right-8 top-7 h-32 w-32 rotate-12 rounded-[36px] bg-white/25 md:h-44 md:w-44 md:rounded-[48px]" />
            <LogoCorreAqui className="relative h-16 w-16 rounded-[20px] bg-white/90 shadow-[0_18px_42px_rgba(15,23,42,0.18)] md:h-20 md:w-20 md:rounded-[24px]" />
            <div className="relative mt-5 max-w-lg">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-950/70">Corre Aqui</div>
              <h1 className="mt-2 text-3xl font-black leading-none text-blue-950 md:text-5xl">Novo pedido</h1>
              <p className="mt-3 max-w-md text-sm font-bold leading-relaxed text-blue-950/70 md:text-base">
                Descreva o servico, escolha a categoria e publique para quem estiver disponivel perto de voce.
              </p>
            </div>
          </div>

          <div className="p-4 md:p-6">
            <div className="rounded-[24px] border border-blue-100 bg-blue-50 p-3 text-left md:rounded-[30px] md:p-4">
              <div className="text-sm font-black text-blue-950">Fluxo rapido e seguro</div>
              <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-600 md:text-sm">
                O pedido entra na lista da regiao e pode ser acompanhado pelo chat.
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center md:mt-5">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="h-11 rounded-2xl bg-[#ffd91a] px-5 text-sm font-black text-blue-950 shadow-[0_16px_44px_rgba(245,158,11,0.22)] transition hover:bg-yellow-300 active:scale-[0.98] md:h-12"
              >
                Abrir criacao
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
