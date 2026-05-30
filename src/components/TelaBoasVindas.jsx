'use client'

import LogoCorreAqui from '@/components/LogoCorreAqui'

export default function TelaBoasVindas({ onEntrar }) {
  return (
    <main className="relative min-h-[100dvh] w-full overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_100%)] px-3 py-4 text-white sm:px-5 sm:py-8">
      <div className="pointer-events-none absolute -right-20 top-20 h-72 w-72 rounded-[72px] bg-yellow-200/28 rotate-12" />
      <div className="pointer-events-none absolute -left-24 -top-20 h-72 w-72 rounded-full bg-white/16" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col justify-center sm:min-h-[calc(100vh-4rem)]">
        <div className="mb-4 rounded-[30px] border border-white/30 bg-white/18 p-5 shadow-[0_24px_80px_rgba(37,99,235,0.22)] backdrop-blur-2xl sm:mb-7 sm:rounded-[36px] sm:p-6">
          <LogoCorreAqui className="h-20 w-20 rounded-[22px] bg-white/90 shadow-[0_18px_55px_rgba(37,99,235,0.22)] sm:h-28 sm:w-28 sm:rounded-[28px]" />
          <div className="mt-3 inline-flex rounded-full border border-white/40 bg-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white sm:mt-4 sm:text-[11px] sm:tracking-[0.16em]">
            Serviços locais com confiança
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:mt-5 sm:text-4xl">
            Corre Aqui
          </h1>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-white/90 sm:mt-3 sm:text-lg">
            Encontre alguém perto para resolver hoje.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/76 sm:mt-3 sm:text-sm">
            Peça ajuda, combine pelo chat, acompanhe o serviço e construa reputação com avaliações e patentes.
          </p>
        </div>

        <div className="grid gap-2 sm:gap-3">
          <div className="rounded-[18px] border border-white/30 bg-white/88 p-3 text-slate-950 shadow-[0_12px_28px_rgba(15,23,42,0.1)] sm:rounded-[26px] sm:p-4">
            <div className="text-sm font-black text-blue-800">Preciso de ajuda</div>
            <div className="mt-0.5 text-xs leading-snug text-slate-600 sm:mt-1 sm:leading-relaxed">
              Crie um pedido e encontre corres ou profissionais disponíveis.
            </div>
          </div>

          <div className="rounded-[18px] border border-white/30 bg-white/88 p-3 text-slate-950 shadow-[0_12px_28px_rgba(15,23,42,0.1)] sm:rounded-[26px] sm:p-4">
            <div className="text-sm font-black text-blue-800">Quero trabalhar</div>
            <div className="mt-0.5 text-xs leading-snug text-slate-600 sm:mt-1 sm:leading-relaxed">
              Fique disponível, receba pedidos e combine direto com o cliente.
            </div>
          </div>

          <div className="rounded-[18px] border border-yellow-200/60 bg-yellow-100/90 p-3 text-slate-950 shadow-[0_12px_28px_rgba(245,158,11,0.12)] sm:rounded-[26px] sm:p-4">
            <div className="text-sm font-black text-blue-900">Mais confiança</div>
            <div className="mt-0.5 text-xs leading-snug text-slate-700 sm:mt-1 sm:leading-relaxed">
              Perfil, histórico, avaliações e notificações ficam ligados à sua conta.
            </div>
          </div>
        </div>

        <a
          href="/login"
          onClick={() => {
            onEntrar?.()
          }}
          className="relative z-50 mt-4 flex h-11 w-full items-center justify-center rounded-[18px] bg-[#ffd91a] text-sm font-black text-blue-950 shadow-[0_14px_34px_rgba(245,158,11,0.24)] transition active:scale-[0.98] sm:mt-5 sm:h-14 sm:rounded-[22px] pointer-events-auto"
        >
          Começar
        </a>

        <div className="mt-4 text-center text-xs font-semibold text-blue-950/70">
          Você continua no controle dos seus dados e da sua localização.
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-black text-blue-950/70">
          <a href="/termos" className="transition hover:text-blue-950">Termos</a>
          <a href="/privacidade" className="transition hover:text-blue-950">Privacidade</a>
          <a href="/seguranca" className="transition hover:text-blue-950">Segurança</a>
        </div>
      </div>
    </main>
  )
}
