'use client'

import { useEffect, useState } from 'react'
import { auth, database } from '@/lib/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { ref, set, get } from 'firebase/database'
import {
  signInAsGuest,
  signInWithGoogle
} from '@/lib/authGoogle'

import TelaBoasVindas from './TelaBoasVindas'

export default function LoginGate({ children }) {
  const [uid, setUid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loginLoading, setLoginLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)
  const [showGuestLogin, setShowGuestLogin] = useState(false)
  const [viuBoasVindas, setViuBoasVindas] = useState(false)

  async function salvarUsuario(user) {
    try {
      const userRef = ref(database, `users/${user.uid}`)
      const snap = await get(userRef)

      const nome = user.displayName || (user.isAnonymous ? 'Visitante teste' : '')

      await set(userRef, {
        nome,
        email: user.email || '',
        foto: user.photoURL || '',
        anonimo: !!user.isAnonymous,
        criadoEm: snap.exists() ? snap.val()?.criadoEm || Date.now() : Date.now(),
        atualizadoEm: Date.now(),
      })
    } catch (err) {
      console.error('Erro ao salvar usuario:', err)
    }
  }

  async function aplicarUsuario(user) {
    if (!user) {
      setUid(null)
      return
    }

    setUid(user.uid)

    localStorage.setItem('meuNome', user.displayName || (user.isAnonymous ? 'Visitante teste' : ''))
    localStorage.setItem('meuId', user.uid)

    await salvarUsuario(user)
  }

  useEffect(() => {
    const viu = localStorage.getItem('viuBoasVindas')
    if (viu === 'true') setViuBoasVindas(true)

    const ua = navigator.userAgent || ''
    const host = window.location.hostname || ''
    const isMobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua)
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.')
    setShowGuestLogin(isMobile && isLocalHost)

    let active = true
    const off = onAuthStateChanged(auth, async (user) => {
      if (!active) return

      await aplicarUsuario(user)
      setLoading(false)
    })

    return () => {
      active = false
      off()
    }
  }, [])

  function entrarBoasVindas() {
    localStorage.setItem('viuBoasVindas', 'true')
    setViuBoasVindas(true)
  }

  async function loginGoogle() {
    if (loginLoading) return

    try {
      setLoginLoading(true)
      const user = await signInWithGoogle()

      if (!user) return

      await aplicarUsuario(user)
    } catch (error) {
      console.error(error)
      if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        alert('Erro ao entrar com Google')
      }
    } finally {
      setLoginLoading(false)
    }
  }

  async function loginVisitante() {
    if (guestLoading) return

    try {
      setGuestLoading(true)
      const user = await signInAsGuest()
      await aplicarUsuario(user)
    } catch (error) {
      console.error(error)
      alert('Erro ao entrar como visitante')
    } finally {
      setGuestLoading(false)
    }
  }

  async function sair() {
    await signOut(auth)
    localStorage.clear()
    location.reload()
  }

  if (loading) return null

  if (!viuBoasVindas) {
    return <TelaBoasVindas onEntrar={entrarBoasVindas} />
  }

  if (!uid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-slate-900 to-blue-950 text-white">
        <div className="w-full max-w-sm p-6 text-center">
          <h1 className="text-2xl font-bold mb-6">Entrar</h1>

          <button
            onClick={loginGoogle}
            disabled={loginLoading}
            className="w-full py-3 bg-white text-black rounded-xl font-semibold hover:scale-105 transition disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loginLoading ? 'Abrindo Google...' : 'Entrar com Google'}
          </button>

          {showGuestLogin && (
            <button
              onClick={loginVisitante}
              disabled={guestLoading}
              className="mt-3 w-full py-3 rounded-xl border border-white/20 bg-white/10 text-white font-semibold hover:bg-white/15 transition disabled:cursor-not-allowed disabled:opacity-70"
            >
              {guestLoading ? 'Entrando...' : 'Entrar como visitante/teste'}
            </button>
          )}
        </div>
      </div>
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
