'use client'

import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import { signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import TelaBoasVindas from './TelaBoasVindas'

export default function LoginGate({ children }) {
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(true)
  const [logando, setLogando] = useState(false)
  const [uid, setUid] = useState(null)
  const [err, setErr] = useState('')
  const [viuBoasVindas, setViuBoasVindas] = useState(false)

  useEffect(() => {
    try {
      const jaViu = localStorage.getItem('viuBoasVindas')
      if (jaViu === 'true') {
        setViuBoasVindas(true)
      }
    } catch {}

    const off = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        setUid(user.uid)

        try {
          const lsId = localStorage.getItem('meuId')
          if (lsId !== user.uid) {
            localStorage.setItem('meuId', user.uid)
          }

          const lsNome = localStorage.getItem('meuNome') || ''
          setNome(lsNome)
        } catch {}
      } else {
        setUid(null)
      }

      setLoading(false)
    })

    return () => off()
  }, [])

  function entrarBoasVindas() {
    try {
      localStorage.setItem('viuBoasVindas', 'true')
    } catch {}
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
    setNome(user.displayName || '')
  } catch (error) {
    console.error(error)
    setErr('Erro ao entrar com Google')
  }
}

async function entrar() {
    const n = nome.trim()
    if (!n) {
      setErr('Digite seu nome')
      return
    }

    setErr('')
    setLogando(true)

    try {
      const cred = await signInAnonymously(auth)

      localStorage.setItem('meuNome', n)
      localStorage.setItem('meuId', cred.user.uid)

      setUid(cred.user.uid)
    } catch (e) {
      console.error(e)
      setErr(String(e?.message || e))
    } finally {
      setLogando(false)
    }
  }

  if (loading) return null

  if (!viuBoasVindas) {
    return <TelaBoasVindas onEntrar={entrarBoasVindas} />
  }

  if (!uid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-black via-slate-900 to-blue-950">
        <div className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
          <h1 className="text-2xl font-bold text-white">Corre Aqui</h1>
          <p className="text-sm text-gray-300 mt-1">
            Entre com seu nome para continuar
          </p>

          <input
            className="mt-4 w-full px-3 py-2 border border-white/10 rounded-xl bg-white/10 text-white placeholder:text-gray-400 outline-none"
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />

          {err && <div className="mt-3 text-sm text-red-400">{err}</div>}

          <button
            className="mt-4 w-full py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-60"
            onClick={entrar}
            disabled={logando}
            type="button"
          >
            {logando ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </div>
    )
  }

  const nomeOk = (() => {
    try {
      return !!(localStorage.getItem('meuNome') || '').trim()
    } catch {
      return false
    }
  })()

  if (!nomeOk) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-black via-slate-900 to-blue-950">
        <div className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-xl font-bold text-white">Qual seu nome?</h2>

          <input
            className="mt-4 w-full px-3 py-2 border border-white/10 rounded-xl bg-white/10 text-white placeholder:text-gray-400 outline-none"
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />

          {err && <div className="mt-3 text-sm text-red-400">{err}</div>}

          <button
            className="mt-4 w-full py-3 rounded-xl bg-blue-600 text-white font-semibold"
            onClick={() => {
              const n = nome.trim()
              if (!n) return setErr('Digite seu nome')
              localStorage.setItem('meuNome', n)
              setErr('')
            }}
            type="button"
          >
            Salvar
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}