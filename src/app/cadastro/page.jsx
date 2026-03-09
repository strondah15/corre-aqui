'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'

export default function CadastroPage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [visivel, setVisivel] = useState(true)

  useEffect(() => {
    const nomeSalvo = localStorage.getItem('meuNome')
    const idSalvo = localStorage.getItem('meuId')
    if (nomeSalvo && idSalvo) {
      router.push('/')
    }
  }, [])

  const handleCadastrar = () => {
    if (nome.trim().length < 2) {
      alert('Digite um nome válido!')
      return
    }

    const idUnico = uuidv4().slice(0, 6)
    localStorage.setItem('meuNome', nome.trim())
    localStorage.setItem('meuId', idUnico)
    localStorage.setItem('visivel', visivel ? 'true' : 'false')

    router.push('/')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-200 p-6">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Bem-vindo ao Corre Aqui 🚀</h1>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Seu nome"
          className="w-full p-2 border border-gray-300 rounded-lg mb-4 outline-none focus:ring-2 focus:ring-blue-300"
        />
        <div className="flex items-center justify-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={visivel}
            onChange={() => setVisivel(!visivel)}
            id="visivel"
            className="h-4 w-4"
          />
          <label htmlFor="visivel" className="text-sm text-gray-700">Quero aparecer no mapa</label>
        </div>
        <button
          onClick={handleCadastrar}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Entrar no Mapa
        </button>
      </div>
    </main>
  )
}
