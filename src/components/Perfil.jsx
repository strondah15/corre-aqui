'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import PerfilDrawer from './PerfilDrawer'

export default function Perfil() {
  const router = useRouter()
  const [uid, setUid] = useState('')

  useEffect(() => {
    const off = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || '')
    })

    return () => off()
  }, [])

  async function sair() {
    await signOut(auth).catch(() => {})
    router.replace('/')
  }

  if (!uid) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#050914] px-4 text-white">
        <div className="w-full max-w-md rounded-[30px] border border-white/10 bg-white/[0.055] p-6 text-center shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
            Corre Aqui
          </div>
          <h1 className="mt-3 text-2xl font-black">Perfil do app</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Entre primeiro para editar cadastro, notificacoes, patentes e preferencias.
          </p>
          <button
            type="button"
            onClick={() => router.replace('/')}
            className="mt-5 h-12 w-full rounded-2xl bg-white text-sm font-black text-slate-950 transition active:scale-[0.98]"
          >
            Ir para entrada
          </button>
        </div>
      </main>
    )
  }

  return (
    <>
      <PerfilDrawer open uid={uid} onClose={() => router.replace('/')} />
      <button
        type="button"
        onClick={sair}
        className="fixed bottom-4 left-4 z-[100001] rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white/[0.12]"
      >
        Sair da conta
      </button>
    </>
  )
}
