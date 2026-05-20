'use client'

import { useCallback, useEffect, useState } from 'react'
import { auth, database } from '@/lib/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { ref, update, get, serverTimestamp } from 'firebase/database'
import {
  getGoogleRedirectUser,
  signInAsGuest,
  signInWithGoogle
} from '@/lib/authGoogle'

import TelaBoasVindas from './TelaBoasVindas'
import CadastroPerfilInicial from './CadastroPerfilInicial'
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

function isMobileLoginDevice() {
  if (typeof window === 'undefined') return false

  const ua = window.navigator?.userAgent || ''
  return (
    /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua) ||
    window.matchMedia?.('(max-width: 768px)')?.matches
  )
}

function criarVisitanteLocal() {
  const id = `visitante_${Date.now()}`
  const nome = 'Visitante'
  const data = {
    uid: id,
    nome,
    email: '',
    anonimo: true,
    authProvider: 'visitante-local',
    cadastroCompleto: true,
    onboardingCompleto: true,
    profile: {
      nome,
      email: '',
      cadastroCompleto: true,
      onboardingCompleto: true,
    },
  }
  const user = {
    uid: id,
    displayName: nome,
    email: null,
    photoURL: null,
    isAnonymous: true,
  }

  try {
    localStorage.setItem('meuId', id)
    localStorage.setItem('meuNome', nome)
    localStorage.setItem('cadastroCompleto', 'true')
    localStorage.setItem(`cadastroCompleto:${id}`, 'true')
    localStorage.setItem('viuBoasVindas', 'true')
  } catch (err) {
    console.warn('[LoginGate] falha ao salvar visitante local', err)
  }

  return { id, nome, data, user }
}

