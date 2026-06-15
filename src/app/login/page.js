'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import LogoCorreAqui from '@/components/LogoCorreAqui'
import {
  getGoogleRedirectUser,
  mensagemErroAuthGoogle,
  signInWithGoogle,
} from '@/lib/authGoogle'

let loginRedirectPromise = null
const DEBUG_AUTH =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEBUG_AUTH === 'true'

function debugAuth(evento, dados = {}) {
  if (!DEBUG_AUTH) return
  console.log(`[CorreAqui Auth /login] ${evento}`, dados)
}

function resolverRedirectUmaVez() {
  if (!loginRedirectPromise) {
    loginRedirectPromise = getGoogleRedirectUser()
  }

  return loginRedirectPromise
}

function mensagemErroGoogle(err) {
  const msg = mensagemErroAuthGoogle(err)
  if (msg) return msg

  if (err?.code === 'auth/unauthorized-domain') {
    return 'Este endereço do celular ainda não está autorizado no Firebase. Adicione o domínio em Authentication > Authorized domains.'
  }

  if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user') {
    return 'O navegador bloqueou a janela do Google. No celular vamos tentar por redirecionamento.'
  }

  if (err?.code === 'auth/network-request-failed') {
    return 'Falha de rede ao abrir o Google. Confira a internet do celular.'
  }

  return 'Não foi possível abrir o Google agora. Tente novamente em instantes.'
}

function marcarEntradaIniciada() {
  try {
    localStorage.setItem('viuBoasVindas', 'true')
  } catch {}
}

export default function LoginPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let active = true
    let authDone = false
    let redirectDone = false

    setChecking(true)
    debugAuth('checking:true', {
      host: typeof window !== 'undefined' ? window.location.hostname : '',
      href: typeof window !== 'undefined' ? window.location.href : '',
    })

    const finalizarSePronto = () => {
      if (!active) return
      if (authDone && redirectDone) {
        debugAuth('checking:false', {
          motivo: 'auth e redirect finalizados sem user',
          currentUserUid: auth.currentUser?.uid || null,
        })
        setChecking(false)
      }
    }

    const entrarNoApp = () => {
      marcarEntradaIniciada()
      router.replace('/')
    }

    const off = onAuthStateChanged(auth, (user) => {
      if (!active) return

      debugAuth('onAuthStateChanged', {
        uid: user?.uid || null,
        email: user?.email || '',
      })
      authDone = true
      if (user?.uid) {
        entrarNoApp()
        return
      }

      finalizarSePronto()
    })

    resolverRedirectUmaVez()
      .then((redirectUser) => {
        redirectDone = true
        if (!active) return

        debugAuth('getRedirectResult:done', {
          uid: redirectUser?.uid || null,
          currentUserUid: auth.currentUser?.uid || null,
        })
        if (redirectUser?.uid || auth.currentUser?.uid) {
          entrarNoApp()
          return
        }

        finalizarSePronto()
      })
      .catch((err) => {
        redirectDone = true
        if (!active) return

        console.error('[LoginPage] Redirect Google: erro', err)
        debugAuth('getRedirectResult:error', {
          code: err?.code || '',
          message: err?.message || '',
        })
        setErro(mensagemErroGoogle(err))
        finalizarSePronto()
      })

    return () => {
      active = false
      off()
    }
  }, [router])

  async function entrarGoogle() {
    if (loading) return

    try {
      setErro('')
      setLoading(true)
      marcarEntradaIniciada()
      debugAuth('loginGoogle:click', {
        host: typeof window !== 'undefined' ? window.location.hostname : '',
        href: typeof window !== 'undefined' ? window.location.href : '',
      })
      const user = await signInWithGoogle()

      if (user?.uid) {
        marcarEntradaIniciada()
        router.replace('/')
      }
    } catch (err) {
      console.error(err)
      debugAuth('loginGoogle:error', {
        code: err?.code || '',
        message: err?.message || '',
      })
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setErro(mensagemErroGoogle(err))
      }
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_120%)] px-4 py-5 text-white">
        <div className="w-full max-w-sm rounded-[28px] border border-white/35 bg-white/92 p-5 text-center text-slate-950 shadow-[0_22px_70px_rgba(37,99,235,0.22)] backdrop-blur-2xl">
          <LogoCorreAqui className="mx-auto h-20 w-20 rounded-[22px] bg-white shadow-[0_14px_34px_rgba(37,99,235,0.18)]" />
          <h1 className="mt-4 text-xl font-black text-blue-950">
            Abrindo Corre Aqui...
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Verificando se sua sessão já está ativa. Não precisa tocar de novo.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_120%)] px-4 py-5 text-white">
      <div className="w-full max-w-md rounded-[32px] border border-white/35 bg-white/92 p-5 text-center text-slate-950 shadow-[0_22px_70px_rgba(37,99,235,0.22)] backdrop-blur-2xl sm:p-6">
        <LogoCorreAqui className="mx-auto h-24 w-24 rounded-[28px] bg-white shadow-[0_18px_55px_rgba(37,99,235,0.2)]" />
        <h1 className="mt-3 text-2xl font-black text-blue-950">Entrar no app</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Sua conta mantém perfil, pedidos, conversas, avaliações e notificações sempre juntos.
        </p>

        <div className="mt-5 grid gap-2 text-left">
          {[
            ['🔒', 'Mais segurança', 'Sem entrada anônima na experiência principal.'],
            ['💬', 'Chat confiável', 'As conversas ficam conectadas ao mesmo perfil.'],
            ['⭐', 'Reputação real', 'Patentes, avaliações e histórico ganham valor.'],
          ].map(([icon, title, text]) => (
            <div key={title} className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white text-base shadow-sm">
                  {icon}
                </div>
                <div>
                  <div className="text-sm font-black text-blue-950">{title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-600">{text}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={entrarGoogle}
          disabled={loading}
          className="relative z-50 mt-6 h-14 w-full rounded-[22px] bg-[#ffd91a] px-5 text-sm font-black text-blue-950 shadow-[0_16px_38px_rgba(245,158,11,0.22)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 pointer-events-auto"
        >
          {loading ? 'Abrindo Google...' : 'Entrar com Google'}
        </button>

        <div className="mt-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-bold leading-relaxed text-blue-950">
          Entrada por conta ajuda a proteger histórico, reputação e notificações.
        </div>

        {erro ? (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-3 text-left text-xs font-bold leading-relaxed text-amber-100">
            {erro}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
          <a href="/termos" className="transition hover:text-slate-300">Termos</a>
          <a href="/privacidade" className="transition hover:text-slate-300">Privacidade</a>
          <a href="/seguranca" className="transition hover:text-slate-300">Segurança</a>
        </div>

        <button
          type="button"
          onClick={() => {
            router.replace('/')
          }}
          className="relative z-50 mt-3 h-12 w-full rounded-[20px] border border-white/10 bg-white/[0.04] text-sm font-bold text-white/70 transition hover:bg-white/[0.07] pointer-events-auto"
        >
          Voltar
        </button>
      </div>
    </main>
  )
}
