'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { onValue, ref } from '@/lib/firebaseDebug'
import { auth, database } from '@/lib/firebase'
import { getOnlineTimestamp, isOnlineRecente } from '@/lib/presence'
import LoginGate from '@/components/LoginGate'
import ChatMensagens from '@/components/ChatMensagens'
import { ChatScreenSkeleton } from '@/components/LoadingSkeletons'
import { isServiceContactActiveStatus, isServiceParticipant } from '@/lib/serviceContactPolicy'
import { requestAuthorizedServiceContact } from '@/lib/serviceContacts'
import { isPrivateAttendanceStatus } from '@/lib/attendanceState'
import { getChatOriginFromContext, getChatReturnHref } from '@/lib/chatNavigation'

const LIST_STATE_PREFIX = 'correAqui:listState:v2'
const LIST_RETURN_FLAG = 'correAqui:returningToList'

function pickNome(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || 'Você'
}

function getOutroUser(pedido, conversa, meuId) {
  if (pedido?.aceite?.id && pedido.aceite.id !== meuId) {
    return { id: pedido.aceite.id, nome: pedido.aceite.nome || 'Corre', fotoURL: pedido.aceite.fotoURL || pedido.aceite.photoURL || '' }
  }

  if (pedido?.criador?.id && pedido.criador.id !== meuId) {
    return { id: pedido.criador.id, nome: pedido.criador.nome || 'Cliente', fotoURL: pedido.criador.fotoURL || pedido.criador.photoURL || '' }
  }

  if (conversa?.outroId || conversa?.outroNome) {
    return {
      id: conversa?.outroId || null,
      nome: conversa?.outroNome || 'Alguém',
    }
  }

  return { id: null, nome: 'Alguém' }
}

function isPrivateChatReady(record = {}) {
  return isPrivateAttendanceStatus(record?.status)
}

function useOwnedValue(ownerKey, initialValue = null) {
  const [state, setState] = useState({ ownerKey: '', value: initialValue })
  const publish = useCallback((value) => {
    setState({ ownerKey, value })
  }, [ownerKey])
  return [state.ownerKey === ownerKey ? state.value : initialValue, publish]
}

