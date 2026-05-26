'use client'

import LogoCorreAqui from '@/components/LogoCorreAqui'

export default function TelaBoasVindas({ onEntrar }) {
  return (
    <main className="min-h-[100dvh] w-full bg-[#050914] px-3 py-4 text-white sm:px-5 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-center sm:min-h-[calc(100vh-4rem)]">
        <div className="mb-4 sm:mb-7">
          <LogoCorreAqui className="h-16 w-16 rounded-[18px] shadow-[0_18px_55px_rgba(34,211,238,0.16)] sm:h-24 sm:w-24 sm:rounded-[22px]" />
          <div className="mt-3 inline-flex rounded-full border border-emerald-300/15 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100 sm:mt-4 sm:text-[11px] sm:tracking-[0.16em]">
            Serviços locais com confiança
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:mt-5 sm:text-4xl">
            Corre Aqui
          </h1>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-slate-200 sm:mt-3 sm:text-lg">
            Encontre alguém perto para resolver hoje.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400 sm:mt-3 sm:text-sm">
            Peça ajuda, combine pelo chat, acompanhe o serviço e construa reputação com avaliações e patentes.
          </p>
        </div>

        <div className="grid gap-2 sm:gap-3">
          <div className="rounded-[18px] border border-white/10 bg-white/[0.045] p-3 sm:rounded-[26px] sm:p-4">
            <div className="text-sm font-black text-white">Preciso de ajuda</div>
            <div className="mt-0.5 text-xs leading-snug text-slate-400 sm:mt-1 sm:leading-relaxed">
              Crie um pedido e encontre corres ou profissionais disponíveis.
            </div>
          </div>

          <div className="rounded-[18px] border border-white/10 bg-white/[0.045] p-3 sm:rounded-[26px] sm:p-4">
            <div className="text-sm font-black text-white">Quero trabalhar</div>
            <div className="mt-0.5 text-xs leading-snug text-slate-400 sm:mt-1 sm:leading-relaxed">
              Fique disponível, receba pedidos e combine direto com o cliente.
            </div>
          </div>

          <div className="rounded-[18px] border border-emerald-300/10 bg-emerald-400/[0.055] p-3 sm:rounded-[26px] sm:p-4">
            <div className="text-sm font-black text-white">Mais confiança</div>
            <div className="mt-0.5 text-xs leading-snug text-slate-400 sm:mt-1 sm:leading-relaxed">
              Perfil, histórico, avaliações e notificações ficam ligados à sua conta.
            </div>
          </div>
        </div>

        <a
          href="/login"
          onClick={() => {
            onEntrar?.()
          }}
          className="relative z-50 mt-4 flex h-11 w-full items-center justify-center rounded-[18px] bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-black text-white shadow-[0_14px_34px_rgba(37,99,235,0.28)] transition active:scale-[0.98] sm:mt-5 sm:h-14 sm:rounded-[22px] sm:shadow-[0_18px_48px_rgba(37,99,235,0.35)] pointer-events-auto"
        >
          Começar
        </a>

        <div className="mt-4 text-center text-xs font-semibold text-slate-500">
          Você continua no controle dos seus dados e da sua localização.
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
          <a href="/termos" className="transition hover:text-slate-300">Termos</a>
          <a href="/privacidade" className="transition hover:text-slate-300">Privacidade</a>
          <a href="/seguranca" className="transition hover:text-slate-300">Seguranca</a>
        </div>
      </div>
    </main>
  )
}
