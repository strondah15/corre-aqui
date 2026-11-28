'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { get, onValue, ref, serverTimestamp, update } from '@/lib/firebaseDebug'
import LoginGate from '@/components/LoginGate'
import { getCategoryById } from '@/constants/categories'
import { auth, database } from '@/lib/firebase'
import { isOnlineRecente } from '@/lib/presence'
import { ATENDIMENTO_STATUS, normalizeServiceAttendanceStatus, transitionAtendimento } from '@/lib/atendimento'
import { notifyPublicRequestAccepted } from '@/lib/privateRequests'
import { CONTEXTUAL_TIP_IDS } from '@/lib/tutorial/contextualTipsConfig'
import { showCorreAquiTipOnce } from '@/components/tutorial/TutorialProvider'
import { normalizePublicRequest } from '@/lib/publicRequests'
import { createClaimUiCheck } from '@/lib/publicRequestClaimUi'
import { registrarMensagemSistemaConfiavel } from '@/lib/trustedSystemChat'
import { getAuthorizedPhoneHref } from '@/lib/serviceExperience'
import { createChatHref, getChatReturnHref, normalizeChatOrigin, prefetchChatRoute } from '@/lib/chatNavigation'

const MapinhaModal = dynamic(() => import('@/components/MapinhaModal'), { ssr: false })
const LIST_STATE_PREFIX = 'correAqui:listState:v2'
const LIST_RETURN_FLAG = 'correAqui:returningToList'

function getMs(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') return value.seconds * 1000
  return 0
}

function getValorPedido(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

function formatMoney(value) {
  const n = getValorPedido(value)
  if (!n) return 'Combinar'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatData(value) {
  const ms = getMs(value)
  if (!ms) return 'Sem data'
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTempo(value) {
  const ms = getMs(value)
  if (!ms) return 'Agora'
  const diff = Math.max(0, Date.now() - ms)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Agora'
  if (min < 60) return `${min} min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h atrás`
  return `${Math.floor(h / 24)} d atrás`
}

function getMyLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    )
  })
}

function getInitials(name) {
  const parts = String(name || 'Usuário')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CA'
}

function StatusPill({ status, label }) {
  const tone =
    status === ATENDIMENTO_STATUS.ACEITO
      ? 'border-yellow-300/35 bg-yellow-400/10 text-yellow-200'
      : status === ATENDIMENTO_STATUS.EM_ANDAMENTO || status === ATENDIMENTO_STATUS.CHEGOU
        ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-200'
      : status === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO || status === ATENDIMENTO_STATUS.FINALIZADO
        ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-200'
        : status === ATENDIMENTO_STATUS.CANCELADO
          ? 'border-rose-300/35 bg-rose-400/10 text-rose-200'
          : 'border-blue-300/35 bg-blue-500/12 text-blue-100'

  return (
    <span className={`inline-flex items-center justify-center rounded-full border px-2.5 py-1 text-xs font-black md:px-4 md:py-1.5 md:text-sm ${tone}`}>
      {label}
    </span>
  )
}

function IconChevronLeft({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 18 9 12l6-6" />
    </svg>
  )
}

