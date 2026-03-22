import TelaBoasVindas from './TelaBoasVindas'
'use client'

import { useEffect, useState } from 'react'
import { auth } from '@/lib/firebase'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'

export default function LoginGate({ children }) {
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(true)
  const [logando, setLogando] = useState(false)
  const [uid, setUid] = useState(null)
  const [err, setErr] = useState('')

  // 1) Observa auth e sincroniza localStorage.meuId com auth.uid
  useEffect(() => {
    const off = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        setUid(user.uid)

        try {
          const lsId = localStorage.getItem('meuId')
          if (lsId !== user.uid) {
            localStorage.setItem('meuId', user.uid) // ✅ CORRIGE
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

      // ✅ Fonte da verdade do ID
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

  // Se ainda não logou, mostra tela de entrar
  if (!uid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border rounded-2xl p-6 shadow">
          <h1 className="text-2xl font-bold">Corre Aqui</h1>
          <p className="text-sm text-gray-600 mt-1">Entre com seu nome para continuar</p>

          <input
            className="mt-4 w-full px-3 py-2 border rounded"
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />

          {err && <div className="mt-3 text-sm text-red-600">{err}</div>}

          <button
            className="mt-4 w-full py-2 rounded bg-black text-white disabled:opacity-60"
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

  // Se já está logado: garante que o nome existe no localStorage
  // (se não tiver, mostra input antes de entrar no app)
  const nomeOk = (() => {
    try {
      return !!(localStorage.getItem('meuNome') || '').trim()
    } catch {
      return false
    }
  })()

  if (!nomeOk) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border rounded-2xl p-6 shadow">
          <h2 className="text-xl font-bold">Qual seu nome?</h2>

          <input
            className="mt-4 w-full px-3 py-2 border rounded"
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />

          {err && <div className="mt-3 text-sm text-red-600">{err}</div>}

          <button
            className="mt-4 w-full py-2 rounded bg-black text-white"
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
