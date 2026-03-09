'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, database } from '@/lib/firebase'
import { signOut } from 'firebase/auth'
import { ref, update } from 'firebase/database'

export default function Perfil() {
  const router = useRouter()

  const [nome, setNome] = useState('')
  const [meuId, setMeuId] = useState('')
  const [visivel, setVisivel] = useState(true)
  const [notifs, setNotifs] = useState(true)

  useEffect(() => {
    const n = localStorage.getItem('meuNome') || 'Anônimo'
    const id = localStorage.getItem('meuId') || ''
    setNome(n)
    setMeuId(id)

    const v = localStorage.getItem('visivelNoMapa')
    setVisivel(v == null ? true : v === 'true')

    const nf = localStorage.getItem('notifsAtivas')
    setNotifs(nf == null ? true : nf === 'true')
  }, [])

  async function salvarNome() {
    const novo = nome.trim() || 'Anônimo'
    setNome(novo)
    localStorage.setItem('meuNome', novo)

    // opcional: atualizar em /users/{id}
    if (meuId) {
      await update(ref(database, `users/${meuId}`), {
        nome: novo,
        updatedAt: Date.now(),
      }).catch(() => {})
    }
  }

  function toggleVisivel() {
    const nv = !visivel
    setVisivel(nv)
    localStorage.setItem('visivelNoMapa', String(nv))
  }

  function toggleNotifs() {
    const nv = !notifs
    setNotifs(nv)
    localStorage.setItem('notifsAtivas', String(nv))
  }

  async function sair() {
    try {
      // marca offline no RTDB
      if (meuId) {
        await update(ref(database, `users/${meuId}`), {
          online: false,
          lastSeen: Date.now(),
          updatedAt: Date.now(),
        }).catch(() => {})
      }

      await signOut(auth).catch(() => {})
    } finally {
      // não apaga teu nome se quiser manter
      localStorage.removeItem('meuId')
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-2xl mx-auto p-4">
        {/* topo */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <button
            onClick={() => router.back()}
            className="px-3 py-2 rounded-xl bg-white border shadow-sm hover:bg-gray-50"
            type="button"
          >
            ← Voltar
          </button>

          <div className="text-sm text-gray-600">
            {meuId ? (
              <>
                ID: <span className="font-semibold">{meuId.slice(0, 8)}…</span>
              </>
            ) : (
              <span>Sem login</span>
            )}
          </div>
        </div>

        {/* header */}
        <div className="bg-white border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center font-bold">
              CA
            </div>
            <div className="leading-tight">
              <div className="text-lg font-bold text-gray-900">Perfil & Configurações</div>
              <div className="text-xs text-gray-500">
                Ajuste seu nome, privacidade e preferências do app.
              </div>
            </div>
          </div>

          {/* nome */}
          <div className="mt-4">
            <div className="text-xs font-semibold text-gray-700 mb-1">Seu nome no app</div>
            <div className="flex gap-2">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border bg-white"
                placeholder="Ex: Robson"
              />
              <button
                onClick={salvarNome}
                className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90"
                type="button"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>

        {/* opções */}
        <div className="mt-4 space-y-3">
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900">👁️ Visível no mapa</div>
                <div className="text-xs text-gray-500">
                  Quando desligado, você não aparece como “online” para outros.
                </div>
              </div>
              <button
                onClick={toggleVisivel}
                className={`px-4 py-2 rounded-xl border ${
                  visivel ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-800'
                }`}
                type="button"
              >
                {visivel ? 'Ligado' : 'Desligado'}
              </button>
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900">🔔 Notificações</div>
                <div className="text-xs text-gray-500">
                  Controla se o app deve mostrar alertas/avisos (local).
                </div>
              </div>
              <button
                onClick={toggleNotifs}
                className={`px-4 py-2 rounded-xl border ${
                  notifs ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-800'
                }`}
                type="button"
              >
                {notifs ? 'Ligado' : 'Desligado'}
              </button>
            </div>
          </div>

          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="font-semibold text-gray-900">🧠 IA do Corre Aqui</div>
            <div className="text-xs text-gray-500 mt-1">
              (Próximo passo) Aqui vamos colocar: estilo da conversa, tom do assistente, “modo missão”, etc.
            </div>

            <button
              onClick={() => router.push('/')}
              className="mt-3 px-4 py-2 rounded-xl bg-gray-900 text-white hover:opacity-90"
              type="button"
            >
              Abrir tela principal
            </button>
          </div>

          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="font-semibold text-gray-900">🚪 Sair</div>
            <div className="text-xs text-gray-500 mt-1">Desconecta sua conta do app.</div>

            <button
              onClick={sair}
              className="mt-3 px-4 py-2 rounded-xl bg-red-600 text-white hover:opacity-90"
              type="button"
            >
              Sair da conta
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
