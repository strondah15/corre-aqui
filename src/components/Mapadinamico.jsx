// XP_PATENTE_SYSTEM
// aceitar serviço = +3 XP
// concluir serviço = +10 XP
// avaliação positiva = +5 XP

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

import { auth, database } from '@/lib/firebase'
import { onForegroundPush } from '@/lib/pushNotifications'
import { enviarPushParaUsuario } from '@/lib/pushSender'
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
import CentralNotificacoes from '@/components/CentralNotificacoes'
import PainelProblemasDenuncias from '@/components/PainelProblemasDenuncias'
import StatusFluxoServico from '@/components/StatusFluxoServico'
import LogoCorreAqui from '@/components/LogoCorreAqui'

// ✅ NOVOS COMPONENTES
import BottomBar from '@/components/BottomBar'
import Patente, { calcularPatentePorServicos, getPatenteTitle } from '@/components/Patente'
import PatenteUpModal from '@/components/PatenteUpModal'

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

const isFotoValor = (v) => /^(https?:\/\/|data:image\/|blob:|\/)/i.test(String(v || '').trim())

const pickFoto = (...vals) => vals.map((v) => String(v || '').trim()).find(isFotoValor) || ''

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
  1: { minutos: 30, label: 'Destaque (em breve)', emoji: '🚀', preco: 2.99 },
  2: { minutos: 20, label: 'Urgente (em breve)', emoji: '🚨', preco: 4.99 },
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

