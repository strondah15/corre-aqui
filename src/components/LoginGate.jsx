'use client'

import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from 'firebase/auth'

import TelaBoasVindas from './TelaBoasVindas'

export default function LoginGate({ children }) {
  const [uid, setUid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viuBoasVindas, setViuBoasVindas] = useState(false)

  useEffect(() => {
    const viu = localStorage.getItem('viuBoasVindas')
    if (viu === 'true') setViuBoasVindas(true)

    const off = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid)

        localStorage.setItem('meuNome', user.displayName || '')
        localStorage.setItem('meuId', user.uid)
      } else {
        setUid(null)
      }

      setLoading(false)
    })

    return () => off()
  }, [])

  function entrarBoasVindas() {
    localStorage.setItem('viuBoasVindas', 'true')
    setViuBoasVindas(true)
  }

  async function loginGoogle() {
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)

      const user = result.user

      localStorage.setItem('meuNome', user.displayName || '')
      localStorage.setItem('meuId', user.uid)

      setUid(user.uid)
    } catch (error) {
      console.error(error)
      alert('Erro ao entrar com Google')
    }
  }

  async function sair() {
    await signOut(auth)
    localStorage.clear()
    location.reload()
  }

  if (loading) return null

  // 🔥 BOAS-VINDAS
  if (!viuBoasVindas) {
    return <TelaBoasVindas onEntrar={entrarBoasVindas} />
  }

  // 🔐 LOGIN OBRIGATÓRIO
  if (!uid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="w-full max-w-sm p-6 text-center">

          <h1 className="text-2xl font-bold mb-6">Entrar</h1>

          <button
            onClick={loginGoogle}
            className="w-full py-3 bg-white text-black rounded-xl font-semibold"
          >
            Entrar com Google
          </button>

        </div>
      </div>
    )
  }

  // 🔥 APP
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