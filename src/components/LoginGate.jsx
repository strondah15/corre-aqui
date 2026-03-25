'use client'

import { useEffect, useState } from 'react'
import { auth, database } from '@/lib/firebase'
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from 'firebase/auth'

import { ref, set, get } from 'firebase/database'

import TelaBoasVindas from './TelaBoasVindas'

export default function LoginGate({ children }) {
  const [uid, setUid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [viuBoasVindas, setViuBoasVindas] = useState(false)

  // 🔥 SALVAR USUÁRIO NO BANCO
  async function salvarUsuario(user) {
    try {
      const userRef = ref(database, `users/${user.uid}`)
      const snap = await get(userRef)

      if (!snap.exists()) {
        await set(userRef, {
          nome: user.displayName || '',
          email: user.email || '',
          foto: user.photoURL || '',
          criadoEm: Date.now(),
        })
      }
    } catch (err) {
      console.error('Erro ao salvar usuário:', err)
    }
  }

  useEffect(() => {
    const viu = localStorage.getItem('viuBoasVindas')
    if (viu === 'true') setViuBoasVindas(true)

    const off = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUid(user.uid)

        localStorage.setItem('meuNome', user.displayName || '')
        localStorage.setItem('meuId', user.uid)

        await salvarUsuario(user) // 🔥 salva no banco
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

      await salvarUsuario(user) // 🔥 salva aqui também

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

  // 🔐 LOGIN
  if (!uid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-slate-900 to-blue-950 text-white">
        <div className="w-full max-w-sm p-6 text-center">

          <h1 className="text-2xl font-bold mb-6">Entrar</h1>

          <button
            onClick={loginGoogle}
            className="w-full py-3 bg-white text-black rounded-xl font-semibold hover:scale-105 transition"
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