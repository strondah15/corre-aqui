'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { onValue, ref } from 'firebase/database'
import { auth, database } from '@/lib/firebase'
import LoginGate from '@/components/LoginGate'
import ChatMensagens from '@/components/ChatMensagens'

function pickNome(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || 'Você'
}

function getOutroUser(pedido, conversa, meuId) {
  if (pedido?.aceite?.id && pedido.aceite.id !== meuId) {
    return { id: pedido.aceite.id, nome: pedido.aceite.nome || 'Corre' }
  }

  if (pedido?.criador?.id && pedido.criador.id !== meuId) {
    return { id: pedido.criador.id, nome: pedido.criador.nome || 'Cliente' }
  }

  if (conversa?.outroId || conversa?.outroNome) {
    return {
      id: conversa?.outroId || null,
      nome: conversa?.outroNome || 'Alguém',
    }
  }

  return { id: null, nome: 'Alguém' }
}

function ChatPageContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pedidoId = useMemo(() => {
    const raw = Array.isArray(params?.pedidoId) ? params.pedidoId[0] : params?.pedidoId
    try {
      return decodeURIComponent(String(raw || '').trim())
    } catch {
      return String(raw || '').trim()
    }
  }, [params])

  const [authUser, setAuthUser] = useState(null)
  const [pedido, setPedido] = useState(null)
  const [conversa, setConversa] = useState(null)
  const [userNode, setUserNode] = useState(null)
  const [nomeCache, setNomeCache] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    try {
      setNomeCache(localStorage.getItem('meuNome') || '')
    } catch {}

    const off = onAuthStateChanged(auth, (user) => {
      setAuthUser(user || null)
    })

    return () => off()
  }, [])

  useEffect(() => {
    if (!authUser?.uid) {
      setUserNode(null)
      return undefined
    }

    const off = onValue(ref(database, `users/${authUser.uid}`), (snap) => {
      setUserNode(snap.val() || null)
    })

    return () => off()
  }, [authUser?.uid])

  useEffect(() => {
    if (!pedidoId) {
      setPedido(null)
      return undefined
    }

    const off = onValue(ref(database, `pedidos/${pedidoId}`), (snap) => {
      setPedido(snap.exists() ? { id: pedidoId, ...(snap.val() || {}) } : null)
    })

    return () => off()
  }, [pedidoId])

  useEffect(() => {
    if (!authUser?.uid || !pedidoId) {
      setConversa(null)
      return undefined
    }

    const off = onValue(ref(database, `conversas/${authUser.uid}/${pedidoId}`), (snap) => {
      setConversa(snap.val() || null)
    })

    return () => off()
  }, [authUser?.uid, pedidoId])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), toast.ms || 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const voltarParaOrigem = useCallback(() => {
    const modoUrl = String(searchParams?.get('voltar') || '').toLowerCase()
    if (modoUrl === 'cliente' || modoUrl === 'corre') {
      router.replace(`/${modoUrl}`)
      return
    }

    try {
      const modoSalvo = String(localStorage.getItem('modoApp') || '').toLowerCase()
      if (modoSalvo === 'cliente' || modoSalvo === 'corre') {
        router.replace(`/${modoSalvo}`)
        return
      }
    } catch {}

    router.replace('/cliente')
  }, [router, searchParams])

  const meuNome = pickNome(
    userNode?.profile?.nome,
    userNode?.nome,
    authUser?.displayName,
    nomeCache
  )
  const titulo = pedido?.titulo || conversa?.titulo || 'Conversa do pedido'
  const outroUser = getOutroUser(pedido, conversa, authUser?.uid)

  return (
    <main className="min-h-[100dvh] bg-[#020617] text-white">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col p-2 sm:p-5">
        {pedidoId && authUser?.uid ? (
          <ChatMensagens
            pedidoId={pedidoId}
            meuId={authUser.uid}
            meuNome={meuNome}
            pedidoTitulo={titulo}
            outroUser={outroUser}
            planoAtual={userNode?.plano || 'free'}
            mostrarAnuncio={false}
            modoPagina
            onClose={voltarParaOrigem}
            onToast={setToast}
          />
        ) : (
          <div className="grid flex-1 place-items-center rounded-[28px] border border-white/10 bg-white/[0.045] p-6 text-center">
            <div>
              <div className="text-xl font-black text-white">Conversa indisponível</div>
              <p className="mt-2 text-sm text-slate-400">
                Entre no app novamente ou abra a conversa pela lista de pedidos.
              </p>
            </div>
          </div>
        )}
      </div>

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-[99999] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
          <div className="text-white">{toast.title || 'Corre Aqui'}</div>
          {toast.message ? <div className="mt-1 text-xs text-slate-400">{toast.message}</div> : null}
        </div>
      ) : null}
    </main>
  )
}

export default function ChatPedidoPage() {
  return (
    <LoginGate>
      <ChatPageContent />
    </LoginGate>
  )
}
