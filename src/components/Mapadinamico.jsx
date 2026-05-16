// XP_PATENTE_SYSTEM
// aceitar serviço = +3 XP
// concluir serviço = +10 XP
// avaliação positiva = +5 XP

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'

import { auth, database } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import {
  ref,
  onValue,
  update,
  set,
  serverTimestamp,
  onDisconnect,
  remove,
  query,
  limitToLast,
  runTransaction,
} from 'firebase/database'

import PerfilDrawer from '@/components/PerfilDrawer'
import XpToast from '@/components/XpToast'
import ModalIA from './ModalIA'
import ModalAgenda from './ModalAgenda'
import ChatMensagens from './ChatMensagens'
import ListaConversas from './ListaConversas'
import AvisoCorreAceito from '@/components/AvisoCorreAceito'
import MeusPedidosCliente from '@/components/MeusPedidosCliente'
import AgendaProfissional from '@/components/AgendaProfissional'

// ✅ NOVOS COMPONENTES
import BottomBar from '@/components/BottomBar'
import Patente from '@/components/Patente'

import ClienteHome from '@/components/ClienteHome'
import ListaProfissionais from '@/components/ListaProfissionais'
import PerfilPublico from '@/components/PerfilPublico'

// ✅ CATEGORIAS
import { CATEGORIES } from '@/constants/categories'

const MapinhaModal = dynamic(() => import('./MapinhaModal'), { ssr: false })

/* =======================
   Helpers
======================= */
const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const normalizeLocal = (p) => {
  if (!p || typeof p !== 'object') return p

  let lat =
    p?.local?.lat ??
    p?.localizacao?.lat ??
    p?.latitude ??
    p?.lat ??
    p?.geo?.lat ??
    p?.location?.lat

  let lng =
    p?.local?.lng ??
    p?.localizacao?.lng ??
    p?.longitude ??
    p?.lng ??
    p?.geo?.lng ??
    p?.location?.lng

  lat = toNum(lat)
  lng = toNum(lng)

  const local = lat != null && lng != null ? { lat, lng } : null

  const categoriaId = p?.categoriaId ?? p?.categoria ?? p?.category ?? null
  const modoPedido = p?.modoPedido ?? 'geral' // geral | corre | profissional

  return {
    ...p,
    local,
    categoria: categoriaId,
    categoriaId,
    modoPedido,
    titulo: p.titulo || (p.tipo === 'oferta' ? 'Oferta' : 'Pedido'),
    descricao: p.descricao || p.descricaoPedido || p.texto || '',
    criadoEm: p.criadoEm || p.createdAt || p.criadoEmMs || p.atualizadoEm || 0,
  }
}

async function getMyLocation() {
  return await new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  })
}

/* =======================
   🔥 PATENTE + TAXA + BOOST + MISSÕES
======================= */
const BASE_TAXA_CORRE = 0 // sem taxa do app
const BASE_TAXA_PROF = 0 // sem taxa do app

const TAXA_PROF_POR_PATENTE = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
}

const BOOST_LEVELS = {
  1: { minutos: 30, label: 'Destaque (breve)', emoji: '🚀', preco: 2.99 },
  2: { minutos: 20, label: 'Emergência (breve)', emoji: '🚨', preco: 4.99 },
}

const nowMs = () => Date.now()

const isBoostAtivo = (p) => {
  const until = Number(p?.boost?.until || 0)
  return until > nowMs()
}

// Compatibilidade com trechos antigos do componente.
// Agora "impulsionar" usa a mesma base de destaque/emergência.
const isImpulsionarAtivo = isBoostAtivo

const isPedidoEmergencia = (p) => {
  return !!(p?.emergencia || p?.urgencia === 'emergencia' || p?.boost?.tipo === 'emergencia' || Number(p?.boost?.level || 0) === 2)
}

const isPedidoDestaque = (p) => {
  return !!(p?.destaque || p?.boost?.tipo === 'destaque' || Number(p?.boost?.level || 0) === 1)
}

const prioridadePedido = (p) => {
  if ((p?.status || 'aberto') !== 'aberto') return 0
  if (isPedidoEmergencia(p) && isBoostAtivo(p)) return 300
  if (isPedidoDestaque(p) && isBoostAtivo(p)) return 200
  return 100
}

const boostInfo = (p) => {
  const lvl = Number(p?.boost?.level || 0)
  const cfg = BOOST_LEVELS[lvl]
  const until = Number(p?.boost?.until || 0)
  const ativo = until > nowMs()
  const emergencia = isPedidoEmergencia(p) && ativo
  const destaque = !emergencia && isPedidoDestaque(p) && ativo
  return { lvl, cfg, until, ativo, emergencia, destaque }
}

const calcTaxaServiço = ({ modoPedido, isProfissionalUser, patenteProf }) => {
  const modo = String(modoPedido || 'geral').toLowerCase()
  if (modo === 'profissional' && isProfissionalUser) {
    const lvl = Math.max(1, Math.min(5, Number(patenteProf || 1)))
    return TAXA_PROF_POR_PATENTE[lvl] ?? BASE_TAXA_PROF
  }
  return BASE_TAXA_CORRE
}

const dayKey = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const getMs = (v) => {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const parsed = Date.parse(v)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000
  return 0
}

const formatDataHora = (v) => {
  const ms = getMs(v)
  if (!ms) return 'Sem horário'

  const d = new Date(ms)
  const hoje = new Date()
  const ontem = new Date()
  ontem.setDate(hoje.getDate() - 1)

  const mesmoDia = d.toDateString() === hoje.toDateString()
  const foiOntem = d.toDateString() === ontem.toDateString()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (mesmoDia) return `Hoje às ${hora}`
  if (foiOntem) return `Ontem às ${hora}`

  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }) + ` às ${hora}`
}