function ChatPageContent() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnNavigationLockRef = useRef(false)
  const pedidoId = useMemo(() => {
    const raw = Array.isArray(params?.pedidoId) ? params.pedidoId[0] : params?.pedidoId
    try {
      return decodeURIComponent(String(raw || '').trim())
    } catch {
      return String(raw || '').trim()
    }
  }, [params])

  const [authUser, setAuthUser] = useState(null)
  const [authResolved, setAuthResolved] = useState(false)
  const authUid = String(authUser?.uid || '')
  const contextKey = `${authUid}:${pedidoId}`
  const [pedido, setPedido] = useOwnedValue(contextKey)
  const [privateRequest, setPrivateRequest] = useOwnedValue(contextKey)
  const [sourceStatus, setSourceStatus] = useOwnedValue(contextKey, 'loading')
  const [conversa, setConversa] = useOwnedValue(contextKey)
  const [userNode, setUserNode] = useOwnedValue(authUid)
  const [serviceContact, setServiceContact] = useOwnedValue(contextKey)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    returnNavigationLockRef.current = false
  }, [contextKey])

  useEffect(() => {
    const off = onAuthStateChanged(auth, (user) => {
      setAuthUser(user || null)
      setAuthResolved(true)
    })

    return () => off()
  }, [])

  useEffect(() => {
    setUserNode(null)
    if (!authUser?.uid) {
      return undefined
    }

    let active = true
    const off = onValue(ref(database, `users/${authUser.uid}`), (snap) => {
      if (active) setUserNode(snap.val() || null)
    }, () => {
      if (active) setUserNode(null)
    })

    return () => {
      active = false
      off()
    }
  }, [authUser?.uid, setUserNode])

  useEffect(() => {
    setPedido(null)
    setPrivateRequest(null)
    setSourceStatus('loading')
    if (!authUser?.uid || !pedidoId) {
      return undefined
    }

    const effectUid = authUser.uid
    let active = true
    let offSource = null

    const isCurrentSession = () => active && auth.currentUser?.uid === effectUid
    const reportSourceError = (operation, path, error) => {
      if (!isCurrentSession()) return
      setPedido(null)
      setPrivateRequest(null)
      setSourceStatus('unavailable')
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[CHAT_SOURCE]', {
          operation,
          path,
          authUid: effectUid,
          pedidoId,
          error: { code: error?.code || null, message: error?.message || null },
        })
      }
    }

    void (async () => {
      const contextPath = '/api/conversations/context'
      try {
        const currentUser = auth.currentUser
        if (!currentUser?.uid || currentUser.uid !== effectUid) return
        const idToken = await currentUser.getIdToken()
        if (!isCurrentSession()) return

        const response = await fetch(contextPath, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ conversationId: pedidoId }),
        })
        const result = await response.json().catch(() => ({}))
        if (!isCurrentSession()) return
        if (!response.ok || (result?.kind !== 'pedido' && result?.kind !== 'privateRequest')) {
          const error = new Error(result?.error || 'conversation_context_unavailable')
          error.code = result?.error || 'conversation_context_unavailable'
          throw error
        }

        const sourceKind = result.kind
        const sourcePath = sourceKind === 'privateRequest'
          ? `privateRequests/${pedidoId}`
          : `pedidos/${pedidoId}`

        offSource = onValue(
          ref(database, sourcePath),
          (snapshot) => {
            if (!isCurrentSession()) return
            if (sourceKind === 'privateRequest') {
              const nextPrivateRequest = snapshot.exists() ? { id: pedidoId, ...(snapshot.val() || {}) } : null
              const ready = Boolean(nextPrivateRequest && isPrivateChatReady(nextPrivateRequest))
              setPedido(null)
              setPrivateRequest(ready ? nextPrivateRequest : null)
              setSourceStatus(ready ? 'ready' : 'unavailable')
              return
            }

            setPrivateRequest(null)
            setPedido(snapshot.exists() ? { id: pedidoId, ...(snapshot.val() || {}) } : null)
            setSourceStatus(snapshot.exists() ? 'ready' : 'unavailable')
          },
          (error) => reportSourceError('onValue', sourcePath, error),
        )
      } catch (error) {
        reportSourceError('POST', contextPath, error)
      }
    })()

    return () => {
      active = false
      offSource?.()
    }
  }, [authUser?.uid, pedidoId, setPedido, setPrivateRequest, setSourceStatus])

  useEffect(() => {
    setConversa(null)
    if (!authUser?.uid || !pedidoId) {
      return undefined
    }

    let active = true
    const off = onValue(ref(database, `conversas/${authUser.uid}/${pedidoId}`), (snap) => {
      if (active) setConversa(snap.val() || null)
    }, () => {
      if (active) setConversa(null)
    })

    return () => {
      active = false
      off()
    }
  }, [authUser?.uid, pedidoId, setConversa])

  useEffect(() => setToast(null), [contextKey])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), toast.ms || 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  const voltarParaOrigem = useCallback(() => {
    if (returnNavigationLockRef.current) return

    let fallback = 'cliente'
    try {
      const modoSalvo = String(localStorage.getItem('modoApp') || '').toLowerCase()
      if (modoSalvo === 'cliente' || modoSalvo === 'corre') fallback = modoSalvo
    } catch {}

    const origin = getChatOriginFromContext({
      explicit: searchParams?.get('voltar'),
      fallback,
    })
    const returnHref = getChatReturnHref(origin)
    returnNavigationLockRef.current = true

    if (origin === 'cliente' || origin === 'corre') {
      const stateKey = `${LIST_STATE_PREFIX}:${origin}`
      try {
        if (sessionStorage.getItem(stateKey)) {
          if (process.env.NODE_ENV !== 'production') console.time('back-list')
          sessionStorage.setItem(LIST_RETURN_FLAG, stateKey)
          router.replace(returnHref, { scroll: false })
          return
        }
      } catch {}

      try {
        sessionStorage.setItem(LIST_RETURN_FLAG, stateKey)
      } catch {}
    }

    router.replace(returnHref, { scroll: false })
  }, [router, searchParams])

  const meuNome = pickNome(
    userNode?.profile?.nome,
    userNode?.nome,
    authUser?.displayName
  )
  const pedidoChat = useMemo(() => {
    if (pedido) return pedido
    if (!privateRequest) return null
    return {
      ...privateRequest,
      id: pedidoId,
      titulo: privateRequest?.servicoTitulo || privateRequest?.titulo || conversa?.titulo || 'Pedido direto',
      privateRequest: true,
      criador: {
        id: privateRequest?.clienteId,
        nome: privateRequest?.clienteNome,
        fotoURL: privateRequest?.clienteFotoURL,
      },
      aceite: {
        id: privateRequest?.profissionalId,
        nome: privateRequest?.profissionalNome,
        fotoURL: privateRequest?.profissionalFotoURL,
      },
    }
  }, [conversa?.titulo, pedido, pedidoId, privateRequest])
  const titulo = pedidoChat?.titulo || conversa?.titulo || 'Conversa do pedido'
  const outroUserBase = useMemo(() => getOutroUser(pedidoChat, conversa, authUser?.uid), [authUser?.uid, conversa, pedidoChat])
  const counterpartKey = `${contextKey}:${String(outroUserBase?.id || '')}`
  const [outroPresence, setOutroPresence] = useOwnedValue(counterpartKey)
  const [outroPublicProfile, setOutroPublicProfile] = useOwnedValue(counterpartKey)
  const serviceContext = pedido || privateRequest
  const serviceKind = pedido ? 'pedido' : 'privateRequest'
  const serviceParticipant = Boolean(
    authUser?.uid && serviceContext && isServiceParticipant(serviceContext, serviceKind, authUser.uid),
  )

  useEffect(() => {
    setServiceContact(null)
    if (!authUser?.uid || !pedidoId || !serviceContext || !serviceParticipant) {
      return undefined
    }

    let mounted = true
    if (!isServiceContactActiveStatus(serviceContext?.status)) {
      setServiceContact(null)
      return () => {
        mounted = false
      }
    }

    void requestAuthorizedServiceContact(pedidoId)
      .then((result) => {
        if (mounted) setServiceContact(result?.available ? result.contact || null : null)
      })
      .catch(() => {
        if (mounted) setServiceContact(null)
      })

    return () => {
      mounted = false
    }
  }, [authUser?.uid, pedidoId, serviceContext, serviceParticipant, setServiceContact])

  useEffect(() => {
    setOutroPresence(null)
    setOutroPublicProfile(null)
    if (!outroUserBase?.id) {
      return undefined
    }

    let active = true
    const offPresence = onValue(
      ref(database, `publicAvailability/${outroUserBase.id}`),
      (snap) => {
        if (active) setOutroPresence(snap.val() || null)
      },
      () => {
        if (active) setOutroPresence(null)
      },
    )
    const offPublicProfile = onValue(
      ref(database, `publicProfiles/${outroUserBase.id}`),
      (snap) => {
        if (active) setOutroPublicProfile(snap.val() || null)
      },
      () => {
        if (active) setOutroPublicProfile(null)
      },
    )

    return () => {
      active = false
      offPresence()
      offPublicProfile()
    }
  }, [outroUserBase?.id, setOutroPresence, setOutroPublicProfile])

  const presence = outroPresence || {}
  const outroUser = {
    ...outroUserBase,
    fotoURL: outroUserBase?.fotoURL || outroPublicProfile?.fotoURL || outroPublicProfile?.photoURL || '',
    photoURL: outroUserBase?.photoURL || outroPublicProfile?.photoURL || outroPublicProfile?.fotoURL || '',
    online: isOnlineRecente(presence),
    lastSeen: getOnlineTimestamp(presence),
    presence,
    publicProfile: outroPublicProfile,
    serviceContact,
    requestStatus: privateRequest?.status || '',
    privateRequestParticipant: Boolean(
      authUser?.uid
      && privateRequest
      && [privateRequest?.clienteId, privateRequest?.profissionalId].some((uid) => String(uid || '') === String(authUser.uid)),
    ),
  }
  const loadingAuthoritativeContext = !authResolved
    || Boolean(pedidoId && authUser?.uid && sourceStatus === 'loading')

  return (
    <main className="fixed inset-0 z-[100000] h-[100svh] overflow-hidden bg-[#050b12] text-white supports-[height:100dvh]:h-[100dvh]">
      <div className="relative h-full min-h-0 w-full overflow-hidden">
        {pedidoId && authUser?.uid && sourceStatus === 'ready' && pedidoChat ? (
          <ChatMensagens
            key={`${authUser.uid}:${pedidoId}`}
            pedidoId={pedidoId}
            meuId={authUser.uid}
            meuNome={meuNome}
            pedidoTitulo={titulo}
            serviceRecord={pedidoChat}
            outroUser={outroUser}
            planoAtual={userNode?.plano || 'free'}
            mostrarAnuncio={false}
            modoPagina
            initialDetailsOpen={searchParams?.get('detalhes') === '1'}
            onClose={voltarParaOrigem}
            onToast={setToast}
          />
        ) : loadingAuthoritativeContext ? (
          <ChatScreenSkeleton />
        ) : (
          <div className="grid h-full place-items-center bg-[#050b12] p-6 text-center">
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
