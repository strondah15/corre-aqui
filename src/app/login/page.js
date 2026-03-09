'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithGoogle } from '@/lib/authGoogle'

function LoginGoogleButton() {
  return (
    <button
      onClick={async () => {
        try {
          await signInWithGoogle({ mode: 'popup' })
          window.location.href = '/' // troque pra '/mapa' se quiser
        } catch (e) {
          console.error(e)
          alert('❌ Falhou login Google. Veja o console (F12).')
        }
      }}
      className="w-full rounded-xl bg-black text-white py-2"
    >
      Entrar com Google
    </button>
  )
}

export default function LoginPage() {
  const [nome, setNome] = useState('')
  const [nomeSalvo, setNomeSalvo] = useState('')
  const router = useRouter()

  useEffect(() => {
    setNomeSalvo(localStorage.getItem('meuNome') || '')
  }, [])

  const handleLogin = () => {
    if (!nome.trim()) return alert('Digite seu nome')
    localStorage.setItem('meuNome', nome.trim())
    router.push('/')
  }

  const limparNome = () => {
    localStorage.removeItem('meuNome')
    setNomeSalvo('')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white p-6 rounded-xl shadow-md text-center max-w-md w-full space-y-4">
        <h1 className="text-2xl font-bold text-blue-600">Corre Aqui 🚀</h1>

        {/* Mostra se existe nome salvo */}
        {nomeSalvo ? (
          <div className="text-sm text-gray-700">
            Você já tem um nome salvo: <b>{nomeSalvo}</b>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => router.push('/')}
                className="flex-1 rounded-xl bg-blue-500 text-white py-2"
              >
                Ir pro app
              </button>
              <button
                onClick={limparNome}
                className="flex-1 rounded-xl bg-gray-200 py-2"
              >
                Trocar
              </button>
            </div>
          </div>
        ) : null}

        {/* Google login sempre visível */}
        <LoginGoogleButton />

        <div className="flex items-center gap-3">
          <div className="h-px bg-gray-200 flex-1" />
          <span className="text-xs text-gray-500">ou</span>
          <div className="h-px bg-gray-200 flex-1" />
        </div>

        <p>Como você quer ser chamado?</p>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Robson"
          className="w-full p-3 border rounded-xl"
        />

        <button
          onClick={handleLogin}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl"
        >
          Entrar
        </button>
      </div>
    </main>
  )
}
