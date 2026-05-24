'use client'

import { useCallback, useEffect, useState } from 'react'
import { auth, database } from '@/lib/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { ref, update, get, serverTimestamp } from 'firebase/database'
import {
  clearGoogleRedirectPending,
  getGoogleRedirectUser,
  isGoogleRedirectPending,
  signInAsGuest,
  signInWithGoogle
} from '@/lib/authGoogle'

import TelaBoasVindas from './TelaBoasVindas'
import CadastroPerfilInicial from './CadastroPerfilInicial'
import LogoCorreAqui from '@/components/LogoCorreAqui'
import { perfilMinimoCompleto } from '@/lib/perfilCadastro'

function esperar(ms, valor = null) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(valor), ms)
  })
}

function perfilCompletoLocal(uid) {
  if (!uid || typeof window === 'undefined') return false

  try {
    return (
      localStorage.getItem(`cadastroCompleto:${uid}`) === 'true' ||
      (localStorage.getItem('meuId') === uid && localStorage.getItem('cadastroCompleto') === 'true')
    )
  } catch {
    return false
  }
}

function limparSessaoLocal(uid) {
  try {
    const remover = [
      'meuId',
      'meuNome',
      'cadastroCompleto',
      'fotoURL',
      'fotoUrl',
      'avatarURL',
      'avatarEmoji',
      'visivelNoMapa',
      'notifsAtivas',
    ]

    remover.forEach((key) => localStorage.removeItem(key))

    if (uid) localStorage.removeItem(`cadastroCompleto:${uid}`)
    Object.keys(localStorage)
      .filter((key) => key.startsWith('cadastroCompleto:'))
      .forEach((key) => localStorage.removeItem(key))
  } catch {}
}

async function salvarUsuarioBasico(user) {
  if (!user?.uid) return {}

  try {
    const userRef = ref(database, `users/${user.uid}`)
    const snap = await Promise.race([get(userRef), esperar(1800)])
    const atual = snap?.val?.() || {}
    const profileAtual = atual.profile || {}
    const nomeAuth = user.displayName || (user.isAnonymous ? 'Visitante' : '')
    const fotoAuth = user.photoURL || ''

    const basePayload = {
      email: user.email || atual.email || '',
      anonimo: !!user.isAnonymous,
      authProvider: user.isAnonymous ? 'anonimo' : 'google',
      atualizadoEm: serverTimestamp(),
    }

    if (!atual.criadoEm) basePayload.criadoEm = serverTimestamp()
    if (!atual.nome && nomeAuth) basePayload.nome = nomeAuth
    if (!atual.fotoURL && fotoAuth) basePayload.fotoURL = fotoAuth
    if (!atual.photoURL && fotoAuth) basePayload.photoURL = fotoAuth

    Promise.race([update(userRef, basePayload), esperar(1800)]).catch(() => {})

    const profilePayload = {
      atualizadoEm: serverTimestamp(),
    }

    if (!profileAtual.nome && nomeAuth) profilePayload.nome = nomeAuth
    if (!profileAtual.email && user.email) profilePayload.email = user.email
    if (!profileAtual.fotoURL && fotoAuth) profilePayload.fotoURL = fotoAuth
    if (!profileAtual.photoURL && fotoAuth) profilePayload.photoURL = fotoAuth

    if (Object.keys(profilePayload).length > 1) {
      Promise.race([
        update(ref(database, `users/${user.uid}/profile`), profilePayload),
        esperar(1800),
      ]).catch(() => {})
    }

    return {
      ...atual,
      ...basePayload,
      profile: {
        ...profileAtual,
        ...profilePayload,
      },
    }
  } catch (err) {
    console.error('Erro ao salvar usuario:', err)
    return {}
  }
}

