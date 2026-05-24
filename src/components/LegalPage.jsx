import Link from 'next/link'
import LogoCorreAqui from '@/components/LogoCorreAqui'

const navLinks = [
  { href: '/termos', label: 'Termos' },
  { href: '/privacidade', label: 'Privacidade' },
  { href: '/seguranca', label: 'Seguranca' },
]

export default function LegalPage({
  eyebrow = 'Corre Aqui',
  title,
  subtitle,
  updatedAt = '22 de maio de 2026',
  children,
}) {
  return (
    <main className="min-h-[100dvh] bg-[#050914] px-4 py-5 text-white sm:px-5 sm:py-8">
      <div className="mx-auto w-full max-w-4xl">
        <header className="rounded-[30px] border border-white/10 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <LogoCorreAqui className="h-14 w-14 rounded-2xl" />
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200">
                  {eyebrow}
                </div>
                <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                  {title}
                </h1>
              </div>
            </div>

            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-white transition hover:bg-white/[0.1] active:scale-[0.98]"
            >
              Voltar ao app
            </Link>
          </div>

          {subtitle ? (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">
              {subtitle}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-black text-slate-200 transition hover:bg-white/[0.09]"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs font-bold leading-relaxed text-amber-100">
            Versao inicial para testes do produto. Antes do lancamento publico, revise com suporte juridico e ajuste contatos oficiais.
          </div>
        </header>

        <article className="mt-4 rounded-[30px] border border-white/10 bg-white/[0.965] p-5 text-slate-900 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-7">
          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
            Ultima atualizacao: {updatedAt}
          </div>
          <div className="space-y-6">{children}</div>
        </article>
      </div>
    </main>
  )
}

export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  )
}