function IconX({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function IconCheck({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function IconBox({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21 8-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  )
}

function IconDollar({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2v20M17 6.5C15.8 5.5 14.1 5 12.3 5 9.6 5 8 6.2 8 8.2c0 4.2 9 2.1 9 7 0 2.2-1.9 3.8-5 3.8-2 0-3.8-.6-5-1.7" />
    </svg>
  )
}

function IconClock({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function IconCalendar({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 2v4M16 2v4M4 9h16" />
      <rect x="4" y="5" width="16" height="17" rx="3" />
    </svg>
  )
}

function IconPin({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C8.13 2 5 5.05 5 8.82c0 5.12 7 13.18 7 13.18s7-8.06 7-13.18C19 5.05 15.87 2 12 2Zm0 9.4a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Z" />
    </svg>
  )
}

function IconShield({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3 5 6v5c0 4.5 2.8 8.7 7 10 4.2-1.3 7-5.5 7-10V6l-7-3Z" />
      <path d="m8.8 12 2.1 2.1 4.4-4.8" />
    </svg>
  )
}

function IconChat({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 11.5a8.4 8.4 0 0 1-8.8 8.3 9.5 9.5 0 0 1-3.8-.8L3 21l1.8-4.7A8.2 8.2 0 0 1 3 11.5 8.4 8.4 0 0 1 11.8 3 8.4 8.4 0 0 1 21 11.5Z" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </svg>
  )
}

function IconPhone({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.9v2.5a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 3.7 2 2 0 0 1 4.1 1.5h2.5a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L7.7 9a16 16 0 0 0 7.3 7.3l1.1-1.1a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z" />
    </svg>
  )
}

function IconRoute({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 6h4.2a3.3 3.3 0 0 1 0 6.6H11a3.3 3.3 0 0 0 0 6.6h4.5" />
    </svg>
  )
}

function IconStar({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    </svg>
  )
}

function IconExternal({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 3h7v7" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  )
}

function MetricCard({ icon, label, value }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[14px] border border-white/10 bg-[#0f1b2d] px-2 py-2 shadow-[0_12px_26px_rgba(0,0,0,0.20)] md:min-h-[92px] md:rounded-[22px] md:px-4 md:py-4">
      <div className="flex min-w-0 items-center gap-1.5 md:gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-600 text-white shadow-[0_10px_20px_rgba(37,99,235,0.22)] md:h-11 md:w-11">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="truncate text-[8px] font-black uppercase tracking-[0.08em] text-slate-400 md:text-xs">{label}</div>
          <div className="mt-0.5 line-clamp-2 text-[12px] font-black leading-tight text-white md:mt-1 md:text-base">{value}</div>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, text }) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-[18px] bg-white/[0.04] p-3 md:items-center md:gap-4 md:bg-transparent md:px-4 md:py-2">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-500/10 text-blue-300 md:h-14 md:w-14">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-black text-white md:text-base">{title}</div>
        <div className="mt-0.5 text-xs font-semibold leading-snug text-slate-400 md:mt-1 md:text-sm">{text}</div>
      </div>
    </div>
  )
}

function MiniMapPreview({ onOpen, disabled }) {
  return (
    <div className="relative min-h-[145px] overflow-hidden rounded-[18px] border border-blue-100 bg-blue-50 shadow-inner md:min-h-[300px] md:rounded-[24px]">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(255,255,255,.22), rgba(239,246,255,.5)), url('/cliente-home-map-bg-v3.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div className="absolute left-[16%] top-[18%] -rotate-[54deg] text-sm font-semibold text-[#07184b] opacity-80">Rua das Flores</div>
      <div className="absolute right-[6%] top-[24%] rotate-[28deg] text-sm font-semibold text-[#07184b] opacity-80">Rua das Palmeiras</div>
      <div className="absolute bottom-[18%] right-[17%] rotate-[26deg] text-sm font-semibold text-[#07184b] opacity-80">Rua das Acácias</div>
      <div className="absolute bottom-[22%] left-[27%] -rotate-[64deg] text-sm font-semibold text-[#07184b] opacity-80">Av. Central</div>
      <div className="absolute left-1/2 top-[35%] -translate-x-1/2 text-blue-600 drop-shadow-[0_18px_26px_rgba(37,99,235,0.35)]">
        <IconPin className="h-12 w-12 md:h-24 md:w-24" />
      </div>
      <span className="absolute left-1/2 top-[59%] h-5 w-5 -translate-x-1/2 rounded-full border-4 border-blue-200 bg-blue-600 shadow-[0_12px_22px_rgba(37,99,235,0.28)] md:h-7 md:w-7 md:border-[5px] md:shadow-[0_16px_28px_rgba(37,99,235,0.32)]" />
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="absolute bottom-2 right-2 inline-flex h-9 items-center gap-1 rounded-[14px] border border-blue-100 bg-white/95 px-2.5 text-xs font-black text-blue-700 shadow-[0_12px_26px_rgba(15,72,150,0.12)] transition active:scale-[0.98] disabled:opacity-55 md:bottom-4 md:right-4 md:h-14 md:gap-2 md:rounded-[20px] md:px-5 md:text-lg md:shadow-[0_16px_34px_rgba(15,72,150,0.14)]"
      >
        Abrir no mapa
        <IconExternal className="h-4 w-4 md:h-5 md:w-5" />
      </button>
    </div>
  )
}

function PedidoDetalhe() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const pedidoId = String(params?.pedidoId || '')
  const voltar = normalizeChatOrigin(searchParams.get('voltar'), 'corre')
  const acceptLockRef = useRef('')
  const navigationLockRef = useRef('')
  const chatPrefetchesRef = useRef(new Set())

  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [creatorProfile, setCreatorProfile] = useState(null)
  const [creatorPresence, setCreatorPresence] = useState(null)
  const [publicPedido, setPublicPedido] = useState(null)
  const [privatePedido, setPrivatePedido] = useState(null)
  const [privateAccessGranted, setPrivateAccessGranted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [aceitando, setAceitando] = useState(false)
  const [erro, setErro] = useState('')
  const [mapOpen, setMapOpen] = useState(false)

  const navigateOnce = useCallback((href, { replace = false } = {}) => {
    if (!href || navigationLockRef.current) return false
    navigationLockRef.current = href
    if (replace) router.replace(href, { scroll: false })
    else router.push(href)
    window.setTimeout(() => {
      if (navigationLockRef.current === href) navigationLockRef.current = ''
    }, 1200)
    return true
  }, [router])

  useEffect(() => {
    acceptLockRef.current = ''
    navigationLockRef.current = ''
    chatPrefetchesRef.current.clear()
  }, [pedidoId, user?.uid])

  useEffect(() => {
    const off = onAuthStateChanged(auth, (authUser) => setUser(authUser || null))
    return () => off()
  }, [])

  useEffect(() => {
    if (!pedidoId) return undefined
    setLoading(true)
    const offPublic = onValue(ref(database, `publicRequests/${pedidoId}`), (snap) => {
      setPublicPedido(snap.exists() ? normalizePublicRequest(pedidoId, snap.val()) : null)
      setLoading(false)
    })
    return () => offPublic()
  }, [pedidoId])

  useEffect(() => {
    setPrivatePedido(null)
    setPrivateAccessGranted(false)
  }, [pedidoId, user?.uid])

  const publicCreatorId = String(publicPedido?.criador?.id || '')
  const publicAcceptedId = String(publicPedido?.aceite?.id || '')
  const canReadPrivatePedido = !!user?.uid && (
    privateAccessGranted ||
    publicCreatorId === String(user.uid) ||
    publicAcceptedId === String(user.uid)
  )

  useEffect(() => {
    if (!pedidoId || !canReadPrivatePedido) return undefined

    const offPrivate = onValue(
      ref(database, `pedidos/${pedidoId}`),
      (snap) => setPrivatePedido(snap.exists() ? { id: pedidoId, ...(snap.val() || {}), _private: true } : null),
      (error) => setErro(error?.message || 'Não foi possível carregar os dados privados deste pedido.'),
    )
    return () => offPrivate()
  }, [canReadPrivatePedido, pedidoId])

  const pedido = privatePedido || publicPedido

  useEffect(() => {
    if (!user?.uid) {
      setProfile(null)
      return undefined
    }
    const off = onValue(ref(database, `users/${user.uid}`), (snap) => {
      setProfile(snap.val() || null)
    })
    return () => off()
  }, [user?.uid])

  useEffect(() => {
    const creatorId = pedido?.criador?.id
    if (!creatorId) {
      setCreatorProfile(null)
      return undefined
    }

    const off = onValue(
      ref(database, `publicProfiles/${creatorId}`),
      (snap) => setCreatorProfile(snap.val() || null),
      () => setCreatorProfile(null),
    )
    return () => off()
  }, [pedido?.criador?.id])

  useEffect(() => {
    const creatorId = pedido?.criador?.id
    if (!creatorId) {
      setCreatorPresence(null)
      return undefined
    }

    const off = onValue(
      ref(database, `publicAvailability/${creatorId}`),
      (snap) => setCreatorPresence(snap.val() || null),
      () => setCreatorPresence(null),
    )
    return () => off()
  }, [pedido?.criador?.id])

  const status = normalizeServiceAttendanceStatus({
    status: pedido?.status,
    kind: 'pedido',
    type: pedido?.tipo,
    record: pedido,
  })
  const souCriador = !!user?.uid && String(pedido?.criador?.id || '') === String(user.uid)
  const souAceitador = !!user?.uid && String(pedido?.aceite?.id || '') === String(user.uid)
  const podeAceitar = !!user?.uid && pedido && status === ATENDIMENTO_STATUS.ABERTO && !pedido?.aceite?.id && !souCriador
  const participanteDoPedido = souCriador || souAceitador
  const podeAbrirChat = participanteDoPedido && [
    ATENDIMENTO_STATUS.ACEITO,
    ATENDIMENTO_STATUS.EM_ANDAMENTO,
    ATENDIMENTO_STATUS.A_CAMINHO,
    ATENDIMENTO_STATUS.CHEGOU,
    ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO,
    ATENDIMENTO_STATUS.FINALIZADO,
    ATENDIMENTO_STATUS.CANCELADO,
  ].includes(status)
  const preloadChat = useCallback(() => {
    if (!podeAbrirChat) return ''
    return prefetchChatRoute(router, chatPrefetchesRef.current, pedidoId, voltar)
  }, [pedidoId, podeAbrirChat, router, voltar])
  const criadoEm = pedido?.criadoEm || pedido?.createdAt || pedido?.atualizadoEm
  const localOk = pedido?.local?.lat != null && pedido?.local?.lng != null

  const categoryMeta = useMemo(
    () => getCategoryById(pedido?.categoriaId || pedido?.categoria || pedido?.category),
    [pedido?.categoriaId, pedido?.categoria, pedido?.category],
  )

  const categoria = pedido?.categoriaNome || pedido?.categoriaLabel || categoryMeta?.label || pedido?.categoriaId || pedido?.categoria || 'Serviços gerais'
  const criadorNome = pedido?.criador?.nome || creatorProfile?.nome || creatorProfile?.displayName || 'Usuário Corre Aqui'
  const criadorFoto = pedido?.criador?.fotoURL || pedido?.criador?.photoURL || creatorProfile?.fotoURL || creatorProfile?.photoURL || creatorPresence?.fotoURL || creatorPresence?.photoURL || ''
  const criadorOnline = isOnlineRecente(creatorPresence)
  const telefoneLink = getAuthorizedPhoneHref({
    publicProfile: creatorProfile,
    pedidoStatus: pedido?.status,
    isParticipant: participanteDoPedido,
  })
  const tituloPedido = pedido?.titulo || pedido?.texto || 'Pedido sem título'
  const descricaoPedido = pedido?.descricao || pedido?.texto || 'Converse no chat para combinar os detalhes desse serviço.'

  const statusLabel = useMemo(() => {
    if (status === ATENDIMENTO_STATUS.ACEITO || status === ATENDIMENTO_STATUS.EM_ANDAMENTO) return 'Combinando'
    if (status === ATENDIMENTO_STATUS.A_CAMINHO) return 'A caminho'
    if (status === ATENDIMENTO_STATUS.CHEGOU) return 'Chegou ao local'
    if (status === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) return 'Confirmação pendente'
    if (status === ATENDIMENTO_STATUS.FINALIZADO) return 'Finalizado'
    if (status === ATENDIMENTO_STATUS.CANCELADO) return 'Cancelado'
    return 'Aberto'
  }, [status])

  const voltarParaLista = () => {
    if (navigationLockRef.current) return
    const fallback = getChatReturnHref(voltar)
    const listMode = voltar === 'cliente' || voltar === 'corre' ? voltar : ''
    const stateKey = listMode ? `${LIST_STATE_PREFIX}:${listMode}` : ''

    try {
      if (stateKey && sessionStorage.getItem(stateKey)) {
        if (process.env.NODE_ENV !== 'production') console.time('back-list')
        sessionStorage.setItem(LIST_RETURN_FLAG, stateKey)
        navigateOnce(fallback, { replace: true })
        return
      }
    } catch {}

    try {
      if (stateKey) sessionStorage.setItem(LIST_RETURN_FLAG, stateKey)
    } catch {}
    navigateOnce(fallback, { replace: true })
  }

  const abrirChat = () => {
    if (!pedidoId || navigationLockRef.current) return
    navigateOnce(createChatHref(pedidoId, voltar), { replace: true })
  }

  const aceitarPedido = async () => {
    const actionKey = String(pedidoId || '')
    if (!podeAceitar || aceitando || acceptLockRef.current || navigationLockRef.current) return
    acceptLockRef.current = actionKey
    let navigatingToChat = false
    setErro('')
    setAceitando(true)

    try {
      const publicSnapshot = await get(ref(database, `publicRequests/${pedidoId}`))
      const publicCurrent = publicSnapshot.exists() ? publicSnapshot.val() : null
      const claimUiCheck = createClaimUiCheck({
        pedidoId,
        cardPresent: !!publicPedido,
        publicExistsNow: publicSnapshot.exists(),
        publicStatus: publicCurrent?.status,
      })
      if (process.env.NODE_ENV !== 'production') {
        console.info('[CLAIM_UI_CHECK]', JSON.stringify(claimUiCheck))
      }
      if (!claimUiCheck.publicExistsNow) {
        setPublicPedido(null)
        setErro('Este pedido não está mais disponível.')
        return
      }

      const agora = Date.now()
      const local = await getMyLocation()
      const nome = profile?.nome || user.displayName || 'Corre'
      const conversaId = pedido.id
      const aceite = {
        id: user.uid,
        nome,
        local: local || null,
        aceitoEm: agora,
      }

      const acceptedPedido = await transitionAtendimento({
        database,
        pedidoId: pedido.id,
        actorUid: user.uid,
        expectedStatus: ATENDIMENTO_STATUS.ABERTO,
        nextStatus: ATENDIMENTO_STATUS.ACEITO,
        atendimentoPatch: {
          aceitoEm: agora,
          aceitoPor: { id: user.uid, nome },
        },
        topLevelPatch: {
          aceite,
          conversaId,
          aceitoEm: agora,
          atualizadoEmServer: serverTimestamp(),
        },
      })
      setPrivateAccessGranted(true)
      setPrivatePedido({ id: pedido.id, ...acceptedPedido, _private: true })

      await update(ref(database, `users/${user.uid}`), {
        statusProfissional: 'em_servico',
        ocupadoAte: agora + 3 * 24 * 60 * 60 * 1000,
        agendaAberta: true,
        atualizadoEm: serverTimestamp(),
      }).catch(() => {})

      // A rota autenticada cria a mensagem e materializa os dois índices canônicos.
      await registrarMensagemSistemaConfiavel({
        pedidoId: pedido.id,
        eventType: 'pedido_aceito',
        contextKind: 'pedido',
      })
      if (pedido?.criador?.id) {
        await notifyPublicRequestAccepted({
          database,
          pedido: { ...pedido, conversaId },
          profissional: { ...profile, uid: user.uid, nome, photoURL: profile?.fotoURL || user.photoURL || '' },
          aceitoEm: agora,
        })
      }
      showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.pedidoAceito, {
        id: CONTEXTUAL_TIP_IDS.pedidoAceito,
        target: 'aceitar-pedido',
      })
      navigatingToChat = navigateOnce(createChatHref(pedido.id, voltar), { replace: true })
    } catch (error) {
      console.error('Erro ao aceitar pedido:', error)
      setErro(error?.message || 'Não foi possível aceitar agora.')
    } finally {
      if (!navigatingToChat) {
        if (acceptLockRef.current === actionKey) acceptLockRef.current = ''
        setAceitando(false)
      }
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#050b14] px-4 text-white">
        <div className="rounded-[24px] border border-white/10 bg-[#0f1b2d] px-6 py-5 text-sm font-black shadow-[0_22px_60px_rgba(0,0,0,0.28)]">
          Carregando pedido...
        </div>
      </main>
    )
  }

  if (!pedido) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#050b14] px-4 text-white">
        <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0f1b2d] p-6 text-center shadow-[0_22px_60px_rgba(0,0,0,0.28)]">
          <div className="text-xl font-black">Pedido não encontrado</div>
          <button type="button" onClick={voltarParaLista} className="mt-5 h-12 rounded-[18px] bg-blue-600 px-6 text-sm font-black text-white shadow-[0_16px_30px_rgba(37,99,235,0.25)]">
            Voltar
          </button>
        </div>
      </main>
    )
  }

  const primaryLabel = podeAceitar
    ? aceitando
      ? 'Aceitando pedido...'
      : 'Aceitar pedido'
    : podeAbrirChat
      ? 'Abrir conversa'
      : 'Voltar para lista'
  const primaryAction = podeAceitar
    ? aceitarPedido
    : podeAbrirChat
      ? abrirChat
      : voltarParaLista

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#050b14] px-1.5 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] pt-1.5 text-white md:px-5 md:py-5">
      <section className="mx-auto w-full max-w-[1540px] overflow-hidden rounded-[18px] border border-white/10 bg-[#07111f] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.28)] md:rounded-[34px] md:p-8">
        <header className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-1.5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-3">
          <button
            type="button"
            onClick={voltarParaLista}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white shadow-[0_12px_28px_rgba(0,0,0,0.24)] transition active:scale-[0.98] md:h-[66px] md:w-[66px]"
            aria-label="Voltar"
          >
            <IconChevronLeft className="h-5 w-5 md:h-8 md:w-8" />
          </button>

          <div className="min-w-0 text-center">
            <h1 className="truncate text-base font-black tracking-tight md:text-[32px]">Detalhes do pedido</h1>
            <div className="mt-1 md:mt-2">
              <StatusPill status={status} label={statusLabel} />
            </div>
          </div>

          <div className="justify-self-end">
            <span className="inline-flex h-10 max-w-[96px] items-center gap-1 rounded-full bg-blue-600 px-2.5 text-xs font-black text-white shadow-[0_12px_26px_rgba(37,99,235,0.20)] md:h-14 md:max-w-none md:gap-2 md:px-6 md:text-lg md:shadow-[0_16px_34px_rgba(37,99,235,0.25)]">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/18 md:h-7 md:w-7">
                <IconDollar className="h-3.5 w-3.5 md:h-4 md:w-4" />
              </span>
              <span className="truncate">{formatMoney(pedido.valor)}</span>
            </span>
          </div>
        </header>

        <div className="mt-2 overflow-hidden rounded-[18px] border border-white/10 bg-[#0b1628] p-2.5 shadow-[0_16px_38px_rgba(0,0,0,0.20)] md:mt-7 md:rounded-[28px] md:p-6">
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_520px] xl:gap-5">
            <div className="min-w-0 xl:border-r xl:border-white/10 xl:pr-5">
              <div className="flex flex-wrap items-center justify-between gap-2 md:gap-3">
                <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-1.5 text-[11px] font-black text-blue-100 md:gap-3 md:px-5 md:py-3 md:text-lg">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-600 text-white md:h-9 md:w-9">
                    <IconBox className="h-4 w-4 md:h-5 md:w-5" />
                  </span>
                  <span className="truncate">{categoria}</span>
                </span>
                <span className="inline-flex max-w-full items-center rounded-full border border-emerald-300/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-black uppercase text-emerald-200 md:px-5 md:py-3 md:text-lg">
                  {statusLabel}
                </span>
              </div>

              <h2 className="mt-3 max-w-full break-words text-[24px] font-black leading-[1.03] tracking-tight text-white min-[390px]:text-[26px] md:mt-6 md:text-[70px] md:leading-[0.96]">
                {tituloPedido}
              </h2>

              <div className="mt-3 md:mt-7">
                <h3 className="text-base font-black text-blue-300 md:text-2xl">Descrição do pedido</h3>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed text-slate-200 md:mt-3 md:text-xl">
                  {descricaoPedido}
                </p>
              </div>

              <div className="mt-3 grid min-w-0 grid-cols-2 gap-1.5 md:mt-8 md:gap-4 2xl:grid-cols-4">
                <MetricCard icon={<IconDollar className="h-5 w-5 md:h-7 md:w-7" />} label="Valor" value={formatMoney(pedido.valor)} />
                <MetricCard icon={<IconClock className="h-5 w-5 md:h-7 md:w-7" />} label="Postado" value={formatTempo(criadoEm)} />
                <MetricCard icon={<IconCalendar className="h-5 w-5 md:h-7 md:w-7" />} label="Data" value={formatData(criadoEm)} />
                <MetricCard icon={<IconPin className="h-5 w-5 md:h-7 md:w-7" />} label="Local" value={localOk ? 'Mapa disponível' : 'A combinar'} />
              </div>

              <div className="mt-3 flex items-center gap-2.5 rounded-[16px] border border-white/10 bg-[#0f1b2d] px-2.5 py-2.5 shadow-[0_12px_26px_rgba(0,0,0,0.18)] md:mt-5 md:gap-4 md:rounded-[22px] md:px-5 md:py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-blue-600 text-white shadow-[0_12px_24px_rgba(37,99,235,0.18)] md:h-16 md:w-16 md:rounded-[20px] md:shadow-[0_14px_30px_rgba(37,99,235,0.22)]">
                  <IconShield className="h-6 w-6 md:h-9 md:w-9" />
                </span>
                <div>
                  <div className="text-sm font-black text-white md:text-xl">Pedido seguro</div>
                  <div className="mt-0.5 text-xs font-semibold leading-snug text-slate-400 md:mt-1 md:text-lg">
                    Depois do aceite, use o chat para combinar todos os detalhes antes do deslocamento.
                  </div>
                </div>
              </div>
            </div>

            <aside className="grid content-start gap-3 md:gap-5">
              <MiniMapPreview onOpen={() => setMapOpen(true)} disabled={!localOk} />

              <div className="rounded-[18px] border border-white/10 bg-[#0f1b2d] p-3 shadow-[0_12px_26px_rgba(0,0,0,0.18)] md:rounded-[24px] md:p-5">
                <div className="text-sm font-black text-white md:text-lg">Enviado por</div>
                <div className="mt-3 flex items-center gap-2.5 md:mt-5 md:gap-4">
                  {criadorFoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={criadorFoto}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-blue-50 md:h-16 md:w-16 md:ring-4"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-500/10 text-sm font-black text-blue-200 ring-2 ring-white/5 md:h-16 md:w-16 md:text-xl md:ring-4">
                      {getInitials(criadorNome)}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-white md:text-xl">{criadorNome}</div>
                    <div className={`mt-0.5 flex items-center gap-1.5 text-xs font-semibold md:mt-1 md:gap-2 md:text-base ${criadorOnline ? 'text-emerald-600' : 'text-slate-500'}`}>
                      <span className={`h-2.5 w-2.5 rounded-full md:h-3 md:w-3 ${criadorOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      {criadorOnline ? 'Online' : 'Offline'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={podeAbrirChat ? abrirChat : () => setErro('Aceite o pedido para abrir o chat.')}
                    onPointerEnter={podeAbrirChat ? preloadChat : undefined}
                    onPointerDown={podeAbrirChat ? preloadChat : undefined}
                    onFocus={podeAbrirChat ? preloadChat : undefined}
                    disabled={!podeAbrirChat}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-white/10 bg-white/[0.06] text-blue-200 shadow-[0_12px_26px_rgba(0,0,0,0.18)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 md:h-16 md:w-16 md:rounded-[20px]"
                    aria-label="Abrir chat"
                  >
                    <IconChat className="h-5 w-5 md:h-8 md:w-8" />
                  </button>

                  {telefoneLink ? (
                    <a
                      href={telefoneLink}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] border border-yellow-300/50 bg-blue-950 text-yellow-300 shadow-[0_12px_26px_rgba(0,0,0,0.18)] transition hover:bg-blue-900 active:scale-[0.98] md:h-16 md:w-16 md:rounded-[20px]"
                      aria-label="Ligar para o cliente"
                    >
                      <IconPhone className="h-5 w-5 md:h-8 md:w-8" />
                    </a>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </div>

        <div className="mt-4 hidden grid-cols-2 gap-2 rounded-[20px] border border-white/10 bg-[#0f1b2d] p-2 shadow-[0_14px_36px_rgba(0,0,0,0.20)] md:mt-5 md:grid md:gap-0 md:rounded-[24px] md:p-4 xl:grid-cols-4 xl:divide-x xl:divide-white/10">
          <FeatureCard icon={<IconShield className="h-8 w-8" />} title="Comunique-se" text="Converse no chat após o aceite" />
          <FeatureCard icon={<IconRoute className="h-8 w-8" />} title="Rota rápida" text="Veja a melhor rota até o local" />
          <FeatureCard icon={<IconDollar className="h-8 w-8" />} title="Pagamento seguro" text="Combine tudo antes de concluir" />
          <FeatureCard icon={<IconStar className="h-8 w-8" />} title="Avaliação" text="Ambos avaliam após concluir o pedido" />
        </div>

        {erro ? (
          <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700">
            {erro}
          </div>
        ) : null}

        <div className="sticky bottom-1.5 z-30 mt-3 grid min-w-0 grid-cols-[0.78fr_1.22fr] gap-1.5 rounded-[18px] border border-white/10 bg-[#07111f]/95 p-1.5 shadow-[0_16px_42px_rgba(0,0,0,0.30)] backdrop-blur lg:static lg:mt-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-4 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-0">
          <button
            type="button"
            onClick={voltarParaLista}
            className="flex min-w-0 min-h-[48px] items-center justify-center gap-1.5 rounded-[15px] border border-red-400/30 bg-red-500/10 px-2 text-xs font-black text-red-200 shadow-[0_12px_26px_rgba(0,0,0,0.18)] transition active:scale-[0.98] md:text-base lg:min-h-[86px] lg:gap-4 lg:rounded-[24px] lg:px-6 lg:text-2xl"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-500/10 text-red-100 lg:h-16 lg:w-16">
              <IconX className="h-4 w-4 lg:h-8 lg:w-8" />
            </span>
            <span className="truncate">{podeAceitar ? 'Cancelar' : 'Voltar'}</span>
          </button>

          <button
            type="button"
            onClick={primaryAction}
            onPointerEnter={podeAbrirChat ? preloadChat : undefined}
            onPointerDown={podeAbrirChat ? preloadChat : undefined}
            onFocus={podeAbrirChat ? preloadChat : undefined}
            disabled={aceitando}
            data-tutorial={podeAceitar ? 'aceitar-pedido' : 'progresso'}
            className={`flex min-w-0 min-h-[48px] flex-row items-center justify-center gap-1.5 rounded-[15px] px-2.5 text-white transition active:scale-[0.99] disabled:opacity-65 lg:min-h-[86px] lg:flex-col lg:gap-0 lg:rounded-[24px] lg:px-6 ${
              podeAbrirChat
                ? 'bg-emerald-500 shadow-[0_14px_34px_rgba(34,197,94,0.28)] lg:shadow-[0_18px_42px_rgba(34,197,94,0.32)]'
                : 'bg-blue-600 shadow-[0_14px_34px_rgba(37,99,235,0.26)] lg:shadow-[0_18px_42px_rgba(37,99,235,0.3)]'
            }`}
          >
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white lg:mb-2 lg:h-11 lg:w-11 ${podeAbrirChat ? 'text-emerald-600' : 'text-blue-600'}`}>
              <IconCheck className="h-4 w-4 lg:h-7 lg:w-7" />
            </span>
            <span className="min-w-0 text-center text-xs font-black leading-tight md:text-base lg:text-3xl lg:leading-none">{primaryLabel}</span>
            <span className="mt-2 hidden text-lg font-semibold text-blue-100 lg:block">
              {podeAceitar
                ? 'Depois você confere os detalhes antes de iniciar'
                : 'Acompanhe e avance as etapas pelo chat'}
            </span>
          </button>
        </div>
      </section>

      {mapOpen ? (
        <MapinhaModal
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          pedidoLocal={pedido?.local || null}
          aceiteLocal={pedido?.aceite?.local || null}
          titulo={pedido?.titulo || 'Corre aqui'}
          infoExtra={{
            status: pedido?.status || 'aberto',
            valor: pedido?.valor || null,
            categoria,
          }}
        />
      ) : null}
    </main>
  )
}

export default function PedidoPage() {
  return (
    <LoginGate>
      <PedidoDetalhe />
    </LoginGate>
  )
}
