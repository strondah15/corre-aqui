'use client'

export default function TelaBoasVindas({ onEntrar }) {
  return (
    <main className="min-h-screen w-full bg-[#050914] px-5 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-[22px] border border-cyan-300/15 bg-cyan-400/10 text-2xl shadow-[0_0_34px_rgba(34,211,238,0.16)]">
            ⚡
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-tight">
            Corre Aqui
          </h1>
          <p className="mt-3 text-lg font-semibold leading-snug text-slate-200">
            Encontre alguém perto para resolver hoje.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Peça ajuda, combine pelo chat e acompanhe tudo pelo mapa. Sem taxa do app para quem trabalha.
          </p>
        </div>

        <div className="grid gap-3">
          <div className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4">
            <div className="text-sm font-black text-white">Preciso de ajuda</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-400">
              Crie um pedido e encontre corres ou profissionais disponíveis.
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-white/[0.045] p-4">
            <div className="text-sm font-black text-white">Quero trabalhar</div>
            <div className="mt-1 text-xs leading-relaxed text-slate-400">
              Fique disponível, receba pedidos e combine direto com o cliente.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onEntrar}
          className="mt-5 h-14 w-full rounded-[22px] bg-gradient-to-r from-blue-600 to-cyan-500 text-sm font-black text-white shadow-[0_18px_48px_rgba(37,99,235,0.35)] transition active:scale-[0.98]"
        >
          Começar
        </button>

        <div className="mt-4 text-center text-xs font-semibold text-slate-500">
          Você continua no controle dos seus dados e da sua localização.
        </div>
      </div>
    </main>
  )
}
