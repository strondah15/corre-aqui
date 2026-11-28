'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { get, ref } from '@/lib/firebaseDebug'
import CadastroPerfilInicial from '@/components/CadastroPerfilInicial'
import { auth, database } from '@/lib/firebase'
import { perfilMinimoCompleto } from '@/lib/perfilCadastro'
import { removerPushTokenDoDispositivo } from '@/lib/pushClient'
import { logoutFirebaseSession } from '@/lib/sessionLogout'

function esperar(ms, valor = null) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(valor), ms)
  })
}

export default function CadastroPage() {
  const router = useRouter()
  const [uid, setUid] = useState('')
  const [authUser, setAuthUser] = useState(null)
  const [userData, setUserData] = useState(null)
  const [saindo, setSaindo] = useState(false)
  const [erroSaida, setErroSaida] = useState('')

  useEffect(() => {
    let active = true

    const off = onAuthStateChanged(auth, async (user) => {
      if (!active || auth.currentUser !== user) return
      setUid('')
      setAuthUser(null)
      setUserData(null)
      setErroSaida('')
      if (!user?.uid) return

      const snap = await Promise.race([
        get(ref(database, `users/${user.uid}`)).catch(() => null),
        esperar(3500),
      ])
      const data = snap?.val?.() || {}

      if (!active || auth.currentUser !== user) return

      if (perfilMinimoCompleto(data)) {
        router.replace('/')
        return
      }

      setUid(user.uid)
      setAuthUser(user)
      setUserData(data)
    })

    return () => {
      active = false
      off()
    }
  }, [router])

  async function sair() {
    if (saindo) return
    setSaindo(true)
    setErroSaida('')
    try {
      await logoutFirebaseSession({ auth, database, uid, removePushToken: removerPushTokenDoDispositivo })
      router.replace('/')
    } catch (error) {
      if (auth.currentUser === authUser) setErroSaida(error?.message || 'Não foi possível sair agora. Tente novamente.')
    } finally {
      setSaindo(false)
    }
  }

  if (!uid) {
    return (
      <main className="grid min-h-screen place-items-center bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_120%)] px-4 text-white">
        <div className="w-full max-w-md rounded-[30px] border border-white/35 bg-white/92 p-6 text-center text-slate-950 shadow-[0_30px_100px_rgba(37,99,235,0.24)] backdrop-blur-2xl">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
            Corre Aqui
          </div>
          <h1 className="mt-3 text-2xl font-black text-blue-950">Entre antes de cadastrar o perfil</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            O cadastro agora fica ligado a uma conta real para salvar pedidos, chat,
            notificações e histórico.
          </p>
          <button
            type="button"
            onClick={() => router.replace('/')}
            className="mt-5 h-12 w-full rounded-2xl bg-[#ffd91a] text-sm font-black text-blue-950 transition active:scale-[0.98]"
          >
            Voltar para entrada
          </button>
        </div>
      </main>
    )
  }

  return (
    <CadastroPerfilInicial
      key={uid}
      uid={uid}
      authUser={authUser}
      userData={userData}
      onSaved={() => { if (auth.currentUser === authUser) router.replace('/') }}
      onSair={sair}
      saindo={saindo}
      erroSaida={erroSaida}
    />
  )
}
