'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import {
  clearGoogleRedirectPending,
  getGoogleRedirectUser,
  isGoogleRedirectPending,
  mensagemErroAuthGoogle,
  signInAsGuest,
  signInWithGoogle,
} from '@/lib/authGoogle'

function mensagemErroGoogle(err) {
  const msg = mensagemErroAuthGoogle(err)
  if (msg) return msg

  if (err?.code === 'auth/unauthorized-domain') {
    return 'Este endereço do celular ainda não está autorizado no Firebase. Use visitante agora ou adicione o IP/domínio em Authentication > Authorized domains.'
  }

  if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user') {
    return 'O navegador bloqueou a janela do Google. No celular vamos tentar por redirecionamento.'
  }

  if (err?.code === 'auth/network-request-failed') {
    return 'Falha de rede ao abrir o Google. Confira a internet do celular.'
  }

  return 'Não foi possível abrir o Google agora. Tente novamente ou entre como visitante.'
}

export default function LoginPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let active = true
    const redirectPendente = isGoogleRedirectPending()
    setRedirecting(redirectPendente)
    setChecking(true)

    const fallback = window.setTimeout(() => {
      if (!active) return
      setChecking(false)
      setRedirecting(false)
    }, redirectPendente ? 10000 : 4500)

    getGoogleRedirectUser().then((user) => {
      if (!active) return
      if (user?.uid) router.replace('/')
    }).finally(() => {
      if (!active) return
      setRedirecting(false)
    })

    const off = onAuthStateChanged(auth, (user) => {
      if (!active) return
      window.clearTimeout(fallback)
      if (user?.uid) {
        router.replace('/')
        return
      }
      setChecking(false)
      setRedirecting(false)
    })

    return () => {
      active = false
      window.clearTimeout(fallback)
      off()
    }
  }, [router])

  async function entrarGoogle() {
    if (loading) return

    try {
      setErro('')
      setLoading(true)
      const user = await signInWithGoogle()
      if (user?.uid) {
        router.replace('/')
        return
      }

      setRedirecting(true)
      window.setTimeout(() => {
        clearGoogleRedirectPending()
        setRedirecting(false)
        setLoading(false)
        setErro('Se o Google não abriu, seu navegador pode ter bloqueado o redirecionamento ou o domínio local ainda não está autorizado no Firebase. Use visitante para continuar.')
      }, 1800)
    } catch (err) {
      console.error(err)
      clearGoogleRedirectPending()
      setRedirecting(false)
      setLoading(false)
      if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        setErro(mensagemErroGoogle(err))
      }
    }
  }

  async function entrarVisitante() {
    if (guestLoading) return

    try {
      setErro('')
      setGuestLoading(true)
      const user = await signInAsGuest()
      if (user?.uid) router.replace('/')
    } catch (err) {
      console.error(err)
      setErro('Não foi possível entrar como visitante agora. Verifique se login anônimo está ativo no Firebase.')
    } finally {
      setGuestLoading(false)
    }
  }

  if (checking || redirecting) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#050914] px-4 py-5 text-white">
        <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-white/[0.055] p-5 text-center shadow-[0_22px_70px_rgba(0,0,0,0.34)]">
          <Image
            src="/logo-corre-aqui.png.png"
            alt="Corre Aqui"
            width={72}
            height={72}
            className="mx-auto h-16 w-16 object-contain"
            priority
            unoptimized
          />
          <h1 className="mt-4 text-xl font-black">
            {redirecting ? 'Voltando do Google...' : 'Abrindo Corre Aqui...'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {redirecting ? 'Confirmando sua conta no celular. Não precisa tocar de novo.' : 'Verificando se sua sessão já está ativa.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#050914] px-4 py-5 text-white">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/[0.055] p-5 text-center shadow-[0_22px_70px_rgba(0,0,0,0.34)] sm:rounded-[30px] sm:p-6">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-[26px] border border-cyan-300/15 bg-white/[0.06] shadow-[0_18px_55px_rgba(0,0,0,0.25)]">
          <Image
            src="/logo-corre-aqui.png.png"
            alt="Corre Aqui"
            width={64}
            height={64}
            className="h-16 w-16 object-contain"
            priority
            unoptimized
          />
        </div>
        <h1 className="mt-3 text-2xl font-black">Entrar no app</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Use uma conta para manter seu perfil, pedidos, conversas e notificações juntos.
        </p>

        <button
          type="button"
          onClick={entrarGoogle}
          disabled={loading}
          className="relative z-50 mt-6 h-14 w-full rounded-[22px] bg-white px-5 text-sm font-black text-slate-950 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 pointer-events-auto"
        >
          {loading ? 'Abrindo Google...' : 'Entrar com Google'}
        </button>

        <button
          type="button"
          onClick={entrarVisitante}
          disabled={guestLoading}
          className="relative z-50 mt-3 h-12 w-full rounded-[20px] border border-white/10 bg-white/[0.045] text-sm font-black text-white/80 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 pointer-events-auto"
        >
          {guestLoading ? 'Entrando...' : 'Entrar como visitante'}
        </button>

        {erro ? (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-3 py-3 text-left text-xs font-bold leading-relaxed text-amber-100">
            {erro}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
          <a href="/termos" className="transition hover:text-slate-300">Termos</a>
          <a href="/privacidade" className="transition hover:text-slate-300">Privacidade</a>
          <a href="/seguranca" className="transition hover:text-slate-300">Seguranca</a>
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
