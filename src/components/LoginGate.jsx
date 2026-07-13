'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { auth, database } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { ref, update, get, serverTimestamp } from '@/lib/firebaseDebug'
import {
  getGoogleRedirectUser,
  isGoogleRedirectPending,
  mensagemErroAuthGoogle,
  signInWithGoogle,
} from '@/lib/authGoogle'

import LogoCorreAqui from '@/components/LogoCorreAqui'
import SplashScreen from '@/components/SplashScreen'
import { perfilMinimoCompleto } from '@/lib/perfilCadastro'
import { getUserOnlinePreference, startPresence } from '@/lib/presence'

let vinhetaJaRodouNoRuntime = false
let googleRedirectPromise = null
const USER_READ_TIMEOUT_MS = 7000
const AUTH_NULL_GRACE_MS = 2200
const DEBUG_AUTH =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEBUG_AUTH === 'true'
const DEBUG_PRESENCE =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEBUG_PRESENCE === 'true'

function esperar(ms, valor = null) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(valor), ms)
  })
}

function resolverGoogleRedirectUmaVez() {
  if (!googleRedirectPromise) {
    googleRedirectPromise = getGoogleRedirectUser()
  }

  return googleRedirectPromise
}

function isFotoValor(v) {
  const s = String(v || '').trim()
  return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(s)
}

