'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'

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
import ModalIA from './ModalIA'
import ChatMensagens from './ChatMensagens'
import ListaConversas from './ListaConversas'
import AvisoCorreAceito from '@/components/AvisoCorreAceito'
import MeusPedidosCliente from '@/components/MeusPedidosCliente'

// ✅ NOVOS COMPONENTES
import BottomBar from '@/components/BottomBar'
import Patente from '@/components/Patente'

import ClienteHome from '@/components/ClienteHome'

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
    criadoEm: p.criadoEm || 0,
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
const BASE_TAXA_CORRE = 0.1 // 10%
const BASE_TAXA_PROF = 0.12 // 12%

const TAXA_PROF_POR_PATENTE = {
  1: 0.12,
  2: 0.1,
  3: 0.08,
  4: 0.06,
  5: 0.04,
}

const BOOST_LEVELS = {
  1: { minutos: 20, label: 'Boost', emoji: '🚀' },
  2: { minutos: 60, label: 'Turbo', emoji: '🔥' },
  3: { minutos: 180, label: 'Insano', emoji: '⚡' },
}

const nowMs = () => Date.now()

const isBoostAtivo = (p) => {
  const until = Number(p?.boost?.until || 0)
  return until > nowMs()
}

const boostInfo = (p) => {
  const lvl = Number(p?.boost?.level || 0)
  const cfg = BOOST_LEVELS[lvl]
  const until = Number(p?.boost?.until || 0)
  const ativo = until > nowMs()
  return { lvl, cfg, until, ativo }
}