async function salvarUsuarioBasico(user) {
  if (!user?.uid) return {}

  try {
    const userRef = ref(database, `users/${user.uid}`)
    const snap = await Promise.race([get(userRef), esperar(1800)])
    const atual = snap?.val?.() || {}
    const profileAtual = atual.profile || {}
    const nomeAuth = user.displayName || (user.isAnonymous ? 'Visitante teste' : '')
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
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-cyan-400/10 text-lg font-black text-cyan-100">
          CA
        </div>
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
  const [loading, setLoading] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)
  const [showGuestLogin, setShowGuestLogin] = useState(false)
  const [viuBoasVindas, setViuBoasVindas] = useState(false)

  const aplicarVisitanteLocal = useCallback(() => {
    console.log('[LoginGate] visitante local: criando estado fake')
    const visitante = criarVisitanteLocal()
    console.log('[LoginGate] visitante local criado', {
      uid: visitante.id,
      nome: visitante.nome,
    })

    setUid(visitante.id)
    setAuthUser(visitante.user)
    setUserData(visitante.data)
    setCadastroCompleto(true)
    setChecandoPerfil(false)
    setLoading(false)
    setLoginLoading(false)
    setGuestLoading(false)
    setViuBoasVindas(true)

    return visitante
  }, [])

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

    const nomeLocal = data?.profile?.nome || data?.nome || user.displayName || (user.isAnonymous ? 'Visitante teste' : '')
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

    let active = true
    let resolved = false
    const fallback = window.setTimeout(() => {
      if (!active || resolved) return
      setLoading(false)
    }, 4500)

    const off = onAuthStateChanged(auth, async (user) => {
      if (!active) return

      console.log('[LoginGate] onAuthStateChanged', {
        temUser: !!user,
        uid: user?.uid || null,
        anonimo: !!user?.isAnonymous,
      })

      if (!user) {
        try {
          const localId = localStorage.getItem('meuId') || ''
          if (localId.startsWith('visitante_')) {
            console.log('[LoginGate] restaurando visitante local', { uid: localId })
            setUid(localId)
            setAuthUser({
              uid: localId,
              displayName: localStorage.getItem('meuNome') || 'Visitante',
              email: null,
              photoURL: null,
              isAnonymous: true,
            })
            setUserData({
              uid: localId,
              nome: localStorage.getItem('meuNome') || 'Visitante',
              anonimo: true,
              authProvider: 'visitante-local',
              cadastroCompleto: true,
              onboardingCompleto: true,
              profile: {
                nome: localStorage.getItem('meuNome') || 'Visitante',
                cadastroCompleto: true,
                onboardingCompleto: true,
              },
            })
            setCadastroCompleto(true)
            setChecandoPerfil(false)
            resolved = true
            window.clearTimeout(fallback)
            setLoading(false)
            return
          }
        } catch (err) {
          console.warn('[LoginGate] falha ao restaurar visitante local', err)
        }
      }

      aplicarUsuario(user)
      resolved = true
      window.clearTimeout(fallback)
      setLoading(false)
    })

    getGoogleRedirectUser().then((user) => {
      if (!active || !user?.uid) return
      console.log('[LoginGate] retorno Google redirect recebido', {
        uid: user.uid,
        mobile: isMobileLoginDevice(),
      })
      aplicarUsuario(user)
    })

    return () => {
      active = false
      window.clearTimeout(fallback)
      off()
    }
  }, [aplicarUsuario])

  function entrarBoasVindas() {
    console.log('[LoginGate] toque Comecar boas-vindas', {
      mobile: isMobileLoginDevice(),
    })
    setViuBoasVindas(true)
    try {
      localStorage.setItem('viuBoasVindas', 'true')
    } catch {}
  }

  async function loginGoogle() {
    alert('clicou google')
    console.log('[LoginGate] toque Entrar com Google', {
      mobile: isMobileLoginDevice(),
      disabled: loginLoading,
    })
    if (loginLoading) return

    try {
      setLoginLoading(true)
      console.log('[LoginGate] Google: chamando signInWithGoogle')
      const user = await signInWithGoogle()
      console.log('[LoginGate] Google: retorno signInWithGoogle', {
        temUser: !!user,
        uid: user?.uid || null,
      })

      if (!user) return

      console.log('[LoginGate] Google: aplicando usuario')
      await aplicarUsuario(user)
    } catch (error) {
      console.error('[LoginGate] Google: erro', error)
      if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        alert('Erro ao entrar com Google')
      }
    } finally {
      setLoginLoading(false)
    }
  }

  async function loginVisitante() {
    alert('clicou visitante')
    console.log('[LoginGate] toque Visitante/teste', {
      mobile: isMobileLoginDevice(),
      disabled: guestLoading,
    })
    if (guestLoading) return

    const visitante = aplicarVisitanteLocal()
    console.log('[LoginGate] visitante local: login fechado imediatamente', {
      uid: visitante.id,
    })

    try {
      setGuestLoading(true)
      console.log('[LoginGate] visitante Firebase: tentando anonimo em segundo plano')
      const user = await signInAsGuest()
      console.log('[LoginGate] visitante Firebase: retorno anonimo', {
        uid: user?.uid || null,
      })
      if (user?.uid) {
        try {
          localStorage.setItem('meuId', user.uid)
          localStorage.setItem('meuNome', user.displayName || 'Visitante')
          localStorage.setItem('cadastroCompleto', 'true')
          localStorage.setItem(`cadastroCompleto:${user.uid}`, 'true')
        } catch (err) {
          console.warn('[LoginGate] visitante Firebase: falha ao marcar cadastro local', err)
        }
      }
      await aplicarUsuario(user)
    } catch (error) {
      console.error('[LoginGate] visitante Firebase: erro, mantendo visitante local', error)
    } finally {
      setGuestLoading(false)
    }
  }

  async function sair() {
    await signOut(auth)
    localStorage.clear()
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
    return <StatusEntrada />
  }

  if (!viuBoasVindas) {
    return <TelaBoasVindas onEntrar={entrarBoasVindas} />
  }

  if (!uid) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#050914] px-4 py-5 text-white">
        <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-white/[0.055] p-5 text-center shadow-[0_22px_70px_rgba(0,0,0,0.32)]">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-[22px] border border-cyan-300/15 bg-cyan-400/10 text-lg font-black text-cyan-100">
            CA
          </div>
          <h1 className="mt-3 text-2xl font-black">Entrar no app</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Seu perfil, pedidos, chat e notificacoes ficam juntos na mesma conta.
          </p>

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
              {guestLoading ? 'Entrando...' : 'Visitante / teste'}
            </button>
          )}
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