function StatusEntrada({ title = 'Abrindo Corre Aqui...', message = 'Preparando uma entrada leve para o app.' }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#050914] px-4 text-white">
      <div className="w-full max-w-sm rounded-[26px] border border-white/10 bg-white/[0.055] p-5 text-center shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
        <LogoCorreAqui className="mx-auto h-16 w-16 rounded-2xl" />
        <h1 className="mt-4 text-xl font-black">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{message}</p>
      </div>
    </main>
  )
}

export default function LoginGate({ children }) {
  const [uid, setUid] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [cadastroCompleto, setCadastroCompleto] = useState(false)
  const [checandoPerfil, setChecandoPerfil] = useState(false)
  const [loading, setLoading] = useState(true)
  const [resolvendoRedirect, setResolvendoRedirect] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)
  const [showGuestLogin, setShowGuestLogin] = useState(false)
  const [viuBoasVindas, setViuBoasVindas] = useState(false)
  const [loginError, setLoginError] = useState('')

  const aplicarUsuario = useCallback(async (user) => {
    if (!user) {
      setUid(null)
      setAuthUser(null)
      setUserData(null)
      setCadastroCompleto(false)
      setChecandoPerfil(false)
      return
    }

    setUid(user.uid)
    setAuthUser(user)
    setChecandoPerfil(true)

    const localCompleto = perfilCompletoLocal(user.uid)
    setCadastroCompleto(localCompleto)

    const data = await salvarUsuarioBasico(user)
    setUserData(data)
    setCadastroCompleto(localCompleto || perfilMinimoCompleto(data))
    setChecandoPerfil(false)

    const nomeLocal = data?.profile?.nome || data?.nome || user.displayName || (user.isAnonymous ? 'Visitante' : '')
    localStorage.setItem('meuNome', nomeLocal)
    localStorage.setItem('meuId', user.uid)
  }, [])

  useEffect(() => {
    try {
      const viu = localStorage.getItem('viuBoasVindas')
      setViuBoasVindas(viu === 'true')
    } catch {
      setViuBoasVindas(false)
    }

    const host = window.location.hostname || ''
    const isPrivateHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    setShowGuestLogin(isPrivateHost)

    const redirectPendente = isGoogleRedirectPending()
    setResolvendoRedirect(redirectPendente)
    setLoading(true)

    let active = true
    let resolved = false
    const fallback = window.setTimeout(() => {
      if (!active || resolved) return
      setLoading(false)
      setResolvendoRedirect(false)
    }, redirectPendente ? 10000 : 5500)

    const off = onAuthStateChanged(auth, async (user) => {
      if (!active) return

      resolved = true
      window.clearTimeout(fallback)
      await aplicarUsuario(user)
      if (!active) return
      setLoading(false)
      setResolvendoRedirect(false)
    })

    getGoogleRedirectUser().then(async (user) => {
      if (!active || !user?.uid) return
      resolved = true
      window.clearTimeout(fallback)
      await aplicarUsuario(user)
      if (!active) return
      setLoading(false)
      setResolvendoRedirect(false)
    }).catch(() => {
      if (!active) return
      setResolvendoRedirect(false)
    })

    return () => {
      active = false
      window.clearTimeout(fallback)
      off()
    }
  }, [aplicarUsuario])

  function entrarBoasVindas() {
    setViuBoasVindas(true)
    try {
      localStorage.setItem('viuBoasVindas', 'true')
    } catch {}
  }

  async function loginGoogle() {
    if (loginLoading) return

    try {
      setLoginLoading(true)
      setLoginError('')
      const user = await signInWithGoogle()

      if (!user) {
        setResolvendoRedirect(true)
        setLoading(true)
        window.setTimeout(() => {
          if (!isGoogleRedirectPending()) return
          clearGoogleRedirectPending()
          setLoading(false)
          setResolvendoRedirect(false)
          setLoginError('O Google não terminou a entrada. Toque novamente ou use visitante se estiver testando por IP local.')
        }, 8000)
        return
      }

      await aplicarUsuario(user)
    } catch (error) {
      console.error('[LoginGate] Google: erro', error)
      if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        setLoginError('Não consegui entrar com Google agora. Verifique a conexão e tente novamente.')
      }
    } finally {
      setLoginLoading(false)
    }
  }

  async function loginVisitante() {
    if (guestLoading) return

    try {
      setGuestLoading(true)
      setLoginError('')
      const user = await signInAsGuest()
      await aplicarUsuario(user)
    } catch (error) {
      console.error('[LoginGate] visitante Firebase: erro', error)
      setLoginError('Não consegui entrar como visitante agora. Tente novamente em instantes.')
    } finally {
      setGuestLoading(false)
    }
  }

  async function sair() {
    const uidAtual = uid
    await signOut(auth)
    limparSessaoLocal(uidAtual)
    location.reload()
  }

  function concluirCadastro(perfil) {
    const atualizado = {
      ...(userData || {}),
      ...perfil,
      cadastroCompleto: true,
      onboardingCompleto: true,
      profile: {
        ...((userData && userData.profile) || {}),
        ...perfil,
        cadastroCompleto: true,
        onboardingCompleto: true,
      },
    }

    setUserData(atualizado)
    setCadastroCompleto(true)
  }

  if (loading) {
    return (
      <StatusEntrada
        title={resolvendoRedirect ? 'Voltando do Google...' : 'Abrindo Corre Aqui...'}
        message={resolvendoRedirect ? 'Confirmando sua conta no celular. Não precisa tocar de novo.' : 'Restaurando sua sessão para entrar direto.'}
      />
    )
  }

  if (!viuBoasVindas) {
    return <TelaBoasVindas onEntrar={entrarBoasVindas} />
  }

  if (!uid) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#050914] px-4 py-5 text-white">
        <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-white/[0.055] p-5 text-center shadow-[0_22px_70px_rgba(0,0,0,0.32)]">
          <LogoCorreAqui className="mx-auto h-20 w-20 rounded-[22px]" />
          <h1 className="mt-3 text-2xl font-black">Entrar no app</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Seu perfil, pedidos, chat e notificações ficam juntos na mesma conta.
          </p>

          {loginError ? (
            <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-left text-xs font-semibold leading-relaxed text-rose-100">
              {loginError}
            </div>
          ) : null}

          <button
            type="button"
            onClick={loginGoogle}
            disabled={loginLoading}
            className="relative z-50 mt-5 h-12 w-full rounded-[20px] bg-white px-4 text-sm font-black text-slate-950 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 pointer-events-auto"
          >
            {loginLoading ? 'Abrindo...' : 'Entrar com Google'}
          </button>

          {showGuestLogin && (
            <button
              type="button"
              onClick={loginVisitante}
              disabled={guestLoading}
              className="relative z-50 mt-3 h-12 w-full rounded-[20px] border border-white/10 bg-white/[0.055] px-4 text-sm font-black text-white/80 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 pointer-events-auto"
            >
              {guestLoading ? 'Entrando...' : 'Entrar como visitante'}
            </button>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
            <a href="/termos" className="transition hover:text-slate-300">Termos</a>
            <a href="/privacidade" className="transition hover:text-slate-300">Privacidade</a>
            <a href="/seguranca" className="transition hover:text-slate-300">Seguranca</a>
          </div>
        </div>
      </main>
    )
  }

  if (checandoPerfil && !cadastroCompleto) {
    return (
      <StatusEntrada
        title="Preparando seu perfil..."
        message="Carregando seus dados para abrir sem travar no celular."
      />
    )
  }

  if (!cadastroCompleto) {
    return (
      <CadastroPerfilInicial
        uid={uid}
        authUser={authUser}
        userData={userData}
        onSaved={concluirCadastro}
        onSair={sair}
      />
    )
  }

  return (
    <>
      <button
        onClick={sair}
        className="fixed top-4 right-4 bg-red-600 text-white px-3 py-1 rounded"
      >
        Sair
      </button>

      {children}
    </>
  )
}
