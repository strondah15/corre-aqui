'use client'

export default function TelaBoasVindas({ onEntrar }) {
  return (
    <main className="min-h-[100dvh] w-full bg-[#050914] px-4 py-5 text-white sm:px-5 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-md flex-col justify-center sm:min-h-[calc(100vh-4rem)]">
        <div className="mb-5 sm:mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-[20px] border border-cyan-300/15 bg-cyan-400/10 text-xl font-black text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)] sm:h-14 sm:w-14 sm:rounded-[22px] sm:text-2xl">
            CA
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight sm:mt-5 sm:text-4xl">
            Corre Aqui
          </h1>
          <p className="mt-2 text-base font-semibold leading-snug text-slate-200 sm:mt-3 sm:text-lg">
            Encontre alguem perto para resolver hoje.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Peca ajuda, combine pelo chat e acompanhe tudo pelo mapa. Sem taxa do app para quem trabalha.
          </p>
        </div>

        <div className="grid gap-2.5 sm:gap-3">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.045] p-3.5 sm:rounded-[26px] sm:p-4">
            <div className="text-sm font-black text-white">Preciso de ajuda</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-400">
              Crie um pedido e encontre corres ou profissionais disponiveis.
            </div>
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.045] p-3.5 sm:rounded-[26px] sm:p-4">
            <div className="text-sm font-black text-white">Quero trabalhar</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-400">
              Fique disponivel, receba pedidos e combine direto com o cliente.
            </div>
          </div>
        </div>

        <a
          href="/login"
          onClick={() => {
            alert('clicou comecar')
            console.log('[TelaBoasVindas] toque Comecar', {
              mobile:
                /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(window.navigator?.userAgent || '') ||
                window.matchMedia?.('(max-width: 768px)')?.matches,
            })
            onEntrar?.()
          }}
          className="relative z-50 mt-5 flex h-12 w-full items-center justify-center rounded-[20px] bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-black text-white shadow-[0_14px_34px_rgba(37,99,235,0.28)] transition active:scale-[0.98] sm:h-14 sm:rounded-[22px] sm:shadow-[0_18px_48px_rgba(37,99,235,0.35)] pointer-events-auto"
        >
          Comecar
        </a>

        <div className="mt-4 text-center text-xs font-semibold text-slate-500">
          Voce continua no controle dos seus dados e da sua localizacao.
        </div>
      </div>
    </main>
  )
}
