'use client'

import { useEffect, useMemo, useState } from 'react'
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
    bio: '',
    visivel: true,
    notificacoes: true,
    isProfissional: false,
    whatsapp: '',
    preco: ''
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

      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="absolute right-0 top-0 h-full w-[400px] bg-[#0b1220] text-white p-4 overflow-y-auto">

        <h2 className="text-xl font-bold mb-4">Perfil</h2>

        <div className="flex gap-2 mb-4">
          {['perfil', 'config', 'profissional', 'monetizacao'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 rounded ${tab === t ? 'bg-blue-600' : 'bg-white/10'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'perfil' && (
          <>
            <input value={profile.nome} onChange={(e)=>setProfile(p=>({...p,nome:e.target.value}))} placeholder="Nome" className="w-full mb-2 p-2 rounded bg-white/10" />
            <input value={profile.cidade} onChange={(e)=>setProfile(p=>({...p,cidade:e.target.value}))} placeholder="Cidade" className="w-full mb-2 p-2 rounded bg-white/10" />
            <input value={profile.fotoURL} onChange={(e)=>setProfile(p=>({...p,fotoURL:e.target.value}))} placeholder="Foto URL" className="w-full mb-2 p-2 rounded bg-white/10" />
            <input value={profile.avatarEmoji} onChange={(e)=>setProfile(p=>({...p,avatarEmoji:e.target.value}))} placeholder="Emoji 😎" className="w-full mb-2 p-2 rounded bg-white/10" />
            <textarea value={profile.bio} onChange={(e)=>setProfile(p=>({...p,bio:e.target.value}))} placeholder="Bio" className="w-full mb-2 p-2 rounded bg-white/10" />
            <button onClick={salvar} className="w-full bg-blue-600 py-2 rounded mt-2">Salvar</button>
          </>
        )}

        {tab === 'config' && (
          <>
            <label className="flex justify-between mb-3">
              <span>Visível no mapa</span>
              <input type="checkbox" checked={profile.visivel} onChange={(e)=>setProfile(p=>({...p,visivel:e.target.checked}))} />
            </label>

            <label className="flex justify-between mb-3">
              <span>Notificações</span>
              <input type="checkbox" checked={profile.notificacoes} onChange={(e)=>setProfile(p=>({...p,notificacoes:e.target.checked}))} />
            </label>
          </>
        )}

        {tab === 'profissional' && (
          <>
            <label className="flex justify-between mb-3">
              <span>Sou profissional</span>
              <input type="checkbox" checked={profile.isProfissional} onChange={(e)=>setProfile(p=>({...p,isProfissional:e.target.checked}))} />
            </label>

            <input value={profile.whatsapp} onChange={(e)=>setProfile(p=>({...p,whatsapp:e.target.value}))} placeholder="WhatsApp" className="w-full mb-2 p-2 rounded bg-white/10" />

            <input value={profile.preco} onChange={(e)=>setProfile(p=>({...p,preco:e.target.value}))} placeholder="Preço base" className="w-full mb-2 p-2 rounded bg-white/10" />
          </>
        )}

        {tab === 'monetizacao' && (
          <PlanosCorreAqui />
        )}

      </div>
    </div>
  )
}