const solicitarPermissaoNotificacao = async () => {
  if (typeof window === 'undefined') return false
  if (!('Notification' in window)) return false

  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

const notificarTelefone = async ({ title, body, tag }) => {
  try {
    if (typeof window === 'undefined') return false
    if (!('Notification' in window)) return false

    const ok = await solicitarPermissaoNotificacao()
    if (!ok) return false

    new Notification(title || 'Corre Aqui', {
      body: body || '',
      tag: tag || `corre-aqui-${Date.now()}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    })

    return true
  } catch (e) {
    console.warn('Falha ao notificar no telefone/navegador:', e)
    return false
  }
}


/* =======================
   ✅ Patente por serviços
======================= */
const calcPatente = (serviços = 0) => {
  const n = Number(serviços || 0)
  if (n >= 60) return 5
  if (n >= 30) return 4
  if (n >= 15) return 3
  if (n >= 5) return 2
  return 1
}

async function subirPatentePorServiço({ uid, modoPedido = 'geral' }) {
  if (!uid) return

  const userRef = ref(database, `users/${uid}`)

  await runTransaction(userRef, (current) => {
    const u = current || {}

    const serviçosCorre = Number(u.serviçosCorre || 0) + 1

    const isProf = String(modoPedido || 'geral').toLowerCase() === 'profissional'
    const serviçosProf = isProf ? Number(u.serviçosProf || 0) + 1 : Number(u.serviçosProf || 0)

    const patenteCorre = calcPatente(serviçosCorre)

    const isProfissionalUser = !!u.isProfissional
    const patenteProf = isProfissionalUser ? calcPatente(serviçosProf) : 0

    return {
      ...u,
      serviçosCorre,
      serviçosProf,
      patenteCorre,
      patenteProf,
      patenteAtualizadaEm: Date.now(),
    }
  })
}

/* =======================
   ✅ MISSÕES (XP + moedas)
======================= */
async function missãoIncrementar(uid, tipo) {
  if (!uid) return

  const k = dayKey()
  const mRef = ref(database, `missoes/${uid}/${k}`)

  await runTransaction(mRef, (cur) => {
    const c = cur || { aceitou: 0, entregou: 0, boostou: 0, xp: 0, moedas: 0, updatedAt: 0 }
    const next = { ...c }

    next[tipo] = Number(next[tipo] || 0) + 1

    if (tipo === 'aceitou') {
      next.xp += 3
      next.moedas += 1
    }
    if (tipo === 'entregou') {
      next.xp += 10
      next.moedas += 4
    }
    if (tipo === 'boostou') {
      next.xp += 2
    }

    next.updatedAt = Date.now()
    return next
  })

  const userRef = ref(database, `users/${uid}`)
  await runTransaction(userRef, (cur) => {
    const u = cur || {}

    const addXp = tipo === 'aceitou' ? 3 : tipo === 'entregou' ? 10 : 2
    const addMoedas = tipo === 'aceitou' ? 1 : tipo === 'entregou' ? 4 : 0

    return {
      ...u,
      xp: Number(u.xp || 0) + addXp,
      moedas: Number(u.moedas || 0) + addMoedas,
      missaoAtualizadaEm: Date.now(),
    }
  })
}

async function aplicarImpulsionarNoPedido({ pedido, level, meuId, meuNome }) {
  if (!pedido?.id || !meuId) return

  const lvl = Number(level || 1)
  const cfg = BOOST_LEVELS[lvl]
  if (!cfg) return

  // só criador pode dar boost
  if (pedido?.criador?.id && pedido.criador.id !== meuId) return

  // só boost se estiver ABERTO
  const status = String(pedido?.status || 'aberto').toLowerCase()
  if (status !== 'aberto') return

  const until = Date.now() + cfg.minutos * 60_000

  await update(ref(database, `pedidos/${pedido.id}`), {
    boost: {
      level: lvl,
      label: cfg.label,
      until,
      by: { id: meuId, nome: meuNome || 'Anônimo' },
      createdAt: Date.now(),
    },
    atualizadoEm: serverTimestamp(),
  })

  await missãoIncrementar(meuId, 'boostou')
}

/** =======================
 * Toast simples (dark)
======================= */
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => onClose?.(), toast.ms ?? 2800)
    return () => clearTimeout(t)
  }, [toast, onClose])

  if (!toast) return null

  const type = toast.type || 'info'

  const base =
    'fixed top-4 left-1/2 -translate-x-1/2 z-[99999] px-4 py-3 rounded-2xl shadow-xl border text-sm max-w-[92vw] w-[420px] '

  const styles =
    type === 'success'
      ? 'bg-emerald-500/15 border-emerald-400/20 text-emerald-100'
      : type === 'error'
      ? 'bg-red-500/15 border-red-400/20 text-red-100'
      : 'bg-white/10 border-white/10 text-slate-950'

  return (
    <div className={`${base} ${styles}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {toast.title && <div className="font-semibold">{toast.title}</div>}
          <div className="mt-0.5 text-gray-200">{toast.message}</div>
        </div>
        <button
          onClick={onClose}
          className="text-[11px] md:text-xs px-2 py-0.5 md:py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
          type="button"
        >
          fechar
        </button>
      </div>
    </div>
  )
}

/* =======================
   Badge modo
======================= */
function BadgeModo({ modo }) {
  const m = String(modo || 'geral').toLowerCase()

  if (m === 'corre') {
    return (
      <span className="text-[11px] md:text-xs px-2 py-0.5 md:py-1 rounded-full bg-yellow-300/20 border border-yellow-300/30 text-yellow-200 font-semibold">
        ⚡ Corre
      </span>
    )
  }

  if (m === 'profissional') {
    return (
      <span className="text-[11px] md:text-xs px-2 py-0.5 md:py-1 rounded-full bg-sky-500/15 border border-sky-400/20 text-sky-200 font-semibold">
        🧑‍🔧 Profissional
      </span>
    )
  }

  return (
    <span className="text-[11px] md:text-xs px-2 py-0.5 md:py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
      ⚪ Geral
    </span>
  )
}

export default function Mapadinamico({ initialMode = 'corre', onBackToMode } = {}) {
  const [tab, setTab] = useState('corre') // corre | inbox | agenda
  const [clientePainelBaixo, setClientePainelBaixo] = useState('') // '' | meusPedidos | conversas | chat

  const [modoApp, setModoApp] = useState(initialMode === 'cliente' || initialMode === 'corre' ? initialMode : 'corre') // cliente | corre
  const [openPerfil, setOpenPerfil] = useState(false)
const [showXpToast, setShowXpToast] = useState(false)

  const [meuNome, setMeuNome] = useState('')
  const [meuId, setMeuId] = useState('')

  const [fotoURL, setFotoURL] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('')

  const [corres, setCorres] = useState([])
  const [cardAbertoId, setCardAbertoId] = useState(null)

  const [filtro, setFiltro] = useState('abertos')
  const [busca, setBusca] = useState('')
  const [clienteProfBusca, setClienteProfBusca] = useState('')
  const [clienteProfCategoria, setClienteProfCategoria] = useState('')
  const [openProfissionaisLateral, setOpenProfissionaisLateral] = useState(false)

  // ✅ lateral esquerda: lista dos Corres / bicos
  const [clienteCorreBusca, setClienteCorreBusca] = useState('')
  const [clienteCorreCategoria, setClienteCorreCategoria] = useState('')
  const [openCorresLateral, setOpenCorresLateral] = useState(false)
  const [buscaUsuarioMapa, setBuscaUsuarioMapa] = useState('')
  const [mapItem, setMapItem] = useState(null)

  // ✅ menu some quando mapa abre (MapinhaModal ou Ao Vivo)
  const [openMapaAoVivo, setOpenMapaAoVivo] = useState(false)
  const isMapOpen = !!openMapaAoVivo || !!mapItem

  const [openIA, setOpenIA] = useState(false)

  const [categoriaFiltro, setCategoriaFiltro] = useState('todas')
  const [chatPedido, setChatPedido] = useState(null)
  const [ultimoAceiteNotificado, setUltimoAceiteNotificado] = useState('')

  const [editItem, setEditItem] = useState(null)
  const [editTitulo, setEditTitulo] = useState('')
  const [editDescricao, setEditDescricao] = useState('')
  const [editValor, setEditValor] = useState('')

  const [usersObj, setUsersObj] = useState({})
  const ONLINE_TTL_MS = 45_000

  const [toast, setToast] = useState(null)
  const [usuarioSelecionado, setUsuarioSelecionado] = useState(null)
  const [agendaClienteUser, setAgendaClienteUser] = useState(null)
  const [notifPermission, setNotifPermission] = useState('default')
  const showToast = useCallback((t) => setToast({ ms: 2800, ...t }), [])

  const [loadingPedidos, setLoadingPedidos] = useState(true)
  const [erroPedidos, setErroPedidos] = useState(null)

  const [aceitandoId, setAceitandoId] = useState(null)
  const [cancelandoId, setCancelandoId] = useState(null)
  const [serviçondoId, setServiçondoId] = useState(null)
  const [excluindoId, setExcluindoId] = useState(null)
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)

  const [unreadInbox, setUnreadInbox] = useState(0)
  const [agendaPendentes, setAgendaPendentes] = useState(0)
  const [agendaConfirmados, setAgendaConfirmados] = useState(0)
  const [agendaRecusados, setAgendaRecusados] = useState(0)
  const [correDisponivel, setCorreDisponivel] = useState(true)

  /* =======================
     ✅ VOLTAR LIMPO PRA TELA DAS ABAS
  ======================= */
  const voltarModoLimpo = () => {
    setOpenPerfil(false)
    setOpenIA(false)
    setChatPedido(null)
    setMapItem(null)
    setOpenMapaAoVivo(false)
    setBuscaUsuarioMapa('')

    if (typeof onBackToMode === 'function') {
      onBackToMode()
    }
  }

  /* =======================
     0) Avatar do LocalStorage
  ======================= */
  useEffect(() => {
    try {
      const f =
        localStorage.getItem('fotoURL') ||
        localStorage.getItem('fotoUrl') ||
        localStorage.getItem('avatarURL') ||
        ''
      const e = localStorage.getItem('avatarEmoji') || localStorage.getItem('emoji') || ''
      setFotoURL(f || '')
      setAvatarEmoji(e || '')
    } catch {}
  }, [openPerfil])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) {
      setNotifPermission('unsupported')
      return
    }
    setNotifPermission(Notification.permission || 'default')
  }, [])

  /* =======================
     modoApp (prioriza initialMode)
  ======================= */
  useEffect(() => {
    if (initialMode === 'cliente' || initialMode === 'corre') {
      setModoApp(initialMode)
      return
    }

    try {
      const saved = localStorage.getItem('modoApp')
      if (saved === 'cliente' || saved === 'corre') setModoApp(saved)
    } catch {}
  }, [initialMode])

  useEffect(() => {
    try {
      localStorage.setItem('modoApp', modoApp)
    } catch {}
  }, [modoApp])

  // ✅ Cliente não usa BottomBar; profissionais abrem em aba lateral direita
  useEffect(() => {
    if (modoApp === 'cliente' && tab !== 'corre') setTab('corre')
  }, [modoApp, tab])

  /* =======================
     1) Identidade (Auth + LocalStorage)
  ======================= */
  useEffect(() => {
    let off = () => {}
    try {
      const nomeLS = localStorage.getItem('meuNome') || 'Anônimo'
      setMeuNome(nomeLS)

      off = onAuthStateChanged(auth, (u) => {
        if (!u?.uid) {
          setMeuId('')
          return
        }
        const uid = u.uid
        setMeuId(uid)

        const lsId = localStorage.getItem('meuId')
        if (lsId !== uid) localStorage.setItem('meuId', uid)

        const lsNome = localStorage.getItem('meuNome') || 'Anônimo'
        setMeuNome(lsNome)
      })
    } catch {
      setMeuNome('Anônimo')
      setMeuId('')
    }
    return () => off()
  }, [])

  /* =======================
     ✅ Inbox unread count (leve)
  ======================= */
  useEffect(() => {
    if (!meuId) {
      setUnreadInbox(0)
      return
    }

    const cRef = query(ref(database, `conversas/${meuId}`), limitToLast(80))
    const off = onValue(cRef, (snap) => {
      const raw = snap.val() || {}
      const list = Object.values(raw)
      const total = list.reduce((acc, c) => acc + (c?.unread === true ? 1 : 0), 0)
      setUnreadInbox(total)
    })

    return () => off()
  }, [meuId])


  /* =======================
     ✅ Agenda pending count
  ======================= */
  useEffect(() => {
    if (!meuId) {
      setAgendaPendentes(0)
      return
    }

    const off = onValue(ref(database, 'agendamentos'), (snap) => {
      const raw = snap.val() || {}
      const total = Object.values(raw).filter((a) => {
        return a?.profissionalId === meuId && String(a?.status || 'pendente') === 'pendente'
      }).length
      setAgendaPendentes(total)
    })

    return () => off()
  }, [meuId])

  /* =======================
     2) /users/{meuId} ONLINE REAL (+ avatar)
  ======================= */
  useEffect(() => {
    if (!meuId) return
    let cancelled = false

    const userRef = ref(database, `users/${meuId}`)
    const connectedRef = ref(database, '.info/connected')

    const getAvatarPatch = () => ({
      fotoURL: fotoURL || null,
      avatarEmoji: avatarEmoji || null,
    })

    const writeOnline = async () => {
      const local = await getMyLocation()
      if (cancelled) return

      await update(userRef, {
        id: meuId,
        nome: meuNome || 'Anônimo',
        online: correDisponivel,
        disponivel: correDisponivel,
        local: correDisponivel ? (local || null) : null,
        latitude: correDisponivel ? (local?.lat ?? null) : null,
        longitude: correDisponivel ? (local?.lng ?? null) : null,
        lastSeen: Date.now(),
        updatedAt: serverTimestamp(),
        ...getAvatarPatch(),
      })
    }

    const writeOffline = async () => {
      if (cancelled) return
      await update(userRef, {
        online: false,
        lastSeen: Date.now(),
        updatedAt: serverTimestamp(),
        ...getAvatarPatch(),
      }).catch(() => {})
    }

    const offConnected = onValue(connectedRef, async (snap) => {
      const connected = !!snap.val()
      if (!connected || cancelled) return

      try {
        await onDisconnect(userRef).update({
          online: false,
          lastSeen: Date.now(),
          updatedAt: Date.now(),
          ...getAvatarPatch(),
        })
      } catch {}

      try {
        await writeOnline()
      } catch {}
    })

    const heartbeat = setInterval(async () => {
      const local = await getMyLocation()
      update(userRef, {
        online: correDisponivel,
        disponivel: correDisponivel,
        local: correDisponivel ? (local || null) : null,
        latitude: correDisponivel ? (local?.lat ?? null) : null,
        longitude: correDisponivel ? (local?.lng ?? null) : null,
        lastSeen: Date.now(),
        updatedAt: serverTimestamp(),
        ...getAvatarPatch(),
      }).catch(() => {})
    }, 15000)

    const onExit = () => writeOffline()
    window.addEventListener('beforeunload', onExit)
    window.addEventListener('pagehide', onExit)

    return () => {
      cancelled = true
      clearInterval(heartbeat)
      offConnected()
      window.removeEventListener('beforeunload', onExit)
      window.removeEventListener('pagehide', onExit)
      onExit()
    }
  }, [meuId, meuNome, fotoURL, avatarEmoji, correDisponivel])

  /* =======================
     3) Ler pedidos
  ======================= */
  useEffect(() => {
    setLoadingPedidos(true)
    setErroPedidos(null)

    const pedidosRef = ref(database, 'pedidos')

    const off = onValue(
      pedidosRef,
      (snap) => {
        const raw = snap.val() || {}
        const lista = Object.entries(raw).map(([id, item]) => normalizeLocal({ id, ...item }))

        // ✅ BOOST primeiro
        lista.sort((a, b) => {
          const ba = isImpulsionarAtivo(a) ? 1 : 0
          const bb = isImpulsionarAtivo(b) ? 1 : 0
          if (bb !== ba) return bb - ba

          const la = Number(a?.boost?.level || 0)
          const lb = Number(b?.boost?.level || 0)
          if (lb !== la) return lb - la

          const ta = typeof a.criadoEm === 'string' ? Date.parse(a.criadoEm) : Number(a.criadoEm || 0)
          const tb = typeof b.criadoEm === 'string' ? Date.parse(b.criadoEm) : Number(b.criadoEm || 0)
          return (tb || 0) - (ta || 0)
        })

        setCorres(lista)
        setLoadingPedidos(false)
        setErroPedidos(null)
      },
      (err) => {
        console.error('❌ erro ao ler pedidos:', err)
        setLoadingPedidos(false)

        const code = err?.code || ''
        if (String(code).includes('PERMISSION_DENIED')) {
          setErroPedidos('Sem permissão para ler pedidos (Rules do RTDB).')
          showToast({
            type: 'error',
            title: 'Sem permissão',
            message: 'Confira as Rules do Realtime Database (read).',
          })
        } else {
          setErroPedidos(err?.message || 'Erro ao ler pedidos.')
          showToast({
            type: 'error',
            title: 'Erro ao ler pedidos',
            message: err?.message || 'Erro desconhecido.',
          })
        }
      }
    )

    return () => off()
  }, [showToast])

  /* =======================
     4) Ler /users (online)
  ======================= */
  useEffect(() => {
    const off = onValue(ref(database, 'users'), (snap) => {
      setUsersObj(snap.val() || {})
    })
    return () => off()
  }, [])

  /* =======================
     Toast quando pedido do cliente for aceito
  ======================= */
  useEffect(() => {
    if (!meuId) return

    const pedidoAceito = (corres || []).find((p) => {
      const marker = `${p.id}:${p?.aceite?.id || ''}`

      return (
        p?.criador?.id === meuId &&
        String(p?.status || '').toLowerCase() === 'aceito' &&
        !!p?.aceite?.id &&
        ultimoAceiteNotificado !== marker
      )
    })

    if (!pedidoAceito) return

    const marker = `${pedidoAceito.id}:${pedidoAceito?.aceite?.id || ''}`
    setUltimoAceiteNotificado(marker)

    showToast({
      type: 'success',
      title: 'Seu corre foi aceito! 🚀',
      message: `${pedidoAceito?.aceite?.nome || 'Alguém'} aceitou "${pedidoAceito?.titulo || 'seu pedido'}" às ${formatDataHora(pedidoAceito?.aceite?.aceitoEm || pedidoAceito?.aceitoEm || pedidoAceito?.atualizadoEm)}.`,
    })

    notificarTelefone({
      title: 'Seu corre foi aceito! 🚀',
      body: `${pedidoAceito?.aceite?.nome || 'Alguém'} aceitou: ${pedidoAceito?.titulo || 'Corre aqui'}`,
      tag: `corre-aceito-${pedidoAceito?.id || marker}`,
    })
  }, [corres, meuId, ultimoAceiteNotificado, showToast])

  const onlineUsers = useMemo(() => {
    const now = Date.now()
    return Object.entries(usersObj || {})
      .map(([id, u]) => ({ id, ...u }))
      .filter((u) => u?.online === true && now - Number(u?.lastSeen || 0) <= ONLINE_TTL_MS)
      .sort((a, b) => Number(b?.lastSeen || 0) - Number(a?.lastSeen || 0))
  }, [usersObj])

  const onlineUsersFiltrados = useMemo(() => {
    const t = buscaUsuarioMapa.trim().toLowerCase()
    if (!t) return onlineUsers
    return onlineUsers.filter((u) => {
      const nome = String(u?.nome || '').toLowerCase()
      const cidade = String(u?.cidade || '').toLowerCase()
      return nome.includes(t) || cidade.includes(t)
    })
  }, [onlineUsers, buscaUsuarioMapa])


  const onlineUsersParaPerfil = useMemo(() => {
    return (onlineUsers || []).filter((u) => {
      if (!u) return false
      const prof = u?.profissional || null
      return !!(u?.nome || prof?.titulo || prof?.descricao)
    })
  }, [onlineUsers])

  const meuUserNode = useMemo(() => {
    if (!meuId) return null
    return usersObj?.[meuId] || null
  }, [usersObj, meuId])

  const isProfissional = useMemo(() => !!meuUserNode?.isProfissional, [meuUserNode])

  const minhasCategoriasProf = useMemo(() => {
    const arr = meuUserNode?.profCategorias
    return Array.isArray(arr) ? arr : []
  }, [meuUserNode])

  const minhaPatenteCorre = useMemo(() => Number(meuUserNode?.patenteCorre || 1), [meuUserNode])
  const minhaPatenteProf = useMemo(
    () => Number(meuUserNode?.patenteProf || (isProfissional ? 1 : 0)),
    [meuUserNode, isProfissional]
  )

  const getCatObj = (id) => {
    if (!id) return null
    const found = (CATEGORIES || []).find((c) => String(c.id) === String(id))
    return found || null
  }

  const corresFiltrados = useMemo(() => {
    return (corres || [])
      .filter((p) => {
        const modo = String(p?.modoPedido || 'geral').toLowerCase()

        if (modo === 'profissional' && !isProfissional) return false

        if (filtro === 'abertos' && (p.status || 'aberto') !== 'aberto') return false
        if (filtro === 'meus' && p?.aceite?.id !== meuId) return false

        const cat = p?.categoriaId ?? p?.categoria ?? null
        if (categoriaFiltro === 'sem') {
          if (cat) return false
        } else if (categoriaFiltro !== 'todas') {
          if (String(cat || '') !== String(categoriaFiltro)) return false
        }

        if (busca.trim()) {
          const t = busca.trim().toLowerCase()
          const hay =
            (p.titulo || '').toLowerCase().includes(t) ||
            (p.descricao || '').toLowerCase().includes(t) ||
            (p.criador?.nome || '').toLowerCase().includes(t)
          if (!hay) return false
        }
        return true
      })
      .sort((a, b) => {
        const pa = prioridadePedido(a)
        const pb = prioridadePedido(b)
        if (pb !== pa) return pb - pa

        const ta = getMs(a?.criadoEm || a?.createdAt || a?.atualizadoEm || 0)
        const tb = getMs(b?.criadoEm || b?.createdAt || b?.atualizadoEm || 0)
        return tb - ta
      })
  }, [corres, filtro, busca, meuId, categoriaFiltro, isProfissional])

  async function aceitarCorre(p) {
    if (!meuId) {
      showToast({ type: 'error', title: 'Sem login', message: 'Entre para aceitar.' })
      return
    }
    if (aceitandoId) return
    setAceitandoId(p.id)

    try {
      const agora = Date.now()
      const local = await getMyLocation()
      const aceite = {
        id: meuId,
        nome: meuNome,
        local: local || null,
        aceitoEm: agora,
      }

      // ✅ usa o próprio ID do pedido como conversaId
      const conversaId = p.id

      // marcar pedido como aceito
      await update(ref(database, `pedidos/${p.id}`), {
        status: 'aceito',
        aceite,
        conversaId,
        aceitoEm: agora,
        atualizadoEm: agora,
        atualizadoEmServer: serverTimestamp(),
      })

      // 📅 Agenda inteligente: ao aceitar um serviço, o profissional fica "em serviço"
      // e continua disponível para receber agendamentos futuros.
      await update(ref(database, `users/${meuId}`), {
        statusProfissional: "em_servico",
        ocupadoAte: agora + 3 * 24 * 60 * 60 * 1000,
        agendaAberta: true,
        atualizadoEm: serverTimestamp(),
      }).catch(() => {})

      await update(ref(database, `users/${meuId}/profile`), {
        statusProfissional: "em_servico",
        ocupadoAte: agora + 3 * 24 * 60 * 60 * 1000,
        agendaAberta: true,
        atualizadoEm: serverTimestamp(),
      }).catch(() => {})

      // ✅ conversa do cliente
      if (p?.criador?.id) {
        await update(ref(database, `conversas/${p.criador.id}/${conversaId}`), {
          pedidoId: p.id,
          titulo: p.titulo || 'Corre aqui',
          outroId: meuId,
          outroNome: meuNome || 'Anônimo',
          unread: true,
          status: 'ativa',
          tipoNotificacao: 'corre_aceito',
          mensagemPreview: `${meuNome || 'Alguém'} aceitou seu corre.`,
          updatedAt: agora,
        })

        await update(ref(database, `notificacoes/${p.criador.id}/notif_${agora}`), {
          tipo: 'corre_aceito',
          pedidoId: p.id,
          conversaId,
          titulo: 'Seu corre foi aceito! 🚀',
          mensagem: `${meuNome || 'Alguém'} aceitou: ${p.titulo || 'Corre aqui'}`,
          lida: false,
          criadoEm: agora,
          autor: { id: meuId, nome: meuNome || 'Anônimo' },
        })
      }

      // ✅ conversa de quem aceitou
      await update(ref(database, `conversas/${meuId}/${conversaId}`), {
        pedidoId: p.id,
        titulo: p.titulo || 'Corre aqui',
        outroId: p?.criador?.id || null,
        outroNome: p?.criador?.nome || 'Cliente',
        unread: false,
        status: 'ativa',
        mensagemPreview: 'Você aceitou esse corre.',
        updatedAt: agora,
      })

      // ✅ mensagem automática
      await update(ref(database, `mensagens/${conversaId}/msg_${agora}`), {
        texto: `${meuNome} aceitou seu corre.`,
        sistema: true,
        criadoEm: agora,
        hora: agora,
        autorId: 'sistema',
        autorNome: 'Sistema',
      })

      // ✅ atalhos de conversa
      if (p?.criador?.id) {
        await set(ref(database, `usersChats/${p.criador.id}/${conversaId}`), true)
      }

      await set(ref(database, `usersChats/${meuId}/${conversaId}`), true)

      await missãoIncrementar(meuId, 'aceitou')

      setMapItem({ ...p, aceite, status: 'aceito', aceitoEm: agora, atualizadoEm: agora })
      showToast({
        type: 'success',
        title: 'Corre aceito! ✅',
        message: `Você aceitou "${p.titulo || 'Corre aqui'}" às ${formatDataHora(agora)}. +XP`,
      })
    } catch (e) {
      console.error('Erro ao aceitar:', e)
      showToast({ type: 'error', title: 'Falha ao aceitar', message: e?.message || 'Veja o console.' })
    } finally {
      setAceitandoId(null)
    }
  }

  async function cancelarAceite(p) {
    if (cancelandoId) return
    setCancelandoId(p.id)

    try {
      if (p?.aceite?.id && p.aceite.id !== meuId) {
        showToast({ type: 'error', title: 'Ops', message: 'Esse corre foi aceito por outra pessoa.' })
        return
      }

      await update(ref(database, `pedidos/${p.id}`), {
        status: 'aberto',
        aceite: null,
        atualizadoEm: serverTimestamp(),
      })

      if (mapItem?.id === p.id) setMapItem(null)
      if (chatPedido?.id === p.id) setChatPedido(null)

      showToast({ type: 'success', title: 'Cancelado', message: 'Voltou para ABERTO.' })
    } catch (e) {
      console.error('Erro ao cancelar aceite:', e)
      showToast({ type: 'error', title: 'Falha ao cancelar', message: e?.message || 'Veja o console.' })
    } finally {
      setCancelandoId(null)
    }
  }

  async function marcarConcluído(p) {
    if (serviçondoId) return
    setServiçondoId(p.id)

    try {
      const criadorId = p?.criador?.id
      const aceitadorId = p?.aceite?.id
      // ✅ Regra correta: somente o CLIENTE/CRIADOR confirma que o serviço foi feito.
      // Corre/profissional não pode marcar concluido sozinho.
      const pode = meuId && meuId === criadorId

      if (!pode) {
        showToast({
          type: 'error',
          title: 'Sem permissão',
          message: 'Somente o cliente que criou o pedido pode confirmar que o serviço foi feito.',
        })
        return
      }

      if ((p.status || '').toLowerCase() !== 'aceito') {
        showToast({
          type: 'info',
          title: 'Ainda não',
          message: 'Só marca ENTREGUE quando estiver ACEITO.',
        })
        return
      }

      const concluidoAgora = Date.now()

      await update(ref(database, `pedidos/${p.id}`), {
        status: 'concluido',
        concluidoEm: concluidoAgora,
        concluidoPor: { id: meuId, nome: meuNome || 'Anônimo' },
        atualizadoEm: concluidoAgora,
        atualizadoEmServer: serverTimestamp(),
      })

      // ✅ QUEM GANHA A ENTREGA?
      const creditUid = aceitadorId || meuId

      await subirPatentePorServiço({
        uid: creditUid,
        modoPedido: p?.modoPedido || 'geral',
      })

      await missãoIncrementar(creditUid, 'entregou')

      showToast({
        type: 'success',
        title: 'Fechado!',
        message: 'ENTREGUE ✅ Patente atualizada + Missão +XP + moedas 💰',
      })
    } catch (e) {
      console.error('Erro ao marcar concluido:', e)
      showToast({ type: 'error', title: 'Falha', message: e?.message || 'Veja o console.' })
    } finally {
      setServiçondoId(null)
    }
  }

  function abrirEditar(p) {
    const criadorId = p?.criador?.id
    if (!meuId || criadorId !== meuId) {
      showToast({ type: 'error', title: 'Sem permissão', message: 'Só o criador pode editar.' })
      return
    }
    setEditItem(p)
    setEditTitulo(p.titulo || '')
    setEditDescricao(p.descricao || '')
    setEditValor(
      p.valor != null && Number.isFinite(Number(p.valor)) ? String(Number(p.valor).toFixed(2)).replace('.', ',') : ''
    )
  }

  async function salvarEdicao() {
    if (salvandoEdicao) return
    setSalvandoEdicao(true)

    try {
      if (!editItem?.id) return

      const criadorId = editItem?.criador?.id
      if (!meuId || criadorId !== meuId) {
        showToast({ type: 'error', title: 'Sem permissão', message: 'Só o criador pode editar.' })
        return
      }

      const v = editValor.trim()
      const valorNum = v ? Number(v.replace(',', '.')) : null

      const patch = {
        titulo: editTitulo.trim(),
        descricao: editDescricao.trim(),
        atualizadoEm: serverTimestamp(),
      }

      if (v === '') patch.valor = null
      else if (Number.isFinite(valorNum)) patch.valor = valorNum

      await update(ref(database, `pedidos/${editItem.id}`), patch)
      setEditItem(null)

      showToast({ type: 'success', title: 'Salvo!', message: 'Pedido atualizado.' })
    } catch (e) {
      console.error('Erro ao salvar edição:', e)
      showToast({ type: 'error', title: 'Falha ao salvar', message: e?.message || 'Veja o console.' })
    } finally {
      setSalvandoEdicao(false)
    }
  }

  async function excluirPedido(p) {
    if (excluindoId) return
    setExcluindoId(p.id)

    try {
      const criadorId = p?.criador?.id
      if (!meuId || criadorId !== meuId) {
        showToast({ type: 'error', title: 'Sem permissão', message: 'Só o criador pode excluir.' })
        return
      }

      const ok = confirm('Tem certeza que deseja EXCLUIR este pedido? Essa ação não tem volta.')
      if (!ok) return

      await remove(ref(database, `pedidos/${p.id}`))

      if (mapItem?.id === p.id) setMapItem(null)
      if (chatPedido?.id === p.id) setChatPedido(null)

      showToast({ type: 'success', title: 'Excluído', message: 'Pedido removido.' })
    } catch (e) {
      console.error('Erro ao excluir:', e)
      showToast({ type: 'error', title: 'Falha ao excluir', message: e?.message || 'Veja o console.' })
    } finally {
      setExcluindoId(null)
    }
  }

  const BadgeStatus = ({ status }) => {
    const s = (status || 'aberto').toLowerCase()
    if (s === 'aberto')
      return (
        <span className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-400/20 border border-emerald-300/60 text-emerald-900 text-xs font-black uppercase tracking-[0.12em] shadow-[0_0_22px_rgba(16,185,129,0.55)] animate-pulse overflow-hidden">
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-70" />
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.95)]" />
          </span>
          <span className="relative drop-shadow-[0_0_7px_rgba(16,185,129,0.85)]">ABERTO</span>
        </span>
      )
    if (s === 'aceito')
      return (
        <span className="text-[11px] md:text-xs px-2 py-0.5 md:py-1 rounded-full bg-amber-400/15 border border-amber-400/20 text-amber-200 font-semibold">
          ACEITO
        </span>
      )
    if (s === 'concluido')
      return (
        <span className="text-[11px] md:text-xs px-2 py-0.5 md:py-1 rounded-full bg-sky-400/15 border border-sky-400/20 text-sky-200 font-semibold">
          ENTREGUE
        </span>
      )
    return (
      <span className="text-[11px] md:text-xs px-2 py-0.5 md:py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
        {s.toUpperCase()}
      </span>
    )
  }

  const getOutroUser = (p) => {
    if (p?.aceite?.id && p.aceite.id !== meuId) return { id: p.aceite.id, nome: p.aceite.nome || 'Alguém' }
    if (p?.criador?.id && p.criador.id !== meuId) return { id: p.criador.id, nome: p.criador.nome || 'Alguém' }
    if (p?.aceite?.nome && p.aceite.id !== meuId) return { id: null, nome: p.aceite.nome }
    if (p?.criador?.nome) return { id: null, nome: p.criador.nome }
    return { id: null, nome: 'Alguém' }
  }

  const souCriador = (p) => !!meuId && p?.criador?.id === meuId
  const souAceitador = (p) => !!meuId && p?.aceite?.id === meuId

  const glassCard = 'bg-white/10  border border-white/10 shadow-xl shadow-black/30'

  const btnGhost =
    'px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white transition'

  const btnPrimary =
    'px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition'

  const btnDanger =
    'px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/20 transition'

  const btnDark =
    'px-2.5 py-1.5 rounded-xl bg-gray-900 text-white hover:bg-black border border-white/5 transition'

  const btnMapBase = 'px-2.5 py-1.5 rounded-xl text-sm font-semibold border transition'
  const btnMapEnabled = 'bg-slate-900 text-white border-slate-700 hover:bg-slate-800'
  const btnMapDisabled = 'bg-white/5 text-white/70 border-white/10 opacity-70 cursor-not-allowed'

  const onBottomTab = (id) => {
    if (id === 'modo') {
      setModoApp((prev) => {
        const next = prev === 'cliente' ? 'corre' : 'cliente'
        showToast({
          type: 'info',
          title: 'Modo alterado',
          message: next === 'cliente' ? 'Modo Cliente ativado 🚕' : 'Modo Corre ativado ⚡',
        })
        return next
      })
      return
    }
    if (id === 'disponivel') {
      setCorreDisponivel((prev) => {
        const next = !prev

        if (meuId) {
          update(ref(database, `users/${meuId}`), {
            online: next,
            disponivel: next,
            lastSeen: Date.now(),
            updatedAt: serverTimestamp(),
          }).catch(() => {})
        }

        showToast({
          type: next ? 'success' : 'info',
          title: next ? 'Disponível' : 'Indisponível',
          message: next
            ? 'Você está aparecendo para clientes e pedidos.'
            : 'Você não aparece como disponível agora.',
        })

        return next
      })
      return
    }

    if (id === 'criar') {
      setOpenIA(true)
      return
    }
    if (id === 'perfil') {
      setOpenPerfil(true)
      return
    }
    if (id === 'aovivo') {
      setOpenMapaAoVivo(true)
      showToast({
        type: 'info',
        title: 'Mapa ao vivo',
        message: 'Mostrando pessoas online em tempo real.',
      })
      return
    }
    setTab(id)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020617] text-slate-900 corre-aqui-no-select">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.20),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_32%),linear-gradient(180deg,#071120_0%,#020617_55%,#020617_100%)]" />
      <style>{`
        .corre-aqui-no-select,
        .corre-aqui-no-select * {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .corre-aqui-no-select ::selection {
          background: transparent;
          color: inherit;
        }
        .corre-card-clean {
          background-color: rgba(255,255,255,0.97);
        }
        .corre-card-clean:active,
        .corre-card-clean:focus,
        .corre-card-clean:focus-within {
          background-color: rgba(255,255,255,0.97);
          filter: none;
          transform: none;
        }
      `}</style>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="relative z-10 w-full max-w-[1320px] mx-auto px-4 sm:px-5 lg:px-6 py-4 pb-[220px]">
        {/* ✅ TROCAR MODO DENTRO DO LAYOUT (não cobre mais os cards) */}
        {typeof onBackToMode === 'function' && (
          <div className="mb-4 flex justify-start">
            <button
              onClick={voltarModoLimpo}
              className="
                inline-flex items-center gap-2
                rounded-3xl px-4 py-2.5
                bg-white hover:bg-slate-50
                border border-slate-200
                text-slate-900 text-sm font-extrabold
                shadow-[0_10px_30px_rgba(15,23,42,0.16)]
                transition
              "
              type="button"
              title="Voltar para escolher Cliente ou Corre"
            >
              <span className="text-base">↩</span>
              <span>Trocar modo</span>
            </button>
          </div>
        )}

        {/* CORRE: Header + Inbox */}
        {modoApp === 'corre' && (
          <>
            <div className="relative mb-4 rounded-[32px] overflow-hidden bg-white border border-slate-200 shadow-[0_18px_60px_rgba(15,23,42,0.14)] text-slate-900">
              <div className="absolute inset-0 bg-gradient-to-br from-white via-slate-50 to-white pointer-events-none" />

              <div className="relative p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-3xl bg-slate-900 text-white flex items-center justify-center font-extrabold shadow-lg shadow-slate-900/15">
                      CA
                    </div>

                    <div className="leading-tight min-w-0">
                      <div className="text-base font-extrabold text-slate-950 truncate">
                        Bem-vindo, {meuNome || '...'}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        Aceite pedidos próximos, concluido e suba sua patente ⭐
                      </div>

                      <div className="mt-3 flex gap-2 flex-wrap">
                        <Patente tipo="corre" nivel={minhaPatenteCorre} size="sm" showLabel={false} />
                        {isProfissional && <Patente tipo="prof" nivel={minhaPatenteProf} size="sm" />}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setTab('corre')}
                      className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold shadow-lg shadow-blue-500/25 transition"
                    >
                      📋 Pedidos
                    </button>

                    <button
                      type="button"
                      onClick={() => setOpenMapaAoVivo(true)}
                      className="px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-900 text-sm font-extrabold shadow-sm transition"
                    >
                      🗺️ Mapa ao vivo
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {tab === 'inbox' && (
              <div className="mb-4 rounded-[32px] overflow-hidden bg-white border border-slate-200 shadow-[0_18px_60px_rgba(15,23,42,0.14)]">
                <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-br from-white to-slate-50">
                  <div className="text-base font-extrabold text-slate-950">💬 Inbox</div>
                  <div className="mt-1 text-xs text-slate-500">Conversas dos pedidos aceitos e enviados.</div>
                </div>

                <div className="p-3 bg-slate-50">
                  <ListaConversas
                    meuId={meuId}
                    onAbrirChat={(pedidoId) => {
                      const p = corres.find((x) => x.id === pedidoId)
                      if (p) {
                        setChatPedido(p)
                        setTab('corre')
                      } else {
                        showToast({ type: 'info', title: 'Aguarde', message: 'Esse pedido ainda não carregou.' })
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}


            {tab === 'agenda' && (
              <div className="mb-4 rounded-[32px] overflow-hidden bg-[#020617] border border-white/10 shadow-[0_22px_80px_rgba(0,0,0,0.35)]">
                <div className="px-4 py-4 border-b border-white/10 bg-gradient-to-br from-[#07111f] to-[#0f172a]">
                  <div className="text-xl font-black text-white">📅 Minha agenda</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Solicitações futuras dos clientes. Aceite, recuse e organize sua fila.
                  </div>
                </div>

                <div className="p-3 bg-[#020617]">
                  <AgendaProfissional uid={meuId} modo="profissional" />
                </div>
              </div>
            )}

        {/* CLIENTE */}
        {modoApp === 'cliente' && (
          <div className="space-y-4">
            <ClienteHome
              meuNome={meuNome}
              onlineUsers={onlineUsers}
              onCriarPedido={() => setOpenIA(true)}
              onIrAoVivo={() => {
                setOpenMapaAoVivo(true)
              }}
              onAbrirPerfil={(u) => {
                setUsuarioSelecionado(u)
                showToast({
                  type: 'info',
                  title: u?.nome || u?.profile?.nome || 'Perfil',
                  message:
                    u?.profResumo ||
                    u?.correResumo ||
                    u?.profissional?.descricao ||
                    u?.profile?.descricao ||
                    'Ficha selecionada.',
                })
              }}
              onAgendar={(u) => {
                setAgendaClienteUser(u)
              }}
            />

            <AvisoCorreAceito
              meuId={meuId}
              corres={corres}
              onAbrirChat={(pedido) => {
                setChatPedido(pedido)
              }}
              onVerMapa={(pedido) => {
                setMapItem(pedido)
              }}
              showToast={showToast}
            />

            {/* ✅ A área pesada de cliente saiu daqui.
                Agora Pedidos e Conversas ficam na barra inferior real
                e abrem como tela separada, sem poluir a lista/fichas. */}
          </div>
        )}

        {/* CORRE */}
        {modoApp === 'corre' && tab === 'corre' && (
          <>
            {/* Painel de filtros do Corre */}
            <div className="mb-4 rounded-[32px] overflow-hidden bg-white border border-slate-200 shadow-[0_18px_60px_rgba(15,23,42,0.14)] text-slate-900">
              <div className="p-4">
                {/* filtros status */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    className={`px-3 py-3 rounded-2xl border text-sm font-extrabold transition ${
                      filtro === 'abertos'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/25'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                    onClick={() => setFiltro('abertos')}
                    type="button"
                  >
                    Abertos
                  </button>

                  <button
                    className={`px-3 py-3 rounded-2xl border text-sm font-extrabold transition ${
                      filtro === 'meus'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/25'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                    onClick={() => setFiltro('meus')}
                    type="button"
                  >
                    Aceitos
                  </button>

                  <button
                    className={`px-3 py-3 rounded-2xl border text-sm font-extrabold transition ${
                      filtro === 'todos'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/25'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                    onClick={() => setFiltro('todos')}
                    type="button"
                  >
                    Todos
                  </button>
                </div>

                {/* Online agora */}
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center gap-2 text-sm text-slate-800">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
                    <span className="font-bold">Online agora:</span>
                    <b className="text-emerald-700">{onlineUsers.length}</b>
                  </div>

                  <div className="text-xs text-slate-500">
                    expira em {Math.floor(ONLINE_TTL_MS / 1000)}s
                  </div>
                </div>

                {/* Busca + categoria */}
                <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_260px] gap-2">
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <span className="text-lg">🔍</span>
                    <input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar por título, descrição ou criador"
                      className="min-w-0 flex-1 bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-600 font-semibold"
                    />
                  </div>

                  <select
                    value={categoriaFiltro}
                    onChange={(e) => setCategoriaFiltro(e.target.value)}
                    className="px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-900 font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    title="Filtrar por categoria"
                  >
                    <option value="todas">📦 Todas categorias</option>
                    <option value="sem">⚠️ Sem categoria</option>
                    {(CATEGORIES || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* indicador profissional */}
            {isProfissional && (
              <div className={`mb-4 rounded-2xl p-3 ${glassCard}`}>
                <div className="text-sm text-gray-200">🧑‍🔧 Modo Profissional ativo ✅</div>
                <div className="text-xs text-slate-500 mt-1">
                  Suas categorias:{' '}
                  <b className="text-slate-800">
                    {(minhasCategoriasProf || []).length > 0 ? minhasCategoriasProf.join(', ') : 'Nenhuma'}
                  </b>
                </div>
              </div>
            )}

            {loadingPedidos && (
              <div className={`mb-3 text-sm text-gray-200 rounded-2xl p-3 ${glassCard}`}>⏳ Carregando pedidos...</div>
            )}

            {!loadingPedidos && erroPedidos && (
              <div className="mb-3 text-sm text-red-200 bg-red-500/15 border border-red-400/20 rounded-2xl p-3 ">
                ❌ {erroPedidos}
              </div>
            )}

            {/* Lista */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start pb-44 md:pb-36">
              {!loadingPedidos && !erroPedidos && corresFiltrados.length === 0 && (
                <div className="text-sm text-slate-500">Nenhum corre aqui para mostrar.</div>
              )}

              {corresFiltrados.map((p, index) => {
                const status = (p.status || 'aberto').toLowerCase()
                const aceitoPorMim = p?.aceite?.id === meuId
                const temAceitador = !!p?.aceite?.id
                const mapOk = !!(p?.local?.lat != null && p?.local?.lng != null)

                const b = boostInfo(p)
                const cardAberto = cardAbertoId === p.id

                const catObj = getCatObj(p?.categoriaId || p?.categoria)
                const combinaComigo =
                  isProfissional && p?.categoriaId && (minhasCategoriasProf || []).includes(p.categoriaId)

                const criadorId = p?.criador?.id
                const userCriador = criadorId ? usersObj?.[criadorId] : null
                const patenteCriadorCorre = Number(userCriador?.patenteCorre || 1)
                const patenteCriadorProf = Number(userCriador?.patenteProf || 0)

                const taxaEstimada = calcTaxaServiço({
                  modoPedido: p?.modoPedido,
                  isProfissionalUser: isProfissional,
                  patenteProf: minhaPatenteProf,
                })

                return (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: 22, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.34, delay: Math.min(index * 0.055, 0.35), ease: 'easeOut' }}
                    whileHover={{ y: -3, scale: 1.008 }}
                    whileTap={{ scale: 0.985 }}
                    className={[
                      "corre-card-clean relative overflow-hidden rounded-[22px] md:rounded-[26px] p-2.5 md:p-3 text-slate-950 flex flex-col gap-1.5 md:gap-2 select-none cursor-default",
                      "bg-white border border-white/80 shadow-[0_16px_44px_rgba(15,23,42,0.14)]",
                      "ring-1 ring-slate-900/5 transition",
                      status === 'aberto' ? "border-emerald-300/70 ring-2 ring-emerald-300/35 shadow-[0_18px_55px_rgba(16,185,129,0.20)]" : "",
                      b.destaque ? "border-fuchsia-300/90 ring-2 ring-fuchsia-300/40 shadow-[0_18px_60px_rgba(217,70,239,0.22)]" : "",
                      b.emergencia ? "border-red-400 ring-2 ring-red-400/60 shadow-[0_20px_70px_rgba(239,68,68,0.32)] animate-pulse" : "",
                    ].join(" ")}
                  >
                    {b.emergencia ? (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-red-500 via-orange-300 to-red-600 shadow-[0_0_36px_rgba(239,68,68,0.95)] animate-pulse" />
                    ) : b.destaque ? (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-fuchsia-500 via-amber-300 to-blue-500 shadow-[0_0_32px_rgba(217,70,239,0.75)]" />
                    ) : status === 'aberto' ? (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-300 via-lime-200 to-emerald-400 shadow-[0_0_28px_rgba(16,185,129,0.95)] animate-pulse" />
                    ) : null}
                    {b.emergencia ? (
                      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-red-400/35 blur-2xl animate-pulse" />
                    ) : b.destaque ? (
                      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-fuchsia-400/30 blur-2xl" />
                    ) : status === 'aberto' ? (
                      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-emerald-300/25 blur-2xl animate-pulse" />
                    ) : null}
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(59,130,246,0.12),transparent_34%),radial-gradient(circle_at_90%_15%,rgba(16,185,129,0.16),transparent_28%)]" />
                    <div className="relative z-10 flex items-start justify-between gap-2 md:gap-3">
                      <div className="min-w-0">
                        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-2 md:px-2.5 py-0.5 md:py-1 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 shadow-[0_0_18px_rgba(16,185,129,0.18)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                          Pedido disponível
                        </div>
                        <div className="mt-2 font-black text-slate-950 text-base md:text-xl leading-tight line-clamp-1 drop-shadow-[0_1px_0_rgba(255,255,255,0.65)]">🏁 {p.titulo || '(sem título)'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {b.emergencia ? (
                          <span className="text-[11px] px-2.5 py-1 rounded-full bg-red-100 border border-red-300 text-red-800 font-black shadow-sm animate-pulse">
                            🚨 URGENTE ANTIGO
                          </span>
                        ) : b.destaque ? (
                          <span className="text-[11px] px-2.5 py-1 rounded-full bg-fuchsia-100 border border-fuchsia-300 text-fuchsia-800 font-black shadow-sm">
                            🚀 DESTAQUE ANTIGO
                          </span>
                        ) : null}
                        <BadgeStatus status={status} />
                      </div>
                    </div>

                    {/* modo + categoria */}
                    <div className="relative z-10 flex gap-2 flex-wrap items-center">
                      <BadgeModo modo={p?.modoPedido} />

                      {catObj ? (
                        <span className="text-[11px] md:text-xs px-2 py-0.5 md:py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
                          {catObj.emoji} {catObj.label}
                        </span>
                      ) : p?.categoriaId ? (
                        <span className="text-[11px] md:text-xs px-2 py-0.5 md:py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
                          🏷️ {String(p.categoriaId)}
                        </span>
                      ) : (
                        <span className="text-[11px] md:text-xs px-2 py-0.5 md:py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-500 font-semibold">
                          ⚠️ Sem categoria
                        </span>
                      )}

                      {combinaComigo && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 font-black">
                          ✅ Combina com você
                        </span>
                      )}
                    </div>

                    <div className="relative z-10 flex items-center justify-between gap-2 rounded-2xl bg-white/75 border border-slate-200/70 px-2.5 md:px-3 py-2">
                      <div className="min-w-0 text-[11px] md:text-xs font-black uppercase tracking-wide">
                        {b.emergencia ? (
                          <span className="text-red-700">🚨 Resposta rápida</span>
                        ) : b.destaque ? (
                          <span className="text-fuchsia-700">🚀 Mais visibilidade</span>
                        ) : (
                          <span className="text-emerald-700">✅ Disponível agora</span>
                        )}
                      </div>
                      {p.valor != null && Number.isFinite(Number(p.valor)) ? (
                        <div className="shrink-0 rounded-xl bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-sm md:text-base font-black text-emerald-700">
                          R$ {Number(p.valor).toFixed(2)}
                        </div>
                      ) : (
                        <div className="shrink-0 rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-1 text-xs font-black text-slate-600">
                          combinar
                        </div>
                      )}
                    </div>

                    {cardAberto && (
                      <>
                    {p.descricao && String(p.descricao).trim().toLowerCase() !== String(p.titulo || '').trim().toLowerCase() && (
                      <div className="relative z-10 rounded-2xl bg-slate-50/90 border border-slate-200/80 px-2.5 md:px-3 py-2 text-xs md:text-sm text-slate-700 leading-relaxed select-none">
                        {p.descricao}
                      </div>
                    )}

                    <div className="relative z-10 grid grid-cols-2 gap-1.5 md:gap-2">
                      <div className="rounded-2xl bg-white border border-slate-200 px-2.5 md:px-3 py-2">
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-600">Criado por</div>
                        <div className="text-xs md:text-sm font-black text-slate-900 truncate">👤 {p.criador?.nome || meuNome || 'Anônimo'}</div>
                      </div>
                      {p.valor != null && Number.isFinite(Number(p.valor)) ? (
                        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-2.5 md:px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-wide text-emerald-500">Valor combinado</div>
                          <div className="text-sm md:text-base font-black text-emerald-700">R$ {Number(p.valor).toFixed(2)}</div>
                        </div>
                      ) : null}
                    </div>

                    {b.emergencia ? (
                      <div className="relative z-10 rounded-2xl bg-red-50 border border-red-300 px-2.5 md:px-3 py-2 text-[11px] md:text-[12px] text-red-800 font-black shadow-sm">
                        🚨 Emergência: cliente pediu resposta rápida. Prioridade máxima na lista dos corres.
                      </div>
                    ) : b.destaque ? (
                      <div className="relative z-10 rounded-2xl bg-fuchsia-50 border border-fuchsia-300 px-2.5 md:px-3 py-2 text-[11px] md:text-[12px] text-fuchsia-800 font-black shadow-sm">
                        🚀 Pedido destacado: mais visibilidade para quem está disponível agora.
                      </div>
                    ) : null}

                    {/* taxa removida / incentivo ao profissional */}
                    <div className="relative z-10 rounded-2xl bg-emerald-500/10 border border-emerald-300/50 px-2.5 md:px-3 py-2 text-[11px] md:text-[12px] text-emerald-800 font-black shadow-sm">
                      ✅ Sem taxa do app: <b>100% do valor fica com quem faz o serviço</b>
                    </div>

                    {/* patentes do criador */}
                    <div className="relative z-10 flex gap-2 flex-wrap">
                      <Patente tipo="corre" nivel={patenteCriadorCorre} size="sm" showLabel={false} />
                      {patenteCriadorProf > 0 && <Patente tipo="prof" nivel={patenteCriadorProf} size="sm" />}
                    </div>

                      </>
                    )}

                    <div className="relative z-10 grid grid-cols-2 sm:flex gap-1.5 md:gap-2 flex-wrap mt-1">
                      <button
                        className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-800 font-black hover:bg-slate-50 shadow-sm transition"
                        onClick={() => setCardAbertoId(cardAberto ? null : p.id)}
                        type="button"
                      >
                        {cardAberto ? 'Ocultar' : 'Detalhes'}
                      </button>

                      {p.local && (
                        <button
                          onClick={() => {
                            if (!mapOk) {
                              showToast({
                                type: 'info',
                                title: 'Sem localização',
                                message: 'Esse pedido não tem lat/lng válidos para abrir no mapa.',
                              })
                              return
                            }
                            setMapItem(p)
                          }}
                          type="button"
                          disabled={!mapOk}
                          className={`${btnMapBase} ${mapOk ? btnMapEnabled : btnMapDisabled}`}
                          title={mapOk ? 'Abrir no mapa' : 'Sem lat/lng válidos'}
                        >
                          📍 Ver no mapa
                        </button>
                      )}

                      <button className={btnDark} onClick={() => setChatPedido(p)} type="button">
                        💬 Chat
                      </button>

                      {status === 'aberto' && (
                        <button
                          className={`${btnPrimary} disabled:opacity-60`}
                          onClick={() => aceitarCorre(p)}
                          disabled={aceitandoId === p.id}
                          type="button"
                        >
                          {aceitandoId === p.id ? 'Aceitando…' : 'Aceitar'}
                        </button>
                      )}

                      {aceitoPorMim && status === 'aceito' && (
                        <button
                          className={`${btnDanger} disabled:opacity-60`}
                          onClick={() => cancelarAceite(p)}
                          disabled={cancelandoId === p.id}
                          type="button"
                        >
                          {cancelandoId === p.id ? 'Cancelando…' : 'Cancelar aceitação'}
                        </button>
                      )}

                      {status === 'aceito' && souCriador(p) && (
                        <button
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 disabled:opacity-60 transition"
                          onClick={() => marcarConcluído(p)}
                          disabled={serviçondoId === p.id}
                          type="button"
                        >
                          {serviçondoId === p.id ? 'Confirmando…' : 'Confirmar serviço feito'}
                        </button>
                      )}

                      {/* Alcance/urgência fica somente em MeusPedidosCliente (área do cliente). */}


                      {status !== 'aberto' && !aceitoPorMim && temAceitador && (
                        <span className="text-xs text-slate-500">Aceito por {p.aceite?.nome || 'alguém'}</span>
                      )}
                    </div>

                    {chatPedido?.id === p.id && (
                      <div className="pt-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-slate-500">
                            Chat do pedido: <b className="text-slate-800">{p.titulo || p.id}</b>
                          </div>
                          <button
                            className="text-[11px] md:text-xs px-2 py-0.5 md:py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white"
                            onClick={() => setChatPedido(null)}
                            type="button"
                          >
                            Fechar chat
                          </button>
                        </div>

                        <ChatMensagens
                          pedidoId={p.id}
                          meuId={meuId}
                          meuNome={meuNome}
                          pedidoTitulo={p.titulo || 'Corre aqui'}
                          outroUser={getOutroUser(p)}
                        />
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </>
        )}

        {/* MODAL IA */}
        <ModalIA open={openIA} onClose={() => setOpenIA(false)} abrirCriacaoManual={() => setOpenIA(false)} />

        {/* MAPA DO PEDIDO */}
        {mapItem && (
          <MapinhaModal
            open={!!mapItem}
            onClose={() => setMapItem(null)}
            pedidoLocal={mapItem?.local || null}
            aceiteLocal={mapItem?.aceite?.local || null}
            titulo={mapItem.titulo || 'Corre aqui'}
            infoExtra={{
              status: mapItem.status || 'aberto',
              criador: mapItem?.criador?.nome || 'Anônimo',
              aceitador: mapItem?.aceite?.nome || null,
            }}
            onlineUsers={onlineUsersParaPerfil}
            limitOnlineMarkers={30}
            myUid={meuId}
            onClickUser={(u) => setUsuarioSelecionado(u)}
          />
        )}

        {/* MAPA AO VIVO */}
        {openMapaAoVivo && (
          <>
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100000] w-[min(92vw,520px)] px-3">
              <div className="rounded-3xl bg-white border border-slate-200 shadow-[0_18px_60px_rgba(15,23,42,0.16)] p-2">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-lg">
                    🔎
                  </div>

                  <input
                    value={buscaUsuarioMapa}
                    onChange={(e) => setBuscaUsuarioMapa(e.target.value)}
                    placeholder="Buscar usuário online por nome ou cidade"
                    className="min-w-0 flex-1 px-2 py-2 bg-transparent text-slate-900 placeholder:text-slate-600 outline-none text-sm font-semibold"
                  />

                  {buscaUsuarioMapa ? (
                    <button
                      type="button"
                      onClick={() => setBuscaUsuarioMapa('')}
                      className="w-9 h-9 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                      title="Limpar busca"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <MapinhaModal
              open={openMapaAoVivo}
              onClose={() => {
                setOpenMapaAoVivo(false)
                setBuscaUsuarioMapa('')
              }}
              pedidoLocal={null}
              aceiteLocal={null}
              titulo="Mapa ao vivo"
              infoExtra={{
                status: 'online',
                criador: meuNome || 'Anônimo',
                aceitador: null,
              }}
              onlineUsers={onlineUsersFiltrados}
              limitOnlineMarkers={30}
              myUid={meuId}
            />
          </>
        )}


        {/* CHAT MODAL NO MODO CLIENTE */}
        {modoApp === 'cliente' && chatPedido && !clientePainelBaixo && (
          <div className="fixed inset-0 z-[99999] bg-black/70  flex items-center justify-center p-3">
            <div className="w-full max-w-2xl rounded-2xl bg-[#0b1220] border border-white/10 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Conversa do pedido
                  </div>
                  <div className="text-xs text-slate-500">
                    {chatPedido?.titulo || 'Corre aqui'}
                  </div>
                </div>

                <button
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white"
                  onClick={() => setChatPedido(null)}
                  type="button"
                >
                  Fechar
                </button>
              </div>

              <div className="p-3">
                <ChatMensagens
                  pedidoId={chatPedido.id}
                  meuId={meuId}
                  meuNome={meuNome}
                  pedidoTitulo={chatPedido.titulo || 'Corre aqui'}
                  outroUser={getOutroUser(chatPedido)}
                />
              </div>
            </div>
          </div>
        )}

        {/* EDITAR */}
        {editItem && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70">
            <div className="w-[92%] max-w-md rounded-2xl p-5 shadow-xl border border-white/10 bg-white/10 ">
              <div className="text-lg font-bold text-slate-950">Editar pedido</div>
              <div className="text-xs text-slate-500 mt-1">Só o criador pode editar</div>

              <div className="mt-3 space-y-2">
                <input
                  value={editTitulo}
                  onChange={(e) => setEditTitulo(e.target.value)}
                  placeholder="Título"
                  className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <textarea
                  value={editDescricao}
                  onChange={(e) => setEditDescricao(e.target.value)}
                  placeholder="Descrição"
                  className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-white/40 min-h-[90px] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <input
                  value={editValor}
                  onChange={(e) => setEditValor(e.target.value)}
                  placeholder="Valor (opcional) ex: 25,00"
                  className="w-full px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  inputMode="decimal"
                />
              </div>

              <div className="mt-4 flex gap-2 justify-end">
                <button
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white"
                  onClick={() => setEditItem(null)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                  onClick={salvarEdicao}
                  disabled={salvandoEdicao}
                  type="button"
                >
                  {salvandoEdicao ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ✅ PERFIL RÁPIDO DO PROFISSIONAL SELECIONADO */}
      {usuarioSelecionado && (
        <div className="fixed inset-0 z-[100000] bg-black/55  flex items-end sm:items-center justify-center p-3">
          <div className="w-full max-w-md rounded-3xl bg-white text-slate-900 border border-slate-200 shadow-[0_30px_90px_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="p-4 bg-gradient-to-br from-white to-slate-50 border-b border-slate-200">
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 rounded-3xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-3xl shrink-0">
                  {usuarioSelecionado?.fotoURL || usuarioSelecionado?.profile?.fotoURL ? (
                    <img
                      src={usuarioSelecionado?.fotoURL || usuarioSelecionado?.profile?.fotoURL}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{usuarioSelecionado?.avatarEmoji || usuarioSelecionado?.profile?.avatarEmoji || '🙂'}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-lg font-extrabold text-slate-950 truncate">
                    {usuarioSelecionado?.nome || usuarioSelecionado?.profile?.nome || 'Profissional'}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {usuarioSelecionado?.profissional?.titulo ||
                      usuarioSelecionado?.profile?.titulo ||
                      usuarioSelecionado?.profResumo ||
                      'Profissional do Corre Aqui'}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                    🟢 Disponível
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setUsuarioSelecionado(null)}
                  className="w-9 h-9 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Especialidade</div>
                <div className="mt-1 text-sm text-slate-800">
                  {usuarioSelecionado?.profissional?.descricao ||
                    usuarioSelecionado?.profile?.descricao ||
                    usuarioSelecionado?.profResumo ||
                    'Ainda sem descrição cadastrada.'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5 md:gap-2 text-sm">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Cidade</div>
                  <div className="font-bold text-slate-800">
                    {usuarioSelecionado?.profCidadeAtende || usuarioSelecionado?.cidade || usuarioSelecionado?.profile?.cidade || '—'}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Base</div>
                  <div className="font-bold text-slate-800">
                    {usuarioSelecionado?.profPrecoBase || usuarioSelecionado?.profissional?.preco || usuarioSelecionado?.profile?.preco
                      ? `R$ ${usuarioSelecionado?.profPrecoBase || usuarioSelecionado?.profissional?.preco || usuarioSelecionado?.profile?.preco}`
                      : 'A combinar'}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUsuarioSelecionado(null)
                    setOpenIA(true)
                  }}
                  className="flex-1 h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold shadow-lg shadow-blue-500/25"
                >
                  Pedir serviço
                </button>

                <button
                  type="button"
                  onClick={() => setAgendaClienteUser(usuarioSelecionado)}
                  className="h-12 px-4 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-extrabold flex items-center justify-center shadow-lg shadow-violet-500/20"
                >
                  📅 Agendar
                </button>

                {(usuarioSelecionado?.profWhats || usuarioSelecionado?.profissional?.whatsapp || usuarioSelecionado?.profile?.whatsapp) && (
                  <a
                    href={`https://wa.me/55${String(usuarioSelecionado?.profWhats || usuarioSelecionado?.profissional?.whatsapp || usuarioSelecionado?.profile?.whatsapp).replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="h-12 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold flex items-center justify-center shadow-lg shadow-emerald-500/20"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ BARRA INFERIOR REAL DO CLIENTE
          Pedidos e Conversas não ficam mais como caixa no meio.
          A barra fica fixa embaixo e cada opção abre uma tela própria com rolagem. */}
      


{modoApp === 'cliente' && (
        <div className="fixed inset-x-0 bottom-4 z-[99980] flex justify-center pointer-events-none">
          <div className="
            pointer-events-auto relative
            flex items-center gap-1.5
            rounded-[34px]
            border border-blue-400/25
            bg-[#0b1220]/95
            px-2 py-2
            shadow-[0_18px_50px_rgba(0,0,0,0.50),0_0_36px_rgba(59,130,246,0.22)]
            backdrop-blur-xl
            overflow-hidden
          ">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_50%,rgba(59,130,246,0.22),transparent_35%),radial-gradient(circle_at_82%_50%,rgba(168,85,247,0.20),transparent_35%)]" />

            <button
              type="button"
              onClick={() => setClientePainelBaixo('meusPedidos')}
              className={`relative h-13 min-w-[148px] rounded-[26px]
                flex items-center justify-center gap-3
                text-[15px] font-black
                transition-all duration-300 active:scale-[0.96]
                ${
                  clientePainelBaixo === 'meusPedidos'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-400 text-white shadow-[0_10px_26px_rgba(37,99,235,0.42),inset_0_0_20px_rgba(255,255,255,0.12)]'
                    : 'bg-white/[0.055] text-white/82 hover:text-white hover:bg-white/[0.09]'
                }`}
            >
              <span className={`grid h-9 w-9 place-items-center rounded-2xl border text-[22px] ${
                clientePainelBaixo === 'meusPedidos'
                  ? 'border-cyan-200/35 bg-white/12 shadow-[0_0_18px_rgba(103,232,249,0.50)]'
                  : 'border-white/10 bg-white/[0.07]'
              }`}>
                📦
              </span>
              <span>Pedidos</span>
              {clientePainelBaixo === 'meusPedidos' ? (
                <span className="absolute bottom-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-cyan-200 shadow-[0_0_16px_rgba(103,232,249,0.85)]" />
              ) : null}
            </button>

            <div className="relative h-9 w-px bg-white/15" />

            <button
              type="button"
              onClick={() => setClientePainelBaixo('conversas')}
              className={`relative h-13 min-w-[148px] rounded-[26px]
                flex items-center justify-center gap-3
                text-[15px] font-black
                transition-all duration-300 active:scale-[0.96]
                ${
                  clientePainelBaixo === 'conversas'
                    ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-[0_10px_26px_rgba(168,85,247,0.42),inset_0_0_20px_rgba(255,255,255,0.12)]'
                    : 'bg-white/[0.055] text-white/82 hover:text-white hover:bg-white/[0.09]'
                }`}
            >
              <span className={`grid h-9 w-9 place-items-center rounded-2xl border text-[22px] ${
                clientePainelBaixo === 'conversas'
                  ? 'border-fuchsia-200/35 bg-white/12 shadow-[0_0_18px_rgba(240,171,252,0.50)]'
                  : 'border-white/10 bg-white/[0.07]'
              }`}>
                💬
              </span>
              <span>Conversas</span>
              {clientePainelBaixo === 'conversas' ? (
                <span className="absolute bottom-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-fuchsia-200 shadow-[0_0_16px_rgba(240,171,252,0.85)]" />
              ) : null}
            </button>
          </div>
        </div>
      )}

      {modoApp === 'cliente' && clientePainelBaixo && (
        <div className="fixed inset-0 z-[99990] bg-[#0f172a] flex justify-center">
          <div className="w-full max-w-[900px] h-[100dvh] bg-[#0f172a] text-white shadow-[0_0_40px_rgba(0,0,0,0.45)] flex flex-col">
            <div className="shrink-0 px-4 pt-4 pb-3 bg-[#111827] border-b border-slate-700 shadow-md">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">
                    Corre Aqui
                  </div>
                  <div className="mt-1 text-xl font-black text-white truncate">
                    {clientePainelBaixo === 'meusPedidos' ? '📦 Meus pedidos' : clientePainelBaixo === 'chat' ? '💬 Conversa' : '💬 Caixa de conversas'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setClientePainelBaixo('')
                    if (clientePainelBaixo === 'chat') setChatPedido(null)
                  }}
                  className="w-11 h-11 rounded-2xl bg-[#1e293b] hover:bg-[#263449] text-white font-black border border-slate-700"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-3 md:p-5 pb-28 bg-[#0f172a]">
              {clientePainelBaixo === 'meusPedidos' && (
                <MeusPedidosCliente
                  meuId={meuId}
                  corres={corres}
                  onAbrirChat={(pedido) => {
                    setChatPedido(pedido)
                    setClientePainelBaixo('chat')
                  }}
                  onVerMapa={(pedido) => {
                    setMapItem(pedido)
                  }}
                  onConfirmarServicoFeito={(pedido) => {
                    marcarConcluído(pedido)
                  }}
                  onToast={showToast}
                />
              )}

              {clientePainelBaixo === 'conversas' && (
                <div className="rounded-[28px] overflow-hidden bg-[#0f172a] border border-slate-700 shadow-lg text-white">
                  <ListaConversas
                    meuId={meuId}
                    onAbrirChat={(pedidoId) => {
                      const p = corres.find((x) => x.id === pedidoId)

                      if (p) {
                        setChatPedido(p)
                        setClientePainelBaixo('chat')
                      } else {
                        showToast({
                          type: 'info',
                          title: 'Aguarde',
                          message: 'Esse pedido ainda não carregou.',
                        })
                      }
                    }}
                  />
                </div>
              )}

              {clientePainelBaixo === 'chat' && chatPedido && (
                <div className="rounded-[28px] overflow-hidden bg-[#0f172a] border border-slate-700 shadow-lg text-white">
                  <div className="px-4 py-3 border-b border-slate-700 bg-[#111827]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-300">Chat do pedido</div>
                        <div className="mt-1 text-base font-black text-white truncate">{chatPedido?.titulo || 'Corre aqui'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setChatPedido(null)
                          setClientePainelBaixo('conversas')
                        }}
                        className="px-3 py-2 rounded-2xl bg-[#1e293b] hover:bg-[#263449] text-white text-xs font-black border border-slate-700"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>

                  <div className="p-3">
                    <ChatMensagens
                      pedidoId={chatPedido.id}
                      meuId={meuId}
                      meuNome={meuNome}
                      pedidoTitulo={chatPedido.titulo || 'Corre aqui'}
                      outroUser={getOutroUser(chatPedido)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ✅ ClienteHome agora controla Corre/Profissionais e mostra a lista rica direto no centro.
          Removido bloco duplicado de busca/filtros e qualquer botão flutuante extra. */}

      <XpToast
        open={showXpToast}
        xp={10}
      />

      <PerfilDrawer open={openPerfil} onClose={() => setOpenPerfil(false)} uid={meuId} />

      <ModalAgenda
        open={!!agendaClienteUser}
        profissional={agendaClienteUser}
        onClose={() => setAgendaClienteUser(null)}
      />

      {modoApp === 'corre' && (
        <BottomBar active={tab} onTab={onBottomTab} unreadCount={unreadInbox} agendaCount={agendaPendentes} agendaConfirmados={agendaConfirmados} agendaRecusados={agendaRecusados} modoApp={modoApp} hidden={isMapOpen} disponivel={correDisponivel} />
      )}
    </div>
  )
}

/*
Se o perfil público não abrir ao clicar no usuário online no mapa,
o próximo arquivo para ajustar é src/components/MapinhaModal.jsx.
Nos markers de onlineUsers, use:
eventHandlers={{ click: () => onClickUser?.(u) }}
*/

// cards limpos para corre/profissional
