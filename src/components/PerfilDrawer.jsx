'use client'

import { useEffect, useState } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { database } from '@/lib/firebase'

export default function PerfilDrawer({ open, onClose, uid }) {

  const [user, setUser] = useState(null)

  useEffect(() => {
    if (!uid) return

    const userRef = ref(database, `users/${uid}`)

    const off = onValue(userRef, (snap) => {
      setUser(snap.val())
    })

    return () => off()

  }, [uid])

  if (!open) return null

  async function ativarPlano(tipo) {

    if (!uid) return

    await update(ref(database, `users/${uid}`), {
      plano: tipo,
      planoAtivo: true,
      atualizadoEm: Date.now()
    })

    alert(`Plano ${tipo} ativado`)
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex justify-end">

      <div className="w-[340px] bg-zinc-900 text-white h-full p-4 overflow-y-auto">

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold">Perfil</h2>

          <button
            onClick={onClose}
            className="text-sm bg-white/10 px-3 py-1 rounded-lg"
          >
            fechar
          </button>
        </div>

        {/* USUÁRIO */}

        <div className="mb-6">

          <div className="text-sm text-gray-400">Usuário</div>
          <div className="text-lg font-semibold">
            {user?.nome || 'Anônimo'}
          </div>

        </div>

        {/* PATENTE */}

        <div className="mb-6">

          <div className="text-sm text-gray-400 mb-2">
            Patente
          </div>

          <div className="bg-white/10 p-3 rounded-xl">
            Corre: {user?.patenteCorre || 1}
          </div>

        </div>

        {/* MONETIZAÇÃO */}

        <div className="mb-6">

          <div className="text-lg font-bold mb-3">
            💰 Monetização
          </div>

          <div className="bg-white/10 p-3 rounded-xl mb-3">

            <div className="text-sm text-gray-400">
              Plano atual
            </div>

            <div className="font-semibold">
              {user?.plano || 'Free'}
            </div>

          </div>

          <button
            onClick={() => ativarPlano('pro')}
            className="w-full bg-blue-600 py-2 rounded-xl mb-2"
          >
            Ativar Plano Pro
          </button>

          <button
            onClick={() => ativarPlano('premium')}
            className="w-full bg-purple-600 py-2 rounded-xl"
          >
            Ativar Plano Premium
          </button>

        </div>

        {/* ANÚNCIOS */}

        <div className="mb-6">

          <div className="text-lg font-bold mb-2">
            📢 Anunciar no app
          </div>

          <div className="text-sm text-gray-400 mb-3">
            Promova seu negócio dentro do Corre Aqui
          </div>

          <button
            className="w-full bg-yellow-500 text-black py-2 rounded-xl"
            onClick={() => alert('Em breve anúncios disponíveis')}
          >
            Criar anúncio
          </button>

        </div>

      </div>

    </div>
  )
}