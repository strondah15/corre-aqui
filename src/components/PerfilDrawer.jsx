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
    titulo: '',
    descricao: '',
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

    await update(ref(database, `${userBasePath}`), {
      nome: profile.nome,
      fotoURL: profile.fotoURL || null,
      cidade: profile.cidade || '',
      profissional: profile.isProfissional ? {
        titulo: profile.titulo,
        descricao: profile.descricao,
        preco: profile.preco,
        whatsapp: profile.whatsapp
      } : null
    })
  }

  return (
    <div className="fixed inset-0 z-[9999]">

      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="absolute right-0 top-0 h-full w-[420px] bg-[#0b1220] text-white p-4 overflow-y-auto">

        {/* FOTO + HEADER */}
        <div className="flex flex-col items-center mb-6">

          <label className="cursor-pointer relative">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const url = URL.createObjectURL(file)
                setProfile(p => ({ ...p, fotoURL: url }))
              }}
            />

            {profile.fotoURL ? (
              <img src={profile.fotoURL} className="w-24 h-24 rounded-full object-cover border-4 border-blue-500 shadow-lg"/>
            ) : (
              <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center text-3xl border border-white/20">
                {profile.avatarEmoji || '📷'}
              </div>
            )}
          </label>

          <div className="mt-3 text-lg font-bold">{profile.nome || 'Seu nome'}</div>
          <div className="text-sm text-gray-400">{profile.cidade}</div>

        </div>

        {/* TABS */}
        <div className="flex gap-2 mb-4">
          {['perfil', 'config', 'profissional', 'monetizacao'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 rounded text-sm ${tab === t ? 'bg-blue-600' : 'bg-white/10'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* PERFIL */}
        {tab === 'perfil' && (
          <>
            <input value={profile.nome} onChange={(e)=>setProfile(p=>({...p,nome:e.target.value}))}
              placeholder="Nome" className="w-full mb-3 p-3 rounded-xl bg-white/5 border border-white/10"/>

            <input value={profile.cidade} onChange={(e)=>setProfile(p=>({...p,cidade:e.target.value}))}
              placeholder="Cidade" className="w-full mb-3 p-3 rounded-xl bg-white/5 border border-white/10"/>

            <textarea value={profile.bio} onChange={(e)=>setProfile(p=>({...p,bio:e.target.value}))}
              placeholder="Bio" className="w-full mb-3 p-3 rounded-xl bg-white/5 border border-white/10"/>
          </>
        )}

        {/* CONFIG */}
        {tab === 'config' && (
          <>
            <label className="flex justify-between mb-3">
              <span>Visível no mapa</span>
              <input type="checkbox" checked={profile.visivel}
                onChange={(e)=>setProfile(p=>({...p,visivel:e.target.checked}))}/>
            </label>
          </>
        )}

        {/* PROFISSIONAL */}
        {tab === 'profissional' && (
          <>
            <label className="flex justify-between mb-3">
              <span>Modo profissional</span>
              <input type="checkbox" checked={profile.isProfissional}
                onChange={(e)=>setProfile(p=>({...p,isProfissional:e.target.checked}))}/>
            </label>

            {profile.isProfissional && (
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10">

                <input value={profile.titulo}
                  onChange={(e)=>setProfile(p=>({...p,titulo:e.target.value}))}
                  placeholder="Título"
                  className="w-full mb-2 p-3 rounded-xl bg-white/5 border border-white/10"/>

                <textarea value={profile.descricao}
                  onChange={(e)=>setProfile(p=>({...p,descricao:e.target.value}))}
                  placeholder="Descrição"
                  className="w-full mb-2 p-3 rounded-xl bg-white/5 border border-white/10"/>

                <input value={profile.preco}
                  onChange={(e)=>setProfile(p=>({...p,preco:e.target.value}))}
                  placeholder="Preço"
                  className="w-full mb-2 p-3 rounded-xl bg-white/5 border border-white/10"/>

              </div>
            )}
          </>
        )}

        {/* MONETIZAÇÃO */}
        {tab === 'monetizacao' && (
          <PlanosCorreAqui />
        )}

        <button onClick={salvar}
          className="w-full mt-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 font-bold">
          Salvar
        </button>

      </div>
    </div>
  )
}
