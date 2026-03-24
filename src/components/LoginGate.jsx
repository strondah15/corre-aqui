'use client'

import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import {
  onAuthStateChanged,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from 'firebase/auth'

import TelaBoasVindas from './TelaBoasVindas'

export default function LoginGate({ children }) {
  const [uid, setUid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [nome, setNome] = useState('')
  const [viuBoasVindas, setViuBoasVindas] = useState(false)

  useEffect(() => {
    const viu = localStorage.getItem('viuBoasVindas')
    if (viu === 'true') setViuBoasVindas(true)

    const off = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid)
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
    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(auth, provider)

    localStorage.setItem('meuNome', result.user.displayName || '')
    localStorage.setItem('meuId', result.user.uid)

    setUid(result.user.uid)
  }

  async function loginAnonimo() {
    const cred = await signInAnonymously(auth)

    localStorage.setItem('meuNome', nome)
    localStorage.setItem('meuId', cred.user.uid)

    setUid(cred.user.uid)
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

  // 🔥 LOGIN
  if (!uid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="w-full max-w-sm p-6">

          <h1 className="text-2xl font-bold mb-4">Entrar</h1>

          <input
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full px-3 py-2 mb-3 rounded bg-white/10"
          />

          <button
            onClick={loginAnonimo}
            className="w-full py-2 bg-blue-600 rounded mb-3"
          >
            Entrar com nome
          </button>

          <button
            onClick={loginGoogle}
            className="w-full py-2 bg-white text-black rounded"
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