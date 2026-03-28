'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ref, onValue, update, serverTimestamp } from 'firebase/database'
import { database } from '@/lib/firebase'
import dynamic from 'next/dynamic'

const PlanosCorreAqui = dynamic(() => import('@/components/PlanosCorreAqui'), {
  ssr: false
})

export default function PerfilDrawer({ open, onClose, uid }) {
  if (!open) return null
  if (!uid) return null

  const [tab, setTab] = useState('perfil')
  const [profile, setProfile] = useState({
    nome: '',
    cidade: '',
    fotoURL: '',
    avatarEmoji: '',
    bio: ''
  })

  const userBasePath = useMemo(() => `users/${uid}`, [uid])

  useEffect(() => {
    if (!open || !uid) return

    const pRef = ref(database, `${userBasePath}/profile`)

    return onValue(pRef, (snap) => {
      if (snap.exists()) {
        setProfile((prev) => ({ ...prev, ...snap.val() }))
      }
    })
  }, [open, uid, userBasePath])

  const salvar = async () => {
    await update(ref(database, `${userBasePath}/profile`), {
      ...profile,
      atualizadoEm: serverTimestamp()
    })
  }

  return (
    <div className="fixed inset-0 z-[9999]">

      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* drawer */}
      <div className="absolute right-0 top-0 h-full w-[400px] bg-[#0b1220] text-white p-4 overflow-y-auto">

        <h2 className="text-xl font-bold mb-4">Perfil</h2>

        {/* TABS */}
        <div className="flex gap-2 mb-4">
          {['perfil', 'config', 'profissional', 'monetizacao'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded ${
                tab === t ? 'bg-blue-600' : 'bg-white/10'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* PERFIL */}
        {tab === 'perfil' && (
          <>
            <input
              value={profile.nome}
              onChange={(e) => setProfile(p => ({ ...p, nome: e.target.value }))}
              placeholder="Nome"
              className="w-full mb-2 p-2 rounded bg-white/10"
            />

            <input
              value={profile.cidade}
              onChange={(e) => setProfile(p => ({ ...p, cidade: e.target.value }))}
              placeholder="Cidade"
              className="w-full mb-2 p-2 rounded bg-white/10"
            />

            <button
              onClick={salvar}
              className="w-full bg-blue-600 py-2 rounded mt-2"
            >
              Salvar
            </button>
          </>
        )}

        {/* MONETIZAÇÃO */}
        {tab === 'monetizacao' && (
          <PlanosCorreAqui />
        )}

      </div>
    </div>
  )
}