const calcTaxaEntrega = ({ modoPedido, isProfissionalUser, patenteProf }) => {
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

/* =======================
   ✅ Patente por entregas
======================= */
const calcPatente = (entregas = 0) => {
  const n = Number(entregas || 0)
  if (n >= 60) return 5
  if (n >= 30) return 4
  if (n >= 15) return 3
  if (n >= 5) return 2
  return 1
}

async function subirPatentePorEntrega({ uid, modoPedido = 'geral' }) {
  if (!uid) return

  const userRef = ref(database, `users/${uid}`)

  await runTransaction(userRef, (current) => {
    const u = current || {}

    const entregasCorre = Number(u.entregasCorre || 0) + 1

    const isProf = String(modoPedido || 'geral').toLowerCase() === 'profissional'
    const entregasProf = isProf ? Number(u.entregasProf || 0) + 1 : Number(u.entregasProf || 0)

    const patenteCorre = calcPatente(entregasCorre)

    const isProfissionalUser = !!u.isProfissional
    const patenteProf = isProfissionalUser ? calcPatente(entregasProf) : 0

    return {
      ...u,
      entregasCorre,
      entregasProf,
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

async function aplicarBoostNoPedido({ pedido, level, meuId, meuNome }) {
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
    'fixed top-4 left-1/2 -translate-x-1/2 z-[99999] px-4 py-3 rounded-2xl shadow-xl border text-sm max-w-[92vw] w-[420px] backdrop-blur-md'

  const styles =
    type === 'success'
      ? 'bg-emerald-500/15 border-emerald-400/20 text-emerald-100'
      : type === 'error'
      ? 'bg-red-500/15 border-red-400/20 text-red-100'
      : 'bg-white/10 border-white/10 text-gray-100'

  return (
    <div className={`${base} ${styles}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {toast.title && <div className="font-semibold">{toast.title}</div>}
          <div className="mt-0.5 text-gray-200">{toast.message}</div>
        </div>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
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
      <span className="text-xs px-2 py-1 rounded-full bg-yellow-300/20 border border-yellow-300/30 text-yellow-200 font-semibold">
        ⚡ Corre
      </span>
    )
  }

  if (m === 'profissional') {
    return (
      <span className="text-xs px-2 py-1 rounded-full bg-sky-500/15 border border-sky-400/20 text-sky-200 font-semibold">
        🧑‍🔧 Profissional
      </span>
    )
  }

  return (
    <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10 text-gray-200 font-semibold">
      ⚪ Geral
    </span>
  )
}

export default function Mapadinamico({ initialMode = 'corre', onBackToMode } = {}) {
  const [tab, setTab] = useState('corre') // corre | inbox

  const [modoApp, setModoApp] = useState(initialMode === 'cliente' || initialMode === 'corre' ? initialMode : 'corre') // cliente | corre
  const [openPerfil, setOpenPerfil] = useState(false)

  const [meuNome, setMeuNome] = useState('')
  const [meuId, setMeuId] = useState('')

  const [fotoURL, setFotoURL] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('')

  const [corres, setCorres] = useState([])
  const [filtro, setFiltro] = useState('abertos')
  const [busca, setBusca] = useState('')
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
  const showToast = useCallback((t) => setToast({ ms: 2800, ...t }), [])

  const [loadingPedidos, setLoadingPedidos] = useState(true)
  const [erroPedidos, setErroPedidos] = useState(null)

  const [aceitandoId, setAceitandoId] = useState(null)
  const [cancelandoId, setCancelandoId] = useState(null)
  const [entregandoId, setEntregandoId] = useState(null)
  const [excluindoId, setExcluindoId] = useState(null)
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)

  const [unreadInbox, setUnreadInbox] = useState(0)

  /* =======================
     ✅ VOLTAR LIMPO PRA TELA DAS ABAS
  ======================= */
  const voltarModoLimpo = () => {
    setOpenPerfil(false)
    setOpenIA(false)
    setChatPedido(null)
    setMapItem(null)
    setOpenMapaAoVivo(false)

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

  // ✅ Cliente não usa Inbox / tabs
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
        online: true,
        local: local || null,
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

    const heartbeat = setInterval(() => {
      update(userRef, {
        online: true,
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
  }, [meuId, meuNome, fotoURL, avatarEmoji])

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
          const ba = isBoostAtivo(a) ? 1 : 0
          const bb = isBoostAtivo(b) ? 1 : 0
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
      message: `${pedidoAceito?.aceite?.nome || 'Alguém'} aceitou seu pedido.`,
    })
  }, [corres, meuId, ultimoAceiteNotificado, showToast])

  const onlineUsers = useMemo(() => {
    const now = Date.now()
    return Object.entries(usersObj || {})
      .map(([id, u]) => ({ id, ...u }))
      .filter((u) => u?.online === true && now - Number(u?.lastSeen || 0) <= ONLINE_TTL_MS)
      .sort((a, b) => Number(b?.lastSeen || 0) - Number(a?.lastSeen || 0))
  }, [usersObj])

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
    return (corres || []).filter((p) => {
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
  }, [corres, filtro, busca, meuId, categoriaFiltro, isProfissional])

  async function aceitarCorre(p) {
    if (!meuId) {
      showToast({ type: 'error', title: 'Sem login', message: 'Entre para aceitar.' })
      return
    }
    if (aceitandoId) return
    setAceitandoId(p.id)

    try {
      const local = await getMyLocation()
      const aceite = {
        id: meuId,
        nome: meuNome,
        local: local || null,
        aceitoEm: Date.now(),
      }

      // ✅ usa o próprio ID do pedido como conversaId
      const conversaId = p.id

      // marcar pedido como aceito
      await update(ref(database, `pedidos/${p.id}`), {
        status: 'aceito',
        aceite,
        conversaId,
        atualizadoEm: serverTimestamp(),
      })

      // ✅ conversa do cliente
      if (p?.criador?.id) {
        await update(ref(database, `conversas/${p.criador.id}/${conversaId}`), {
          pedidoId: p.id,
          titulo: p.titulo || 'Corre aqui',
          outroId: meuId,
          outroNome: meuNome || 'Anônimo',
          unread: true,
          status: 'ativa',
          updatedAt: Date.now(),
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
        updatedAt: Date.now(),
      })

      // ✅ mensagem automática
      await update(ref(database, `mensagens/${conversaId}/msg_${Date.now()}`), {
        texto: `${meuNome} aceitou seu corre.`,
        sistema: true,
        criadoEm: Date.now(),
        autorId: 'sistema',
        autorNome: 'Sistema',
      })

      // ✅ atalhos de conversa
      if (p?.criador?.id) {
        await set(ref(database, `usersChats/${p.criador.id}/${conversaId}`), true)
      }

      await set(ref(database, `usersChats/${meuId}/${conversaId}`), true)

      await missãoIncrementar(meuId, 'aceitou')

      setMapItem({ ...p, aceite })
      showToast({ type: 'success', title: 'Aceito!', message: 'Você aceitou esse corre. +XP ✅' })
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

  async function marcarEntregue(p) {
    if (entregandoId) return
    setEntregandoId(p.id)

    try {
      const criadorId = p?.criador?.id
      const aceitadorId = p?.aceite?.id
      const pode = meuId && (meuId === criadorId || meuId === aceitadorId)

      if (!pode) {
        showToast({
          type: 'error',
          title: 'Sem permissão',
          message: 'Só criador/aceitador pode marcar entregue.',
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

      await update(ref(database, `pedidos/${p.id}`), {
        status: 'entregue',
        entregueEm: Date.now(),
        entreguePor: { id: meuId, nome: meuNome || 'Anônimo' },
        atualizadoEm: serverTimestamp(),
      })

      // ✅ QUEM GANHA A ENTREGA?
      const creditUid = aceitadorId || meuId

      await subirPatentePorEntrega({
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
      console.error('Erro ao marcar entregue:', e)
      showToast({ type: 'error', title: 'Falha', message: e?.message || 'Veja o console.' })
    } finally {
      setEntregandoId(null)
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
        <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-emerald-400/15 border border-emerald-400/20 text-emerald-200 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]" />
          ABERTO
        </span>
      )
    if (s === 'aceito')
      return (
        <span className="text-xs px-2 py-1 rounded-full bg-amber-400/15 border border-amber-400/20 text-amber-200 font-semibold">
          ACEITO
        </span>
      )
    if (s === 'entregue')
      return (
        <span className="text-xs px-2 py-1 rounded-full bg-sky-400/15 border border-sky-400/20 text-sky-200 font-semibold">
          ENTREGUE
        </span>
      )
    return (
      <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10 text-gray-200 font-semibold">
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

  const glassCard = 'bg-white/10 backdrop-blur-md border border-white/10 shadow-xl shadow-black/30'

  const btnGhost =
    'px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white transition active:scale-[0.98]'

  const btnPrimary =
    'px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 transition active:scale-[0.98]'

  const btnDanger =
    'px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-500/20 transition active:scale-[0.98]'

  const btnDark =
    'px-3 py-1.5 rounded-xl bg-gray-900 text-white hover:bg-black border border-white/5 transition active:scale-[0.98]'

  const btnMapBase = 'px-3 py-1.5 rounded-xl text-sm font-semibold border transition active:scale-[0.98]'
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
    <div className="min-h-screen">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* ✅ VOLTAR PRA TELA DAS ABAS (AGORA LIMPO) */}
      {typeof onBackToMode === 'function' && (
        <button
          onClick={voltarModoLimpo}
          className="
            fixed top-4 left-4 z-[99999]
            rounded-2xl px-4 py-2
            bg-white/5 hover:bg-white/10
            border border-white/10
            text-white/80 text-sm font-semibold
            backdrop-blur-xl
            shadow-[0_12px_40px_rgba(0,0,0,0.35)]
          "
          type="button"
        >
          ← Trocar modo
        </button>
      )}

      <div className="max-w-3xl mx-auto p-4 pb-[200px]">
        {/* CORRE: Header + Inbox */}
        {modoApp === 'corre' && (
          <>
            <div className="relative mb-4">
              <div className="flex items-center gap-3 justify-between flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/10 text-white flex items-center justify-center font-bold">
                    CA
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm text-gray-100 font-semibold">Bem-vindo, {meuNome || '...'}</div>
                    <div className="text-xs text-gray-400">Aceite, entregue, e suba sua patente ⭐</div>

                    <div className="mt-2 flex gap-2 flex-wrap">
                      <Patente tipo="corre" nivel={minhaPatenteCorre} size="sm" showLabel={false} />
                      {isProfissional && <Patente tipo="prof" nivel={minhaPatenteProf} size="sm" />}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {tab === 'inbox' && (
              <div className="mb-4">
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
            )}
          </>
        )}

        {/* CLIENTE */}
        {modoApp === 'cliente' && (
          <div className="space-y-4">
            <ClienteHome
              meuNome={meuNome}
              onlineUsers={onlineUsers}
              onCriarPedido={() => setOpenIA(true)}
              onIrAoVivo={() => {
                setTab('aovivo')
                setOpenMapaAoVivo(true)
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

            <MeusPedidosCliente
              meuId={meuId}
              corres={corres}
              onAbrirChat={(pedido) => {
                setChatPedido(pedido)
              }}
              onVerMapa={(pedido) => {
                setMapItem(pedido)
              }}
            />

            <div className={`rounded-2xl p-3 ${glassCard}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-gray-100">
                  💬 Mensagens do cliente
                </div>

                <div className="text-xs text-gray-400">
                  Conversas dos seus pedidos
                </div>
              </div>

              <ListaConversas
                meuId={meuId}
                onAbrirChat={(pedidoId) => {
                  const p = corres.find((x) => x.id === pedidoId)

                  if (p) {
                    setChatPedido(p)
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
          </div>
        )}

        {/* CORRE */}
        {modoApp === 'corre' && tab === 'corre' && (
          <>
            {/* filtros status */}
            <div className="mb-4 flex flex-wrap gap-2 justify-center">
              <button
                className={`px-3 py-1.5 rounded-xl border transition ${
                  filtro === 'abertos'
                    ? 'bg-blue-600 text-white border-blue-500/40'
                    : 'bg-white/10 text-white border-white/10 hover:bg-white/15'
                }`}
                onClick={() => setFiltro('abertos')}
                type="button"
              >
                Abertos
              </button>

              <button
                className={`px-3 py-1.5 rounded-xl border transition ${
                  filtro === 'meus'
                    ? 'bg-blue-600 text-white border-blue-500/40'
                    : 'bg-white/10 text-white border-white/10 hover:bg-white/15'
                }`}
                onClick={() => setFiltro('meus')}
                type="button"
              >
                Aceitos por mim
              </button>

              <button
                className={`px-3 py-1.5 rounded-xl border transition ${
                  filtro === 'todos'
                    ? 'bg-blue-600 text-white border-blue-500/40'
                    : 'bg-white/10 text-white border-white/10 hover:bg-white/15'
                }`}
                onClick={() => setFiltro('todos')}
                type="button"
              >
                Todos
              </button>
            </div>

            {/* Online agora */}
            <div className={`mb-4 rounded-2xl p-3 ${glassCard}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-gray-200">
                  🟢 Online agora: <b className="text-gray-100">{onlineUsers.length}</b>
                </div>
                <div className="text-xs text-gray-400">expira em {Math.floor(ONLINE_TTL_MS / 1000)}s</div>
              </div>
            </div>

            {/* Busca + categoria */}
            <div className="mb-4 flex gap-2 flex-wrap">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="🔍 Buscar por título, descrição ou criador"
                className="flex-1 min-w-[220px] px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />

              <select
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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

            {/* indicador profissional */}
            {isProfissional && (
              <div className={`mb-4 rounded-2xl p-3 ${glassCard}`}>
                <div className="text-sm text-gray-200">🧑‍🔧 Modo Profissional ativo ✅</div>
                <div className="text-xs text-gray-400 mt-1">
                  Suas categorias:{' '}
                  <b className="text-gray-200">
                    {(minhasCategoriasProf || []).length > 0 ? minhasCategoriasProf.join(', ') : 'Nenhuma'}
                  </b>
                </div>
              </div>
            )}

            {loadingPedidos && (
              <div className={`mb-3 text-sm text-gray-200 rounded-2xl p-3 ${glassCard}`}>⏳ Carregando pedidos...</div>
            )}

            {!loadingPedidos && erroPedidos && (
              <div className="mb-3 text-sm text-red-200 bg-red-500/15 border border-red-400/20 rounded-2xl p-3 backdrop-blur-md">
                ❌ {erroPedidos}
              </div>
            )}

            {/* Lista */}
            <div className="space-y-3">
              {!loadingPedidos && !erroPedidos && corresFiltrados.length === 0 && (
                <div className="text-sm text-gray-400">Nenhum corre aqui para mostrar.</div>
              )}

              {corresFiltrados.map((p) => {
                const status = (p.status || 'aberto').toLowerCase()
                const aceitoPorMim = p?.aceite?.id === meuId
                const temAceitador = !!p?.aceite?.id
                const mapOk = !!(p?.local?.lat != null && p?.local?.lng != null)

                const b = boostInfo(p)

                const catObj = getCatObj(p?.categoriaId || p?.categoria)
                const combinaComigo =
                  isProfissional && p?.categoriaId && (minhasCategoriasProf || []).includes(p.categoriaId)

                const criadorId = p?.criador?.id
                const userCriador = criadorId ? usersObj?.[criadorId] : null
                const patenteCriadorCorre = Number(userCriador?.patenteCorre || 1)
                const patenteCriadorProf = Number(userCriador?.patenteProf || 0)

                const taxaEstimada = calcTaxaEntrega({
                  modoPedido: p?.modoPedido,
                  isProfissionalUser: isProfissional,
                  patenteProf: minhaPatenteProf,
                })

                return (
                  <div key={p.id} className={`rounded-2xl p-4 ${glassCard} flex flex-col gap-2`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-gray-100">🏁 {p.titulo || '(sem título)'}</div>
                      <div className="flex items-center gap-2">
                        {b.ativo && (
                          <span className="text-xs px-2 py-1 rounded-full bg-fuchsia-500/15 border border-fuchsia-400/20 text-fuchsia-200 font-semibold">
                            {b.cfg?.emoji || '🚀'} BOOST
                          </span>
                        )}
                        <BadgeStatus status={status} />
                      </div>
                    </div>

                    {/* modo + categoria */}
                    <div className="flex gap-2 flex-wrap items-center">
                      <BadgeModo modo={p?.modoPedido} />

                      {catObj ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10 text-gray-200 font-semibold">
                          {catObj.emoji} {catObj.label}
                        </span>
                      ) : p?.categoriaId ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-white/10 border border-white/10 text-gray-200 font-semibold">
                          🏷️ {String(p.categoriaId)}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 font-semibold">
                          ⚠️ Sem categoria
                        </span>
                      )}

                      {combinaComigo && (
                        <span className="text-xs px-2 py-1 rounded-full bg-emerald-400/15 border border-emerald-400/20 text-emerald-200 font-semibold">
                          ✅ Combina com você
                        </span>
                      )}
                    </div>

                    {p.descricao && <div className="text-sm text-gray-200">{p.descricao}</div>}

                    <div className="text-xs text-gray-400">
                      Criado por: <b className="text-gray-200">{p.criador?.nome || meuNome || 'Anônimo'}</b>
                      {p.valor != null && Number.isFinite(Number(p.valor)) ? (
                        <>
                          {' '}
                          · Valor: <b className="text-gray-200">R$ {Number(p.valor).toFixed(2)}</b>
                        </>
                      ) : null}
                    </div>

                    {/* taxa / incentivo patente */}
                    <div className="text-[11px] text-gray-400">
                      💸 Taxa estimada: <b className="text-gray-200">{Math.round(taxaEstimada * 100)}%</b>
                      {String(p?.modoPedido || '').toLowerCase() === 'profissional' && isProfissional ? (
                        <span className="ml-2 text-emerald-300/90">✅ menor pela sua patente</span>
                      ) : null}
                    </div>

                    {/* patentes do criador */}
                    <div className="flex gap-2 flex-wrap">
                      <Patente tipo="corre" nivel={patenteCriadorCorre} size="sm" showLabel={false} />
                      {patenteCriadorProf > 0 && <Patente tipo="prof" nivel={patenteCriadorProf} size="sm" />}
                    </div>

                    <div className="flex gap-2 flex-wrap mt-1">
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
                        Chat
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

                      {status === 'aceito' && (souAceitador(p) || souCriador(p)) && (
                        <button
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 disabled:opacity-60 transition active:scale-[0.98]"
                          onClick={() => marcarEntregue(p)}
                          disabled={entregandoId === p.id}
                          type="button"
                        >
                          {entregandoId === p.id ? 'Marcando…' : 'Marcar ENTREGUE'}
                        </button>
                      )}

                      {/* ✅ BOOST (só criador e só aberto) */}
                      {souCriador(p) && status === 'aberto' && (
                        <>
                          <button
                            className="px-3 py-1.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white shadow-md shadow-fuchsia-500/20 transition active:scale-[0.98]"
                            onClick={async () => {
                              try {
                                await aplicarBoostNoPedido({ pedido: p, level: 1, meuId, meuNome })
                                showToast({ type: 'success', title: 'Boost!', message: 'Seu pedido subiu pro topo 🚀' })
                              } catch (e) {
                                showToast({ type: 'error', title: 'Falha no boost', message: e?.message || 'Erro' })
                              }
                            }}
                            type="button"
                          >
                            🚀 Boost
                          </button>

                          <button
                            className="px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-500/20 transition active:scale-[0.98]"
                            onClick={async () => {
                              try {
                                await aplicarBoostNoPedido({ pedido: p, level: 2, meuId, meuNome })
                                showToast({ type: 'success', title: 'Turbo!', message: 'Turbo ativado 🔥' })
                              } catch (e) {
                                showToast({ type: 'error', title: 'Falha no turbo', message: e?.message || 'Erro' })
                              }
                            }}
                            type="button"
                          >
                            🔥 Turbo
                          </button>

                          <button
                            className="px-3 py-1.5 rounded-xl bg-yellow-600 hover:bg-yellow-700 text-white shadow-md shadow-yellow-500/20 transition active:scale-[0.98]"
                            onClick={async () => {
                              try {
                                await aplicarBoostNoPedido({ pedido: p, level: 3, meuId, meuNome })
                                showToast({ type: 'success', title: 'Insano!', message: 'Insano ativado ⚡' })
                              } catch (e) {
                                showToast({ type: 'error', title: 'Falha no insano', message: e?.message || 'Erro' })
                              }
                            }}
                            type="button"
                          >
                            ⚡ Insano
                          </button>
                        </>
                      )}

                      {souCriador(p) && (
                        <>
                          <button className={btnGhost} onClick={() => abrirEditar(p)} type="button">
                            Editar
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-xl bg-red-500/15 text-red-200 border border-red-400/20 hover:bg-red-500/20 disabled:opacity-60 transition active:scale-[0.98]"
                            onClick={() => excluirPedido(p)}
                            disabled={excluindoId === p.id}
                            type="button"
                          >
                            {excluindoId === p.id ? 'Excluindo…' : 'Excluir'}
                          </button>
                        </>
                      )}

                      {status !== 'aberto' && !aceitoPorMim && temAceitador && (
                        <span className="text-xs text-gray-400">Aceito por {p.aceite?.nome || 'alguém'}</span>
                      )}
                    </div>

                    {chatPedido?.id === p.id && (
                      <div className="pt-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-400">
                            Chat do pedido: <b className="text-gray-200">{p.titulo || p.id}</b>
                          </div>
                          <button
                            className="text-xs px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-white"
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
                  </div>
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
            onlineUsers={onlineUsers}
            limitOnlineMarkers={30}
            myUid={meuId}
          />
        )}

        {/* MAPA AO VIVO */}
        {openMapaAoVivo && (
          <MapinhaModal
            open={openMapaAoVivo}
            onClose={() => setOpenMapaAoVivo(false)}
            pedidoLocal={null}
            aceiteLocal={null}
            titulo="Mapa ao vivo"
            infoExtra={{
              status: 'online',
              criador: meuNome || 'Anônimo',
              aceitador: null,
            }}
            onlineUsers={onlineUsers}
            limitOnlineMarkers={30}
            myUid={meuId}
          />
        )}

        {/* CHAT MODAL NO MODO CLIENTE */}
        {modoApp === 'cliente' && chatPedido && (
          <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3">
            <div className="w-full max-w-2xl rounded-2xl bg-[#0b1220] border border-white/10 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Conversa do pedido
                  </div>
                  <div className="text-xs text-gray-400">
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
            <div className="w-[92%] max-w-md rounded-2xl p-5 shadow-xl border border-white/10 bg-white/10 backdrop-blur-md">
              <div className="text-lg font-bold text-gray-100">Editar pedido</div>
              <div className="text-xs text-gray-400 mt-1">Só o criador pode editar</div>

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

      <PerfilDrawer open={openPerfil} onClose={() => setOpenPerfil(false)} uid={meuId} />

      {modoApp === 'corre' && (
        <BottomBar active={tab} onTab={onBottomTab} unreadCount={unreadInbox} modoApp={modoApp} hidden={isMapOpen} />
      )}
    </div>
  )
}