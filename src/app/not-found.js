import LogoCorreAqui from '@/components/LogoCorreAqui'
import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="relative z-[1] isolate grid min-h-[100dvh] place-items-center overflow-hidden bg-[linear-gradient(180deg,#e7f6ff_0%,#f7fbff_48%,#ffffff_100%)] px-4 py-8 text-[#102451]">
      <section className="w-full max-w-sm rounded-[28px] border border-blue-100 bg-white/95 p-6 text-center shadow-[0_22px_70px_rgba(37,99,235,0.14)] backdrop-blur-xl">
        <LogoCorreAqui className="mx-auto h-20 w-20" />
        <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-blue-600">Erro 404</p>
        <h1 className="mt-2 text-2xl font-black text-blue-950">Página não encontrada</h1>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
          Este endereço não existe ou foi movido. Volte para continuar usando o Corre Aqui.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-blue-700 px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(37,99,235,0.22)] transition hover:bg-blue-800 active:scale-[0.98]"
        >
          Voltar ao início
        </Link>
      </section>
    </main>
  )
}
