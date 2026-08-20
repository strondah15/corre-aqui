'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { onValue, ref } from '@/lib/firebaseDebug'
import { auth, database } from '@/lib/firebase'
import { reconcilePrivateRequestInbox } from '@/lib/privateRequests'
import { normalizePublicRequest } from '@/lib/publicRequests'
import AgendaProfissional from '@/components/AgendaProfissional'
import CentralNotificacoes from '@/components/CentralNotificacoes'
import ListaConversas from '@/components/ListaConversas'
import PainelProblemasDenuncias from '@/components/PainelProblemasDenuncias'

const META = {
  inbox: {
    icon: '💬',
    eyebrow: 'Inbox',
    title: 'Conversas e notificações',
    subtitle: 'Mensagens, aceites, conclusões e avisos importantes em uma tela limpa.',
  },
  agenda: {
    icon: '📅',
    eyebrow: 'Agenda',
    title: 'Minha agenda',
    subtitle: 'Solicitações futuras, confirmações e recusas dos seus serviços.',
  },
  seguranca: {
    icon: '🛡️',
    eyebrow: 'Segurança',
    title: 'Problemas e denúncias',
    subtitle: 'Acompanhe registros ligados aos seus pedidos e conversas.',
  },
}

function ordenarPedidos(lista) {
  return [...lista].sort((a, b) => Number(b?.atualizadoEm || b?.criadoEm || 0) - Number(a?.atualizadoEm || a?.criadoEm || 0))
}