const getProximoPassoPedido = (p, meuId) => {
  const status = String(p?.status || 'aberto').toLowerCase()
  const souCliente = !!meuId && String(p?.criador?.id || '') === String(meuId)
  const souAceitador = !!meuId && String(p?.aceite?.id || '') === String(meuId)

  if (p?.problemaServico) return 'Problema registrado. Acompanhe pelo chat até resolver.'
  if (status === 'aberto') return 'Aguardando alguém aceitar.'
  if (status === 'aceito' && souCliente) return 'Combine no chat e confirme quando o serviço terminar.'
  if (status === 'aceito' && souAceitador) return 'Combine no chat e aguarde o cliente confirmar a conclusão.'
  if (status === 'aceito') return 'Serviço em andamento.'
  if (status === 'concluido' && !p?.avaliacao && souCliente) return 'Avalie o serviço para fechar o ciclo.'
  if (status === 'concluido' && !p?.avaliacao && souAceitador) return 'Serviço confirmado. Aguardando avaliação do cliente.'
  if (status === 'concluido') return 'Serviço finalizado e avaliado.'
  if (status === 'cancelado') return 'Pedido cancelado.'
  return 'Acompanhe os próximos passos pelo chat.'
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

const notificarTelefone = async ({ title, body, tag }) => {
  try {
    if (typeof window === 'undefined') return false
    if (!('Notification' in window)) return false
    if (Notification.permission !== 'granted') return false

    new Notification(title || 'Corre Aqui', {
      body: body || '',
      tag: tag || `corre-aqui-${Date.now()}`,
      icon: '/corre-aqui-icon-192.png',
      badge: '/corre-aqui-icon-192.png',
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
  return calcularPatentePorServicos(serviços)
}

async function subirPatentePorServiço({ uid, modoPedido = 'geral' }) {
  if (!uid) return

  const userRef = ref(database, `users/${uid}`)
  let resultado = null

  await runTransaction(userRef, (current) => {
    const u = current || {}

    const servicosCorreAntes = Number(u.servicosCorre ?? u['serviçosCorre'] ?? 0)
    const servicosProfAntes = Number(u.servicosProf ?? u['serviçosProf'] ?? 0)
    const patenteCorreAntes = calcPatente(servicosCorreAntes)
    const patenteProfAntes = calcPatente(servicosProfAntes)
    const isProfissionalUser = !!(u.isProfissional || u?.profile?.isProfissional || u?.profissional?.ativo)
    const isProf = String(modoPedido || 'geral').toLowerCase() === 'profissional' && isProfissionalUser

    const servicosCorre = isProf ? servicosCorreAntes : servicosCorreAntes + 1
    const servicosProf = isProf ? servicosProfAntes + 1 : servicosProfAntes

    const patenteCorre = calcPatente(servicosCorre)
    const patenteProf = isProfissionalUser ? calcPatente(servicosProf) : 0

    resultado = {
      tipo: isProf ? 'prof' : 'corre',
      patenteAntes: isProf ? patenteProfAntes : patenteCorreAntes,
      patenteDepois: isProf ? patenteProf : patenteCorre,
      servicosCorre,
      servicosProf,
      subiu: isProf ? patenteProf > patenteProfAntes : patenteCorre > patenteCorreAntes,
    }

    return {
      ...u,
      servicosCorre,
      servicosProf,
      serviçosCorre: servicosCorre,
      serviçosProf: servicosProf,
      patenteCorre,
      patenteProf,
      patenteAtualizadaEm: Date.now(),
    }
  })

  return resultado
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
  const router = useRouter()
  const [tab, setTab] = useState('corre') // corre | inbox | agenda
  const [clientePainelBaixo, setClientePainelBaixo] = useState('') // '' | meusPedidos | conversas | chat

  const [modoApp, setModoApp] = useState(initialMode === 'cliente' || initialMode === 'corre' ? initialMode : 'corre') // cliente | corre
  const [openPerfil, setOpenPerfil] = useState(false)
  const [showXpToast, setShowXpToast] = useState(false)
  const [xpToastInfo, setXpToastInfo] = useState({
    xp: 10,
    texto: 'Serviço concluído',
  })
  const [patenteUp, setPatenteUp] = useState(null)

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
  const notificacoesInicializadasRef = useRef(false)
  const notificacoesVistasRef = useRef(new Set())
  const showToast = useCallback((t) => setToast({ ms: 2800, ...t }), [])

  const [loadingPedidos, setLoadingPedidos] = useState(true)
  const [erroPedidos, setErroPedidos] = useState(null)

  const [aceitandoId, setAceitandoId] = useState(null)
  const [cancelandoId, setCancelandoId] = useState(null)
  const [serviçondoId, setServiçondoId] = useState(null)
  const [excluindoId, setExcluindoId] = useState(null)
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [conclusaoPedido, setConclusaoPedido] = useState(null)
  const [avaliacaoPedido, setAvaliacaoPedido] = useState(null)
  const [avaliacaoNota, setAvaliacaoNota] = useState(5)
  const [avaliacaoComentario, setAvaliacaoComentario] = useState('')
  const [salvandoAvaliacao, setSalvandoAvaliacao] = useState(false)
  const [problemaPedido, setProblemaPedido] = useState(null)
  const [problemaTipo, setProblemaTipo] = useState('servico_nao_resolvido')
  const [problemaDescricao, setProblemaDescricao] = useState('')
  const [salvandoProblema, setSalvandoProblema] = useState(false)

  const [unreadInbox, setUnreadInbox] = useState(0)
  const [agendaPendentes, setAgendaPendentes] = useState(0)
  const [agendaConfirmados, setAgendaConfirmados] = useState(0)
  const [agendaRecusados, setAgendaRecusados] = useState(0)
  const [correDisponivel, setCorreDisponivel] = useState(true)
  const [bottomBarsHidden, setBottomBarsHidden] = useState(false)
  const lastScrollYRef = useRef(0)

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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    lastScrollYRef.current = window.scrollY || document.documentElement.scrollTop || 0
    let ticking = false

    const onScroll = () => {
      if (ticking) return

      ticking = true
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY || document.documentElement.scrollTop || 0
        const diff = currentY - lastScrollYRef.current

        if (currentY < 80) {
          setBottomBarsHidden(false)
        } else if (diff > 10) {
          setBottomBarsHidden(true)
        } else if (diff < -10) {
          setBottomBarsHidden(false)
        }

        lastScrollYRef.current = currentY
        ticking = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* =======================
     0) Cache visual do avatar ate o Firebase carregar
  ======================= */
  useEffect(() => {
    if (meuId && usersObj?.[meuId]) return

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
  }, [openPerfil, meuId, usersObj])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) {
      setNotifPermission('unsupported')
      return
    }
    setNotifPermission(Notification.permission || 'default')
  }, [])

  useEffect(() => {
    let active = true
    let unsubscribe = () => {}

    onForegroundPush((payload) => {
      const notification = payload?.notification || {}
      const data = payload?.data || {}
      showToast({
        type: 'info',
        title: notification.title || data.title || 'Corre Aqui',
        message: notification.body || data.body || data.message || 'Você tem uma nova atualização.',
      })
    }).then((off) => {
      if (!active) {
        off?.()
        return
      }
      unsubscribe = off || (() => {})
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [showToast])

  useEffect(() => {
    notificacoesInicializadasRef.current = false
    notificacoesVistasRef.current = new Set()
  }, [meuId])

  useEffect(() => {
    if (!meuId) return
    const userAtual = usersObj?.[meuId] || {}
    const notificacoesAtivas = userAtual?.profile?.notificacoes !== false
    if (!notificacoesAtivas) return

    const nRef = query(ref(database, `notificacoes/${meuId}`), limitToLast(20))
    const off = onValue(nRef, (snap) => {
      const raw = snap.val() || {}
      const lista = Object.entries(raw)
        .map(([id, n]) => ({ id, ...(n || {}) }))
        .sort((a, b) => Number(b?.criadoEm || 0) - Number(a?.criadoEm || 0))

      if (!notificacoesInicializadasRef.current) {
        lista.forEach((n) => notificacoesVistasRef.current.add(n.id))
        notificacoesInicializadasRef.current = true
        return
      }

      const nova = lista.find((n) => {
        if (!n?.id || notificacoesVistasRef.current.has(n.id)) return false
        if (n?.lida === true) return false
        if (n?.tipo === 'corre_aceito') return false
        if (n?.autor?.id && String(n.autor.id) === String(meuId)) return false
        return true
      })

      if (!nova) return

      notificacoesVistasRef.current.add(nova.id)

      showToast({
        type: nova.tipo === 'mensagem_chat' ? 'info' : 'success',
        title: nova.titulo || 'Nova notificação',
        message: nova.mensagem || 'Você tem uma atualização no Corre Aqui.',
      })

      notificarTelefone({
        title: nova.titulo || 'Corre Aqui',
        body: nova.mensagem || '',
        tag: `corre-aqui-${nova.id}`,
      })
    })

    return () => off()
  }, [meuId, showToast, usersObj])

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
     ✅ Agenda counters
  ======================= */
  useEffect(() => {
    if (!meuId) {
      setAgendaPendentes(0)
      setAgendaConfirmados(0)
      setAgendaRecusados(0)
      return
    }

    const off = onValue(ref(database, 'agendamentos'), (snap) => {
      const raw = snap.val() || {}
      const counts = Object.values(raw).reduce(
        (acc, a) => {
          if (a?.profissionalId !== meuId) return acc

          const status = String(a?.status || 'pendente')
          if (status === 'pendente') acc.pendentes += 1
          if (status === 'aceito') acc.confirmados += 1
          if (status === 'recusado') acc.recusados += 1

          return acc
        },
        { pendentes: 0, confirmados: 0, recusados: 0 }
      )

      setAgendaPendentes(counts.pendentes)
      setAgendaConfirmados(counts.confirmados)
      setAgendaRecusados(counts.recusados)
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

    const getAvatarPatch = () => {
      const patch = {}
      const foto = pickFoto(fotoURL)
      const emoji = String(avatarEmoji || '').trim()

      if (foto) patch.fotoURL = foto
      if (emoji) patch.avatarEmoji = emoji

      return patch
    }

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

  useEffect(() => {
    if (!meuUserNode) return

    const profile = meuUserNode.profile || {}
    const fotoPersonalizada = pickFoto(
      meuUserNode.fotoURL,
      profile.fotoURL,
      meuUserNode.avatar,
      profile.avatar
    )
    const emoji =
      meuUserNode.avatarEmoji ||
      profile.avatarEmoji ||
      (!isFotoValor(meuUserNode.avatar) ? meuUserNode.avatar : '') ||
      ''
    const fotoGoogle = pickFoto(meuUserNode.photoURL, profile.photoURL)
    const foto = fotoPersonalizada || (!emoji ? fotoGoogle : '')

    setFotoURL(foto || '')
    try {
      if (foto) {
        localStorage.setItem('fotoURL', foto)
      } else {
        localStorage.removeItem('fotoURL')
      }
    } catch {}

    setAvatarEmoji(emoji || '')
    try {
      if (emoji) {
        localStorage.setItem('avatarEmoji', emoji)
      } else {
        localStorage.removeItem('avatarEmoji')
      }
    } catch {}
  }, [meuUserNode])

  const isProfissional = useMemo(() => !!meuUserNode?.isProfissional, [meuUserNode])

  const minhasIniciais = useMemo(() => {
    const partes = String(meuNome || 'Corre Aqui').trim().split(/\s+/).filter(Boolean)
    return partes.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'CA'
  }, [meuNome])

  const minhasCategoriasProf = useMemo(() => {
    const arr = meuUserNode?.profCategorias
    return Array.isArray(arr) ? arr : []
  }, [meuUserNode])

  const minhaPatenteCorre = useMemo(() => Number(meuUserNode?.patenteCorre || 1), [meuUserNode])
  const minhaPatenteProf = useMemo(
    () => Number(meuUserNode?.patenteProf || (isProfissional ? 1 : 0)),
    [meuUserNode, isProfissional]
  )

  const minhasConfiguracoesMapa = useMemo(() => {
    const mapa = meuUserNode?.settings?.mapa || {}
    return {
      mostrarOnline: mapa.mostrarOnline === true,
      aoVivo: mapa.aoVivo === true,
      limiteOnline: Math.max(5, Math.min(120, Number(mapa.limiteOnline || 30))),
    }
  }, [meuUserNode])

  const minhasConfiguracoesUi = useMemo(() => {
    const ui = meuUserNode?.settings?.ui || {}
    const profileSettings = meuUserNode?.profile || {}
    return {
      animacoes: ui.animacoes !== false,
      notificacoes: profileSettings.notificacoes !== false,
    }
  }, [meuUserNode])

  const problemasVisiveisCount = useMemo(() => {
    if (!meuId) return 0
    return (corres || []).filter((p) => {
      if (!p?.problemaServico) return false
      return p?.criador?.id === meuId || p?.aceite?.id === meuId
    }).length
  }, [corres, meuId])

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

  const resumoCorre = useMemo(() => {
    const lista = Array.isArray(corres) ? corres : []
    return lista.reduce(
      (acc, p) => {
        const status = String(p?.status || 'aberto').toLowerCase()
        if (status === 'aberto') acc.abertos += 1
        if (p?.aceite?.id === meuId) acc.meus += 1
        if (status === 'concluido') acc.concluidos += 1
        return acc
      },
      { abertos: 0, meus: 0, concluidos: 0 }
    )
  }, [corres, meuId])

  async function aceitarCorre(p) {
    if (!meuId) {
      showToast({ type: 'error', title: 'Sem login', message: 'Entre para aceitar.' })
      return
    }

    const statusAtual = String(p?.status || 'aberto').toLowerCase()
    if (statusAtual !== 'aberto' || p?.aceite?.id) {
      showToast({
        type: 'info',
        title: 'Pedido indisponível',
        message: p?.aceite?.nome ? `Esse pedido já foi aceito por ${p.aceite.nome}.` : 'Esse pedido não está mais aberto.',
      })
      return
    }

    if (p?.criador?.id && String(p.criador.id) === String(meuId)) {
      showToast({
        type: 'info',
        title: 'Esse pedido é seu',
        message: 'O criador não pode aceitar o próprio serviço.',
      })
      return
    }

    if (aceitandoId) return
    setAceitandoId(p.id)

    try {
      const agora = Date.now()
      const local = await getMyLocation()
      const aceite = {
        id: meuId,
        nome: meuNome || meuUserNode?.nome || 'Corre',
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
          lastText: `${meuNome || 'Alguém'} aceitou seu corre.`,
          lastAt: agora,
          lastById: meuId,
          lastByNome: meuNome || 'Anônimo',
          mensagemPreview: `${meuNome || 'Alguém'} aceitou seu corre.`,
          updatedAt: agora,
        })

        await update(ref(database, `notificacoes/${p.criador.id}/notif_${agora}`), {
          tipo: 'corre_aceito',
          pedidoId: p.id,
          conversaId,
          titulo: 'Seu corre foi aceito! 🚀',
          mensagem: `${meuNome || 'Alguém'} aceitou: ${p.titulo || 'Corre aqui'}`,
          prioridade: 'alta',
          acao: 'abrir_chat',
          lida: false,
          criadoEm: agora,
          autor: { id: meuId, nome: meuNome || 'Anônimo' },
        })

        enviarPushParaUsuario(p.criador.id, {
          tipo: 'corre_aceito',
          pedidoId: p.id,
          conversaId,
          titulo: 'Seu corre foi aceito!',
          mensagem: `${meuNome || 'Alguem'} aceitou: ${p.titulo || 'Corre aqui'}`,
          prioridade: 'alta',
          acao: 'abrir_chat',
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
        lastText: 'Você aceitou esse corre.',
        lastAt: agora,
        lastById: meuId,
        lastByNome: meuNome || 'Anônimo',
        mensagemPreview: 'Você aceitou esse corre.',
        updatedAt: agora,
      })

      // ✅ mensagem automática
      const mensagemSistemaAceite = {
        texto: `${meuNome || 'Alguém'} aceitou o pedido.`,
        sistema: true,
        criadoEm: agora,
        hora: agora,
        autorId: 'sistema',
        autorNome: 'Sistema',
      }

      await set(ref(database, `chats/${conversaId}/msg_${agora}`), mensagemSistemaAceite)
      await update(ref(database, `mensagens/${conversaId}/msg_${agora}`), mensagemSistemaAceite)

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

  function abrirConclusao(p) {
    setConclusaoPedido(p)
  }

  function abrirAvaliacao(p) {
    setAvaliacaoPedido(p)
    setAvaliacaoNota(Number(p?.avaliacao?.nota || 5))
    setAvaliacaoComentario(p?.avaliacao?.comentario || '')
  }

  function abrirProblema(p) {
    setProblemaPedido(p)
    setProblemaTipo('servico_nao_resolvido')
    setProblemaDescricao('')
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
        avaliacaoPendente: true,
        atualizadoEm: concluidoAgora,
        atualizadoEmServer: serverTimestamp(),
      })

      if (aceitadorId && aceitadorId !== meuId) {
        await update(ref(database, `notificacoes/${aceitadorId}/notif_concluido_${concluidoAgora}`), {
          tipo: 'servico_concluido',
          pedidoId: p.id,
          conversaId: p?.conversaId || p.id,
          titulo: 'Serviço confirmado',
          mensagem: `${meuNome || 'Cliente'} confirmou a conclusão: ${p.titulo || 'Corre aqui'}`,
          prioridade: 'media',
          acao: 'abrir_chat',
          lida: false,
          criadoEm: concluidoAgora,
          autor: { id: meuId, nome: meuNome || 'Cliente' },
        }).catch((notifyError) => {
          console.warn('Serviço concluído, mas a notificação não foi enviada:', notifyError)
        })

        enviarPushParaUsuario(aceitadorId, {
          tipo: 'servico_concluido',
          pedidoId: p.id,
          conversaId: p?.conversaId || p.id,
          titulo: 'Servico confirmado',
          mensagem: `${meuNome || 'Cliente'} confirmou a conclusao: ${p.titulo || 'Corre aqui'}`,
          prioridade: 'media',
          acao: 'abrir_chat',
        })
      }

      // ✅ QUEM GANHA A ENTREGA?
      const creditUid = aceitadorId || meuId

      try {
        const patenteResultado = await subirPatentePorServiço({
          uid: creditUid,
          modoPedido: p?.modoPedido || 'geral',
        })

        await missãoIncrementar(creditUid, 'entregou')

        setXpToastInfo({
          xp: 10,
          texto: 'Serviço concluído. XP, moedas e patente atualizados.',
        })
        setShowXpToast(true)
        setTimeout(() => setShowXpToast(false), 2600)

        if (patenteResultado?.subiu) {
          setPatenteUp({
            patente: getPatenteTitle(patenteResultado.tipo, patenteResultado.patenteDepois),
            tipo: patenteResultado.tipo,
            nivel: patenteResultado.patenteDepois,
          })
        }
      } catch (xpError) {
        console.warn('Serviço concluído, mas XP/patente não atualizou:', xpError)
      }

      showToast({
        type: 'success',
        title: 'Fechado!',
        message: 'Serviço concluído. Agora avalie como foi a experiência.',
      })

      setConclusaoPedido(null)
      abrirAvaliacao({ ...p, status: 'concluido', concluidoEm: concluidoAgora })
    } catch (e) {
      console.error('Erro ao marcar concluido:', e)
      showToast({ type: 'error', title: 'Falha', message: e?.message || 'Veja o console.' })
    } finally {
      setServiçondoId(null)
    }
  }

  async function salvarAvaliacaoServico() {
    const p = avaliacaoPedido
    if (!p?.id || salvandoAvaliacao) return

    const criadorId = p?.criador?.id
    const avaliadoId = p?.aceite?.id

    if (!meuId || meuId !== criadorId) {
      showToast({
        type: 'error',
        title: 'Sem permissão',
        message: 'Somente o cliente que criou o pedido pode avaliar este serviço.',
      })
      return
    }

    if (!avaliadoId) {
      showToast({
        type: 'error',
        title: 'Sem profissional',
        message: 'Este pedido ainda não tem uma pessoa aceita para receber avaliação.',
      })
      return
    }

    try {
      setSalvandoAvaliacao(true)
      const agora = Date.now()
      const nota = Math.max(1, Math.min(5, Number(avaliacaoNota || 5)))
      const comentario = String(avaliacaoComentario || '').trim().slice(0, 500)
      const payload = {
        pedidoId: p.id,
        nota,
        comentario,
        cliente: { id: meuId, nome: meuNome || 'Cliente' },
        avaliado: { id: avaliadoId, nome: p?.aceite?.nome || 'Corre' },
        criadoEm: agora,
        criadoEmServer: serverTimestamp(),
        origem: 'pos_servico',
      }

      await update(ref(database), {
        [`avaliacoes/${p.id}`]: payload,
        [`pedidos/${p.id}/avaliacao`]: payload,
        [`pedidos/${p.id}/avaliacaoPendente`]: false,
        [`pedidos/${p.id}/atualizadoEm`]: agora,
        [`pedidos/${p.id}/atualizadoEmServer`]: serverTimestamp(),
      })

      if (avaliadoId && avaliadoId !== meuId) {
        await update(ref(database, `notificacoes/${avaliadoId}/notif_avaliacao_${agora}`), {
          tipo: 'avaliacao_recebida',
          pedidoId: p.id,
          conversaId: p?.conversaId || p.id,
          titulo: 'Você recebeu uma avaliação',
          mensagem: `Nota ${nota.toFixed(1)} em ${p.titulo || 'Corre aqui'}.`,
          prioridade: 'media',
          acao: 'ver_historico',
          lida: false,
          criadoEm: agora,
          autor: { id: meuId, nome: meuNome || 'Cliente' },
        }).catch((notifyError) => {
          console.warn('Avaliação salva, mas a notificação não foi enviada:', notifyError)
        })

        enviarPushParaUsuario(avaliadoId, {
          tipo: 'avaliacao_recebida',
          pedidoId: p.id,
          conversaId: p?.conversaId || p.id,
          titulo: 'Você recebeu uma avaliação',
          mensagem: `Nota ${nota.toFixed(1)} em ${p.titulo || 'Corre aqui'}.`,
          prioridade: 'media',
          acao: 'ver_historico',
        })
      }

      showToast({
        type: 'success',
        title: 'Avaliação enviada',
        message: 'Obrigado. Isso ajuda a deixar o Corre Aqui mais confiável.',
      })
      setAvaliacaoPedido(null)
      setAvaliacaoComentario('')
    } catch (e) {
      console.error('Erro ao salvar avaliação:', e)
      showToast({ type: 'error', title: 'Falha ao avaliar', message: e?.message || 'Tente novamente.' })
    } finally {
      setSalvandoAvaliacao(false)
    }
  }

  async function registrarProblemaServico() {
    const p = problemaPedido
    if (!p?.id || salvandoProblema) return

    const participante =
      meuId && (p?.criador?.id === meuId || p?.aceite?.id === meuId)

    if (!participante) {
      showToast({
        type: 'error',
        title: 'Sem permissão',
        message: 'Somente participantes do pedido podem registrar um problema.',
      })
      return
    }

    try {
      setSalvandoProblema(true)
      const agora = Date.now()
      const descricao = String(problemaDescricao || '').trim().slice(0, 800)
      const denuncia = ['conduta_inadequada', 'seguranca_golpe'].includes(problemaTipo)
      const registroId = `${p.id}_${meuId}_${agora}`
      const payload = {
        id: registroId,
        pedidoId: p.id,
        tipo: problemaTipo,
        descricao,
        denuncia,
        status: 'aberto',
        autor: { id: meuId, nome: meuNome || 'Usuário' },
        clienteId: p?.criador?.id || null,
        aceitadorId: p?.aceite?.id || null,
        criadoEm: agora,
        criadoEmServer: serverTimestamp(),
      }

      const updates = {
        [`problemasServico/${registroId}`]: payload,
        [`pedidos/${p.id}/problemaServico`]: {
          tipo: problemaTipo,
          descricao,
          denuncia,
          status: 'aberto',
          autor: { id: meuId, nome: meuNome || 'Usuário' },
          criadoEm: agora,
        },
        [`pedidos/${p.id}/atualizadoEm`]: agora,
        [`pedidos/${p.id}/atualizadoEmServer`]: serverTimestamp(),
      }

      if (denuncia) updates[`denuncias/${registroId}`] = payload

      await update(ref(database), updates)

      showToast({
        type: 'success',
        title: denuncia ? 'Denúncia registrada' : 'Problema registrado',
        message: 'O registro ficou salvo no histórico do serviço.',
      })
      setProblemaPedido(null)
      setProblemaDescricao('')
    } catch (e) {
      console.error('Erro ao registrar problema:', e)
      showToast({ type: 'error', title: 'Falha ao registrar', message: e?.message || 'Tente novamente.' })
    } finally {
      setSalvandoProblema(false)
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
        <span className="relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border border-emerald-300/60 bg-emerald-400/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-900 shadow-[0_0_18px_rgba(16,185,129,0.42)] animate-pulse md:gap-2 md:px-3 md:py-1.5 md:text-xs">
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent opacity-70" />
          <span className="relative flex h-2 w-2 md:h-2.5 md:w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.95)] md:h-2.5 md:w-2.5" />
          </span>
          <span className="relative drop-shadow-[0_0_7px_rgba(16,185,129,0.85)]">ABERTO</span>
        </span>
      )
    if (s === 'aceito')
      return (
        <span className="rounded-full border border-amber-300/50 bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-800 md:py-1 md:text-xs">
          ACEITO
        </span>
      )
    if (s === 'concluido')
      return (
        <span className="rounded-full border border-sky-300/50 bg-sky-50 px-2 py-0.5 text-[11px] font-black text-sky-800 md:py-1 md:text-xs">
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

  const abrirPedidoFocado = (pedido) => {
    if (!pedido?.id) return
    setFiltro('todos')
    setCardAbertoId(pedido.id)
    if (modoApp === 'cliente') {
      setClientePainelBaixo('meusPedidos')
      return
    }
    setTab('corre')
  }

  const abrirChatFocado = (pedido) => {
    if (!pedido?.id) return
    setClientePainelBaixo('')
    setChatPedido(null)
    router.push(`/chat/${encodeURIComponent(String(pedido.id))}?voltar=${modoApp}`)
  }

  const glassCard = 'bg-white/10  border border-white/10 shadow-xl shadow-black/30'

  const btnGhost =
    'px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white transition'

  const btnPrimary =
    'flex min-h-[38px] items-center justify-center rounded-[16px] bg-[#ffd91a] px-2.5 py-2 text-xs font-black text-blue-950 shadow-[0_10px_22px_rgba(250,204,21,0.26)] transition hover:bg-yellow-300 md:min-h-[38px] md:px-4 md:text-sm'

  const btnDanger =
    'flex min-h-[38px] items-center justify-center rounded-[16px] bg-red-600 px-2.5 py-2 text-xs font-black text-white shadow-md shadow-red-500/20 transition hover:bg-red-700 md:min-h-[38px] md:px-4 md:text-sm'

  const btnDark =
    'flex min-h-[38px] items-center justify-center rounded-[16px] border border-blue-950 bg-blue-950 px-2.5 py-2 text-xs font-black text-white shadow-sm transition hover:bg-slate-900 md:min-h-[38px] md:px-4 md:text-sm'

  const btnMapBase = 'flex min-h-[38px] items-center justify-center rounded-[16px] border px-2.5 py-2 text-xs font-black transition md:min-h-[38px] md:px-4 md:text-sm'
  const btnMapEnabled = 'bg-blue-950 text-white border-blue-950 hover:bg-slate-900'
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
    <div className="relative min-h-screen overflow-hidden bg-[#050b12] text-slate-900 corre-aqui-no-select">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(135deg,#06111a_0%,#071724_46%,#050812_100%)]" />
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
          background-color: rgba(255,255,255,0.985);
        }
        .corre-card-clean:active,
        .corre-card-clean:focus,
        .corre-card-clean:focus-within {
          background-color: rgba(255,255,255,0.985);
          filter: none;
          transform: none;
        }
      `}</style>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="relative z-10 w-full max-w-[1280px] mx-auto px-2.5 py-2.5 pb-24 md:px-4 md:py-5 md:pb-32 sm:px-5 lg:px-6">
        {/* ✅ TROCAR MODO DENTRO DO LAYOUT (não cobre mais os cards) */}
        {typeof onBackToMode === 'function' && (
          <div className="mb-2 flex justify-start md:mb-4">
            <button
              onClick={voltarModoLimpo}
              className="
                inline-flex h-10 items-center gap-2
                rounded-[18px] px-3 md:h-auto md:rounded-2xl md:px-4 md:py-2.5
                bg-white/92 hover:bg-white
                border border-blue-100/70
                text-blue-950 text-xs font-extrabold md:text-sm
                shadow-[0_12px_30px_rgba(37,99,235,0.16)]
                backdrop-blur-xl
                transition
              "
              type="button"
              title="Voltar para escolher Cliente ou Corre"
            >
              <span className="text-sm md:text-base">↩</span>
              <span>Trocar modo</span>
            </button>
          </div>
        )}

        {/* CORRE: Header + Inbox */}
        {modoApp === 'corre' && (
          <>
            <div className="relative -mx-2.5 mb-0 overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#16b8d1_46%,#ffdf2e_100%)] text-slate-950 shadow-[0_22px_70px_rgba(37,99,235,0.22)] backdrop-blur-xl md:mx-0 md:rounded-[34px]">
              <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-500/24 md:h-96 md:w-96" />
              <div className="pointer-events-none absolute -right-16 top-0 h-80 w-60 rotate-12 rounded-[70px] bg-yellow-100/42 md:-right-6 md:h-[30rem] md:w-80" />
              <div className="pointer-events-none absolute bottom-10 right-5 h-32 w-52 rotate-12 rounded-[44px] bg-blue-600/26 md:bottom-12 md:right-12 md:h-52 md:w-80" />

              <div className="relative p-4 pb-5 md:p-8 md:pb-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-[22px] bg-white text-lg font-black text-blue-700 shadow-[0_14px_30px_rgba(15,23,42,0.16)] md:h-20 md:w-20 md:rounded-[30px] md:text-2xl">
                        {fotoURL ? (
                          <span
                            aria-hidden="true"
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${fotoURL})` }}
                          />
                        ) : avatarEmoji ? (
                          <span>{avatarEmoji}</span>
                        ) : (
                          <span>{minhasIniciais}</span>
                        )}
                      </div>
                      <span className="absolute -right-1 -top-1 h-5 w-5 rounded-full border-4 border-[#18b8d1] bg-[#ffd91a] md:h-6 md:w-6" />
                    </div>

                    <div className="min-w-0 leading-tight">
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white md:text-xs">
                        Perto de você
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenPerfil(true)}
                        className="mt-0.5 block max-w-[13rem] truncate text-left text-2xl font-black text-white drop-shadow-sm transition hover:opacity-90 md:max-w-none md:text-4xl"
                      >
                        {meuNome || 'Visitante'} ›
                      </button>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 md:gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setTab('corre')
                        setFiltro('meus')
                      }}
                      title="Aceitos"
                      className="grid h-11 w-11 place-items-center rounded-[18px] bg-[#ffd91a] text-lg font-black text-blue-950 shadow-[0_12px_26px_rgba(15,23,42,0.14)] transition hover:scale-[1.03] md:h-14 md:w-14 md:rounded-[22px]"
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenMapaAoVivo(true)}
                      title="Mapa ao vivo"
                      className="grid h-11 w-11 place-items-center rounded-[18px] bg-white/90 text-lg shadow-[0_12px_26px_rgba(15,23,42,0.14)] transition hover:scale-[1.03] md:h-14 md:w-14 md:rounded-[22px]"
                    >
                      🗺️
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('inbox')}
                      title="Notificações e conversas"
                      className="relative grid h-11 w-11 place-items-center rounded-[18px] bg-white/90 text-lg shadow-[0_12px_26px_rgba(15,23,42,0.14)] transition hover:scale-[1.03] md:h-14 md:w-14 md:rounded-[22px]"
                    >
                      🔔
                      {unreadInbox > 0 ? (
                        <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-white">
                          {unreadInbox > 9 ? '9+' : unreadInbox}
                        </span>
                      ) : null}
                    </button>
                  </div>
                </div>

                <div className="mt-5 max-w-3xl md:mt-7">
                  <label className="flex h-14 items-center gap-3 rounded-[24px] bg-white/88 px-5 shadow-[0_18px_38px_rgba(15,23,42,0.12)] backdrop-blur md:h-16 md:rounded-[28px] md:px-6">
                    <span className="text-xl text-blue-600">⌕</span>
                    <input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="buscar trabalho perto"
                      className="min-w-0 flex-1 bg-transparent text-base font-black text-slate-700 outline-none placeholder:text-slate-500 md:text-xl"
                    />
                  </label>
                </div>

                <div className="mt-6 overflow-hidden rounded-[28px] bg-[#ffdf2e]/95 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.18)] md:mt-8 md:rounded-[34px] md:p-8">
                  <div className="grid items-center gap-4 md:grid-cols-[1fr_260px]">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-950/70 md:text-xs">
                        Corre Aqui
                      </div>
                      <div className="mt-2 max-w-xl text-4xl font-black leading-[0.9] text-blue-950 md:text-6xl">
                        Pronto para correr hoje?
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setTab('corre')
                            setFiltro('abertos')
                          }}
                          className="rounded-full bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(37,99,235,0.28)] transition hover:bg-blue-800"
                        >
                          Ver pedidos agora
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenMapaAoVivo(true)}
                          className="rounded-full bg-white/70 px-5 py-3 text-sm font-black text-blue-950 transition hover:bg-white"
                        >
                          Mapa ao vivo
                        </button>
                      </div>
                    </div>

                    <div className="hidden justify-self-end md:block">
                      <div className="grid h-48 w-48 place-items-center rounded-[42px] bg-blue-600/82 shadow-[0_22px_50px_rgba(37,99,235,0.28)]">
                        <div className="grid h-28 w-28 place-items-center rounded-[32px] bg-white/82 text-6xl shadow-inner">
                          ⚡
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {tab === 'inbox' && (
              <div className="mb-3 overflow-hidden rounded-[24px] bg-white border border-slate-200 shadow-[0_14px_44px_rgba(15,23,42,0.12)] md:mb-4 md:rounded-[32px] md:shadow-[0_18px_60px_rgba(15,23,42,0.14)]">
                <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-br from-white to-slate-50">
                  <div className="text-base font-extrabold text-slate-950">💬 Inbox</div>
                  <div className="mt-1 text-xs text-slate-500">Notificações, conversas dos pedidos aceitos e histórico rápido.</div>
                </div>

                <div className="space-y-3 p-3 bg-slate-50">
                  <CentralNotificacoes
                    meuId={meuId}
                    corres={corres}
                    onAbrirChat={abrirChatFocado}
                    onAbrirPedido={abrirPedidoFocado}
                    onToast={showToast}
                  />

                  <ListaConversas
                    meuId={meuId}
                    onAbrirChat={(pedidoId) => {
                      const p = corres.find((x) => x.id === pedidoId)
                      if (p) {
                        abrirChatFocado(p)
                      } else {
                        router.push(`/chat/${encodeURIComponent(String(pedidoId))}?voltar=${modoApp}`)
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

            {tab === 'seguranca' && (
              <div className="mb-4">
                <PainelProblemasDenuncias
                  meuId={meuId}
                  corres={corres}
                  onAbrirChat={abrirChatFocado}
                  onAbrirPedido={abrirPedidoFocado}
                />
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
              enabled={minhasConfiguracoesUi.notificacoes}
              onAbrirChat={abrirChatFocado}
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
          <div className="-mx-2.5 -mt-5 bg-white px-4 pt-4 pb-28 text-slate-950 md:mx-0 md:-mt-6 md:rounded-[36px] md:px-8 md:pt-6 md:pb-10">
            {/* Painel de filtros do Corre */}
            <div className="mb-5 md:mb-8">
              <div>
                <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {[
                    ['🛵', 'Corre rápido'],
                    ['⚡', 'No horário'],
                    ['🛡️', 'Seguro'],
                    ['💬', 'Chat'],
                  ].map(([icon, label]) => (
                    <div
                      key={label}
                      className="flex shrink-0 items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-sm font-black text-slate-950 md:px-4 md:py-2.5 md:text-base"
                    >
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-[#ffd91a] text-base shadow-[0_6px_14px_rgba(245,158,11,0.18)] md:h-8 md:w-8">
                        {icon}
                      </span>
                      {label}
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] md:mt-7 md:grid md:grid-cols-8 md:gap-5 md:overflow-visible md:pb-0 [&::-webkit-scrollbar]:hidden">
                  {[{ id: 'todas', label: 'Todos', emoji: '✨' }, ...(CATEGORIES || []).slice(0, 7)].map((cat) => {
                    const ativo = categoriaFiltro === cat.id
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoriaFiltro(cat.id)}
                        className="group w-[74px] shrink-0 text-center md:w-auto"
                      >
                        <span
                          className={[
                            'mx-auto grid h-16 w-16 place-items-center rounded-[24px] text-3xl shadow-[0_12px_24px_rgba(15,23,42,0.08)] transition group-active:scale-95 md:h-20 md:w-20 md:rounded-[28px] md:text-4xl',
                            ativo
                              ? 'bg-[#ffd91a] text-blue-950 ring-2 ring-blue-500/35'
                              : 'bg-blue-50 text-slate-700 group-hover:bg-blue-100',
                          ].join(' ')}
                        >
                          {cat.emoji}
                        </span>
                        <span className="mt-2 block truncate text-xs font-black text-slate-700 md:text-sm">{cat.label}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-5 grid gap-3 md:mt-7 md:grid-cols-[1fr_260px] md:items-center">
                  <div className="grid grid-cols-3 gap-2 rounded-full bg-slate-100 p-1">
                    {[
                      ['abertos', 'Abertos'],
                      ['meus', 'Aceitos'],
                      ['todos', 'Todos'],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFiltro(id)}
                        className={[
                          'h-10 rounded-full text-xs font-black transition md:h-11 md:text-sm',
                          filtro === id
                            ? 'bg-blue-950 text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)]'
                            : 'text-slate-600 hover:bg-white',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <select
                    value={categoriaFiltro}
                    onChange={(e) => setCategoriaFiltro(e.target.value)}
                    className="h-11 rounded-full border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-blue-500/25 md:h-12"
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

                <div className="mt-5 grid grid-cols-3 gap-3 md:mt-7 md:gap-5">
                  {[
                    ['Abertos', resumoCorre.abertos, 'from-[#ffd91a] to-yellow-200', 'text-blue-950'],
                    ['Aceitos', resumoCorre.meus, 'from-sky-100 to-blue-200', 'text-blue-950'],
                    ['Feitos', resumoCorre.concluidos, 'from-slate-100 to-slate-200', 'text-slate-950'],
                  ].map(([label, value, bg, text]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        if (label === 'Aceitos') setFiltro('meus')
                        else if (label === 'Abertos') setFiltro('abertos')
                        else setFiltro('todos')
                      }}
                      className={`rounded-[24px] bg-gradient-to-br ${bg} p-4 text-left shadow-[0_14px_30px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 md:min-h-[150px] md:rounded-[30px] md:p-6`}
                    >
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 md:text-xs">{label}</div>
                      <div className={`mt-1 text-3xl font-black leading-none ${text} md:text-5xl`}>{value}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* indicador profissional */}
            {isProfissional && (
              <div className="mb-3 rounded-[24px] border border-blue-100 bg-white/95 p-3 text-slate-950 shadow-[0_14px_34px_rgba(15,23,42,0.12)] md:mb-4 md:p-4">
                <div className="flex items-center gap-2 text-sm font-black text-blue-950">
                  <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[#ffd91a]">🧑‍🔧</span>
                  Modo Profissional ativo
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-500">
                  Suas categorias:{' '}
                  <b className="text-slate-900">
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
            <div className="grid grid-cols-1 items-start gap-3 pb-44 md:gap-5 md:pb-28 xl:grid-cols-2 sm:pb-40">
              {!loadingPedidos && !erroPedidos && corresFiltrados.length === 0 && (
                <div className="rounded-[24px] bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">
                  Nenhum trabalho para mostrar agora.
                </div>
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
                      "corre-card-clean relative flex flex-col gap-1.5 overflow-hidden rounded-[22px] bg-white text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.10)]",
                      "border border-slate-100 transition md:gap-2 md:rounded-[26px]",
                      status === 'aberto' ? "shadow-[0_18px_44px_rgba(37,99,235,0.12)]" : "",
                      b.destaque ? "border-fuchsia-300/80 ring-2 ring-fuchsia-300/30 shadow-[0_18px_54px_rgba(217,70,239,0.18)]" : "",
                      b.emergencia ? "border-red-400 ring-2 ring-red-400/55 shadow-[0_20px_64px_rgba(239,68,68,0.26)] animate-pulse" : "",
                    ].join(" ")}
                  >
                    {b.emergencia ? (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-red-500 via-orange-300 to-red-600 shadow-[0_0_36px_rgba(239,68,68,0.95)] animate-pulse" />
                    ) : b.destaque ? (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-fuchsia-500 via-amber-300 to-blue-500 shadow-[0_0_32px_rgba(217,70,239,0.75)]" />
                    ) : status === 'aberto' ? (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-blue-600 via-cyan-300 to-[#ffd91a]" />
                    ) : null}
                    {b.emergencia ? (
                      <div className="pointer-events-none absolute -right-12 -top-12 h-24 w-24 rounded-full bg-red-400/35 blur-2xl animate-pulse md:h-36 md:w-36" />
                    ) : b.destaque ? (
                      <div className="pointer-events-none absolute -right-12 -top-12 h-24 w-24 rounded-full bg-fuchsia-400/30 blur-2xl md:h-36 md:w-36" />
                    ) : status === 'aberto' ? (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-blue-50/95 via-cyan-50/35 to-transparent md:h-20" />
                    ) : null}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-blue-50 via-cyan-50 to-yellow-50 md:h-24" />
                    <div className="relative z-10 flex items-start justify-between gap-2 px-3 pt-3 md:gap-3 md:px-4 md:pt-4">
                      <div className="min-w-0 flex-1">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700 md:gap-2 md:px-2.5 md:py-1 md:text-[10px] md:tracking-[0.16em]">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                          Disponível
                        </div>
                        <div className="mt-1 line-clamp-2 break-words text-base font-black leading-tight text-slate-950 md:mt-1.5 md:text-lg">{p.titulo || '(sem título)'}</div>
                      </div>
                      <div className="flex max-w-[44%] shrink-0 flex-col items-end gap-1 md:max-w-none md:flex-row md:items-center md:gap-2">
                        {b.emergencia ? (
                          <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[9px] font-black text-red-800 shadow-sm animate-pulse md:px-2.5 md:py-1 md:text-[11px]">
                            🚨 URGENTE
                          </span>
                        ) : b.destaque ? (
                          <span className="rounded-full border border-fuchsia-300 bg-fuchsia-100 px-2 py-0.5 text-[9px] font-black text-fuchsia-800 shadow-sm md:px-2.5 md:py-1 md:text-[11px]">
                            🚀 DESTAQUE
                          </span>
                        ) : null}
                        <BadgeStatus status={status} />
                      </div>
                    </div>

                    {/* modo + categoria */}
                    <div className="relative z-10 flex flex-nowrap items-center gap-1.5 overflow-hidden px-3 md:flex-wrap md:gap-2 md:px-4">
                      <BadgeModo modo={p?.modoPedido} />

                      {catObj ? (
                        <span className="min-w-0 truncate rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 md:py-1 md:text-xs">
                          {catObj.emoji} {catObj.label}
                        </span>
                      ) : p?.categoriaId ? (
                        <span className="min-w-0 truncate rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 md:py-1 md:text-xs">
                          🏷️ {String(p.categoriaId)}
                        </span>
                      ) : (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500 md:py-1 md:text-xs">
                          ⚠️ Sem categoria
                        </span>
                      )}

                      {combinaComigo && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-700 md:px-2.5 md:py-1 md:text-xs">
                          ✅ Combina com você
                        </span>
                      )}
                    </div>

                    <div className="relative z-10 mx-3 grid grid-cols-[1fr_auto] items-center gap-2 rounded-[18px] border border-slate-100 bg-slate-50 px-2.5 py-1.5 md:mx-4 md:rounded-[20px] md:px-3 md:py-2">
                      <div className="min-w-0 text-[10px] font-black uppercase tracking-wide md:text-xs">
                        {b.emergencia ? (
                          <span className="text-red-700">🚨 Resposta rápida</span>
                        ) : b.destaque ? (
                          <span className="text-fuchsia-700">🚀 Mais visibilidade</span>
                        ) : (
                          <span className="text-blue-800">⚡ Disponível agora</span>
                        )}
                      </div>
                      {p.valor != null && Number.isFinite(Number(p.valor)) ? (
                        <div className="shrink-0 rounded-[14px] border border-yellow-300 bg-[#ffd91a] px-2.5 py-1 text-sm font-black text-blue-950 shadow-[0_8px_18px_rgba(250,204,21,0.22)] md:px-4 md:text-base">
                          R$ {Number(p.valor).toFixed(2)}
                        </div>
                      ) : (
                        <div className="shrink-0 rounded-[14px] border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-800 md:px-4 md:text-xs">
                          combinar
                        </div>
                      )}
                    </div>

                    <div className="relative z-10 mx-3 flex items-center gap-2 rounded-[16px] border border-sky-100 bg-blue-50 px-2.5 py-1.5 text-[11px] text-slate-700 md:mx-4 md:rounded-[18px] md:px-3 md:py-2 md:text-xs">
                      <span className="shrink-0 font-black uppercase tracking-[0.12em] text-sky-700">Passo</span>
                      <span className="line-clamp-1 min-w-0 font-semibold">{getProximoPassoPedido(p, meuId)}</span>
                    </div>

                    <StatusFluxoServico pedido={p} compact className={`relative z-10 mx-3 md:mx-4 ${cardAberto ? '' : 'hidden'}`} />

                    {cardAberto && (
                      <>
                    {p.descricao && String(p.descricao).trim().toLowerCase() !== String(p.titulo || '').trim().toLowerCase() && (
                      <div className="relative z-10 mx-3 rounded-2xl bg-slate-50/90 border border-slate-200/80 px-2.5 md:mx-4 md:px-3 py-2 text-xs md:text-sm text-slate-700 leading-relaxed select-none">
                        {p.descricao}
                      </div>
                    )}

                    <div className="relative z-10 mx-3 grid grid-cols-2 gap-1.5 md:mx-4 md:gap-2">
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
                      <div className="relative z-10 mx-3 rounded-2xl bg-red-50 border border-red-300 px-2.5 md:mx-4 md:px-3 py-2 text-[11px] md:text-[12px] text-red-800 font-black shadow-sm">
                        🚨 Emergência: cliente pediu resposta rápida. Prioridade máxima na lista dos corres.
                      </div>
                    ) : b.destaque ? (
                      <div className="relative z-10 mx-3 rounded-2xl bg-fuchsia-50 border border-fuchsia-300 px-2.5 md:mx-4 md:px-3 py-2 text-[11px] md:text-[12px] text-fuchsia-800 font-black shadow-sm">
                        🚀 Pedido destacado: mais visibilidade para quem está disponível agora.
                      </div>
                    ) : null}

                    {/* taxa removida / incentivo ao profissional */}
                    <div className="relative z-10 mx-3 rounded-2xl bg-emerald-500/10 border border-emerald-300/50 px-2.5 md:mx-4 md:px-3 py-2 text-[11px] md:text-[12px] text-emerald-800 font-black shadow-sm">
                      ✅ Sem taxa do app: <b>100% do valor fica com quem faz o serviço</b>
                    </div>

                    {/* patentes do criador */}
                    <div className="relative z-10 mx-3 flex gap-2 flex-wrap md:mx-4">
                      <Patente tipo="corre" nivel={patenteCriadorCorre} size="sm" showLabel={false} />
                      {patenteCriadorProf > 0 && <Patente tipo="prof" nivel={patenteCriadorProf} size="sm" />}
                    </div>

                      </>
                    )}

                    <div className="relative z-10 mt-1 grid grid-cols-4 gap-1.5 border-t border-slate-100 bg-white p-2 md:flex md:flex-wrap md:gap-2 md:p-3">
                      <button
                        className="flex min-h-[38px] items-center justify-center rounded-[16px] border border-slate-200 bg-white px-2 py-2 text-[11px] font-black text-blue-950 shadow-sm transition hover:bg-blue-50 md:min-h-[38px] md:px-4 md:text-sm"
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
                          📍 <span className="md:hidden">Mapa</span><span className="hidden md:inline">Ver no mapa</span>
                        </button>
                      )}

                      <button className={btnDark} onClick={() => abrirChatFocado(p)} type="button">
                        💬 Chat
                      </button>

                      {(status === 'aceito' || status === 'concluido') && (souCriador(p) || souAceitador(p)) && (
                        <button
                          className="col-span-2 min-h-[38px] rounded-[16px] border border-red-200 bg-white px-2 py-2 text-[11px] font-black text-red-700 shadow-sm transition hover:bg-red-50 md:col-span-1 md:px-3 md:text-xs"
                          onClick={() => abrirProblema(p)}
                          type="button"
                        >
                          Problema
                        </button>
                      )}

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
                          className={`${btnDanger} col-span-2 disabled:opacity-60 md:col-span-1`}
                          onClick={() => cancelarAceite(p)}
                          disabled={cancelandoId === p.id}
                          type="button"
                        >
                          {cancelandoId === p.id ? 'Cancelando…' : 'Cancelar'}
                        </button>
                      )}

                      {status === 'aceito' && souCriador(p) && (
                        <button
                          className="col-span-2 min-h-[38px] rounded-[16px] bg-emerald-600 px-2 py-2 text-[11px] font-black text-white shadow-md shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:opacity-60 md:col-span-1 md:px-3 md:text-xs"
                          onClick={() => abrirConclusao(p)}
                          disabled={serviçondoId === p.id}
                          type="button"
                        >
                          {serviçondoId === p.id ? 'Confirmando…' : 'Concluir'}
                        </button>
                      )}

                      {status === 'concluido' && souCriador(p) && !p?.avaliacao ? (
                        <button
                          className="min-h-[38px] rounded-[16px] bg-amber-500 px-2 py-2 text-[11px] font-black text-slate-950 shadow-md shadow-amber-500/20 transition hover:bg-amber-600 md:px-3 md:text-xs"
                          onClick={() => abrirAvaliacao(p)}
                          type="button"
                        >
                          Avaliar
                        </button>
                      ) : null}

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
                          planoAtual={meuUserNode?.plano || 'free'}
                          mostrarAnuncio={false}
                          onToast={showToast}
                        />
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </div>
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
            limitOnlineMarkers={minhasConfiguracoesMapa.limiteOnline}
            myUid={meuId}
            mapSettings={minhasConfiguracoesMapa}
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
              limitOnlineMarkers={minhasConfiguracoesMapa.limiteOnline}
              myUid={meuId}
              mapSettings={minhasConfiguracoesMapa}
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
                  planoAtual={meuUserNode?.plano || 'free'}
                  mostrarAnuncio={false}
                  onToast={showToast}
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

      {usuarioSelecionado && (
        <PerfilPublico
          user={usuarioSelecionado}
          onClose={() => setUsuarioSelecionado(null)}
          onPedirServico={() => {
            setUsuarioSelecionado(null)
            setOpenIA(true)
          }}
          onAgendar={(u) => {
            setUsuarioSelecionado(null)
            setAgendaClienteUser(u)
          }}
        />
      )}

      {/* ✅ BARRA INFERIOR REAL DO CLIENTE
          Pedidos e Conversas não ficam mais como caixa no meio.
          A barra fica fixa embaixo e cada opção abre uma tela própria com rolagem. */}
      


      {modoApp === 'cliente' && !isMapOpen && (
        <div
          className={[
            'fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.45rem)] z-[99980] px-3 pointer-events-none transition-all duration-300 ease-out will-change-transform md:inset-x-auto md:right-6 md:bottom-6 md:px-0',
            bottomBarsHidden ? 'translate-y-[135%] opacity-0' : 'translate-y-0 opacity-100',
          ].join(' ')}
        >
          <div className="pointer-events-auto mx-auto flex h-[70px] w-full max-w-[390px] items-center justify-between rounded-full border border-slate-200 bg-white px-3 text-slate-950 shadow-[0_18px_58px_rgba(15,23,42,0.24)] backdrop-blur-xl md:max-w-[430px] md:border-white/10 md:bg-slate-950/92 md:px-4 md:text-white">
            <button
              type="button"
              onClick={() => setClientePainelBaixo('meusPedidos')}
              title="Pedidos"
              className={[
                'relative flex h-12 w-12 flex-col items-center justify-center rounded-2xl text-[10px] font-black transition-all duration-200 active:scale-[0.96] md:h-12 md:w-16',
                clientePainelBaixo === 'meusPedidos'
                  ? 'bg-slate-950 text-white md:bg-white md:text-slate-950'
                  : 'text-slate-700 hover:bg-slate-100 md:text-slate-300 md:hover:bg-white/[0.1] md:hover:text-white',
              ].join(' ')}
            >
              <span className="text-xl leading-none">📦</span>
              <span className="mt-0.5 hidden min-[360px]:block">Pedidos</span>
            </button>

            <button
              type="button"
              onClick={() => setClientePainelBaixo('conversas')}
              title="Conversas"
              className={[
                'relative flex h-12 w-12 flex-col items-center justify-center rounded-2xl text-[10px] font-black transition-all duration-200 active:scale-[0.96] md:h-12 md:w-16',
                clientePainelBaixo === 'conversas'
                  ? 'bg-slate-950 text-white md:bg-white md:text-slate-950'
                  : 'text-slate-700 hover:bg-slate-100 md:text-slate-300 md:hover:bg-white/[0.1] md:hover:text-white',
              ].join(' ')}
            >
              <span className="text-xl leading-none">💬</span>
              <span className="mt-0.5 hidden min-[360px]:block">Chat</span>
            </button>

            <button
              type="button"
              onClick={() => setOpenIA(true)}
              title="Criar pedido"
              className="-mt-9 grid h-[74px] w-[74px] shrink-0 place-items-center rounded-full border-[6px] border-white bg-[linear-gradient(135deg,#0b73ff_0%,#18bfd2_48%,#ffd91a_100%)] text-white shadow-[0_18px_38px_rgba(37,99,235,0.28)] transition active:scale-[0.96] md:-mt-8 md:border-slate-950"
            >
              <span className="flex flex-col items-center leading-none">
                <span className="text-2xl">⚡</span>
                <span className="mt-1 text-[10px] font-black">Criar</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setClientePainelBaixo('notificacoes')}
              title="Avisos"
              className={[
                'relative flex h-12 w-12 flex-col items-center justify-center rounded-2xl text-[10px] font-black transition-all duration-200 active:scale-[0.96] md:h-12 md:w-16',
                clientePainelBaixo === 'notificacoes'
                  ? 'bg-slate-950 text-white md:bg-white md:text-slate-950'
                  : 'text-slate-700 hover:bg-slate-100 md:text-slate-300 md:hover:bg-white/[0.1] md:hover:text-white',
              ].join(' ')}
            >
              <span className="text-xl leading-none">🔔</span>
              <span className="mt-0.5 hidden min-[360px]:block">Avisos</span>
            </button>

            <button
              type="button"
              onClick={() => setClientePainelBaixo('seguranca')}
              title="Segurança"
              className={[
                'relative flex h-12 w-12 flex-col items-center justify-center rounded-2xl text-[10px] font-black transition-all duration-200 active:scale-[0.96] md:h-12 md:w-16',
                clientePainelBaixo === 'seguranca'
                  ? 'bg-slate-950 text-white md:bg-white md:text-slate-950'
                  : 'text-slate-700 hover:bg-slate-100 md:text-slate-300 md:hover:bg-white/[0.1] md:hover:text-white',
              ].join(' ')}
            >
              <span className="text-xl leading-none">🛡️</span>
              <span className="mt-0.5 hidden min-[360px]:block">Seguro</span>
            </button>
          </div>
        </div>
      )}

      {modoApp === 'cliente' && clientePainelBaixo && (
        <div className="fixed inset-0 z-[99990] bg-[#0f172a] flex justify-center">
          <div className="w-full max-w-[900px] h-[100dvh] bg-[#0f172a] text-white shadow-[0_0_40px_rgba(0,0,0,0.45)] flex flex-col">
            <div className="shrink-0 px-3 pt-3 pb-2.5 bg-[#111827] border-b border-slate-700 shadow-md md:px-4 md:pt-4 md:pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-300 md:text-xs md:tracking-[0.18em]">
                    Corre Aqui
                  </div>
                  <div className="mt-0.5 truncate text-lg font-black text-white md:mt-1 md:text-xl">
                    {clientePainelBaixo === 'meusPedidos'
                      ? 'Histórico de serviços'
                      : clientePainelBaixo === 'chat'
                        ? '💬 Conversa'
                        : clientePainelBaixo === 'notificacoes'
                          ? '🔔 Notificações'
                          : clientePainelBaixo === 'seguranca'
                            ? '🛡️ Segurança'
                            : '💬 Caixa de conversas'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setClientePainelBaixo('')
                    if (clientePainelBaixo === 'chat') setChatPedido(null)
                  }}
                  className="h-9 w-9 rounded-xl bg-[#1e293b] hover:bg-[#263449] text-white font-black border border-slate-700 md:h-11 md:w-11 md:rounded-2xl"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain bg-[#0f172a] p-2.5 pb-24 md:p-5 md:pb-28">
              {clientePainelBaixo === 'meusPedidos' && (
                <MeusPedidosCliente
                  meuId={meuId}
                  corres={corres}
                  onAbrirChat={abrirChatFocado}
                  onVerMapa={(pedido) => {
                    setMapItem(pedido)
                  }}
                  onConfirmarServicoFeito={(pedido) => {
                    abrirConclusao(pedido)
                  }}
                  onProblemaServico={abrirProblema}
                  onAvaliarServico={abrirAvaliacao}
                  onToast={showToast}
                />
              )}

              {clientePainelBaixo === 'conversas' && (
                <div className="overflow-hidden rounded-[20px] bg-[#0f172a] border border-slate-700 shadow-lg text-white md:rounded-[28px]">
                  <ListaConversas
                    meuId={meuId}
                    onAbrirChat={(pedidoId) => {
                      const p = corres.find((x) => x.id === pedidoId)

                      if (p) {
                        abrirChatFocado(p)
                      } else {
                        router.push(`/chat/${encodeURIComponent(String(pedidoId))}?voltar=${modoApp}`)
                      }
                    }}
                  />
                </div>
              )}

              {clientePainelBaixo === 'notificacoes' && (
                <CentralNotificacoes
                  meuId={meuId}
                  corres={corres}
                  onAbrirChat={abrirChatFocado}
                  onAbrirPedido={abrirPedidoFocado}
                  onToast={showToast}
                />
              )}

              {clientePainelBaixo === 'seguranca' && (
                <PainelProblemasDenuncias
                  meuId={meuId}
                  corres={corres}
                  onAbrirChat={abrirChatFocado}
                  onAbrirPedido={abrirPedidoFocado}
                />
              )}

              {clientePainelBaixo === 'chat' && chatPedido && (
                <div className="overflow-hidden rounded-[20px] bg-[#0f172a] border border-slate-700 shadow-lg text-white md:rounded-[28px]">
                  <div className="border-b border-slate-700 bg-[#111827] px-3 py-2.5 md:px-4 md:py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-300 md:text-xs md:tracking-[0.16em]">Chat do pedido</div>
                        <div className="mt-0.5 truncate text-sm font-black text-white md:mt-1 md:text-base">{chatPedido?.titulo || 'Corre aqui'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setChatPedido(null)
                          setClientePainelBaixo('conversas')
                        }}
                        className="rounded-xl bg-[#1e293b] px-3 py-1.5 text-xs font-black text-white border border-slate-700 hover:bg-[#263449] md:rounded-2xl md:py-2"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>

                  <div className="p-2 md:p-3">
                    <ChatMensagens
                      pedidoId={chatPedido.id}
                      meuId={meuId}
                      meuNome={meuNome}
                      pedidoTitulo={chatPedido.titulo || 'Corre aqui'}
                      outroUser={getOutroUser(chatPedido)}
                      planoAtual={meuUserNode?.plano || 'free'}
                      mostrarAnuncio={false}
                      onToast={showToast}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {conclusaoPedido ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 md:p-4">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-lg rounded-[20px] border border-white/10 bg-[#07111f] p-3 text-white shadow-[0_28px_95px_rgba(0,0,0,0.62)] md:rounded-[30px] md:p-5 md:shadow-[0_30px_120px_rgba(0,0,0,0.65)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">
                  Conclusão do serviço
                </div>
                <h2 className="mt-1 text-lg font-black md:text-2xl">Está tudo certo?</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300 md:mt-2 md:text-sm">
                  Confirme somente depois que o combinado foi entregue. Depois disso você poderá avaliar quem fez o serviço.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConclusaoPedido(null)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/10 font-black hover:bg-white/15 md:h-11 md:w-11 md:rounded-2xl"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:mt-5 md:rounded-3xl md:p-4">
              <div className="text-sm font-black text-white">{conclusaoPedido?.titulo || 'Serviço'}</div>
              <div className="mt-1 text-xs text-slate-400">
                {conclusaoPedido?.aceite?.nome ? `Feito por ${conclusaoPedido.aceite.nome}` : 'Aguardando dados de quem aceitou'}
              </div>
            </div>

            <StatusFluxoServico pedido={conclusaoPedido} tone="dark" className="mt-3 md:mt-4" />

            <div className="mt-3 grid gap-2 md:mt-5 md:gap-3">
              <button
                type="button"
                disabled={serviçondoId === conclusaoPedido.id}
                onClick={() => marcarConcluído(conclusaoPedido)}
                className="w-full rounded-2xl bg-emerald-600 px-3 py-2.5 text-sm font-black text-white shadow-[0_14px_44px_rgba(16,185,129,0.2)] hover:bg-emerald-500 disabled:opacity-60 md:rounded-3xl md:px-4 md:py-4 md:text-base md:shadow-[0_18px_60px_rgba(16,185,129,0.24)]"
              >
                {serviçondoId === conclusaoPedido.id ? 'Confirmando...' : 'Confirmar serviço feito'}
              </button>
              <button
                type="button"
                onClick={() => {
                  abrirProblema(conclusaoPedido)
                  setConclusaoPedido(null)
                }}
                className="w-full rounded-2xl border border-red-400/25 bg-red-500/12 px-3 py-2.5 text-sm font-black text-red-100 hover:bg-red-500/18 md:rounded-3xl md:px-4 md:py-4 md:text-base"
              >
                Problema com serviço
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}

      {avaliacaoPedido ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 md:p-4">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-lg rounded-[20px] border border-white/10 bg-[#07111f] p-3 text-white shadow-[0_28px_95px_rgba(0,0,0,0.62)] md:rounded-[30px] md:p-5 md:shadow-[0_30px_120px_rgba(0,0,0,0.65)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-300">
                  Avaliação pós-serviço
                </div>
                <h2 className="mt-1 text-lg font-black md:text-2xl">Como foi a experiência?</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300 md:mt-2 md:text-sm">
                  Sua avaliação fica ligada ao histórico do serviço e ajuda a comunidade a confiar em bons perfis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAvaliacaoPedido(null)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/10 font-black hover:bg-white/15 md:h-11 md:w-11 md:rounded-2xl"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <StatusFluxoServico
              pedido={{ ...avaliacaoPedido, status: 'concluido' }}
              tone="dark"
              className="mt-4 md:mt-5"
            />

            <div className="mt-3 flex justify-center gap-1.5 md:mt-5 md:gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAvaliacaoNota(n)}
                  className={[
                    'grid h-10 w-10 place-items-center rounded-xl border text-xl transition md:h-12 md:w-12 md:rounded-2xl md:text-2xl',
                    n <= avaliacaoNota
                      ? 'border-amber-300 bg-amber-400 text-slate-950 shadow-[0_0_28px_rgba(251,191,36,0.28)]'
                      : 'border-white/10 bg-white/[0.06] text-slate-500 hover:bg-white/10',
                  ].join(' ')}
                  aria-label={`${n} estrela${n === 1 ? '' : 's'}`}
                >
                  ★
                </button>
              ))}
            </div>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-300 md:mt-5">
              Comentário opcional
              <textarea
                value={avaliacaoComentario}
                onChange={(e) => setAvaliacaoComentario(e.target.value)}
                maxLength={500}
                placeholder="Ex: chegou no horário, resolveu bem e combinou tudo pelo chat."
                className="mt-2 min-h-[86px] w-full resize-y rounded-2xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 md:min-h-[110px] md:rounded-3xl md:px-4 md:py-3"
              />
            </label>

            <button
              type="button"
              disabled={salvandoAvaliacao}
              onClick={salvarAvaliacaoServico}
              className="mt-3 w-full rounded-2xl bg-amber-400 px-3 py-2.5 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-60 md:mt-5 md:rounded-3xl md:px-4 md:py-4 md:text-base"
            >
              {salvandoAvaliacao ? 'Enviando...' : 'Enviar avaliação'}
            </button>
          </motion.div>
        </div>
      ) : null}

      {problemaPedido ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 md:p-4">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-lg rounded-[20px] border border-white/10 bg-[#07111f] p-3 text-white shadow-[0_28px_95px_rgba(0,0,0,0.62)] md:rounded-[30px] md:p-5 md:shadow-[0_30px_120px_rgba(0,0,0,0.65)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-red-300">
                  Segurança do serviço
                </div>
                <h2 className="mt-1 text-lg font-black md:text-2xl">Problema com serviço</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300 md:mt-2 md:text-sm">
                  Registre o que aconteceu. Casos de conduta inadequada ou segurança também ficam salvos como denúncia.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProblemaPedido(null)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/10 font-black hover:bg-white/15 md:h-11 md:w-11 md:rounded-2xl"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="mt-3 grid gap-1.5 md:mt-5 md:gap-2">
              {[
                ['servico_nao_resolvido', 'Serviço não resolvido'],
                ['valor_combinado', 'Valor ou combinado'],
                ['atraso_cancelamento', 'Atraso ou cancelamento'],
                ['conduta_inadequada', 'Conduta inadequada'],
                ['seguranca_golpe', 'Segurança ou golpe'],
                ['outro', 'Outro'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setProblemaTipo(id)}
                  className={[
                    'rounded-xl border px-3 py-2.5 text-left text-xs font-black transition md:rounded-2xl md:px-4 md:py-3 md:text-sm',
                    problemaTipo === id
                      ? 'border-red-300 bg-red-500/18 text-red-100'
                      : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-300 md:mt-5">
              Conte o que aconteceu
              <textarea
                value={problemaDescricao}
                onChange={(e) => setProblemaDescricao(e.target.value)}
                maxLength={800}
                placeholder="Descreva o problema com clareza para ficar registrado no histórico."
                className="mt-2 min-h-[92px] w-full resize-y rounded-2xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 md:min-h-[120px] md:rounded-3xl md:px-4 md:py-3"
              />
            </label>

            <button
              type="button"
              disabled={salvandoProblema}
              onClick={registrarProblemaServico}
              className="mt-3 w-full rounded-2xl bg-red-600 px-3 py-2.5 text-sm font-black text-white hover:bg-red-500 disabled:opacity-60 md:mt-5 md:rounded-3xl md:px-4 md:py-4 md:text-base"
            >
              {salvandoProblema ? 'Registrando...' : 'Registrar problema'}
            </button>
          </motion.div>
        </div>
      ) : null}

      {/* ✅ ClienteHome agora controla Corre/Profissionais e mostra a lista rica direto no centro.
          Removido bloco duplicado de busca/filtros e qualquer botão flutuante extra. */}

      <XpToast
        open={showXpToast}
        xp={xpToastInfo.xp}
        texto={xpToastInfo.texto}
      />

      <PatenteUpModal
        open={!!patenteUp}
        patente={patenteUp?.patente}
        tipo={patenteUp?.tipo}
        nivel={patenteUp?.nivel}
        animado={minhasConfiguracoesUi.animacoes}
        onClose={() => setPatenteUp(null)}
      />

      <PerfilDrawer open={openPerfil} onClose={() => setOpenPerfil(false)} uid={meuId} />

      <ModalAgenda
        open={!!agendaClienteUser}
        profissional={agendaClienteUser}
        onClose={() => setAgendaClienteUser(null)}
      />

      {modoApp === 'corre' && (
        <BottomBar
          active={tab}
          onTab={onBottomTab}
          unreadCount={unreadInbox}
          agendaCount={agendaPendentes}
          agendaConfirmados={agendaConfirmados}
          agendaRecusados={agendaRecusados}
          problemasCount={problemasVisiveisCount}
          modoApp={modoApp}
          hidden={isMapOpen}
          disponivel={correDisponivel}
          collapsed={bottomBarsHidden}
        />
      )}
    </div>
  )
}