function pickFoto(...vals) {
  return vals.map((v) => String(v || '').trim()).find(isFotoValor) || ''
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

function marcarBoasVindasVistas() {
  try {
    localStorage.setItem('viuBoasVindas', 'true')
  } catch {}
}

function debugAuth(evento, dados = {}) {
  if (!DEBUG_AUTH) return
  console.log(`[CorreAqui Auth] ${evento}`, dados)
}

function debugPresence(message, data = {}) {
  if (!DEBUG_PRESENCE) return
  console.log(`[PRESENCE] ${message}`, data)
}

async function salvarUsuarioBasico(user) {
  if (!user?.uid) return {}

  try {
    debugPresence('uid atual', user.uid)
    let modoAtual = ''
    try {
      const modoSalvo = String(localStorage.getItem('modoApp') || '').toLowerCase()
      modoAtual = modoSalvo === 'cliente' || modoSalvo === 'corre' ? modoSalvo : ''
    } catch {}

    const userRef = ref(database, `users/${user.uid}`)
    const snap = await Promise.race([get(userRef), esperar(USER_READ_TIMEOUT_MS)])
    const leituraConfirmada = typeof snap?.val === 'function'
    const atual = leituraConfirmada ? snap.val() || {} : {}
    const profileAtual = atual.profile || {}
    const nomeAuth = user.displayName || (user.isAnonymous ? 'Visitante' : '')
    const fotoAuth = user.photoURL || ''
    const fotoSalva = pickFoto(
      atual.fotoURL,
      profileAtual.fotoURL,
      atual.avatar,
      profileAtual.avatar,
      atual.photoURL,
      profileAtual.photoURL
    )
    const avatarEmojiSalvo =
      atual.avatarEmoji ||
      profileAtual.avatarEmoji ||
      (!isFotoValor(atual.avatar) ? atual.avatar : '') ||
      (!isFotoValor(profileAtual.avatar) ? profileAtual.avatar : '') ||
      ''

    const basePayload = {
      uid: user.uid,
      id: user.uid,
      email: user.email || atual.email || '',
      anonimo: !!user.isAnonymous,
      authProvider: user.isAnonymous ? 'anonimo' : 'google',
      atualizadoEm: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    if (modoAtual) basePayload.modoAtual = modoAtual
    if (leituraConfirmada && !atual.criadoEm) basePayload.criadoEm = serverTimestamp()
    if (!atual.nome && nomeAuth) basePayload.nome = nomeAuth

    const fotoFallback = fotoSalva || fotoAuth
    if (!atual.fotoURL && fotoFallback) basePayload.fotoURL = fotoFallback
    if (!atual.photoURL && fotoFallback) basePayload.photoURL = fotoFallback
    if (!atual.avatarEmoji && avatarEmojiSalvo) basePayload.avatarEmoji = avatarEmojiSalvo

    const userPathPatch = Object.fromEntries(
      Object.entries(basePayload)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [`users/${user.uid}/${key}`, value])
    )

    const agoraPresence = Date.now()
    const onlinePreference = getUserOnlinePreference()
    const presencePayload = {
      uid: user.uid,
      id: user.uid,
      nome: nomeAuth || atual.nome || 'Usuario',
      fotoURL: fotoFallback || '',
      online: onlinePreference,
      disponivel: onlinePreference,
      lastSeen: agoraPresence,
      updatedAt: agoraPresence,
      modoAtual: modoAtual || undefined,
    }
    const presencePatch = Object.fromEntries(
      Object.entries(presencePayload).filter(([, value]) => value !== undefined)
    )

    debugPresence(`salvando online true em presence/${user.uid}`, {
      origem: 'LoginGate/salvarUsuarioBasico',
      path: `presence/${user.uid}`,
    })
    const salvarPresencePromise = update(ref(database, `presence/${user.uid}`), presencePatch)
      .then(() => debugPresence('salvou online com sucesso', { uid: user.uid, origem: 'LoginGate/salvarUsuarioBasico' }))
      .catch((error) => {
        console.error('[PRESENCE] erro ao salvar presença', error)
        throw error
      })
    await Promise.race([salvarPresencePromise, esperar(3500)]).catch(() => {})
    Promise.race([update(ref(database), userPathPatch), esperar(1800)]).catch(() => {})

    const profilePayload = {
      atualizadoEm: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    if (leituraConfirmada && !profileAtual.nome && nomeAuth) profilePayload.nome = nomeAuth
    if (leituraConfirmada && !profileAtual.email && user.email) profilePayload.email = user.email
    if (!profileAtual.fotoURL && fotoFallback) profilePayload.fotoURL = fotoFallback
    if (!profileAtual.photoURL && fotoFallback) profilePayload.photoURL = fotoFallback
    if (!profileAtual.avatarEmoji && avatarEmojiSalvo) profilePayload.avatarEmoji = avatarEmojiSalvo

    if (Object.keys(profilePayload).length > 2) {
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

export default function LoginGate({ children }) {
  const pathname = usePathname()
  const pularVinheta = String(pathname || '').startsWith('/chat/')
  const authResolvidoRef = useRef(false)
  const redirectResolvidoRef = useRef(false)
  const syncUsuarioRef = useRef({ uid: '', promise: null })
  const authenticatedUidRef = useRef('')
  const [user, setUser] = useState(null)
  const [cadastroCompleto, setCadastroCompleto] = useState(false)
  const [checandoPerfil, setChecandoPerfil] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [splashMinDone, setSplashMinDone] = useState(false)
  const [splashClosing, setSplashClosing] = useState(false)
  const [splashDone, setSplashDone] = useState(pularVinheta || vinhetaJaRodouNoRuntime)

  const uid = user?.uid || ''
  const aguardandoEntrada = authLoading
  const splashReadyToClose = splashMinDone && !aguardandoEntrada
  const renderDestino = !splashDone ? 'splash' : aguardandoEntrada ? 'loading' : !uid ? 'login' : 'app'

  useEffect(() => {
    debugAuth('render', {
      destino: renderDestino,
      motivo:
        renderDestino === 'splash'
          ? 'vinheta inicial'
          : renderDestino === 'loading'
            ? 'aguardando onAuthStateChanged/getRedirectResult'
            : renderDestino === 'login'
              ? 'auth finalizado sem user'
              : 'user autenticado',
      uid: uid || null,
      authLoading,
      checandoPerfil,
      cadastroCompleto,
      host: typeof window !== 'undefined' ? window.location.hostname : '',
    })
  }, [authLoading, cadastroCompleto, checandoPerfil, renderDestino, uid])

  useEffect(() => {
    if (!user?.uid) return undefined

    let nome = user.displayName || ''
    let fotoURL = user.photoURL || ''

    try {
      nome = localStorage.getItem('meuNome') || nome
      fotoURL = localStorage.getItem('fotoURL') || fotoURL
    } catch {}

    return startPresence(database, user, { nome, fotoURL })
  }, [user])

  useEffect(() => {
    if (pularVinheta || vinhetaJaRodouNoRuntime) {
      if (pularVinheta) vinhetaJaRodouNoRuntime = true
      setSplashMinDone(true)
      setSplashClosing(false)
      setSplashDone(true)
      return undefined
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    const timer = window.setTimeout(() => {
      setSplashMinDone(true)
    }, reduceMotion ? 1450 : 2400)

    return () => window.clearTimeout(timer)
  }, [pularVinheta])

  useEffect(() => {
    if (splashDone || !splashReadyToClose) return undefined

    setSplashClosing(true)
    const timer = window.setTimeout(() => {
      vinhetaJaRodouNoRuntime = true
      setSplashDone(true)
    }, 240)

    return () => window.clearTimeout(timer)
  }, [splashDone, splashReadyToClose])

  const aplicarUsuario = useCallback(async (firebaseUser) => {
    if (!firebaseUser?.uid) {
      debugAuth('aplicarUsuario:null', { motivo: 'onAuthStateChanged sem user' })
      authenticatedUidRef.current = ''
      syncUsuarioRef.current = { uid: '', promise: null }
      setUser(null)
      setCadastroCompleto(false)
      setChecandoPerfil(false)
      return
    }

    debugAuth('aplicarUsuario:user', {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      provider: firebaseUser.providerData?.[0]?.providerId || '',
    })
    authenticatedUidRef.current = firebaseUser.uid
    setUser(firebaseUser)
    marcarBoasVindasVistas()
    setChecandoPerfil(true)
    setCadastroCompleto(true)

    try {
      localStorage.setItem('meuNome', firebaseUser.displayName || 'Usuário')
      localStorage.setItem('meuId', firebaseUser.uid)
      if (firebaseUser.photoURL) localStorage.setItem('fotoURL', firebaseUser.photoURL)
    } catch {}

    const localCompleto = perfilCompletoLocal(firebaseUser.uid)

    if (syncUsuarioRef.current.uid !== firebaseUser.uid || !syncUsuarioRef.current.promise) {
      syncUsuarioRef.current = {
        uid: firebaseUser.uid,
        promise: salvarUsuarioBasico(firebaseUser),
      }
    }

    const data = await syncUsuarioRef.current.promise
    setCadastroCompleto(localCompleto || perfilMinimoCompleto(data))
    setChecandoPerfil(false)
    debugAuth('perfil:sincronizado', {
      uid: firebaseUser.uid,
      cadastroCompleto: localCompleto || perfilMinimoCompleto(data),
      temFotoFirebase: Boolean(data?.fotoURL || data?.profile?.fotoURL),
    })

    const nomeLocal = data?.profile?.nome || data?.nome || firebaseUser.displayName || (firebaseUser.isAnonymous ? 'Visitante' : '')
    const fotoCache = pickFoto(
      data?.fotoURL,
      data?.profile?.fotoURL,
      data?.avatar,
      data?.profile?.avatar,
      data?.photoURL,
      data?.profile?.photoURL,
      firebaseUser.photoURL
    )
    const avatarCache =
      data?.avatarEmoji ||
      data?.profile?.avatarEmoji ||
      (!isFotoValor(data?.avatar) ? data?.avatar : '') ||
      (!isFotoValor(data?.profile?.avatar) ? data?.profile?.avatar : '') ||
      ''

    try {
      localStorage.setItem('meuNome', nomeLocal)
      localStorage.setItem('meuId', firebaseUser.uid)
      if (fotoCache) localStorage.setItem('fotoURL', fotoCache)
      if (avatarCache) localStorage.setItem('avatarEmoji', avatarCache)
    } catch {}
  }, [])

  useEffect(() => {
    let active = true

    authResolvidoRef.current = false
    redirectResolvidoRef.current = false
    debugAuth('authLoading:true', {
      host: typeof window !== 'undefined' ? window.location.hostname : '',
      path: typeof window !== 'undefined' ? window.location.pathname : '/',
      motivo: 'inicializando listener',
    })
    setAuthLoading(true)

    const finalizarSePronto = () => {
      if (!active) return
      if (authResolvidoRef.current && redirectResolvidoRef.current) {
        debugAuth('authLoading:false', {
          motivo: 'auth e redirect finalizados sem user',
          temUserAtual: Boolean(auth.currentUser?.uid),
        })
        setAuthLoading(false)
      }
    }

    debugAuth('onAuthStateChanged:init', {
      currentUserUid: auth.currentUser?.uid || null,
      redirectPendente: isGoogleRedirectPending(),
    })

    const off = onAuthStateChanged(auth, async (authUserFromListener) => {
      if (!active) return

      debugAuth('onAuthStateChanged', {
        uid: authUserFromListener?.uid || null,
        email: authUserFromListener?.email || '',
        redirectPendente: isGoogleRedirectPending(),
        uidAutenticadoAntes: authenticatedUidRef.current || null,
      })

      let firebaseUser = authUserFromListener

      if (!firebaseUser?.uid && (authenticatedUidRef.current || isGoogleRedirectPending())) {
        debugAuth('onAuthStateChanged:null-aguardando', {
          motivo: authenticatedUidRef.current
            ? 'null recebido depois de uid valido'
            : 'redirect ainda pendente',
          uidAutenticadoAntes: authenticatedUidRef.current || null,
          tempoMs: AUTH_NULL_GRACE_MS,
        })

        await esperar(AUTH_NULL_GRACE_MS)
        if (!active) return

        if (auth.currentUser?.uid) {
          firebaseUser = auth.currentUser
          debugAuth('onAuthStateChanged:null-recuperado', {
            uid: firebaseUser.uid,
            motivo: 'auth.currentUser apareceu apos aguardar',
          })
        }
      }

      authResolvidoRef.current = true
      await aplicarUsuario(firebaseUser)
      if (!active) return

      if (firebaseUser?.uid) {
        redirectResolvidoRef.current = true
        debugAuth('authLoading:false', {
          motivo: 'onAuthStateChanged recebeu user',
          uid: firebaseUser.uid,
        })
        setAuthLoading(false)
        return
      }

      finalizarSePronto()
    })

    resolverGoogleRedirectUmaVez()
      .then(async (redirectUser) => {
        redirectResolvidoRef.current = true
        if (!active) return

        debugAuth('getRedirectResult:done', {
          uid: redirectUser?.uid || null,
          currentUserUid: auth.currentUser?.uid || null,
        })
        const userResolvido = redirectUser?.uid ? redirectUser : auth.currentUser?.uid ? auth.currentUser : null

        if (userResolvido?.uid) {
          authResolvidoRef.current = true
          await aplicarUsuario(userResolvido)
          if (!active) return
          debugAuth('authLoading:false', {
            motivo: redirectUser?.uid ? 'getRedirectResult recebeu user' : 'auth.currentUser usado apos redirect',
            uid: userResolvido.uid,
          })
          setAuthLoading(false)
          return
        }

        finalizarSePronto()
      })
      .catch((error) => {
        redirectResolvidoRef.current = true
        if (!active) return

        console.error('[LoginGate] Redirect Google: erro', error)
        debugAuth('getRedirectResult:error', {
          code: error?.code || '',
          message: error?.message || '',
        })
        setLoginError(mensagemErroAuthGoogle(error))
        finalizarSePronto()
      })

    return () => {
      active = false
      off()
    }
  }, [aplicarUsuario])

  async function loginGoogle() {
    if (loginLoading) return

    try {
      setLoginLoading(true)
      setLoginError('')
      marcarBoasVindasVistas()
      debugAuth('loginGoogle:click', {
        host: typeof window !== 'undefined' ? window.location.hostname : '',
        href: typeof window !== 'undefined' ? window.location.href : '',
      })
      await signInWithGoogle()
    } catch (error) {
      console.error('[LoginGate] Google: erro', error)
      debugAuth('loginGoogle:error', {
        code: error?.code || '',
        message: error?.message || '',
      })
      if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        setLoginError(mensagemErroAuthGoogle(error))
      }
    } finally {
      setLoginLoading(false)
    }
  }

  if (!splashDone) {
    return (
      <SplashScreen
        exiting={splashClosing}
        status={
          authLoading
            ? 'Restaurando sua sessão...'
            : splashMinDone
              ? 'Abrindo o app...'
              : 'Conectando perto de você...'
        }
      />
    )
  }

  if (aguardandoEntrada) {
    return <main className="min-h-[100dvh] bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_100%)]" aria-busy="true" />
  }

  if (!uid) {
    return (
      <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_100%)] px-4 py-5 text-white">
        <div className="pointer-events-none absolute -right-24 top-16 h-80 w-80 rounded-[80px] bg-yellow-200/30 rotate-12" />
        <div className="pointer-events-none absolute -left-24 -top-20 h-72 w-72 rounded-full bg-white/16" />

        <div className="relative w-full max-w-md rounded-[32px] border border-white/35 bg-white/92 p-5 text-center text-slate-950 shadow-[0_24px_80px_rgba(37,99,235,0.24)] backdrop-blur-2xl sm:p-6">
          <LogoCorreAqui className="mx-auto h-24 w-24 rounded-[26px] bg-white shadow-[0_18px_55px_rgba(37,99,235,0.2)]" />
          <div className="mt-4 inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700">
            Conta segura
          </div>
          <h1 className="mt-3 text-2xl font-black text-blue-950">Entrar no Corre Aqui</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Use sua conta Google para manter perfil, pedidos, chat, avaliações e notificações no mesmo lugar.
          </p>

          <div className="mt-5 grid gap-2 text-left">
            {[
              ['🔒', 'Perfil protegido', 'Histórico e configurações ficam ligados à sua conta.'],
              ['💬', 'Conversas salvas', 'Combine serviços com mais segurança pelo chat.'],
              ['⭐', 'Reputação', 'Patentes e avaliações acompanham sua evolução.'],
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

          {loginError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-left text-xs font-semibold leading-relaxed text-rose-700">
              {loginError}
            </div>
          ) : null}

          <button
            type="button"
            onClick={loginGoogle}
            disabled={loginLoading}
            className="relative z-50 mt-5 h-13 w-full rounded-[22px] bg-[#ffd91a] px-4 py-4 text-sm font-black text-blue-950 shadow-[0_16px_44px_rgba(245,158,11,0.24)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 pointer-events-auto"
          >
            {loginLoading ? 'Abrindo...' : 'Entrar com Google'}
          </button>

          <div className="mt-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-bold leading-relaxed text-blue-950">
            Entrar com conta ajuda a proteger conversas, reputação e notificações.
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
            <a href="/termos" className="transition hover:text-blue-700">Termos</a>
            <a href="/privacidade" className="transition hover:text-blue-700">Privacidade</a>
            <a href="/seguranca" className="transition hover:text-blue-700">Segurança</a>
          </div>
        </div>
      </main>
    )
  }

  return <>{children}</>
}