export default function CorrePainelPage({ tipo = 'inbox' }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const meta = META[tipo] || META.inbox
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [privateRequests, setPrivateRequests] = useState([])
  const uid = user?.uid || ''
  const focusRequestId = String(searchParams.get('requestId') || '').trim()

  useEffect(() => {
    const off = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser || null)
    })

    return () => off()
  }, [])

  useEffect(() => {
    if (!uid) {
      setPedidos([])
      return undefined
    }

    const off = onValue(ref(database, 'publicRequests'), (snap) => {
      const raw = snap.val() || {}
      const lista = Object.entries(raw).map(([id, pedido]) => normalizePublicRequest(id, pedido))
      setPedidos(ordenarPedidos(lista))
    })

    return () => off()
  }, [uid])

  useEffect(() => {
    if (!uid) {
      setPrivateRequests([])
      return undefined
    }

    let cancelled = false
    const off = onValue(ref(database, `privateRequestInbox/${uid}`), (snap) => {
      const raw = snap.val() || {}
      const lista = Object.entries(raw)
        .map(([id, value]) => ({ id, ...(value || {}) }))
        .sort((a, b) => Number(b?.atualizadoEm || b?.criadoEm || 0) - Number(a?.atualizadoEm || a?.criadoEm || 0))

      void reconcilePrivateRequestInbox({ database, uid, entries: lista }).then(({ valid }) => {
        if (!cancelled) setPrivateRequests(valid)
      })
    }, () => {
      if (!cancelled) setPrivateRequests([])
    })

    return () => {
      cancelled = true
      off()
    }
  }, [uid])

  const meusPedidos = uid ? pedidos.filter((p) => p?.criador?.id === uid || p?.aceite?.id === uid) : []

  const abrirChat = (pedido) => {
    const pedidoId = pedido?.id || pedido?.pedidoId
    if (!pedidoId) return
    router.push(`/chat/${encodeURIComponent(String(pedidoId))}?voltar=corre`)
  }

  const abrirAcaoNotificacao = (screen, notificacao = {}) => {
    const action = notificacao?.action || {}
    const destino = String(screen || action?.screen || '').toLowerCase()
    const id = action?.id || notificacao?.privateRequestId || notificacao?.pedidoId || notificacao?.conversaId

    if (destino === 'chat' && id) {
      abrirChat({ id })
      return
    }
    if ((destino === 'abrir_pedido' || destino === 'pedido' || destino === 'pedidodetails' || destino === 'pedido_details') && id) {
      router.push(`/pedido/${encodeURIComponent(String(id))}?voltar=corre`)
      return
    }
    if (destino === 'agenda' || destino === 'privaterequestdetails') {
      router.replace(id ? `/corre/agenda?requestId=${encodeURIComponent(String(id))}` : '/corre/agenda')
      return
    }
    if (destino === 'myorders') {
      router.replace('/cliente')
      return
    }
    if (destino === 'portfolio') {
      router.replace('/cliente')
    }
  }

  const voltarCorre = () => {
    router.replace('/corre')
  }

  return (
    <main className={tipo === 'agenda' ? 'flex h-[100dvh] flex-col overflow-hidden bg-white text-slate-950' : 'min-h-[100dvh] overflow-hidden bg-white text-slate-950'}>
      <div className="relative shrink-0 bg-[linear-gradient(135deg,#0b73ff_0%,#16b8d1_48%,#ffdf2e_100%)] px-3 pb-5 pt-3 text-white md:px-6 md:pb-8 md:pt-6">
        <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-blue-500/24 md:h-96 md:w-96" />
        <div className="pointer-events-none absolute -right-16 top-2 h-72 w-56 rotate-12 rounded-[70px] bg-yellow-100/40 md:h-[28rem] md:w-80" />
        <div className="pointer-events-none absolute bottom-4 right-8 h-28 w-48 rotate-12 rounded-[44px] bg-blue-700/22 md:h-48 md:w-72" />

        <header className="relative mx-auto w-full max-w-5xl">
          <div className="flex items-center gap-3 rounded-[28px] border border-white/30 bg-white/14 p-3 shadow-[0_22px_70px_rgba(37,99,235,0.24)] backdrop-blur-2xl md:rounded-[36px] md:p-5">
            <button
              type="button"
              onClick={voltarCorre}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-lg font-black text-blue-950 shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition active:scale-[0.97] md:h-12 md:w-12"
              aria-label="Voltar"
            >
              ↩
            </button>

            <div className="min-w-0 flex-1">
              <div className="inline-flex rounded-full bg-[#ffd91a] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-950 md:px-3">
                Corre Aqui · {meta.eyebrow}
              </div>
              <h1 className="mt-2 truncate text-2xl font-black leading-tight text-white drop-shadow-sm md:text-4xl">
                <span className="mr-2">{meta.icon}</span>
                {meta.title}
              </h1>
              <p className="mt-1 line-clamp-2 text-xs font-bold leading-snug text-white/82 md:text-sm">
                {meta.subtitle}
              </p>
            </div>
          </div>
        </header>
      </div>

      <div className={['relative -mt-5 rounded-t-[34px] bg-white px-3 pt-5 shadow-[0_-18px_60px_rgba(15,23,42,0.10)] md:-mt-7 md:rounded-t-[44px] md:px-6 md:pt-7', tipo === 'agenda' ? 'flex min-h-0 flex-1 flex-col pb-2' : 'pb-[calc(env(safe-area-inset-bottom)+1.5rem)]'].join(' ')}>
        <section className={['mx-auto w-full max-w-5xl', tipo === 'agenda' ? 'min-h-0 flex-1' : ''].join(' ')}>
          {tipo === 'inbox' ? (
            <div className="grid gap-3 md:gap-4">
              <CentralNotificacoes
                meuId={uid}
                corres={meusPedidos}
                onAbrirChat={abrirChat}
                onAbrirPedido={(pedido) => {
                  const id = pedido?.id || pedido?.pedidoId
                  if (id) router.push(`/pedido/${encodeURIComponent(String(id))}?voltar=corre`)
                  else voltarCorre()
                }}
                onAction={abrirAcaoNotificacao}
              />
              <ListaConversas meuId={uid} onAbrirChat={(pedidoId) => abrirChat({ id: pedidoId })} />
            </div>
          ) : null}

          {tipo === 'agenda' ? (
            <AgendaProfissional
              uid={uid}
              nome={user?.displayName || ''}
              fotoURL={user?.photoURL || ''}
              privateRequests={privateRequests}
              focusRequestId={focusRequestId}
              onAbrirChat={abrirChat}
            />
          ) : null}

          {tipo === 'seguranca' ? (
            <PainelProblemasDenuncias
              meuId={uid}
              corres={meusPedidos}
              onAbrirChat={abrirChat}
              onAbrirPedido={voltarCorre}
            />
          ) : null}
        </section>
      </div>
    </main>
  )
}
