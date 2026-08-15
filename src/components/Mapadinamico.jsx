'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'

import { auth, database } from '@/lib/firebase'
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
  get,
  query,
  limitToLast,
  runTransaction,
} from '@/lib/firebaseDebug'
import { getOnlineTimestamp, getUserOnlinePreference, isOnlineRecente, setUserOnlinePreference, splitUsuariosOnline } from '@/lib/presence'
import { createPrivateRequest, notifyPublicRequestAccepted, reconcilePrivateRequestInbox } from '@/lib/privateRequests'
import { ATENDIMENTO_STATUS, normalizeAtendimentoStatus, transitionAtendimento } from '@/lib/atendimento'
import { contabilizarAtendimentoFinalizado } from '@/lib/atendimentoRewards'
import { TUTORIAL_ACTIONS, TUTORIAL_EVENTS } from '@/lib/tutorial/tutorialConfig'
import { CONTEXTUAL_TIP_IDS } from '@/lib/tutorial/contextualTipsConfig'
import { showCorreAquiTipOnce } from '@/components/tutorial/TutorialProvider'
import { createEventNotificationId } from '@/lib/eventNotifications'
import { REQUEST_BOOST_PRODUCT_ID } from '@/lib/commercialProducts'
import { canAppearInPublicDirectory, mergePublicProfileWithPresence } from '@/lib/publicWorkProfile'

import PerfilDrawer from '@/components/PerfilDrawer'
import ModalIA from './ModalIA'
import ModalAgenda from './ModalAgenda'
import ChatMensagens from './ChatMensagens'
import ListaConversas from './ListaConversas'
import MeusPedidosCliente from '@/components/MeusPedidosCliente'
import AgendaProfissional from '@/components/AgendaProfissional'
import CentralNotificacoes from '@/components/CentralNotificacoes'
import PainelProblemasDenuncias from '@/components/PainelProblemasDenuncias'
import StatusFluxoServico from '@/components/StatusFluxoServico'
import LogoCorreAqui from '@/components/LogoCorreAqui'

// ✅ NOVOS COMPONENTES
import BottomBar from '@/components/BottomBar'

import ClienteHome from '@/components/ClienteHome'
import ListaProfissionais from '@/components/ListaProfissionais'
import PerfilPublico from '@/components/PerfilPublico'

// ✅ CATEGORIAS
import { CATEGORIES, categoryMatches, getCanonicalCategoryId, getCategoryById } from '@/constants/categories'

const MapinhaModal = dynamic(() => import('./MapinhaModal'), { ssr: false })
const COMMERCIAL_HIGHLIGHTS_UI_ENABLED = false

/* =======================
   Helpers
======================= */
const toNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const isFotoValor = (v) => /^(https?:\/\/|data:image\/|blob:|\/)/i.test(String(v || '').trim())

const pickFoto = (...vals) => vals.map((v) => String(v || '').trim()).find(isFotoValor) || ''

const safeText = (v) => String(v || '').trim()

const compactCategoryLabel = (label, max = 12) => {
  const text = String(label || '').trim()
  if (!text || text.length <= max) return text
  return `${text.slice(0, max).trim()}...`
}

const DEBUG_PRESENCE =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEBUG_PRESENCE === 'true'
const DEBUG_NAV_PERF = process.env.NODE_ENV !== 'production'
const LIST_STATE_PREFIX = 'correAqui:listState:v2'
const LIST_RETURN_FLAG = 'correAqui:returningToList'
const PEDIDOS_PAGE_SIZE = 10
const PEDIDO_NOVO_MS = 24 * 60 * 60 * 1000
const PEDIDO_RECENTE_MS = 3 * 24 * 60 * 60 * 1000
const PEDIDO_ANTIGO_MS = 7 * 24 * 60 * 60 * 1000
let pedidosCache = []
let pedidosCacheReady = false

function debugPresence(message, data = {}) {
  if (!DEBUG_PRESENCE) return
  console.log(`[PRESENCE] ${message}`, data)
}

function CorreHeroSpeedIcon({ className = '' }) {
  return (
    <div className={`relative h-28 w-28 md:h-48 md:w-48 ${className}`} aria-hidden="true">
      <div className="absolute -right-[7%] -top-[8%] h-[88%] w-[88%] rounded-[28%] bg-[#ffd91a] opacity-95 shadow-[0_22px_42px_rgba(245,158,11,0.24)]" />
      <div className="relative h-full w-full overflow-hidden rounded-[26%] bg-[linear-gradient(135deg,#0b5fff_0%,#0fb8c5_54%,#ffe33f_116%)] shadow-[0_24px_54px_rgba(37,99,235,0.28)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_20%,rgba(255,255,255,0.22),transparent_22%),radial-gradient(circle_at_82%_86%,rgba(255,217,26,0.34),transparent_38%)]" />
        <div
          className="absolute -bottom-[18%] left-[-8%] h-[58%] w-[135%] -rotate-[10deg] opacity-45"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.30) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.30) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        />
        <div className="absolute left-[18%] top-[37%] grid gap-1.5 md:gap-2.5">
          <span className="block h-2 w-10 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.45)] md:h-3 md:w-16" />
          <span className="block h-2 w-7 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.45)] md:h-3 md:w-11" />
          <span className="block h-2 w-10 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.45)] md:h-3 md:w-16" />
        </div>
        <svg
          viewBox="0 0 120 120"
          className="absolute right-[14%] top-[17%] h-[68%] w-[48%] drop-shadow-[0_12px_18px_rgba(15,23,42,0.22)]"
          role="img"
          aria-label="Corre rapido"
        >
          <path
            d="M68 4 22 67h32l-9 49 52-70H65L68 4Z"
            fill="#ffd91a"
            stroke="#fff"
            strokeLinejoin="round"
            strokeWidth="8"
          />
        </svg>
      </div>
    </div>
  )
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
    if (!navigator.geolocation) {
      debugPresence('localizacao negada/indisponivel', { motivo: 'geolocation indisponivel' })
      return resolve(null)
    }

    try {
      navigator.permissions?.query?.({ name: 'geolocation' }).then((permission) => {
        debugPresence('localizacao permissao', { state: permission?.state || 'desconhecido' })
      }).catch(() => {})
    } catch {}

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        debugPresence('localizacao permitida', {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
      },
      (error) => {
        debugPresence('localizacao negada', {
          code: error?.code || null,
          message: error?.message || 'sem detalhe',
        })
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  })
}

/* =======================
   Destaque temporário de pedidos
======================= */
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

const boostInfo = (p) => {
  const lvl = Number(p?.boost?.level || 0)
  const cfg = BOOST_LEVELS[lvl]
  const until = Number(p?.boost?.until || 0)
  const ativo = until > nowMs()
  const emergencia = isPedidoEmergencia(p) && ativo
  const destaque = !emergencia && isPedidoDestaque(p) && ativo
  return { lvl, cfg, until, ativo, emergencia, destaque }
}

const PEDIDO_ATIVO_STATUSES = [
  ATENDIMENTO_STATUS.ACEITO,
  ATENDIMENTO_STATUS.EM_ANDAMENTO,
  ATENDIMENTO_STATUS.CHEGOU,
  ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO,
  'aguardando_inicio',
  'em_atendimento',
]
const isPedidoAtivoStatus = (status) => PEDIDO_ATIVO_STATUSES.includes(normalizeAtendimentoStatus(status))

const getProximoPassoPedido = (p, meuId) => {
  const status = normalizeAtendimentoStatus(p?.status)
  const souCliente = !!meuId && String(p?.criador?.id || '') === String(meuId)
  const souAceitador = !!meuId && String(p?.aceite?.id || '') === String(meuId)

  if (status === ATENDIMENTO_STATUS.ACEITO && souCliente) return 'O profissional aceitou. Aguarde o inicio do atendimento.'
  if (status === ATENDIMENTO_STATUS.ACEITO && souAceitador) return 'Confira os detalhes e toque em Iniciar atendimento.'
  if (status === ATENDIMENTO_STATUS.EM_ANDAMENTO && souCliente) return 'O profissional esta a caminho.'
  if (status === ATENDIMENTO_STATUS.EM_ANDAMENTO && souAceitador) return 'Quando chegar, informe ao cliente pelo botao de chegada.'
  if (status === ATENDIMENTO_STATUS.CHEGOU && souCliente) return 'O profissional informou que chegou ao local.'
  if (status === ATENDIMENTO_STATUS.CHEGOU && souAceitador) return 'Solicite a finalizacao quando concluir o servico.'
  if (status === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO && souCliente) return 'Confirme a conclusao para finalizar o atendimento.'
  if (status === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO && souAceitador) return 'Aguardando a confirmacao do cliente.'
  if (status === ATENDIMENTO_STATUS.FINALIZADO && !p?.avaliacao && souCliente) return 'Avalie o servico para fechar o ciclo.'
  if (status === ATENDIMENTO_STATUS.FINALIZADO && !p?.avaliacao && souAceitador) return 'Servico confirmado. Aguardando avaliacao do cliente.'
  if (status === ATENDIMENTO_STATUS.FINALIZADO) return 'Servico finalizado e avaliado.'

  if (p?.problemaServico) return 'Problema registrado. Acompanhe pelo chat até resolver.'
  if (status === 'aberto') return 'Aguardando alguém aceitar.'
  if (status === 'aguardando_inicio' && souCliente) return 'O profissional aceitou. Aguarde o início do atendimento.'
  if (status === 'aguardando_inicio' && souAceitador) return 'Confira os detalhes e toque em Iniciar atendimento.'
  if (status === 'em_atendimento' && souCliente) return 'Atendimento em andamento. Combine tudo pelo chat.'
  if (status === 'em_atendimento' && souAceitador) return 'Atendimento em andamento. Use o chat como central.'
  if (isPedidoAtivoStatus(status) && souCliente) return 'Combine no chat e confirme quando o serviço terminar.'
  if (isPedidoAtivoStatus(status) && souAceitador) return 'Combine no chat e aguarde o cliente confirmar a conclusão.'
  if (isPedidoAtivoStatus(status)) return 'Serviço em andamento.'
  if (status === 'concluido' && !p?.avaliacao && souCliente) return 'Avalie o serviço para fechar o ciclo.'
  if (status === 'concluido' && !p?.avaliacao && souAceitador) return 'Serviço confirmado. Aguardando avaliação do cliente.'
  if (status === 'concluido') return 'Serviço finalizado e avaliado.'
  if (status === 'cancelado') return 'Pedido cancelado.'
  return 'Acompanhe os próximos passos pelo chat.'
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

const getPedidoTimeInfo = (pedido) => {
  const reactivatedAt = getMs(
    pedido?.reactivatedAt ||
    pedido?.reativadoEm ||
    pedido?.reativadoAt ||
    pedido?.reactivated_at
  )
  const createdAt = getMs(
    pedido?.criadoEm ||
    pedido?.createdAt ||
    pedido?.criadoEmMs ||
    pedido?.created_at ||
    pedido?.atualizadoEm ||
    pedido?.updatedAt
  )
  const timestamp = reactivatedAt || createdAt

  return {
    timestamp,
    reactivatedAt,
    createdAt,
    hasValidDate: timestamp > 0,
    isReactivated: reactivatedAt > 0,
  }
}

const getRequestFreshness = (pedido, serverNow = Date.now()) => {
  const now = Number(serverNow || Date.now())
  const timeInfo = getPedidoTimeInfo(pedido)

  if (!timeInfo.hasValidDate) {
    return {
      status: 'sem_data',
      label: 'Sem data',
      ageMs: null,
      timestamp: 0,
      visibleInPublicList: true,
      isReactivated: false,
    }
  }

  const ageMs = Math.max(0, now - timeInfo.timestamp)
  if (ageMs <= PEDIDO_NOVO_MS) {
    return {
      status: 'novo',
      label: 'Novo',
      ageMs,
      timestamp: timeInfo.timestamp,
      visibleInPublicList: true,
      isReactivated: timeInfo.isReactivated,
    }
  }

  if (ageMs <= PEDIDO_RECENTE_MS) {
    return {
      status: 'recente',
      label: 'Recente',
      ageMs,
      timestamp: timeInfo.timestamp,
      visibleInPublicList: true,
      isReactivated: timeInfo.isReactivated,
    }
  }

  if (ageMs <= PEDIDO_ANTIGO_MS) {
    return {
      status: 'antigo',
      label: 'Antigo',
      ageMs,
      timestamp: timeInfo.timestamp,
      visibleInPublicList: true,
      isReactivated: timeInfo.isReactivated,
    }
  }

  return {
    status: 'potencialmente_expirado',
    label: 'Expirado',
    ageMs,
    timestamp: timeInfo.timestamp,
    visibleInPublicList: false,
    isReactivated: timeInfo.isReactivated,
  }
}

const getFreshnessBadgeClass = (status) => {
  if (status === 'novo') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'antigo') return 'bg-amber-50 text-amber-700 ring-amber-200'
  if (status === 'sem_data') return 'bg-slate-100 text-slate-600 ring-slate-200'
  return 'bg-blue-50 text-blue-700 ring-blue-200'
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

}

/** =======================
 * Toast premium
======================= */
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => onClose?.(), toast.ms ?? 2800)
    return () => clearTimeout(t)
  }, [toast, onClose])

  if (!toast) return null

  const type = toast.type || 'info'
  const meta =
    type === 'success'
      ? {
          icon: '✓',
          badge: 'bg-emerald-500 text-white',
          border: 'border-emerald-200',
          glow: 'shadow-[0_18px_48px_rgba(16,185,129,0.18)]',
        }
      : type === 'error'
      ? {
          icon: '!',
          badge: 'bg-rose-500 text-white',
          border: 'border-rose-200',
          glow: 'shadow-[0_18px_48px_rgba(244,63,94,0.18)]',
        }
      : {
          icon: 'i',
          badge: 'bg-blue-600 text-white',
          border: 'border-blue-100',
          glow: 'shadow-[0_18px_48px_rgba(37,99,235,0.16)]',
        }

  return (
    <motion.div
      initial={{ opacity: 0, y: -14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      role="status"
      className={[
        'fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[99999] w-[min(92vw,420px)] -translate-x-1/2',
        'rounded-[22px] border bg-white/96 p-2.5 text-sm text-slate-950 backdrop-blur-xl',
        'md:left-auto md:right-6 md:top-6 md:translate-x-0',
        meta.border,
        meta.glow,
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-base font-black ${meta.badge}`}>
          {meta.icon}
        </div>
        <div className="min-w-0 flex-1">
          {toast.title ? <div className="truncate text-sm font-black text-blue-950">{toast.title}</div> : null}
          {toast.message ? <div className="mt-0.5 text-xs font-semibold leading-snug text-slate-600">{toast.message}</div> : null}
        </div>
        <button
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-base font-black text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
          type="button"
          aria-label="Fechar aviso"
        >
          ×
        </button>
      </div>
    </motion.div>
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

const formatMoneyBR = (value) => {
  const n = Number(value || 0)
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  })
}

const getValorPedido = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

const getLatLngFrom = (obj) => {
  const lat = toNum(obj?.local?.lat ?? obj?.latitude ?? obj?.lat)
  const lng = toNum(obj?.local?.lng ?? obj?.longitude ?? obj?.lng)
  if (lat == null || lng == null) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

const distanceKmBetween = (from, to) => {
  if (!from || !to) return null
  const toRad = (v) => (Number(v) * Math.PI) / 180
  const r = 6371
  const dLat = toRad(to.lat - from.lat)
  const dLng = toRad(to.lng - from.lng)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return r * c
}

const formatDistancePedido = (pedido, userNode) => {
  const pedidoLocal = getLatLngFrom(pedido)
  if (!pedidoLocal) return 'Sem local'
  const meuLocal = getLatLngFrom(userNode)
  const km = distanceKmBetween(meuLocal, pedidoLocal)
  if (km == null) return 'Distância indisponível'
  if (!Number.isFinite(km) || km > 150) return 'Distância indisponível'
  if (km < 1) return `${Math.max(100, Math.round(km * 1000))} m`
  return `${km.toFixed(km >= 10 ? 0 : 1).replace('.', ',')} km`
}

const getPedidoDistanceForSort = (pedido, userNode) => {
  const pedidoLocal = getLatLngFrom(pedido)
  const meuLocal = getLatLngFrom(userNode)
  const km = distanceKmBetween(meuLocal, pedidoLocal)
  return Number.isFinite(km) ? km : null
}

const comparePedidosDisponiveis = (a, b, userNode, serverNow) => {
  const statusA = normalizeAtendimentoStatus(a?.status)
  const statusB = normalizeAtendimentoStatus(b?.status)
  const abertoA = statusA === ATENDIMENTO_STATUS.ABERTO ? 1 : 0
  const abertoB = statusB === ATENDIMENTO_STATUS.ABERTO ? 1 : 0
  if (abertoB !== abertoA) return abertoB - abertoA

  const timeA = getRequestFreshness(a, serverNow).timestamp || getPedidoTimeInfo(a).timestamp || 0
  const timeB = getRequestFreshness(b, serverNow).timestamp || getPedidoTimeInfo(b).timestamp || 0
  if (timeB !== timeA) return timeB - timeA

  const distA = getPedidoDistanceForSort(a, userNode)
  const distB = getPedidoDistanceForSort(b, userNode)
  if (distA != null && distB != null && distA !== distB) return distA - distB
  if (distA != null && distB == null) return -1
  if (distA == null && distB != null) return 1

  return String(a?.id || '').localeCompare(String(b?.id || ''), 'pt-BR')
}

const formatTempoPostado = (value) => {
  const ms = getMs(value)
  if (!ms) return 'Agora'
  const diff = Math.max(0, Date.now() - ms)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  return `${d} d`
}

const formatDataCurtaPedido = (value) => {
  const ms = getMs(value)
  if (!ms) return 'Sem data'
  const data = new Date(ms)
  const hoje = new Date()
  const amanha = new Date()
  amanha.setDate(hoje.getDate() + 1)
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (data.toDateString() === hoje.toDateString()) return `Hoje ${hora}`
  if (data.toDateString() === amanha.toDateString()) return `Amanhã ${hora}`
  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

const getPedidoCardTheme = ({ categoriaId, categoriaLabel, titulo, index = 0 }) => {
  const categoryMeta = getCategoryById(categoriaId)
  if (categoryMeta) {
    const badgeById = {
      servicos_gerais: 'bg-blue-600',
      entregas: 'bg-green-600',
      compras: 'bg-sky-600',
      casa: 'bg-yellow-500',
      reparos: 'bg-blue-600',
      limpeza: 'bg-pink-500',
      beleza: 'bg-amber-500',
      aulas: 'bg-violet-600',
      pets: 'bg-amber-800',
      tecnologia: 'bg-violet-600',
      transporte: 'bg-blue-700',
      mudancas: 'bg-orange-500',
      eventos: 'bg-pink-500',
      midia: 'bg-cyan-600',
      cuidados: 'bg-pink-600',
    }
    return {
      icon: categoryMeta.emoji,
      accent: categoryMeta.accent,
      soft: categoryMeta.soft,
      wave: categoryMeta.wave,
      badge: badgeById[categoryMeta.id] || 'bg-blue-600',
    }
  }

  const text = `${categoriaId || ''} ${categoriaLabel || ''} ${titulo || ''}`.toLowerCase()
  const themes = {
    entregas: {
      icon: '🛵',
      accent: '#16a34a',
      soft: '#e8f8ed',
      wave: '#dff3df',
      badge: 'bg-green-600',
    },
    carreto: {
      icon: '📦',
      accent: '#f97316',
      soft: '#fff1e7',
      wave: '#ffe0c2',
      badge: 'bg-orange-500',
    },
    mudanca: {
      icon: '📦',
      accent: '#f97316',
      soft: '#fff1e7',
      wave: '#ffe0c2',
      badge: 'bg-orange-500',
    },
    tecnologia: {
      icon: '📶',
      accent: '#7c3aed',
      soft: '#f0e9ff',
      wave: '#eadcff',
      badge: 'bg-violet-600',
    },
    limpeza: {
      icon: '🧹',
      accent: '#ec4899',
      soft: '#fff0f7',
      wave: '#ffd8e9',
      badge: 'bg-pink-500',
    },
    beleza: {
      icon: '✨',
      accent: '#f59e0b',
      soft: '#fff7dd',
      wave: '#ffefbf',
      badge: 'bg-amber-500',
    },
    reparos: {
      icon: '🔧',
      accent: '#2563eb',
      soft: '#eaf2ff',
      wave: '#dceaff',
      badge: 'bg-blue-600',
    },
    pets: {
      icon: '🐾',
      accent: '#92400e',
      soft: '#f7eee5',
      wave: '#ead9c8',
      badge: 'bg-amber-800',
    },
    aulas: {
      icon: '📘',
      accent: '#6d28d9',
      soft: '#f0e9ff',
      wave: '#e7dcff',
      badge: 'bg-violet-600',
    },
    construcao: {
      icon: '🏠',
      accent: '#f59e0b',
      soft: '#fff8e1',
      wave: '#ffe9ad',
      badge: 'bg-yellow-500',
    },
    jardinagem: {
      icon: '🌿',
      accent: '#16a34a',
      soft: '#edf9e8',
      wave: '#e0f2d5',
      badge: 'bg-green-600',
    },
    eventos: {
      icon: '🎈',
      accent: '#ec4899',
      soft: '#fff0f6',
      wave: '#ffd8e8',
      badge: 'bg-pink-500',
    },
    geral: {
      icon: '⚡',
      accent: '#2563eb',
      soft: '#eef5ff',
      wave: '#dceaff',
      badge: 'bg-blue-600',
    },
  }

  if (text.includes('entrega') || text.includes('encomenda')) return themes.entregas
  if (text.includes('carreto') || text.includes('mudan')) return themes.carreto
  if (text.includes('tecnologia') || text.includes('internet') || text.includes('roteador') || text.includes('tomada')) return themes.tecnologia
  if (text.includes('limpeza') || text.includes('faxina')) return themes.limpeza
  if (text.includes('beleza') || text.includes('maquiagem') || text.includes('escova')) return themes.beleza
  if (text.includes('reparo') || text.includes('consert') || text.includes('instalar') || text.includes('ventilador')) return themes.reparos
  if (text.includes('pet') || text.includes('cachorro')) return themes.pets
  if (text.includes('aula') || text.includes('educa')) return themes.aulas
  if (text.includes('constru') || text.includes('telhado') || text.includes('pintar') || text.includes('pintura')) return themes.construcao
  if (text.includes('jard') || text.includes('grama')) return themes.jardinagem
  if (text.includes('evento') || text.includes('decora')) return themes.eventos

  const fallback = [themes.geral, themes.entregas, themes.carreto, themes.tecnologia, themes.limpeza, themes.beleza]
  return fallback[index % fallback.length]
}

function ProfessionalOverview({
  nome,
  fotoURL,
  avatarEmoji,
  iniciais,
  disponivel,
  categorias = [],
  stats,
  onPerfil,
  onAgenda,
  onInbox,
  onSeguranca,
  onPedidos,
}) {
  const bars = stats?.semana || []
  const maxBar = Math.max(...bars.map((b) => Number(b.value || 0)), 1)
  const nota = Number(stats?.notaMedia || 0)

  return (
    <section className="mb-4 grid gap-3 md:mb-5 md:grid-cols-[1.05fr_0.95fr] md:gap-4">
      <div className="overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-[0_18px_48px_rgba(37,99,235,0.12)] md:rounded-[34px]">
        <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#16b8d1_52%,#ffdf2e_118%)] p-4 text-white md:p-5">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-yellow-200/35 blur-2xl" />
          <div className="pointer-events-none absolute -left-16 bottom-0 h-36 w-36 rounded-full bg-blue-950/20 blur-2xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/75">Meus ganhos</div>
              <div className="mt-2 text-3xl font-black leading-none md:text-4xl">{formatMoneyBR(stats?.ganhosSemana)}</div>
              <div className="mt-1 text-xs font-bold text-white/80">Esta semana</div>
            </div>
            <button
              type="button"
              onClick={onPedidos}
              className="rounded-full bg-white/92 px-3 py-2 text-xs font-black text-blue-950 shadow-[0_10px_24px_rgba(15,23,42,0.14)] transition active:scale-[0.97]"
            >
              Ver pedidos
            </button>
          </div>

          <div className="relative mt-5 flex h-28 items-end gap-2 md:h-32 md:gap-3">
            {bars.map((bar) => {
              const height = Math.max(12, Math.round((Number(bar.value || 0) / maxBar) * 96))
              return (
                <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="text-[10px] font-black text-white/70">
                    {bar.value > 0 ? Math.round(bar.value) : ''}
                  </div>
                  <div className="flex h-20 items-end md:h-24">
                    <div
                      className="w-5 rounded-t-xl bg-white/82 shadow-[0_12px_24px_rgba(15,23,42,0.18)] md:w-7"
                      style={{ height }}
                    />
                  </div>
                  <div className="truncate text-[10px] font-black text-white/76">{bar.label}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid gap-2 p-3 md:p-4">
          {[
            ['Serviços realizados', stats?.concluidos || 0],
            ['Avaliação média', nota > 0 ? `${nota.toFixed(1)} ★` : 'Sem nota'],
            ['Taxa de conclusão', `${stats?.taxaConclusao || 0}%`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="text-xs font-bold text-slate-600">{label}</span>
              <span className="text-sm font-black text-blue-950">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-blue-100 bg-white p-4 shadow-[0_18px_48px_rgba(37,99,235,0.12)] md:rounded-[34px] md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Perfil profissional</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[24px] bg-blue-50 text-xl font-black text-blue-700 shadow-[0_12px_28px_rgba(15,23,42,0.10)]">
                {fotoURL ? (
                  <span className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${fotoURL})` }} />
                ) : avatarEmoji ? (
                  <span>{avatarEmoji}</span>
                ) : (
                  <span>{iniciais}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-xl font-black leading-tight text-blue-950">{nome || 'Profissional'}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[#ffd91a] px-2.5 py-1 text-[10px] font-black text-blue-950">
                    {nota > 0 ? `★ ${nota.toFixed(1)}` : 'Novo perfil'}
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                    {disponivel ? 'Online' : 'Oculto'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-black text-slate-600">
            Reputação real
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['Serviços', stats?.total || 0],
            ['Ativos', stats?.ativos || 0],
            ['Concluídos', `${stats?.taxaConclusao || 0}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 px-2 py-2 text-center">
              <div className="text-lg font-black text-blue-950">{value}</div>
              <div className="mt-0.5 truncate text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(categorias.length ? categorias : ['Sem categoria']).slice(0, 4).map((cat) => (
            <span key={cat} className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-black text-blue-800">
              {cat}
            </span>
          ))}
        </div>

        <div className="mt-4 grid gap-2">
          {[
            ['Meu perfil público', onPerfil],
            ['Agenda', onAgenda],
            ['Conversas', onInbox],
            ['Segurança', onSeguranca],
          ].map(([label, action]) => (
            <button
              key={label}
              type="button"
              onClick={action}
              className="flex h-11 items-center justify-between rounded-2xl border border-slate-100 bg-white px-3 text-left text-sm font-black text-slate-700 shadow-sm transition hover:bg-blue-50 hover:text-blue-950"
            >
              <span>{label}</span>
              <span className="text-blue-400">›</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

const PROFILE_FAB_STORAGE_KEY = 'correAqui.profileFabPosition.v1'
const PROFILE_FAB_EDGE_INSET = 16
const PROFILE_FAB_DRAG_THRESHOLD = 6

function clampProfileFabPosition(position, minBottomInset = PROFILE_FAB_EDGE_INSET) {
  if (typeof window === 'undefined') return position

  const viewport = window.visualViewport
  const width = Math.max(320, Math.floor(viewport?.width || window.innerWidth || 360))
  const height = Math.max(480, Math.floor(viewport?.height || window.innerHeight || 640))
  const isDesktop = width >= 768
  const size = isDesktop ? 62 : 56
  const maxX = Math.max(PROFILE_FAB_EDGE_INSET, width - size - PROFILE_FAB_EDGE_INSET)
  const maxY = Math.max(PROFILE_FAB_EDGE_INSET, height - size - minBottomInset)

  return {
    x: Math.min(Math.max(Number(position?.x) || PROFILE_FAB_EDGE_INSET, PROFILE_FAB_EDGE_INSET), maxX),
    y: Math.min(Math.max(Number(position?.y) || PROFILE_FAB_EDGE_INSET, PROFILE_FAB_EDGE_INSET), maxY),
  }
}

function getDefaultProfileFabPosition(minBottomInset = PROFILE_FAB_EDGE_INSET) {
  if (typeof window === 'undefined') return { x: PROFILE_FAB_EDGE_INSET, y: PROFILE_FAB_EDGE_INSET }

  const viewport = window.visualViewport
  const width = Math.max(320, Math.floor(viewport?.width || window.innerWidth || 360))
  const height = Math.max(480, Math.floor(viewport?.height || window.innerHeight || 640))
  const size = width >= 768 ? 62 : 56

  return clampProfileFabPosition(
    {
      x: width - size - PROFILE_FAB_EDGE_INSET,
      y: height - size - minBottomInset,
    },
    minBottomInset,
  )
}

function snapProfileFabToSide(position, minBottomInset = PROFILE_FAB_EDGE_INSET) {
  if (typeof window === 'undefined') return position

  const viewport = window.visualViewport
  const width = Math.max(320, Math.floor(viewport?.width || window.innerWidth || 360))
  const size = width >= 768 ? 62 : 56
  const center = Number(position?.x || 0) + size / 2
  const x = center < width / 2 ? PROFILE_FAB_EDGE_INSET : width - size - PROFILE_FAB_EDGE_INSET

  return clampProfileFabPosition({ ...position, x }, minBottomInset)
}

function GlobalProfileFab({ fotoURL, avatarEmoji, iniciais, count = 0, onClick, minBottomInset = PROFILE_FAB_EDGE_INSET }) {
  const [position, setPosition] = useState(null)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    let initialPosition = null

    try {
      initialPosition = JSON.parse(window.localStorage.getItem(PROFILE_FAB_STORAGE_KEY) || 'null')
    } catch {
      initialPosition = null
    }

    setPosition(clampProfileFabPosition(initialPosition || getDefaultProfileFabPosition(minBottomInset), minBottomInset))
  }, [minBottomInset])

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => {
        const clamped = clampProfileFabPosition(current || getDefaultProfileFabPosition(minBottomInset), minBottomInset)
        try {
          window.localStorage.setItem(PROFILE_FAB_STORAGE_KEY, JSON.stringify(clamped))
        } catch {
          // localStorage can be unavailable in private contexts.
        }
        return clamped
      })
    }

    window.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)
    }
  }, [minBottomInset])

  const handlePointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return

    event.currentTarget.setPointerCapture?.(event.pointerId)
    const currentPosition = position || getDefaultProfileFabPosition(minBottomInset)
    setPosition(currentPosition)
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: currentPosition.x,
      startY: currentPosition.y,
      dragged: false,
    }
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const dx = event.clientX - drag.startClientX
    const dy = event.clientY - drag.startClientY

    if (!drag.dragged && Math.hypot(dx, dy) >= PROFILE_FAB_DRAG_THRESHOLD) {
      drag.dragged = true
    }

    if (!drag.dragged) return

    event.preventDefault()
    setPosition(clampProfileFabPosition({ x: drag.startX + dx, y: drag.startY + dy }, minBottomInset))
  }

  const handlePointerUp = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragRef.current = null

    if (!drag.dragged) return

    suppressClickRef.current = true
    setTimeout(() => {
      suppressClickRef.current = false
    }, 0)

    setPosition((current) => {
      const snapped = snapProfileFabToSide(current || getDefaultProfileFabPosition(minBottomInset), minBottomInset)
      try {
        window.localStorage.setItem(PROFILE_FAB_STORAGE_KEY, JSON.stringify(snapped))
      } catch {
        // localStorage can be unavailable in private contexts.
      }
      return snapped
    })
  }

  const handleClick = (event) => {
    if (suppressClickRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    onClick?.()
  }

  const style = position
    ? { left: `${position.x}px`, top: `${position.y}px` }
    : { right: `${PROFILE_FAB_EDGE_INSET}px`, bottom: `${minBottomInset}px` }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title="Abrir menu da conta"
      data-tutorial="perfil"
      data-tutorial-alt="perfil-profissional"
      style={style}
      className={[
        'fixed z-[99981] grid h-14 w-14 touch-none place-items-center rounded-full border-[5px] border-white bg-[#ffd91a] text-blue-950 shadow-[0_18px_42px_rgba(15,23,42,0.28),0_0_34px_rgba(250,204,21,0.35)] transition-[box-shadow,transform] hover:scale-[1.03] active:scale-[0.96] md:h-[62px] md:w-[62px]',
        dragRef.current ? 'cursor-grabbing' : 'cursor-grab',
      ].join(' ')}
    >
      {fotoURL ? (
        <span
          aria-hidden="true"
          className="h-full w-full overflow-hidden rounded-full bg-cover bg-center"
          style={{ backgroundImage: `url(${fotoURL})` }}
        />
      ) : avatarEmoji ? (
        <span className="text-xl leading-none">{avatarEmoji}</span>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M4.8 20.5c1.4-4 4-6 7.2-6s5.8 2 7.2 6" />
        </svg>
      )}
      {!fotoURL && !avatarEmoji && iniciais ? (
        <span className="sr-only">{iniciais}</span>
      ) : null}
      {count > 0 ? (
        <span className="absolute -right-2 -top-2 grid h-7 min-w-7 place-items-center rounded-full bg-rose-500 px-1.5 text-xs font-black text-white ring-[3px] ring-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </button>
  )
}

function ProfileMenuRow({ icon, label, count = 0, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-bold text-slate-100 transition hover:bg-white/[0.08] active:scale-[0.99]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/10 text-base">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count > 0 ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
      <span className="text-lg text-slate-400">›</span>
    </button>
  )
}

function GlobalProfileMenu({
  open,
  onClose,
  nome,
  fotoURL,
  avatarEmoji,
  iniciais,
  nota,
  avaliacoes,
  emServico,
  clientePedidosCount,
  unreadInbox,
  problemasCount,
  onDados,
  onEnderecos,
  onHistorico,
  onFavoritos,
  onAvaliacoesCliente,
  onPerfilProfissional,
  onPortfolio,
  onAgenda,
  onGanhos,
  onAvaliacoesRecebidas,
  onConfiguracoes,
  onAjuda,
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100002] bg-slate-950/58 px-3 py-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="ml-auto flex h-full w-full max-w-[390px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1628] text-white shadow-[0_30px_100px_rgba(2,6,23,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#ffd91a] bg-white text-lg font-black text-blue-700">
              {fotoURL ? (
                <span className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${fotoURL})` }} />
              ) : avatarEmoji ? (
                <span>{avatarEmoji}</span>
              ) : (
                <span>{iniciais}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-black">{nome || 'Corre Aqui'}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-black">
                <span className="rounded-full bg-[#ffd91a] px-2 py-1 text-blue-950">
                  {nota > 0 ? `★ ${nota.toFixed(1)}` : 'Novo'}
                  {avaliacoes ? ` (${avaliacoes})` : ''}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/14 px-2 py-1 text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {emServico ? 'Em serviço' : 'Online'}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/8 text-lg font-black transition hover:bg-white/12"
            aria-label="Fechar menu"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <section className="rounded-[22px] border border-white/8 bg-white/[0.045] p-2">
            <div className="px-3 pb-1 pt-2 text-xs font-black uppercase tracking-[0.14em] text-violet-300">Minha conta cliente</div>
            <ProfileMenuRow icon="👤" label="Dados pessoais" onClick={onDados} />
            <ProfileMenuRow icon="📍" label="Endereços" onClick={onEnderecos} />
            <ProfileMenuRow icon="🧾" label="Histórico de pedidos" count={clientePedidosCount} onClick={onHistorico} />
            <ProfileMenuRow icon="♥" label="Favoritos" onClick={onFavoritos} />
            <ProfileMenuRow icon="★" label="Avaliações como cliente" onClick={onAvaliacoesCliente} />
          </section>

          <section className="rounded-[22px] border border-white/8 bg-white/[0.045] p-2">
            <div className="px-3 pb-1 pt-2 text-xs font-black uppercase tracking-[0.14em] text-cyan-300">Área profissional</div>
            <ProfileMenuRow icon="👤" label="Meu perfil profissional" onClick={onPerfilProfissional} />
            <ProfileMenuRow icon="💼" label="Portfólio de serviços" onClick={onPortfolio} />
            <ProfileMenuRow icon="📅" label="Agenda" onClick={onAgenda} />
            <ProfileMenuRow icon="💰" label="Ganhos" onClick={onGanhos} />
            <ProfileMenuRow icon="★" label="Avaliações recebidas" onClick={onAvaliacoesRecebidas} />
          </section>

          <section className="rounded-[22px] border border-white/8 bg-white/[0.045] p-2">
            <ProfileMenuRow icon="⚙" label="Configurações" count={problemasCount} onClick={onConfiguracoes} />
            <ProfileMenuRow icon="?" label="Ajuda e suporte" count={unreadInbox} onClick={onAjuda} />
          </section>
        </div>
      </div>
    </div>
  )
}

export default function Mapadinamico({ initialMode = 'corre', onBackToMode } = {}) {
  const router = useRouter()
  const [tab, setTab] = useState('corre') // corre | inbox | agenda
  const [clientePainelBaixo, setClientePainelBaixo] = useState('') // '' | meusPedidos | conversas | chat

  const [modoApp, setModoApp] = useState(initialMode === 'cliente' || initialMode === 'corre' ? initialMode : 'corre') // cliente | corre
  const [openPerfil, setOpenPerfil] = useState(false)
  const [openProfileMenu, setOpenProfileMenu] = useState(false)
  const [perfilInitialTab, setPerfilInitialTab] = useState('config')
  const [perfilInitialProfSection, setPerfilInitialProfSection] = useState('')
  const [meuNome, setMeuNome] = useState('')
  const [meuId, setMeuId] = useState('')

  const [fotoURL, setFotoURL] = useState('')
  const [avatarEmoji, setAvatarEmoji] = useState('')

  const [corres, setCorres] = useState(() => (pedidosCacheReady ? pedidosCache : []))
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
  const [publicPortfolioObj, setPublicPortfolioObj] = useState({})
  const [registeredUsersObj, setRegisteredUsersObj] = useState({})
  const [meuUserProfile, setMeuUserProfile] = useState(null)

  const [toast, setToast] = useState(null)
  const [usuarioSelecionado, setUsuarioSelecionado] = useState(null)
  const [agendaClienteUser, setAgendaClienteUser] = useState(null)
  const [agendaClienteService, setAgendaClienteService] = useState(null)
  const [privateRequests, setPrivateRequests] = useState([])
  const [boostPedidoModal, setBoostPedidoModal] = useState(null)
  const [boostCheckoutLoading, setBoostCheckoutLoading] = useState(false)
  const [boostCheckoutResult, setBoostCheckoutResult] = useState(null)
  const notificacoesInicializadasRef = useRef(false)
  const notificacoesVistasRef = useRef(new Set())
  const recompensasEmCursoRef = useRef(new Set())
  const showToast = useCallback((t) => setToast({ ms: 2800, ...t }), [])

  const [loadingPedidos, setLoadingPedidos] = useState(() => !pedidosCacheReady)
  const [erroPedidos, setErroPedidos] = useState(null)
  const [abrindoPedidoId, setAbrindoPedidoId] = useState(null)
  const [pedidosRenderLimit, setPedidosRenderLimit] = useState(PEDIDOS_PAGE_SIZE)
  const [pedidosFreshnessNow, setPedidosFreshnessNow] = useState(() => Date.now())

  const [aceitandoId, setAceitandoId] = useState(null)
  const [atendimentoId, setAtendimentoId] = useState(null)
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
  const [notificacoesNaoLidas, setNotificacoesNaoLidas] = useState(0)
  const [agendaPendentes, setAgendaPendentes] = useState(0)
  const [agendaConfirmados, setAgendaConfirmados] = useState(0)
  const [agendaRecusados, setAgendaRecusados] = useState(0)
  const [correDisponivel, setCorreDisponivel] = useState(() => getUserOnlinePreference())
  const [ganhosModo, setGanhosModo] = useState('corre')
  const [bottomBarsHidden, setBottomBarsHidden] = useState(false)
  const [mostrarBuscaCorreFlutuante, setMostrarBuscaCorreFlutuante] = useState(false)
  const lastScrollYRef = useRef(0)
  const lastListStateSaveAtRef = useRef(0)
  const buscaCorreTopoRef = useRef(null)
  const listStateKey = useMemo(() => `${LIST_STATE_PREFIX}:${initialMode}`, [initialMode])

  useEffect(() => {
    const timer = window.setInterval(() => setPedidosFreshnessNow(Date.now()), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!meuId || !Array.isArray(corres)) return

    corres
      .filter((pedido) => (
        normalizeAtendimentoStatus(pedido?.status) === ATENDIMENTO_STATUS.FINALIZADO
        && String(pedido?.aceite?.id || '') === String(meuId)
        && pedido?.atendimento?.recompensasContabilizadas !== true
      ))
      .forEach((pedido) => {
        if (recompensasEmCursoRef.current.has(pedido.id)) return
        recompensasEmCursoRef.current.add(pedido.id)

        contabilizarAtendimentoFinalizado({ database, pedido, uid: meuId })
          .catch((error) => console.warn('Nao foi possivel contabilizar as recompensas:', error))
          .finally(() => recompensasEmCursoRef.current.delete(pedido.id))
      })
  }, [corres, meuId])

  const saveListState = useCallback((markReturning = false) => {
    if (typeof window === 'undefined') return

    try {
      window.sessionStorage.setItem(
        listStateKey,
        JSON.stringify({
          modoApp,
          tab,
          filtro,
          busca,
          categoriaFiltro,
          clientePainelBaixo,
          cardAbertoId,
          scrollY: window.scrollY || document.documentElement.scrollTop || 0,
          ts: Date.now(),
        })
      )

      if (markReturning) {
        window.sessionStorage.setItem(LIST_RETURN_FLAG, listStateKey)
      }
    } catch {}
  }, [busca, cardAbertoId, categoriaFiltro, clientePainelBaixo, filtro, listStateKey, modoApp, tab])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    try {
      const raw = window.sessionStorage.getItem(listStateKey)
      const saved = raw ? JSON.parse(raw) : null
      if (!saved || Date.now() - Number(saved.ts || 0) > 10 * 60 * 1000) return undefined

      if (saved.modoApp === 'cliente' || saved.modoApp === 'corre') setModoApp(saved.modoApp)
      if (saved.tab) setTab(saved.tab)
      if (saved.filtro) setFiltro(saved.filtro)
      if (typeof saved.busca === 'string') setBusca(saved.busca)
      if (saved.categoriaFiltro) setCategoriaFiltro(saved.categoriaFiltro)
      if (typeof saved.clientePainelBaixo === 'string') setClientePainelBaixo(saved.clientePainelBaixo)
      setCardAbertoId(saved.cardAbertoId || null)

      let cancelled = false
      let frameOne = 0
      let frameTwo = 0
      const timers = []
      const targetY = Math.max(0, Number(saved.scrollY || 0))

      const finishPerf = () => {
        if (window.sessionStorage.getItem(LIST_RETURN_FLAG) !== listStateKey) return
        if (DEBUG_NAV_PERF) {
          try {
            console.timeEnd('back-list')
          } catch {}
        }
        window.sessionStorage.removeItem(LIST_RETURN_FLAG)
      }

      const tryRestore = (attempt = 0) => {
        if (cancelled) return

        const doc = document.documentElement
        const maxY = Math.max(0, doc.scrollHeight - window.innerHeight)
        const nextY = Math.min(targetY, maxY)
        window.scrollTo({ top: nextY, left: 0, behavior: 'auto' })

        const currentY = window.scrollY || doc.scrollTop || 0
        const reached = Math.abs(currentY - targetY) <= 8
        const pageReady = maxY >= targetY
        if (reached || pageReady || attempt >= 8) {
          finishPerf()
          return
        }

        const delay = [40, 80, 140, 220, 340, 520, 760, 1000][attempt] || 1200
        timers.push(window.setTimeout(() => tryRestore(attempt + 1), delay))
      }

      frameOne = window.requestAnimationFrame(() => {
        frameTwo = window.requestAnimationFrame(() => tryRestore(0))
      })

      return () => {
        cancelled = true
        if (frameOne) window.cancelAnimationFrame(frameOne)
        if (frameTwo) window.cancelAnimationFrame(frameTwo)
        timers.forEach((timer) => window.clearTimeout(timer))
      }
    } catch {}
    return undefined
  }, [listStateKey])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let frame = 0
    const onSaveScroll = () => {
      const now = Date.now()
      if (now - lastListStateSaveAtRef.current < 350) return
      lastListStateSaveAtRef.current = now
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        saveListState(false)
      })
    }
    const onPageHide = () => saveListState(false)

    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('scroll', onSaveScroll, { passive: true })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('scroll', onSaveScroll)
    }
  }, [saveListState])

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
        const isMobile = window.innerWidth < 768
        const buscaRect = buscaCorreTopoRef.current?.getBoundingClientRect()
        const buscaTopoVisivel = !!buscaRect && buscaRect.bottom > 16 && buscaRect.top < 120

        if (currentY < 80) {
          setBottomBarsHidden(false)
        } else if (diff > 10) {
          setBottomBarsHidden(true)
        } else if (diff < -10) {
          setBottomBarsHidden(false)
        }

        setMostrarBuscaCorreFlutuante(isMobile && currentY > 80 && !buscaTopoVisivel)
        lastScrollYRef.current = currentY
        ticking = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  /* =======================
     0) Cache visual do avatar ate o Firebase carregar
  ======================= */
  useEffect(() => {
    if (meuId && (meuUserProfile || usersObj?.[meuId])) return

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
  }, [openPerfil, meuId, meuUserProfile, usersObj])

  useEffect(() => {
    notificacoesInicializadasRef.current = false
    notificacoesVistasRef.current = new Set()
  }, [meuId])

  useEffect(() => {
    if (!meuId) {
      setNotificacoesNaoLidas(0)
      navigator.clearAppBadge?.().catch?.(() => {})
      return
    }
    const userAtual = meuUserProfile || {}
    const notificacoesAtivas = userAtual?.profile?.notificacoes !== false
    if (!notificacoesAtivas) {
      setNotificacoesNaoLidas(0)
      navigator.clearAppBadge?.().catch?.(() => {})
      return
    }

    let rawLegacy = {}
    let rawModern = {}
    const emitLista = () => {
      const merged = new Map()
      const add = (id, n) => {
        if (!n || typeof n !== 'object') return
        const eventKey = String(
          n.eventId ||
          n.id ||
          `${n.tipo || ''}|${n.pedidoId || n.privateRequestId || n.conversaId || ''}|${n.fromUid || n.autor?.id || ''}|${n.mensagem || n.titulo || ''}`
        )
        const current = merged.get(eventKey) || {}
        const read = current.lida === true || current.read === true || n.lida === true || n.read === true
        merged.set(eventKey, { ...current, ...n, id: eventKey, eventId: n.eventId || current.eventId || '', lida: read, read })
      }
      Object.entries(rawLegacy || {}).forEach(([id, n]) => add(id, n))
      Object.entries(rawModern || {}).forEach(([id, n]) => add(id, n))
      const lista = Array.from(merged.values())
        .sort((a, b) => Number(b?.criadoEm || 0) - Number(a?.criadoEm || 0))

      const unreadCount = lista.filter((n) => n?.lida !== true && n?.read !== true).length
      setNotificacoesNaoLidas(unreadCount)
      if (unreadCount > 0) navigator.setAppBadge?.(unreadCount).catch?.(() => {})
      else navigator.clearAppBadge?.().catch?.(() => {})

      if (!notificacoesInicializadasRef.current) {
        lista.forEach((n) => notificacoesVistasRef.current.add(n.id))
        notificacoesInicializadasRef.current = true
        return
      }

      const nova = lista.find((n) => {
        if (!n?.id || notificacoesVistasRef.current.has(n.id)) return false
        if (n?.lida === true || n?.read === true) return false
        if (n?.tipo === 'corre_aceito') return false
        if (n?.autor?.id && String(n.autor.id) === String(meuId)) return false
        return true
      })

      if (!nova) return

      notificacoesVistasRef.current.add(nova.id)

    }

    const offLegacy = onValue(query(ref(database, `notificacoes/${meuId}`), limitToLast(20)), (snap) => {
      rawLegacy = snap.val() || {}
      emitLista()
    })

    const offModern = onValue(query(ref(database, `notifications/${meuId}`), limitToLast(20)), (snap) => {
      rawModern = snap.val() || {}
      emitLista()
    })

    return () => {
      offLegacy()
      offModern()
    }
  }, [meuId, meuUserProfile])

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
    setCorreDisponivel(getUserOnlinePreference())
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('modoApp', modoApp)
    } catch {}

    if (meuId) {
      const agoraPresence = Date.now()
      const onlineNow = correDisponivel && getUserOnlinePreference()
      debugPresence('uid atual', meuId)
      debugPresence(`salvando status em presence/${meuId}`, { origem: 'modoApp', online: onlineNow })
      update(ref(database, `presence/${meuId}`), {
        modoAtual: modoApp,
        online: onlineNow,
        disponivel: onlineNow,
        lastSeen: agoraPresence,
        updatedAt: agoraPresence,
      })
        .then(() => debugPresence('salvou online com sucesso', { uid: meuId, origem: 'modoApp' }))
        .catch((error) => console.error('[PRESENCE] erro ao salvar presença', error))
    }
  }, [meuId, modoApp, correDisponivel])

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
          if (isPedidoAtivoStatus(status)) acc.confirmados += 1
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

  useEffect(() => {
    if (!meuId) {
      setPrivateRequests([])
      return undefined
    }

    let cancelled = false
    const off = onValue(ref(database, `privateRequestInbox/${meuId}`), (snap) => {
      const raw = snap.val() || {}
      const lista = Object.entries(raw)
        .map(([id, value]) => ({ id, ...(value || {}) }))
        .sort((a, b) => Number(b?.atualizadoEm || b?.criadoEm || 0) - Number(a?.atualizadoEm || a?.criadoEm || 0))

      void reconcilePrivateRequestInbox({ database, uid: meuId, entries: lista }).then(({ valid }) => {
        if (!cancelled) setPrivateRequests(valid)
      })
    }, () => {
      if (!cancelled) setPrivateRequests([])
    })

    return () => {
      cancelled = true
      off()
    }
  }, [meuId])

  /* =======================
     2) /users/{meuId} ONLINE REAL (+ avatar)
  ======================= */
  useEffect(() => {
    if (!meuId) return
    let cancelled = false

    const userRef = ref(database, `presence/${meuId}`)
    const connectedRef = ref(database, '.info/connected')
    debugPresence('uid atual', meuId)
    debugPresence('usando caminho correto', `presence/${meuId}`)

    const getAvatarPatch = () => {
      const patch = {}
      const foto = pickFoto(fotoURL)
      const emoji = String(avatarEmoji || '').trim()
      const profile = meuUserProfile?.profile || {}
      const privacy = meuUserProfile?.privacy || profile?.privacy || {}
      const corre = meuUserProfile?.corre || profile?.corre || {}
      const profissional = meuUserProfile?.profissional || profile?.profissional || {}
      const profCategorias = Array.isArray(meuUserProfile?.profCategorias)
        ? meuUserProfile.profCategorias
        : Array.isArray(profile?.profCategorias)
          ? profile.profCategorias
          : []
      const correCategorias = Array.isArray(meuUserProfile?.correCategorias)
        ? meuUserProfile.correCategorias
        : Array.isArray(profile?.correCategorias)
          ? profile.correCategorias
          : Array.isArray(corre?.categorias)
            ? corre.categorias
            : []
      const profPortfolio = meuUserProfile?.profPortfolio || meuUserProfile?.portfolio || profile?.profPortfolio || profile?.portfolio || profissional?.profPortfolio || profissional?.portfolio || []

      if (foto) patch.fotoURL = foto
      if (emoji) patch.avatarEmoji = emoji
      patch.photoURL = foto || null
      patch.avatar = foto || emoji || ''
      patch.cidade = meuUserProfile?.cidade || profile?.cidade || ''
      patch.visivel = meuUserProfile?.visivel ?? profile?.visivel ?? true
      patch.profileVisible = privacy.profileVisible === false && (privacy.profileVisibilityExplicit === true || privacy.profileVisibleExplicit === true) ? false : true
      patch.profileVisibilityExplicit = privacy.profileVisibilityExplicit === true || privacy.profileVisibleExplicit === true
      patch.showOnlineStatus = meuUserProfile?.showOnlineStatus ?? privacy.showOnlineStatus ?? true
      patch.isCorre = !!(meuUserProfile?.isCorre || profile?.isCorre || corre?.ativo)
      patch.isProfissional = !!(meuUserProfile?.isProfissional || profile?.isProfissional || profissional?.ativo)
      patch.correCategorias = correCategorias
      patch.profCategorias = profCategorias
      patch.correTitulo = meuUserProfile?.correTitulo || profile?.correTitulo || corre?.titulo || ''
      patch.correResumo = meuUserProfile?.correResumo || profile?.correResumo || corre?.bio || profile?.bio || ''
      patch.correRegiao = meuUserProfile?.correRegiao || profile?.correRegiao || corre?.regiao || profile?.cidade || ''
      patch.correTransporte = meuUserProfile?.correTransporte || profile?.correTransporte || corre?.transporte || ''
      patch.profResumo = meuUserProfile?.profResumo || profile?.profResumo || profile?.descricao || profissional?.descricao || profissional?.titulo || ''
      patch.profCidadeAtende = meuUserProfile?.profCidadeAtende || profile?.profCidadeAtende || profissional?.regiao || profile?.cidade || ''
      patch.profPrecoBase = meuUserProfile?.profPrecoBase || profile?.profPrecoBase || profile?.preco || profissional?.preco || ''
      patch.profWhats = meuUserProfile?.profWhats || profile?.profWhats || profissional?.whatsapp || ''
      patch.profExperiencia = meuUserProfile?.profExperiencia || profile?.profExperiencia || profissional?.experiencia || ''
      patch.portfolio = profPortfolio
      patch.profPortfolio = profPortfolio

      return patch
    }

    const writeOnline = async () => {
      if (cancelled) return

      const agoraPresence = Date.now()
      const onlineNow = correDisponivel && getUserOnlinePreference()
      debugPresence(`salvando status em presence/${meuId}`, {
        origem: 'Mapadinamico/writeOnline',
        online: onlineNow,
        temLocal: false,
      })

      await update(userRef, {
        uid: meuId,
        id: meuId,
        nome: meuNome || 'Anônimo',
        online: onlineNow,
        disponivel: onlineNow,
        lastSeen: agoraPresence,
        updatedAt: agoraPresence,
        ...getAvatarPatch(),
      })
      debugPresence('salvou online com sucesso', { uid: meuId, origem: 'Mapadinamico/writeOnline' })

      if (!onlineNow) return

      const local = await getMyLocation()
      if (cancelled || !local) return

      await update(userRef, {
        local,
        latitude: local.lat,
        longitude: local.lng,
        updatedAt: Date.now(),
      })
      debugPresence('local salvo', local)
    }

    const writeOffline = async () => {
      const agoraPresence = Date.now()
      await update(userRef, {
        online: false,
        disponivel: false,
        lastSeen: agoraPresence,
        updatedAt: agoraPresence,
        ...getAvatarPatch(),
      }).catch((error) => console.error('[PRESENCE] erro ao salvar presenca offline', error))
    }

    const offConnected = onValue(connectedRef, async (snap) => {
      const connected = !!snap.val()
      debugPresence('conectado .info/connected', { uid: meuId, connected, origem: 'Mapadinamico' })
      if (!connected || cancelled) return

      try {
        const agoraPresence = Date.now()
        await onDisconnect(userRef).update({
          online: false,
          lastSeen: agoraPresence,
          updatedAt: agoraPresence,
          ...getAvatarPatch(),
        })
      } catch {}

      try {
        await writeOnline()
      } catch (error) {
        console.error('[PRESENCE] erro ao salvar presença', error)
      }
    })

    const heartbeat = setInterval(async () => {
      const agoraPresence = Date.now()
      const onlineNow = correDisponivel && getUserOnlinePreference()
      debugPresence(`salvando status em presence/${meuId}`, {
        origem: 'Mapadinamico/heartbeat',
        online: onlineNow,
        temLocal: false,
      })
      update(userRef, {
        online: onlineNow,
        disponivel: onlineNow,
        lastSeen: agoraPresence,
        updatedAt: agoraPresence,
        ...getAvatarPatch(),
      })
        .then(() => debugPresence('salvou online com sucesso', { uid: meuId, origem: 'Mapadinamico/heartbeat' }))
        .catch((error) => console.error('[PRESENCE] erro ao salvar presença', error))

      if (!onlineNow) return

      const local = await getMyLocation()
      if (cancelled || !local) return
      debugPresence(`salvando online true em presence/${meuId}`, {
        origem: 'Mapadinamico/heartbeat/local',
        temLocal: !!local,
      })
      update(userRef, {
        local,
        latitude: local.lat,
        longitude: local.lng,
        updatedAt: Date.now(),
      })
        .then(() => debugPresence('local salvo', local))
        .catch((error) => console.error('[PRESENCE] erro ao salvar presença', error))
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
  }, [meuId, meuNome, fotoURL, avatarEmoji, correDisponivel, meuUserProfile])

  useEffect(() => {
    if (!meuId) {
      setMeuUserProfile(null)
      return undefined
    }

    const off = onValue(
      ref(database, `users/${meuId}`),
      (snap) => {
        setMeuUserProfile(snap.val() || null)
      },
      (error) => {
        console.warn('[PRESENCE] erro lendo meu perfil em users/{uid}', error)
      }
    )

    return () => off()
  }, [meuId])

  const profissionalStats = useMemo(() => {
    const meus = (Array.isArray(corres) ? corres : []).filter((pedido) => pedido?.aceite?.id === meuId)
    const concluidos = meus.filter((pedido) => normalizeAtendimentoStatus(pedido?.status) === ATENDIMENTO_STATUS.FINALIZADO)
    const ativos = meus.filter((pedido) => isPedidoAtivoStatus(pedido?.status))
    const notas = concluidos
      .map((pedido) => Number(pedido?.avaliacao?.nota || pedido?.avaliacaoNota || 0))
      .filter((nota) => Number.isFinite(nota) && nota > 0)
    const ganhosTotal = concluidos.reduce((sum, pedido) => sum + getValorPedido(pedido?.valor), 0)
    const taxaConclusao = meus.length ? Math.round((concluidos.length / meus.length) * 100) : 0
    const notaMedia = notas.length ? notas.reduce((sum, nota) => sum + nota, 0) / notas.length : 0
    const ticketMedio = concluidos.length ? ganhosTotal / concluidos.length : 0

    const temposResposta = meus
      .map((pedido) => {
        const criadoEm = getMs(pedido?.criadoEm || pedido?.createdAt)
        const aceitoEm = getMs(pedido?.aceite?.aceitoEm || pedido?.aceitoEm || pedido?.atendimento?.aceitoEm)
        if (!criadoEm || !aceitoEm || aceitoEm <= criadoEm) return null
        const intervalo = aceitoEm - criadoEm
        return intervalo <= 7 * 24 * 60 * 60 * 1000 ? intervalo : null
      })
      .filter((value) => Number.isFinite(value) && value > 0)
    const tempoMedioRespostaMs = temposResposta.length >= 3
      ? temposResposta.reduce((sum, value) => sum + value, 0) / temposResposta.length
      : null

    const conclusoesPorCliente = concluidos.reduce((acc, pedido) => {
      const clienteId = safeText(pedido?.criador?.id || pedido?.criadorUid || pedido?.clienteId)
      if (clienteId) acc[clienteId] = (acc[clienteId] || 0) + 1
      return acc
    }, {})
    const clientesRecorrentes = Object.values(conclusoesPorCliente).filter((total) => total >= 2).length

    const hoje = new Date()
    const semana = Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(hoje)
      date.setDate(hoje.getDate() - (6 - idx))
      const key = date.toISOString().slice(0, 10)
      return {
        key,
        label: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        value: 0,
      }
    })
    const byKey = Object.fromEntries(semana.map((day) => [day.key, day]))

    concluidos.forEach((pedido) => {
      const ms = getMs(pedido?.concluidoEm || pedido?.atualizadoEm || pedido?.aceitoEm || pedido?.criadoEm)
      if (!ms) return
      const key = new Date(ms).toISOString().slice(0, 10)
      if (byKey[key]) byKey[key].value += getValorPedido(pedido?.valor)
    })

    const ganhosSemana = semana.reduce((sum, item) => sum + Number(item.value || 0), 0)

    return {
      total: meus.length,
      ativos: ativos.length,
      concluidos: concluidos.length,
      ganhosTotal,
      ganhosSemana,
      taxaConclusao,
      notaMedia,
      avaliacoes: notas.length,
      ticketMedio,
      tempoMedioRespostaMs,
      amostrasResposta: temposResposta.length,
      clientesRecorrentes,
      semana,
    }
  }, [corres, meuId])

  /* =======================
     3) Ler pedidos
  ======================= */
  useEffect(() => {
    if (pedidosCacheReady) {
      setCorres(pedidosCache)
      setLoadingPedidos(false)
    } else {
      setLoadingPedidos(true)
    }
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

        pedidosCache = lista
        pedidosCacheReady = true
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
     4) Ler /presence (online)
  ======================= */
  useEffect(() => {
    debugPresence('lendo presence', { path: 'presence', origem: 'Mapadinamico' })
    const off = onValue(
      ref(database, 'presence'),
      (snap) => {
        const raw = snap.val() || {}
        debugPresence('total bruto de children em /presence', {
          total: Object.keys(raw).length,
          origem: 'Mapadinamico',
        })
        setUsersObj(raw)
      },
      (error) => {
        console.warn('[PRESENCE] erro lendo presence', error)
      }
    )
    return () => off()
  }, [])

  useEffect(() => {
    if (!meuId) {
      setPublicPortfolioObj({})
      return
    }

    const off = onValue(
      ref(database, 'publicPortfolio'),
      (snap) => {
        setPublicPortfolioObj(snap.val() || {})
      },
      (error) => {
        console.warn('[PORTFOLIO] erro lendo publicPortfolio', error)
        setPublicPortfolioObj({})
      }
    )

    return () => off()
  }, [meuId])

  useEffect(() => {
    if (!meuId) {
      setRegisteredUsersObj({})
      return
    }

    const off = onValue(
      query(ref(database, 'publicProfiles'), limitToLast(300)),
      (snap) => {
        setRegisteredUsersObj(snap.val() || {})
      },
      (error) => {
        console.warn('[CLIENTE_HOME] erro lendo publicProfiles', error)
        setRegisteredUsersObj({})
      }
    )

    return () => off()
  }, [meuId])

  const registeredUsers = useMemo(() => {
    return Object.entries(registeredUsersObj || {})
      .map(([uid, value]) => ({
        uid,
        id: uid,
        ...(value || {}),
      }))
      .filter((profile) => canAppearInPublicDirectory(profile))
  }, [registeredUsersObj])

  const publicProfilesByUid = useMemo(() => {
    return new Map(
      registeredUsers
        .map((profile) => [String(profile?.uid || profile?.id || ''), profile])
        .filter(([uid]) => uid)
    )
  }, [registeredUsers])

  const { usuariosOnlineLista, usuariosOnlineMapa } = useMemo(() => {
    const now = Date.now()
    const publicPresence = Object.fromEntries(
      Object.entries(usersObj || {})
        .map(([uid, presence]) => {
          const publicProfile = publicProfilesByUid.get(String(uid))
          const merged = publicProfile
            ? mergePublicProfileWithPresence(publicProfile, { uid, id: uid, ...(presence || {}) }, now)
            : null
          return merged ? [uid, merged] : null
        })
        .filter(Boolean)
    )

    return splitUsuariosOnline(publicPresence, now)
  }, [usersObj, publicProfilesByUid])

  const onlineUsers = usuariosOnlineLista

  const onlineUsersFiltrados = useMemo(() => {
    const t = buscaUsuarioMapa.trim().toLowerCase()
    if (!t) return usuariosOnlineMapa
    return usuariosOnlineMapa.filter((u) => {
      const nome = String(u?.nome || '').toLowerCase()
      const cidade = String(u?.cidade || '').toLowerCase()
      return nome.includes(t) || cidade.includes(t)
    })
  }, [buscaUsuarioMapa, usuariosOnlineMapa])


  const onlineUsersParaPerfil = useMemo(() => {
    return (onlineUsers || []).filter((u) => {
      if (!u) return false
      const prof = u?.profissional || null
      return !!(u?.nome || prof?.titulo || prof?.descricao)
    })
  }, [onlineUsers])

  const meuPublicProfile = useMemo(() => {
    if (!meuId) return null
    const profile = registeredUsersObj?.[meuId]
    return profile ? { uid: meuId, id: meuId, ...(profile || {}) } : null
  }, [registeredUsersObj, meuId])

  const meuUserNode = useMemo(() => {
    if (!meuId) return null
    const presenceNode = usersObj?.[meuId] || {}
    const profileNode = meuUserProfile || {}
    return {
      ...presenceNode,
      ...profileNode,
      ...(meuPublicProfile || {}),
      online: presenceNode?.online ?? profileNode?.online,
      lastSeen: presenceNode?.lastSeen ?? profileNode?.lastSeen,
      updatedAt: presenceNode?.updatedAt ?? profileNode?.updatedAt,
      local: presenceNode?.local ?? profileNode?.local,
      latitude: presenceNode?.latitude ?? profileNode?.latitude,
      longitude: presenceNode?.longitude ?? profileNode?.longitude,
    }
  }, [usersObj, meuId, meuUserProfile, meuPublicProfile])

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

  const isProfissional = useMemo(() => !!(meuUserNode?.isProfissional || meuPublicProfile?.isProfissional), [meuUserNode, meuPublicProfile])

  const minhasIniciais = useMemo(() => {
    const partes = String(meuNome || 'Corre Aqui').trim().split(/\s+/).filter(Boolean)
    return partes.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || 'CA'
  }, [meuNome])

  const minhasCategoriasProf = useMemo(() => {
    const arr = meuUserNode?.profCategorias
    return Array.isArray(arr) ? arr : []
  }, [meuUserNode])

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

  const clientePedidosCount = useMemo(() => {
    if (!meuId) return 0
    return (corres || []).filter((p) => String(p?.criador?.id || '') === String(meuId)).length
  }, [corres, meuId])

  const getCatObj = useCallback((id) => {
    if (!id) return null
    return getCategoryById(id)
  }, [])

  const buscaTerm = useMemo(() => busca.trim().toLowerCase(), [busca])

  const corresFiltrados = useMemo(() => {
    return (corres || [])
      .filter((p) => {
        const modo = String(p?.modoPedido || 'geral').toLowerCase()

        if (modo === 'profissional' && !isProfissional) return false

        const status = normalizeAtendimentoStatus(p?.status)
        if (filtro === 'abertos' && status !== ATENDIMENTO_STATUS.ABERTO) return false
        if (filtro === 'meus' && p?.aceite?.id !== meuId) return false
        if (filtro === 'finalizados' && status !== ATENDIMENTO_STATUS.FINALIZADO) return false
        if (status === ATENDIMENTO_STATUS.ABERTO && !getRequestFreshness(p, pedidosFreshnessNow).visibleInPublicList) return false

        const cat = p?.categoriaId ?? p?.categoria ?? p?.category ?? null
        if (categoriaFiltro === 'sem') {
          if (cat) return false
        } else if (categoriaFiltro !== 'todas') {
          if (!categoryMatches(cat, categoriaFiltro)) return false
        }

        if (buscaTerm) {
          const t = buscaTerm
          const hay =
            (p.titulo || '').toLowerCase().includes(t) ||
            (p.descricao || '').toLowerCase().includes(t) ||
            (p.criador?.nome || '').toLowerCase().includes(t)
          if (!hay) return false
        }
        return true
      })
      .sort((a, b) => comparePedidosDisponiveis(a, b, meuUserNode, pedidosFreshnessNow))
  }, [corres, filtro, buscaTerm, meuId, categoriaFiltro, isProfissional, meuUserNode, pedidosFreshnessNow])

  useEffect(() => {
    setPedidosRenderLimit(PEDIDOS_PAGE_SIZE)
  }, [filtro, categoriaFiltro, buscaTerm])

  const pedidosAntigosOcultosCount = useMemo(() => {
    if (filtro === 'meus' || filtro === 'finalizados') return 0

    return (corres || []).filter((p) => {
      const modo = String(p?.modoPedido || 'geral').toLowerCase()
      if (modo === 'profissional' && !isProfissional) return false

      const status = normalizeAtendimentoStatus(p?.status)
      if (status !== ATENDIMENTO_STATUS.ABERTO) return false
      if (getRequestFreshness(p, pedidosFreshnessNow).visibleInPublicList) return false

      const cat = p?.categoriaId ?? p?.categoria ?? p?.category ?? null
      if (categoriaFiltro === 'sem') {
        if (cat) return false
      } else if (categoriaFiltro !== 'todas') {
        if (!categoryMatches(cat, categoriaFiltro)) return false
      }

      if (buscaTerm) {
        const t = buscaTerm
        const hay =
          (p.titulo || '').toLowerCase().includes(t) ||
          (p.descricao || '').toLowerCase().includes(t) ||
          (p.criador?.nome || '').toLowerCase().includes(t)
        if (!hay) return false
      }

      return true
    }).length
  }, [corres, filtro, categoriaFiltro, buscaTerm, isProfissional, pedidosFreshnessNow])

  const pedidosRenderizados = useMemo(
    () => (corresFiltrados || []).slice(0, pedidosRenderLimit),
    [corresFiltrados, pedidosRenderLimit]
  )
  const pedidosTotalElegivel = corresFiltrados.length
  const pedidosTotalRenderizado = pedidosRenderizados.length
  const pedidosTemMais = pedidosTotalRenderizado < pedidosTotalElegivel

  const categoriaPedidosCount = useMemo(() => {
    const counts = { todas: 0, sem: 0 }
    ;(CATEGORIES || []).forEach((cat) => {
      counts[cat.id] = 0
    })

    ;(corres || []).forEach((p) => {
      const modo = String(p?.modoPedido || 'geral').toLowerCase()
      if (modo === 'profissional' && !isProfissional) return

      const status = normalizeAtendimentoStatus(p?.status)
      if (filtro === 'abertos' && status !== 'aberto') return
      if (filtro === 'meus' && p?.aceite?.id !== meuId) return
      if (filtro === 'finalizados' && status !== ATENDIMENTO_STATUS.FINALIZADO) return
      if (status === ATENDIMENTO_STATUS.ABERTO && !getRequestFreshness(p, pedidosFreshnessNow).visibleInPublicList) return

      if (buscaTerm) {
        const t = buscaTerm
        const hay =
          (p.titulo || '').toLowerCase().includes(t) ||
          (p.descricao || '').toLowerCase().includes(t) ||
          (p.criador?.nome || '').toLowerCase().includes(t)
        if (!hay) return
      }

      counts.todas += 1
      const rawCat = p?.categoriaId ?? p?.categoria ?? p?.category ?? null
      if (!rawCat) {
        counts.sem += 1
        return
      }

      const canonical = getCanonicalCategoryId(rawCat)
      if (counts[canonical] == null) counts[canonical] = 0
      counts[canonical] += 1
    })

    return counts
  }, [corres, filtro, buscaTerm, meuId, isProfissional, pedidosFreshnessNow])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof router.prefetch !== 'function' || modoApp !== 'corre') return undefined

    const pedidosVisiveis = (corresFiltrados || []).slice(0, 12)
    if (!pedidosVisiveis.length) return undefined

    const run = () => {
      pedidosVisiveis.forEach((pedido) => {
        if (pedido?.id) router.prefetch(`/pedido/${encodeURIComponent(String(pedido.id))}?voltar=${modoApp}`)
      })
    }

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(run, { timeout: 1200 })
      return () => window.cancelIdleCallback?.(idleId)
    }

    const timer = window.setTimeout(run, 300)
    return () => window.clearTimeout(timer)
  }, [corresFiltrados, modoApp, router])

  const resumoCorre = useMemo(() => {
    const lista = Array.isArray(corres) ? corres : []
    return lista.reduce(
      (acc, p) => {
        const status = normalizeAtendimentoStatus(p?.status)
        if (status === 'aberto') acc.abertos += 1
        if (p?.aceite?.id === meuId) acc.meus += 1
        if (status === ATENDIMENTO_STATUS.FINALIZADO) acc.concluidos += 1
        return acc
      },
      { abertos: 0, meus: 0, concluidos: 0 }
    )
  }, [corres, meuId])

  const ganhosStatsPorModo = useMemo(() => {
    const meus = (Array.isArray(corres) ? corres : []).filter((p) => p?.aceite?.id === meuId)

    const buildStats = (modo) => {
      const modoProf = modo === 'prof'
      const pedidosModo = meus.filter((p) => {
        const isProf = String(p?.modoPedido || 'geral').toLowerCase() === 'profissional'
        return modoProf ? isProf : !isProf
      })
      const concluidos = pedidosModo.filter((p) => normalizeAtendimentoStatus(p?.status) === ATENDIMENTO_STATUS.FINALIZADO)
      const ativos = pedidosModo.filter((p) => isPedidoAtivoStatus(p?.status))
      const notas = concluidos
        .map((p) => Number(p?.avaliacao?.nota || p?.avaliacaoNota || 0))
        .filter((n) => Number.isFinite(n) && n > 0)
      const ganhosTotal = concluidos.reduce((sum, p) => sum + getValorPedido(p?.valor), 0)
      const taxaConclusao = pedidosModo.length ? Math.round((concluidos.length / pedidosModo.length) * 100) : 0
      const notaMedia = notas.length ? notas.reduce((sum, n) => sum + n, 0) / notas.length : 0
      const ticketMedio = concluidos.length ? ganhosTotal / concluidos.length : 0

      const hoje = new Date()
      const semana = Array.from({ length: 7 }, (_, idx) => {
        const d = new Date(hoje)
        d.setDate(hoje.getDate() - (6 - idx))
        const key = d.toISOString().slice(0, 10)
        return {
          key,
          label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
          value: 0,
        }
      })
      const byKey = Object.fromEntries(semana.map((d) => [d.key, d]))

      concluidos.forEach((p) => {
        const ms = getMs(p?.concluidoEm || p?.atualizadoEm || p?.aceitoEm || p?.criadoEm)
        if (!ms) return
        const key = new Date(ms).toISOString().slice(0, 10)
        if (byKey[key]) byKey[key].value += getValorPedido(p?.valor)
      })

      return {
        label: modoProf ? 'Profissional' : 'Corre',
        shortLabel: modoProf ? 'Prof' : 'Corre',
        total: pedidosModo.length,
        ativos: ativos.length,
        concluidos: concluidos.length,
        ganhosTotal,
        ganhosSemana: semana.reduce((sum, item) => sum + Number(item.value || 0), 0),
        taxaConclusao,
        notaMedia,
        ticketMedio,
        semana,
        recentes: concluidos
          .sort((a, b) => getMs(b?.concluidoEm || b?.atualizadoEm || b?.criadoEm) - getMs(a?.concluidoEm || a?.atualizadoEm || a?.criadoEm))
          .slice(0, 6),
      }
    }

    return {
      corre: buildStats('corre'),
      prof: buildStats('prof'),
    }
  }, [corres, meuId])

  const ganhosSelecionados = ganhosStatsPorModo[ganhosModo] || ganhosStatsPorModo.corre

  const ganhosMaxDia = useMemo(() => {
    return Math.max(...(ganhosSelecionados?.semana || []).map((dia) => Number(dia.value || 0)), 1)
  }, [ganhosSelecionados])

  const ganhosRecentes = useMemo(() => {
    return ganhosSelecionados?.recentes || []
  }, [ganhosSelecionados])

  const aceitarCorreRef = useRef(null)

  async function aceitarCorre(p) {
    if (!meuId) {
      showToast({ type: 'error', title: 'Sem login', message: 'Entre para aceitar.' })
      return
    }

    const statusAtual = normalizeAtendimentoStatus(p?.status)
    if (statusAtual !== ATENDIMENTO_STATUS.ABERTO || p?.aceite?.id) {
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
      await transitionAtendimento({
        database,
        pedidoId: p.id,
        actorUid: meuId,
        expectedStatus: ATENDIMENTO_STATUS.ABERTO,
        nextStatus: ATENDIMENTO_STATUS.ACEITO,
        atendimentoPatch: {
          aceitoEm: agora,
          aceitoPor: { id: meuId, nome: aceite.nome },
        },
        topLevelPatch: {
          aceite,
          conversaId,
          aceitoEm: agora,
          atualizadoEmServer: serverTimestamp(),
        },
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
          pedidoStatus: ATENDIMENTO_STATUS.ACEITO,
          categoriaId: p?.categoriaId || p?.categoria || '',
          categoriaNome: p?.categoriaNome || p?.categoriaLabel || '',
          valor: p?.valor || null,
          tipoNotificacao: 'corre_aceito',
          lastText: `${meuNome || 'Alguém'} aceitou seu corre.`,
          lastAt: agora,
          lastById: meuId,
          lastByNome: meuNome || 'Anônimo',
          mensagemPreview: `${meuNome || 'Alguém'} aceitou seu corre.`,
          updatedAt: agora,
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
        pedidoStatus: ATENDIMENTO_STATUS.ACEITO,
        categoriaId: p?.categoriaId || p?.categoria || '',
        categoriaNome: p?.categoriaNome || p?.categoriaLabel || '',
        valor: p?.valor || null,
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

      if (p?.criador?.id) {
        await notifyPublicRequestAccepted({
          database,
          pedido: { ...p, conversaId },
          profissional: {
            ...meuUserNode,
            uid: meuId,
            nome: meuNome || meuUserNode?.nome || 'Corre',
          },
          aceitoEm: agora,
        })
      }

      showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.pedidoAceito, {
        id: CONTEXTUAL_TIP_IDS.pedidoAceito,
        target: 'aceitar-pedido',
      })

      router.replace(`/pedido/${encodeURIComponent(String(p.id))}?voltar=corre&aceito=1`)
      showToast({
        type: 'success',
        title: 'Corre aceito! ✅',
        message: `Você aceitou "${p.titulo || 'Corre aqui'}" às ${formatDataHora(agora)}.`,
      })
    } catch (e) {
      console.error('Erro ao aceitar:', e)
      showToast({ type: 'error', title: 'Falha ao aceitar', message: e?.message || 'Veja o console.' })
    } finally {
      setAceitandoId(null)
    }
  }
  aceitarCorreRef.current = aceitarCorre

  async function cancelarAceite(p) {
    if (cancelandoId) return
    setCancelandoId(p.id)

    try {
      if (p?.aceite?.id && p.aceite.id !== meuId) {
        showToast({ type: 'error', title: 'Ops', message: 'Esse corre foi aceito por outra pessoa.' })
        return
      }

      await transitionAtendimento({
        database,
        pedidoId: p.id,
        actorUid: meuId,
        expectedStatus: normalizeAtendimentoStatus(p.status),
        nextStatus: ATENDIMENTO_STATUS.CANCELADO,
        atendimentoPatch: {
          canceladoEm: Date.now(),
          canceladoPor: { id: meuId, nome: meuNome || 'Profissional' },
        },
        topLevelPatch: {
          canceladoEm: Date.now(),
          canceladoPor: { id: meuId, nome: meuNome || 'Profissional' },
          atualizadoEmServer: serverTimestamp(),
        },
      })

      if (mapItem?.id === p.id) setMapItem(null)
      if (chatPedido?.id === p.id) setChatPedido(null)

      showToast({ type: 'success', title: 'Atendimento cancelado', message: 'O pedido foi encerrado sem voltar para uma etapa anterior.' })
    } catch (e) {
      console.error('Erro ao cancelar aceite:', e)
      showToast({ type: 'error', title: 'Falha ao cancelar', message: e?.message || 'Veja o console.' })
    } finally {
      setCancelandoId(null)
    }
  }

  async function avancarAtendimento(p, nextStatus) {
    if (!p?.id || !meuId || atendimentoId) return

    const currentStatus = normalizeAtendimentoStatus(p.status)
    const isWorker = String(p?.aceite?.id || '') === String(meuId)
    const isClient = String(p?.criador?.id || '') === String(meuId)
    if (!isWorker && !(nextStatus === ATENDIMENTO_STATUS.FINALIZADO && isClient)) return

    setAtendimentoId(p.id)
    try {
      const agora = Date.now()
      const conversaId = p?.conversaId || p.id
      const profissionalNome = p?.aceite?.nome || 'Profissional'
      const clienteNome = p?.criador?.nome || 'Cliente'
      const event = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
        ? 'atendimento_iniciado'
        : nextStatus === ATENDIMENTO_STATUS.CHEGOU
          ? 'atendimento_chegou'
          : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
            ? 'finalizacao_solicitada'
            : 'atendimento_finalizado'
      const text = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
        ? '✓ Atendimento iniciado.'
        : nextStatus === ATENDIMENTO_STATUS.CHEGOU
          ? `✓ ${profissionalNome} informou que chegou ao local.`
          : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
            ? `✓ ${profissionalNome} solicitou a finalização do atendimento.`
            : '✓ Atendimento finalizado com sucesso.'
      const actorName = isClient ? clienteNome : profissionalNome

      const patch = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
        ? { iniciadoEm: agora, iniciadoPor: { id: meuId, nome: actorName } }
        : nextStatus === ATENDIMENTO_STATUS.CHEGOU
          ? { chegouEm: agora, chegouPor: { id: meuId, nome: actorName } }
          : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
            ? { finalizacaoSolicitadaEm: agora, finalizacaoSolicitadaPor: { id: meuId, nome: actorName } }
            : { finalizadoEm: agora, finalizadoPor: { id: meuId, nome: actorName } }

      await transitionAtendimento({
        database,
        pedidoId: p.id,
        actorUid: meuId,
        expectedStatus: currentStatus,
        nextStatus,
        atendimentoPatch: patch,
        topLevelPatch: { ...patch, ...(nextStatus === ATENDIMENTO_STATUS.FINALIZADO ? { avaliacaoPendente: true } : {}) },
      })

      const updates = {}
      for (const uid of [p?.criador?.id, p?.aceite?.id]) {
        if (!uid) continue
        updates[`conversas/${uid}/${conversaId}/pedidoStatus`] = nextStatus
        updates[`conversas/${uid}/${conversaId}/lastText`] = text
        updates[`conversas/${uid}/${conversaId}/mensagemPreview`] = text
        updates[`conversas/${uid}/${conversaId}/lastAt`] = agora
        updates[`conversas/${uid}/${conversaId}/updatedAt`] = agora
        updates[`conversas/${uid}/${conversaId}/lastById`] = meuId
        updates[`conversas/${uid}/${conversaId}/lastByNome`] = actorName
        updates[`conversas/${uid}/${conversaId}/unread`] = uid !== meuId
        updates[`conversas/${uid}/${conversaId}/status`] = nextStatus === ATENDIMENTO_STATUS.FINALIZADO ? 'arquivavel' : 'ativa'
      }

      const destinatario = isWorker ? p?.criador?.id : p?.aceite?.id
      const notificationId = destinatario
        ? createEventNotificationId({
            type: event,
            sourceId: p.id,
            toUid: destinatario,
            state: nextStatus,
          })
        : ''
      const notificationTitle = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
        ? 'Atendimento iniciado'
        : nextStatus === ATENDIMENTO_STATUS.CHEGOU
          ? 'Seu profissional chegou'
          : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
            ? 'Confirme a conclusão'
            : 'Serviço concluído ✅'
      const notificationMessage = nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO
        ? `${profissionalNome} iniciou o atendimento do seu pedido.`
        : nextStatus === ATENDIMENTO_STATUS.CHEGOU
          ? `${profissionalNome} informou que chegou ao local.`
          : nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO
            ? `${profissionalNome} solicitou a finalização do atendimento.`
            : 'O cliente confirmou a conclusão do atendimento.'
      const notificationAction = nextStatus === ATENDIMENTO_STATUS.FINALIZADO
        ? { label: 'Ver histórico', screen: 'ver_historico', id: p.id }
        : { label: 'Abrir atendimento', screen: 'chat', id: conversaId }
      if (destinatario) {
        const notification = {
          id: notificationId,
          eventId: notificationId,
          tipo: event,
          titulo: notificationTitle,
          mensagem: notificationMessage,
          pedidoId: p.id,
          fromUid: meuId,
          toUid: destinatario,
          lida: false,
          read: false,
          criadoEm: agora,
          action: notificationAction,
          autor: { id: meuId, nome: actorName },
        }
        updates[`notifications/${destinatario}/${notificationId}`] = notification
        updates[`notificacoes/${destinatario}/${notificationId}`] = notification
      }

      await update(ref(database), updates)
      const message = { texto: text, sistema: true, evento: event, criadoEm: agora, hora: agora, autorId: 'sistema', autorNome: 'Sistema' }
      await set(ref(database, `chats/${conversaId}/msg_${event}`), message)
      await set(ref(database, `mensagens/${conversaId}/msg_${event}`), message).catch(() => {})
      if (destinatario) {
        enviarPushParaUsuario(destinatario, {
          type: event,
          pedidoId: p.id,
          conversaId,
          titulo: notificationTitle,
          mensagem: notificationMessage,
          prioridade: 'alta',
          action: notificationAction,
          notificationId,
          eventId: notificationId,
        })
      }
      if (nextStatus === ATENDIMENTO_STATUS.EM_ANDAMENTO) {
        showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.atendimentoIniciado, {
          id: CONTEXTUAL_TIP_IDS.atendimentoIniciado,
          target: 'progresso',
        })
      } else if (nextStatus === ATENDIMENTO_STATUS.CHEGOU) {
        showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.cheguei, {
          id: CONTEXTUAL_TIP_IDS.cheguei,
          target: 'progresso',
        })
      } else if (nextStatus === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) {
        showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.solicitarConclusao, {
          id: CONTEXTUAL_TIP_IDS.solicitarConclusao,
          target: 'confirmacao-final',
        })
      } else if (nextStatus === ATENDIMENTO_STATUS.FINALIZADO) {
        showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.conclusaoConfirmada, {
          id: CONTEXTUAL_TIP_IDS.conclusaoConfirmada,
          evaluationActive: true,
        })
      }
      showToast({ type: 'success', title: 'Atendimento atualizado', message: text })
    } catch (error) {
      console.error('Erro ao avançar atendimento:', error)
      showToast({ type: 'error', title: 'Falha no atendimento', message: error?.message || 'Tente novamente.' })
    } finally {
      setAtendimentoId(null)
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

        if (normalizeAtendimentoStatus(p.status) !== ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) {
          showToast({
            type: 'info',
            title: 'Ainda não',
            message: 'A confirmação só fica disponível quando o profissional solicitar a finalização.',
        })
        return
      }

      const concluidoAgora = Date.now()
      const conversaId = p?.conversaId || p.id
      const completionEventId = aceitadorId
        ? createEventNotificationId({
            type: 'atendimento_finalizado',
            sourceId: p.id,
            toUid: aceitadorId,
            state: ATENDIMENTO_STATUS.FINALIZADO,
          })
        : ''

      await transitionAtendimento({
        database,
        pedidoId: p.id,
        actorUid: meuId,
        expectedStatus: ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO,
        nextStatus: ATENDIMENTO_STATUS.FINALIZADO,
        atendimentoPatch: {
          finalizadoEm: concluidoAgora,
          finalizadoPor: { id: meuId, nome: meuNome || 'Cliente' },
        },
        topLevelPatch: {
          finalizadoEm: concluidoAgora,
          finalizadoPor: { id: meuId, nome: meuNome || 'Cliente' },
          avaliacaoPendente: true,
          atualizadoEmServer: serverTimestamp(),
        },
      })

      await update(ref(database, `pedidos/${p.id}`), {
        concluidoEm: concluidoAgora,
        concluidoPor: { id: meuId, nome: meuNome || 'Anônimo' },
        avaliacaoPendente: true,
        atualizadoEm: concluidoAgora,
        atualizadoEmServer: serverTimestamp(),
      })

      if (aceitadorId && aceitadorId !== meuId) {
        const notification = {
          id: completionEventId,
          eventId: completionEventId,
          tipo: 'servico_concluido',
          pedidoId: p.id,
          conversaId,
          titulo: 'Serviço concluído ✅',
          mensagem: 'O cliente confirmou a conclusão do atendimento.',
          prioridade: 'media',
          lida: false,
          read: false,
          criadoEm: concluidoAgora,
          fromUid: meuId,
          toUid: aceitadorId,
          action: { label: 'Ver histórico', screen: 'ver_historico', id: p.id },
          autor: { id: meuId, nome: meuNome || 'Cliente' },
        }
        await Promise.allSettled([
          set(ref(database, `notifications/${aceitadorId}/${completionEventId}`), notification),
          set(ref(database, `notificacoes/${aceitadorId}/${completionEventId}`), notification),
        ]).then((results) => {
          const notifyError = results.find((result) => result.status === 'rejected')
          if (!notifyError) return
          if (process.env.NODE_ENV !== 'production') {
            console.warn('Serviço concluído, mas a notificação não foi enviada:', notifyError)
          }
        })

        enviarPushParaUsuario(aceitadorId, {
          type: 'atendimento_finalizado',
          pedidoId: p.id,
          conversaId,
          titulo: 'Serviço concluído ✅',
          mensagem: 'O cliente confirmou a conclusão do atendimento.',
          prioridade: 'media',
          action: { label: 'Ver histórico', screen: 'ver_historico', id: p.id },
          notificationId: completionEventId,
          eventId: completionEventId,
        })
      }

      const completionMessage = {
        texto: '✓ Atendimento finalizado com sucesso.',
        sistema: true,
        evento: 'atendimento_finalizado',
        criadoEm: concluidoAgora,
        hora: concluidoAgora,
        autorId: 'sistema',
        autorNome: 'Sistema',
      }
      await set(ref(database, `chats/${conversaId}/msg_atendimento_finalizado`), completionMessage).catch(() => {})
      await set(ref(database, `mensagens/${conversaId}/msg_atendimento_finalizado`), completionMessage).catch(() => {})

      if (meuId && aceitadorId && aceitadorId === meuId && p?.criador?.id !== meuId) {
        await contabilizarAtendimentoFinalizado({ database, pedido: p, uid: meuId })
      }

      showToast({
        type: 'success',
        title: 'Fechado!',
        message: 'Serviço concluído. Agora avalie como foi a experiência.',
      })

      showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.conclusaoConfirmada, {
        id: CONTEXTUAL_TIP_IDS.conclusaoConfirmada,
        evaluationActive: true,
      })

      setConclusaoPedido(null)
      abrirAvaliacao({ ...p, status: ATENDIMENTO_STATUS.FINALIZADO, finalizadoEm: concluidoAgora })
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
        const notificationId = createEventNotificationId({
          type: 'avaliacao_recebida',
          sourceId: p.id,
          toUid: avaliadoId,
          state: 'recebida',
        })
        const notification = {
          id: notificationId,
          eventId: notificationId,
          tipo: 'avaliacao_recebida',
          pedidoId: p.id,
          conversaId: p?.conversaId || p.id,
          titulo: 'Você recebeu uma avaliação ⭐',
          mensagem: 'Veja como foi seu atendimento.',
          prioridade: 'media',
          lida: false,
          read: false,
          criadoEm: agora,
          fromUid: meuId,
          toUid: avaliadoId,
          action: { label: 'Ver avaliações', screen: 'avaliacoes', id: p.id },
          autor: { id: meuId, nome: meuNome || 'Cliente' },
        }
        await Promise.allSettled([
          set(ref(database, `notifications/${avaliadoId}/${notificationId}`), notification),
          set(ref(database, `notificacoes/${avaliadoId}/${notificationId}`), notification),
        ]).then((results) => {
          const notifyError = results.find((result) => result.status === 'rejected')
          if (!notifyError) return
          if (process.env.NODE_ENV !== 'production') {
            console.warn('Avaliação salva, mas a notificação não foi enviada:', notifyError)
          }
        })

        enviarPushParaUsuario(avaliadoId, {
          type: 'avaliacao_recebida',
          pedidoId: p.id,
          conversaId: p?.conversaId || p.id,
          titulo: 'Você recebeu uma avaliação ⭐',
          mensagem: 'Veja como foi seu atendimento.',
          prioridade: 'media',
          action: { label: 'Ver avaliações', screen: 'avaliacoes', id: p.id },
          notificationId,
          eventId: notificationId,
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
    const s = normalizeAtendimentoStatus(status)
    if (s === ATENDIMENTO_STATUS.ABERTO)
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
    if (isPedidoAtivoStatus(s))
      return (
        <span className="rounded-full border border-amber-300/50 bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-800 md:py-1 md:text-xs">
          {s === ATENDIMENTO_STATUS.ACEITO ? 'ACEITO' : s === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO ? 'CONFIRMACAO PENDENTE' : s === ATENDIMENTO_STATUS.CHEGOU ? 'CHEGOU' : 'EM ANDAMENTO'}
        </span>
      )
    if (s === ATENDIMENTO_STATUS.FINALIZADO)
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

  const getOutroUserComPresence = (p) => {
    const base = getOutroUser(p)
    const presence = base?.id ? usersObj?.[base.id] || null : null
    return {
      ...base,
      fotoURL: base?.fotoURL || base?.photoURL || presence?.fotoURL || presence?.photoURL || '',
      photoURL: base?.photoURL || base?.fotoURL || presence?.photoURL || presence?.fotoURL || '',
      online: isOnlineRecente(presence),
      lastSeen: getOnlineTimestamp(presence),
      presence,
    }
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

  const abrirFichaPedido = useCallback((pedido) => {
    if (!pedido?.id) return
    const href = `/pedido/${encodeURIComponent(String(pedido.id))}?voltar=${modoApp}`
    if (DEBUG_NAV_PERF) console.time('open-card')
    saveListState(false)
    setAbrindoPedidoId(pedido.id)
    router.prefetch?.(href)
    router.push(href)
    if (DEBUG_NAV_PERF) {
      window.requestAnimationFrame(() => console.timeEnd('open-card'))
    }
  }, [modoApp, router, saveListState])

  const abrirChatFocado = useCallback((pedido) => {
    if (!pedido?.id) return
    saveListState(false)
    setClientePainelBaixo('')
    setChatPedido(null)
    router.push(`/chat/${encodeURIComponent(String(pedido.id))}?voltar=${modoApp}`)
  }, [modoApp, router, saveListState])

  const abrirBoostPedido = useCallback((pedido) => {
    if (!COMMERCIAL_HIGHLIGHTS_UI_ENABLED) return
    if (!pedido?.id) return
    setBoostCheckoutResult(null)
    setBoostPedidoModal(pedido)
  }, [])

  const criarCheckoutBoost = useCallback(async () => {
    if (!COMMERCIAL_HIGHLIGHTS_UI_ENABLED) return
    if (!boostPedidoModal?.id) return
    setBoostCheckoutLoading(true)
    setBoostCheckoutResult(null)

    try {
      const user = auth.currentUser
      if (!user) {
        setBoostCheckoutResult({ type: 'error', message: 'Entre na sua conta para impulsionar o pedido.' })
        return
      }

      const token = await user.getIdToken()
      const response = await fetch('/api/request-boost/checkout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: REQUEST_BOOST_PRODUCT_ID,
          pedidoId: boostPedidoModal.id,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.ok) {
        setBoostCheckoutResult({
          type: 'error',
          message: data?.reason || data?.error || 'Nao foi possivel criar o checkout agora.',
        })
        return
      }

      setBoostCheckoutResult({
        type: 'success',
        message: data?.message || 'Checkout criado. Aguarde a confirmacao do pagamento.',
      })
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    } catch (error) {
      console.error('[BOOST] checkout do pedido falhou:', error)
      setBoostCheckoutResult({ type: 'error', message: 'Falha temporaria ao criar checkout.' })
    } finally {
      setBoostCheckoutLoading(false)
    }
  }, [boostPedidoModal])

  const abrirAcaoNotificacao = useCallback((screen, notificacao = {}) => {
    const action = notificacao?.action || {}
    const destino = String(screen || action?.screen || '').toLowerCase()
    const id = action?.id || notificacao?.privateRequestId || notificacao?.pedidoId || notificacao?.conversaId || notificacao?.servicoId

    if ((destino === 'abrir_pedido' || destino === 'pedido' || destino === 'pedidodetails' || destino === 'pedido_details') && id) {
      setChatPedido(null)
      router.push(`/pedido/${encodeURIComponent(String(id))}?voltar=${modoApp}`)
      return
    }

    if (destino === 'chat' && id) {
      abrirChatFocado({ id, titulo: notificacao?.titulo || 'Conversa do pedido' })
      return
    }

    if (destino === 'agenda' || destino === 'privaterequestdetails') {
      const href = id
        ? `/corre/agenda?requestId=${encodeURIComponent(String(id))}`
        : '/corre/agenda'
      router.replace(href)
      return
    }

    if (destino === 'myorders') {
      setModoApp('cliente')
      setChatPedido(null)
      setClientePainelBaixo('meusPedidos')
      return
    }

    if (destino === 'professionalreviews') {
      setModoApp('corre')
      setChatPedido(null)
      setClientePainelBaixo('')
      setTab('corre')
      setPerfilInitialTab('profissional')
      setPerfilInitialProfSection('avaliacoes')
      setOpenProfileMenu(false)
      setOpenPerfil(true)
      return
    }

    if (destino === 'portfolio') {
      setModoApp('cliente')
      setChatPedido(null)
      setClientePainelBaixo('')
      showToast({
        type: 'info',
        title: 'Veja outros profissionais',
        message: 'Abra um perfil ou servico do portfolio para tentar novamente.',
      })
    }
  }, [abrirChatFocado, modoApp, router, showToast])

  const abrirPerfilCliente = useCallback((u) => {
    if (!u) {
      setOpenProfileMenu(true)
      return
    }

    setUsuarioSelecionado(u)

    const uidPerfil = u?.uid || u?.id || u?.profissionalId
    if (uidPerfil) {
      get(ref(database, `users/${uidPerfil}`))
        .then((snap) => {
          const full = snap.val()
          if (!full) return

          setUsuarioSelecionado((current) => {
            const currentUid = current?.uid || current?.id || current?.profissionalId
            if (currentUid && currentUid !== uidPerfil) return current

            const profile = full.profile || {}
            return {
              ...u,
              ...full,
              uid: uidPerfil,
              id: uidPerfil,
              online: u?.online ?? full?.online,
              lastSeen: u?.lastSeen ?? full?.lastSeen,
              updatedAt: u?.updatedAt ?? full?.updatedAt,
              local: u?.local ?? full?.local,
              latitude: u?.latitude ?? full?.latitude,
              longitude: u?.longitude ?? full?.longitude,
              portfolio: full?.portfolio || profile?.portfolio || u?.portfolio,
              profPortfolio: full?.profPortfolio || profile?.profPortfolio || u?.profPortfolio,
            }
          })
        })
        .catch((error) => {
          console.warn('[PERFIL] erro lendo users/{uid} para ficha publica', error)
        })
    }

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
  }, [showToast])

  const criarPedidoDiretoPortfolio = useCallback(async (u, servico = null) => {
    const profissionalId = u?.uid || u?.id || u?.profissionalId
    if (!meuId) {
      showToast({ type: 'error', title: 'Entre para solicitar', message: 'Faça login para chamar este perfil.' })
      return
    }
    if (!profissionalId) {
      showToast({ type: 'error', title: 'Perfil incompleto', message: 'Não encontrei o profissional deste serviço.' })
      return
    }
    if (String(profissionalId) === String(meuId)) {
      showToast({ type: 'info', title: 'Este perfil é seu', message: 'Você não pode solicitar o próprio serviço.' })
      return
    }

    try {
      const request = await createPrivateRequest({
        database,
        cliente: {
          uid: meuId,
          nome: meuNome,
          fotoURL,
          avatarEmoji,
        },
        profissional: {
          ...u,
          uid: profissionalId,
          id: profissionalId,
        },
        servico: servico || {
          id: profissionalId,
          titulo: u?.profTitulo || u?.correTitulo || u?.nome || 'Serviço solicitado',
          descricao: u?.profResumo || u?.correResumo || '',
          valor: u?.profPrecoBase || '',
        },
        tipo: 'pedido_direto',
      })

      setUsuarioSelecionado(null)
      setClientePainelBaixo('meusPedidos')
      showToast({
        type: 'success',
        title: 'Pedido enviado',
        message: `${request.profissionalNome} recebeu sua solicitação.`,
      })
    } catch (error) {
      console.error('[PRIVATE_REQUEST] erro ao criar pedido direto', error)
      showToast({
        type: 'error',
        title: 'Não foi possível enviar',
        message: error?.message || 'Tente novamente em alguns segundos.',
      })
    }
  }, [avatarEmoji, fotoURL, meuId, meuNome, showToast])

  const abrirAgendaCliente = useCallback((u, servico = null) => {
    setAgendaClienteService(servico || null)
    setAgendaClienteUser(u)
  }, [])

  const glassCard = 'bg-white/10  border border-white/10 shadow-xl shadow-black/30'

  const btnGhost =
    'px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white transition'

  const btnPrimary =
    'flex min-h-[38px] items-center justify-center rounded-[18px] bg-[#ffd91a] px-2.5 py-2 text-xs font-black text-blue-950 shadow-[0_12px_26px_rgba(250,204,21,0.30)] transition hover:bg-yellow-300 md:min-h-[38px] md:px-4 md:text-sm'

  const btnDanger =
    'flex min-h-[38px] items-center justify-center rounded-[16px] bg-red-600 px-2.5 py-2 text-xs font-black text-white shadow-md shadow-red-500/20 transition hover:bg-red-700 md:min-h-[38px] md:px-4 md:text-sm'

  const btnDark =
    'flex min-h-[38px] items-center justify-center rounded-[18px] border border-blue-950 bg-[#071535] px-2.5 py-2 text-xs font-black text-white shadow-[0_10px_22px_rgba(7,21,53,0.22)] transition hover:bg-blue-950 md:min-h-[38px] md:px-4 md:text-sm'

  const btnMapBase = 'flex min-h-[38px] items-center justify-center rounded-[18px] border px-2.5 py-2 text-xs font-black transition md:min-h-[38px] md:px-4 md:text-sm'
  const btnMapEnabled = 'border-blue-700 bg-blue-700 text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)] hover:bg-blue-800'
  const btnMapDisabled = 'bg-white/5 text-white/70 border-white/10 opacity-70 cursor-not-allowed'
  const navCountBadge = (count) => {
    const total = Number(count || 0)
    if (total <= 0) return null
    return (
      <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-white md:ring-slate-950">
        {total > 99 ? '99+' : total}
      </span>
    )
  }

  const abrirPerfilDrawer = useCallback((initialTab = 'config', initialProfSection = '', options = {}) => {
    setPerfilInitialTab(initialTab && initialTab !== 'perfil' ? initialTab : 'config')
    setPerfilInitialProfSection(initialProfSection || '')
    setOpenProfileMenu(false)
    setOpenPerfil(true)
    if (options?.silentContextualTip !== true && initialTab === 'profissional') {
      if (initialProfSection === 'portfolio') {
        showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.portfolioAberto, {
          id: CONTEXTUAL_TIP_IDS.portfolioAberto,
          target: 'portfolio',
        })
      } else if (initialProfSection === 'perfilProfissional') {
        showCorreAquiTipOnce(CONTEXTUAL_TIP_IDS.reputacaoAberta, {
          id: CONTEXTUAL_TIP_IDS.reputacaoAberta,
          target: 'reputacao',
        })
      }
    }
  }, [])

  const abrirRecursoEmBreve = useCallback((title) => {
    setOpenProfileMenu(false)
    showToast({
      type: 'info',
      title,
      message: 'Essa área entra na próxima rodada de ajustes.',
    })
  }, [showToast])

  const abrirPainelCliente = useCallback((painel) => {
    setOpenProfileMenu(false)
    setModoApp('cliente')
    setChatPedido(null)
    setClientePainelBaixo(painel)
  }, [])

  const abrirAreaProfissional = useCallback((nextTab) => {
    setOpenProfileMenu(false)
    setModoApp('corre')
    setTab(nextTab)
    setClientePainelBaixo('')
    setChatPedido(null)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const closeTransientTutorialViews = () => {
      setOpenProfileMenu(false)
      setOpenPerfil(false)
      setOpenIA(false)
      setOpenMapaAoVivo(false)
      setMapItem(null)
      setUsuarioSelecionado(null)
      setAgendaClienteUser(null)
      setAgendaClienteService(null)
      setOpenProfissionaisLateral(false)
      setOpenCorresLateral(false)
      setChatPedido(null)
    }

    const showClientBase = () => {
      closeTransientTutorialViews()
      setModoApp('cliente')
      setTab('corre')
      setClientePainelBaixo('')
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
    }

    const showWorkerBase = () => {
      closeTransientTutorialViews()
      setModoApp('corre')
      setTab('corre')
      setFiltro('abertos')
      setCategoriaFiltro('todas')
      setClientePainelBaixo('')
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
    }

    const onTutorialAction = (event) => {
      const action = event?.detail?.action
      if (!action) return

      switch (action) {
        case TUTORIAL_ACTIONS.cleanupTutorialViews:
          closeTransientTutorialViews()
          break
        case TUTORIAL_ACTIONS.showClientHome:
        case TUTORIAL_ACTIONS.showClientProfessionals:
        case TUTORIAL_ACTIONS.showClientChatAccess:
        case TUTORIAL_ACTIONS.showClientProfileAccess:
          showClientBase()
          break
        case TUTORIAL_ACTIONS.showWorkerOrders:
        case TUTORIAL_ACTIONS.showWorkerCategories:
        case TUTORIAL_ACTIONS.showWorkerChatAccess:
          showWorkerBase()
          break
        case TUTORIAL_ACTIONS.openProfessionalProfile:
          closeTransientTutorialViews()
          setModoApp('corre')
          setClientePainelBaixo('')
          setTab('corre')
          abrirPerfilDrawer('profissional', 'perfilProfissional', { silentContextualTip: true })
          break
        case TUTORIAL_ACTIONS.openPortfolio:
          closeTransientTutorialViews()
          setModoApp('corre')
          setClientePainelBaixo('')
          setTab('corre')
          abrirPerfilDrawer('profissional', 'portfolio', { silentContextualTip: true })
          break
        case TUTORIAL_ACTIONS.openReputation:
          closeTransientTutorialViews()
          setModoApp('corre')
          setClientePainelBaixo('')
          setTab('corre')
          abrirPerfilDrawer('profissional', 'perfilProfissional', { silentContextualTip: true })
          break
        default:
          break
      }
    }

    window.addEventListener(TUTORIAL_EVENTS.action, onTutorialAction)
    return () => window.removeEventListener(TUTORIAL_EVENTS.action, onTutorialAction)
  }, [abrirPerfilDrawer])

  const onBottomTab = (id) => {
    if (id === 'inicio') {
      setTab('corre')
      return
    }

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
      const next = !correDisponivel
      setCorreDisponivel(next)
      setUserOnlinePreference(next)

        if (meuId) {
          const agoraPresence = Date.now()
          update(ref(database, `presence/${meuId}`), {
            online: next,
            disponivel: next,
            lastSeen: agoraPresence,
            updatedAt: agoraPresence,
          }).catch((error) => console.error('[PRESENCE] erro ao salvar presença', error))
        }

        showToast({
          type: next ? 'success' : 'info',
          title: next ? 'Disponível' : 'Indisponível',
          message: next
            ? 'Você está aparecendo para clientes e pedidos.'
            : 'Você não aparece como disponível agora.',
        })
      return
    }

    if (id === 'criar') {
      setOpenIA(true)
      return
    }
    if (id === 'perfil') {
      setOpenProfileMenu(true)
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
    if (['inbox', 'agenda', 'seguranca', 'ganhos'].includes(id)) {
      setTab(id)
      return
    }
    setTab(id)
  }

  const profileFabCount = Number(problemasVisiveisCount || 0)
  const showGlobalProfileFab =
    !openIA &&
    !isMapOpen &&
    !openPerfil &&
    !openProfileMenu &&
    !usuarioSelecionado &&
    !agendaClienteUser &&
    !clientePainelBaixo
  const profileFabMinBottomInset = bottomBarsHidden
    ? 16
    : modoApp === 'corre'
      ? 176
      : 112

  return (
    <div className={`relative min-h-[100dvh] overflow-x-hidden text-slate-900 corre-aqui-no-select ${modoApp === 'corre' ? 'bg-[#eef7fc]' : 'bg-white md:bg-[#050b12]'}`}>
      <div className={`pointer-events-none absolute inset-0 z-0 min-h-full ${modoApp === 'corre' ? 'bg-[linear-gradient(180deg,#dff2fc_0%,#f7fbfe_48%,#eef7fc_100%)]' : 'bg-white md:bg-[linear-gradient(135deg,#06111a_0%,#071724_46%,#050812_100%)]'}`} />
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
        .corre-card-clean:active,
        .corre-card-clean:focus,
        .corre-card-clean:focus-within {
          filter: none;
          transform: none;
        }
      `}</style>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {modoApp === 'corre' && tab === 'corre' && !isMapOpen && !openIA && mostrarBuscaCorreFlutuante ? (
        <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.55rem)] z-[99960] px-3 md:hidden">
          <label className="mx-auto flex h-11 max-w-[430px] items-center gap-2 rounded-[18px] border border-blue-100 bg-white/96 px-3 text-sm font-black text-slate-700 shadow-[0_14px_38px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <span className="text-lg text-blue-600">⌕</span>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="buscar pedido ou serviço"
              className="min-w-0 flex-1 bg-transparent font-black text-slate-800 outline-none placeholder:text-slate-500"
            />
            {busca ? (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-black text-slate-700"
                title="Limpar busca"
              >
                ×
              </button>
            ) : null}
          </label>
        </div>
      ) : null}

      <div
        className={[
          'relative z-10 mx-auto w-full max-w-[1280px] px-2.5 pt-0 sm:px-5 md:px-4 md:py-5 lg:px-6',
          modoApp === 'corre' && tab === 'agenda'
            ? 'flex h-[100dvh] flex-col overflow-hidden pb-0 md:block md:h-auto md:overflow-visible md:pb-32'
            : 'pb-24 md:pb-32',
        ].join(' ')}
      >
        {/* CORRE: Header + Inbox */}
        {modoApp === 'corre' && (
          <>
            <div className="relative -mx-2.5 mb-0 shrink-0 overflow-hidden bg-[#e8f5fc] text-slate-950 shadow-[0_22px_70px_rgba(37,99,235,0.14)] backdrop-blur-xl md:mx-0 md:rounded-[34px]">
              <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.78]" style={{ backgroundImage: "url('/cliente-home-map-bg-v3.png')" }} />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(218,241,251,.54),rgba(255,255,255,.78)_68%,rgba(239,249,253,.92))]" />
              <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-sky-300/25 blur-2xl md:h-96 md:w-96" />
              <div className="pointer-events-none absolute -right-16 top-0 h-80 w-60 rotate-12 rounded-[70px] bg-white/35 blur-xl md:-right-6 md:h-[30rem] md:w-80" />
              <div className="pointer-events-none absolute bottom-10 right-5 h-32 w-52 rotate-12 rounded-[44px] bg-blue-300/20 blur-xl md:bottom-12 md:right-12 md:h-52 md:w-80" />
              <div className="pointer-events-none absolute right-[22%] top-[27%] z-0 h-20 w-16 opacity-90 drop-shadow-[0_12px_18px_rgba(37,99,235,0.24)] md:right-[24%] md:top-[22%] md:h-32 md:w-24">
                <span
                  className="absolute left-1/2 top-[4%] h-[62px] w-[50px] -translate-x-1/2 bg-blue-600/90 md:top-[3%] md:h-[100px] md:w-[80px]"
                  style={{ clipPath: 'polygon(50% 100%, 7% 45%, 5% 31%, 12% 16%, 28% 5%, 50% 0, 72% 5%, 88% 16%, 95% 31%, 93% 45%)' }}
                />
                <span className="absolute left-1/2 top-[21%] z-10 h-6 w-6 -translate-x-1/2 rounded-full bg-white shadow-sm md:top-[20%] md:h-9 md:w-9" />
                <span className="absolute bottom-0 left-1/2 h-1.5 w-9 -translate-x-1/2 rounded-full bg-blue-500/35 blur-sm md:h-2 md:w-14" />
              </div>

              <div className="relative p-3 pb-5 md:p-8 md:pb-10">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1.5 md:gap-3">
                  <div className="flex min-w-0 items-center gap-1.5 md:gap-3">
                    {typeof onBackToMode === 'function' ? (
                      <button
                        onClick={voltarModoLimpo}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-[16px] border border-yellow-200/80 bg-[#ffd91a] text-blue-950 shadow-[0_14px_28px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.58)] transition hover:-translate-y-0.5 active:scale-[0.96] min-[390px]:h-12 min-[390px]:w-12 min-[390px]:rounded-[18px] md:h-16 md:w-16 md:rounded-[24px]"
                        type="button"
                        title="Voltar para escolher Cliente ou Corre"
                        aria-label="Trocar modo"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className="h-5 w-5 md:h-6 md:w-6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M15 6 9 12l6 6" />
                          <path d="M9 12h10" />
                        </svg>
                      </button>
                    ) : null}

                    <div className="relative shrink-0">
                      <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-[17px] bg-white text-base font-black text-blue-700 shadow-[0_14px_30px_rgba(15,23,42,0.16)] min-[390px]:h-12 min-[390px]:w-12 min-[390px]:rounded-[19px] min-[390px]:text-lg md:h-20 md:w-20 md:rounded-[30px] md:text-2xl">
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
                      <span className="absolute -right-1 -top-1 h-[18px] w-[18px] rounded-full border-[3px] border-[#18b8d1] bg-[#ffd91a] md:h-6 md:w-6 md:border-4" />
                    </div>

                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="max-w-full truncate text-[8px] font-black uppercase tracking-[0.12em] text-blue-700 min-[390px]:text-[9px] md:max-w-none md:text-xs md:tracking-[0.22em]">
                        Perto de você
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenProfileMenu(true)}
                        className="mt-0.5 block w-full max-w-full truncate text-left text-[1.25rem] font-black leading-none text-blue-950 drop-shadow-sm transition hover:opacity-90 min-[390px]:text-[1.35rem] md:max-w-none md:text-4xl"
                      >
                        {meuNome || 'Visitante'} ›
                      </button>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 md:gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenMapaAoVivo(true)}
                      title="Mapa ao vivo"
                      className="grid h-9 w-9 place-items-center rounded-[14px] bg-white/90 text-sm shadow-[0_12px_26px_rgba(15,23,42,0.14)] transition hover:scale-[1.03] min-[390px]:h-10 min-[390px]:w-10 min-[390px]:rounded-[16px] min-[390px]:text-base md:h-14 md:w-14 md:rounded-[22px] md:text-lg"
                    >
                      🗺️
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('inbox')}
                      title="Notificações e conversas"
                      className="relative grid h-9 w-9 place-items-center rounded-[14px] bg-white/90 text-sm shadow-[0_12px_26px_rgba(15,23,42,0.14)] transition hover:scale-[1.03] min-[390px]:h-10 min-[390px]:w-10 min-[390px]:rounded-[16px] min-[390px]:text-base md:h-14 md:w-14 md:rounded-[22px] md:text-lg"
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

                {tab === 'corre' ? (
                  <>
                    <div ref={buscaCorreTopoRef} className="mt-5 max-w-3xl md:mt-7">
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

                    <div className="mt-4 rounded-[20px] border border-white/80 bg-white/60 p-3 text-blue-950 shadow-[0_14px_34px_rgba(15,23,42,0.10)] backdrop-blur md:mt-8 md:rounded-[28px] md:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-900/70">Resumo do dia</div>
                          <div className="mt-1 text-sm font-black md:text-lg">
                            {correDisponivel ? 'Visivel para clientes' : 'Oculto agora'}
                          </div>
                        </div>
                        <span className="rounded-full bg-[#ffd91a] px-3 py-1 text-[10px] font-black text-blue-950">
                          {pedidosTotalElegivel} pedidos
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                          ['Faturamento', formatMoneyBR(profissionalStats.ganhosSemana)],
                          ['Serviços', profissionalStats.total || 0],
                          ['Avaliação', profissionalStats.notaMedia ? `${profissionalStats.notaMedia.toFixed(1)} ★` : '--'],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-2xl border border-blue-100/80 bg-white/60 px-2 py-2 text-center">
                            <div className="truncate text-sm font-black md:text-xl">{value}</div>
                            <div className="mt-0.5 truncate text-[9px] font-black uppercase tracking-[0.1em] text-blue-900/65">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
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
                    onAction={abrirAcaoNotificacao}
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
              <div className="min-h-0 flex-1 md:mb-4 md:flex-none">
                <div className="hidden">
                  <div className="text-xl font-black text-white">📅 Minha agenda</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Solicitações futuras dos clientes. Aceite, recuse e organize sua fila.
                  </div>
                </div>

                <div className="h-full min-h-0">
                  <AgendaProfissional
                    uid={meuId}
                    nome={meuNome}
                    fotoURL={fotoURL}
                    privateRequests={privateRequests}
                    notificacoesCount={notificacoesNaoLidas}
                    onAbrirPerfil={() => setOpenProfileMenu(true)}
                    onAbrirNotificacoes={() => setTab('inbox')}
                    onAbrirChat={abrirChatFocado}
                    onToast={showToast}
                    reserveFloatingControls
                  />
                </div>
              </div>
            )}

            {tab === 'ganhos' && (
              <div className="-mx-2.5 -mt-5 bg-[#050b12] px-3 pt-4 pb-28 text-white md:mx-0 md:-mt-6 md:rounded-[36px] md:px-8 md:pt-6 md:pb-10">
                <section className="mb-3 overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_18%_0%,rgba(11,115,255,0.18),transparent_34%),linear-gradient(180deg,#07111f_0%,#050b12_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.36)] md:mb-4 md:rounded-[38px]">
                  <div className="flex items-center justify-between gap-3 px-4 pt-4 md:px-6 md:pt-5">
                    <button
                      type="button"
                      onClick={() => setTab('corre')}
                      className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/8 text-lg font-black text-white transition hover:bg-white/12"
                      title="Voltar"
                    >
                      ←
                    </button>
                    <div className="text-sm font-black md:text-base">Ganhos Corre/Prof</div>
                    <button
                      type="button"
                      onClick={() => abrirPerfilDrawer('profissional', 'config')}
                      className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/8 text-lg font-black text-white transition hover:bg-white/12"
                      title="Perfil profissional"
                    >
                      ⚙
                    </button>
                  </div>

                  <div className="px-4 pt-4 md:px-6 md:pt-5">
                    <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.055] p-1">
                      {[
                        ['corre', 'Corre', formatMoneyBR(ganhosStatsPorModo.corre.ganhosTotal)],
                        ['prof', 'Prof', formatMoneyBR(ganhosStatsPorModo.prof.ganhosTotal)],
                      ].map(([id, label, value]) => {
                        const active = ganhosModo === id
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setGanhosModo(id)}
                            className={[
                              'rounded-xl px-3 py-2 text-left transition active:scale-[0.98]',
                              active ? 'bg-[#ffd91a] text-blue-950 shadow-[0_10px_24px_rgba(250,204,21,0.24)]' : 'text-slate-300 hover:bg-white/[0.08]',
                            ].join(' ')}
                          >
                            <span className="block text-xs font-black">{label}</span>
                            <span className="mt-0.5 block truncate text-[11px] font-black opacity-80">{value}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="px-4 pt-5 text-center md:px-6">
                    <div className="text-3xl font-black leading-none text-white md:text-5xl">
                      {formatMoneyBR(ganhosSelecionados.ganhosSemana)}
                    </div>
                    <div className="mt-1 text-xs font-bold text-slate-400 md:text-sm">Ganhos da semana em {ganhosSelecionados.label}</div>
                  </div>

                  <div className="px-4 pt-5 md:px-6 md:pt-7">
                    <div className="grid h-36 grid-cols-7 items-end gap-2 border-b border-white/10 pb-2 md:h-44 md:gap-4">
                      {ganhosSelecionados.semana.map((dia) => {
                        const value = Number(dia.value || 0)
                        const height = Math.max(value > 0 ? 18 : 3, Math.round((value / ganhosMaxDia) * 112))
                        return (
                          <div key={dia.key} className="flex min-w-0 flex-col items-center gap-2">
                            <div className="h-5 text-[10px] font-black text-slate-400">
                              {value > 0 ? Math.round(value) : '-'}
                            </div>
                            <div className="flex h-24 items-end md:h-32">
                              <div
                                className={[
                                  "w-5 rounded-t-xl shadow-[0_12px_28px_rgba(0,0,0,0.24)] md:w-7",
                                  value > 0
                                    ? "bg-[linear-gradient(180deg,#ffd91a_0%,#0b73ff_100%)]"
                                    : "bg-white/12",
                                ].join(" ")}
                                style={{ height }}
                              />
                            </div>
                            <div className="truncate text-[10px] font-black capitalize text-slate-400">{dia.label}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="p-4 md:p-6">
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-3 md:rounded-[28px] md:p-4">
                      <div className="text-sm font-black text-white">Resumo de {ganhosSelecionados.label}</div>
                      <div className="mt-3 grid gap-2">
                        {[
                          ['Serviços realizados', ganhosSelecionados.concluidos || 0],
                          ['Avaliação média', ganhosSelecionados.notaMedia ? `${ganhosSelecionados.notaMedia.toFixed(1)} ★` : 'Sem nota'],
                          ['Taxa de conclusão', `${ganhosSelecionados.taxaConclusao || 0}%`],
                          ['Ticket médio', ganhosSelecionados.ticketMedio ? formatMoneyBR(ganhosSelecionados.ticketMedio) : 'R$ 0,00'],
                        ].map(([label, value]) => (
                          <div key={label} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.045] px-3 py-2.5">
                            <span className="text-xs font-bold text-slate-300">{label}</span>
                            <span className="text-sm font-black text-white">{value}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setFiltro('todos')}
                        className="mt-3 h-11 w-full rounded-2xl border border-white/10 bg-white/8 text-sm font-black text-white shadow-[0_14px_34px_rgba(0,0,0,0.18)] transition hover:bg-white/12"
                      >
                        Ver extrato completo
                      </button>
                    </div>
                  </div>
                </section>
                <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_18px_48px_rgba(0,0,0,0.20)] md:rounded-[34px]">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3 md:px-5 md:py-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ffd91a]">Extrato</div>
                      <div className="mt-0.5 text-lg font-black text-white md:text-xl">Ganhos recentes de {ganhosSelecionados.shortLabel}</div>
                    </div>
                    <span className="rounded-full bg-[#ffd91a] px-3 py-1 text-xs font-black text-blue-950">
                      {formatMoneyBR(ganhosSelecionados.ganhosTotal)}
                    </span>
                  </div>

                  <div className="grid gap-2 p-3 md:p-4">
                    {ganhosRecentes.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.035] px-4 py-5 text-center text-sm font-bold text-slate-400">
                        Nenhum ganho de {ganhosSelecionados.label} concluído ainda.
                      </div>
                    ) : (
                      ganhosRecentes.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => abrirPedidoFocado(p)}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-3 text-left shadow-sm transition hover:bg-white/[0.075]"
                        >
                          <div className="min-w-0">
                            <div className="line-clamp-1 text-sm font-black text-white">{p.titulo || 'Serviço concluído'}</div>
                            <div className="mt-0.5 text-xs font-semibold text-slate-400">
                              {formatDataHora(p.concluidoEm || p.atualizadoEm || p.criadoEm)}
                            </div>
                          </div>
                          <div className="shrink-0 rounded-full bg-[#ffd91a] px-3 py-1 text-xs font-black text-blue-950">
                            {formatMoneyBR(getValorPedido(p.valor))}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </section>
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
              currentUid={meuId}
              meuNome={meuNome}
              onlineUsers={onlineUsers}
              registeredUsers={registeredUsers}
              publicPortfolio={publicPortfolioObj}
              viewerLocation={meuUserProfile?.local || meuUserProfile?.location || meuUserProfile?.profile?.local || null}
              viewerRegion={meuUserProfile?.cidade || meuUserProfile?.profile?.cidade || ''}
              onCriarPedido={() => setOpenIA(true)}
              onIrAoVivo={() => {
                setOpenMapaAoVivo(true)
              }}
              onAbrirNotificacoes={() => setClientePainelBaixo('notificacoes')}
              onAbrirPerfil={abrirPerfilCliente}
              onAgendar={abrirAgendaCliente}
              onBackToMode={typeof onBackToMode === 'function' ? voltarModoLimpo : undefined}
            />

            {/* ✅ A área pesada de cliente saiu daqui.
                Agora Pedidos e Conversas ficam na barra inferior real
                e abrem como tela separada, sem poluir a lista/fichas. */}
          </div>
        )}

        {/* CORRE */}
        {modoApp === 'corre' && tab === 'corre' && (
          <div className="relative z-20 -mx-2.5 -mt-4 rounded-t-[30px] bg-white px-4 pt-5 pb-28 text-slate-950 shadow-[0_-14px_34px_rgba(15,23,42,0.08)] md:mx-0 md:-mt-6 md:rounded-[36px] md:px-8 md:pt-6 md:pb-10">
            {/* Painel de filtros do Corre */}
            <div className="mb-3 md:mb-8">
              <div>
                <div data-tutorial="categorias" className="flex gap-1.5 overflow-x-auto pt-1.5 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] md:mt-6 md:gap-2 md:pt-2 [&::-webkit-scrollbar]:hidden">
                  {[{ id: 'todas', label: 'Todos', emoji: '✨', accent: '#0f172a', soft: '#eaf2ff' }, ...(CATEGORIES || [])].map((cat) => {
                    const ativo = categoriaFiltro === cat.id
                    const totalCategoria = categoriaPedidosCount[cat.id] || 0
                    const labelCompacto = compactCategoryLabel(cat.label)
                    const contador = totalCategoria > 99 ? '99+' : totalCategoria
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoriaFiltro(cat.id)}
                        className="group w-[58px] shrink-0 pt-1 text-center md:w-[68px]"
                        aria-label={`Filtrar por ${cat.label}. ${totalCategoria} pedido${totalCategoria === 1 ? '' : 's'}.`}
                        title={cat.label}
                      >
                        <span
                          className={[
                            'relative mx-auto grid h-10 w-10 place-items-center rounded-[15px] text-[1.2rem] shadow-[0_10px_20px_rgba(15,23,42,0.07)] transition group-active:scale-95 md:h-12 md:w-12 md:rounded-[18px] md:text-2xl',
                            ativo ? 'ring-2 ring-blue-500/45' : 'ring-1 ring-slate-200/80',
                          ].join(' ')}
                          style={{
                            backgroundColor: ativo ? cat.accent || '#ffd91a' : cat.soft || '#eff6ff',
                            color: ativo ? '#ffffff' : cat.accent || '#0f172a',
                          }}
                        >
                          {cat.emoji}
                          <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-950 px-1.5 text-[9px] font-black leading-none text-white ring-2 ring-white md:h-[21px] md:min-w-[21px] md:text-[10px]">
                            {contador}
                          </span>
                        </span>
                        <span className="mt-1.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-black leading-tight text-slate-700 md:text-[10px]">
                          {labelCompacto}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-3 grid gap-2 md:mt-7 md:grid-cols-[1fr_260px] md:items-center md:gap-3">
                  <div className="grid grid-cols-3 gap-1 rounded-full bg-slate-100 p-1 md:gap-2">
                    {[
                      ['abertos', 'ABERTOS'],
                      ['meus', 'ACEITOS'],
                      ['finalizados', 'FINALIZADOS'],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFiltro(id)}
                        className={[
                          'h-8 rounded-full text-[10px] font-black tracking-[0.05em] transition md:h-11 md:text-sm',
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
                    className="h-9 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-blue-500/25 md:h-12 md:px-4 md:text-sm"
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

                <div className="mt-3 grid grid-cols-3 gap-2 md:mt-7 md:gap-5">
                  {[
                    ['ABERTOS', resumoCorre.abertos, 'from-[#ffd91a] to-yellow-200', 'text-blue-950'],
                    ['ACEITOS', resumoCorre.meus, 'from-sky-100 to-blue-200', 'text-blue-950'],
                    ['FINALIZADOS', resumoCorre.concluidos, 'from-slate-100 to-slate-200', 'text-slate-950'],
                  ].map(([label, value, bg, text]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        if (label === 'ACEITOS') setFiltro('meus')
                        else if (label === 'ABERTOS') setFiltro('abertos')
                        else setFiltro('finalizados')
                      }}
                      className={`rounded-[18px] bg-gradient-to-br ${bg} p-2.5 text-left shadow-[0_10px_22px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 md:min-h-[150px] md:rounded-[30px] md:p-6`}
                    >
                      <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-600 md:text-xs md:tracking-[0.2em]">{label}</div>
                      <div className={`mt-1 text-2xl font-black leading-none ${text} md:text-5xl`}>{value}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loadingPedidos && (
              <div className={`mb-3 text-sm text-gray-200 rounded-2xl p-3 ${glassCard}`}>⏳ Carregando pedidos...</div>
            )}

            {!loadingPedidos && erroPedidos && (
              <div className="mb-3 text-sm text-red-200 bg-red-500/15 border border-red-400/20 rounded-2xl p-3 ">
                ❌ {erroPedidos}
              </div>
            )}

            {/* Lista */}
            <div className="mb-2 flex items-center justify-between px-1">
              <div>
                <div className="text-sm font-black text-slate-950 md:text-base">Pedidos disponiveis</div>
                <div className="text-[11px] font-bold text-slate-500 md:text-xs">Toque em detalhes para ver a ficha completa.</div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">
                {pedidosTotalRenderizado} de {pedidosTotalElegivel}
              </span>
            </div>

            {pedidosAntigosOcultosCount > 0 ? (
              <div className="mb-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
                {pedidosAntigosOcultosCount} pedido{pedidosAntigosOcultosCount === 1 ? '' : 's'} antigo{pedidosAntigosOcultosCount === 1 ? '' : 's'} oculto{pedidosAntigosOcultosCount === 1 ? '' : 's'} da lista publica.
              </div>
            ) : null}

            <div data-tutorial="lista-pedidos" className="grid grid-cols-1 items-stretch gap-2.5 pb-52 min-[360px]:grid-cols-2 min-[360px]:gap-3 sm:pb-48 md:grid-cols-2 md:gap-3 md:pb-32 lg:grid-cols-3 xl:grid-cols-4">
              {!loadingPedidos && !erroPedidos && pedidosTotalElegivel === 0 && (
                <div className="col-span-full rounded-[24px] bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">
                  Nenhum trabalho para mostrar agora.
                </div>
              )}

              {pedidosRenderizados.map((p, index) => {
                const status = normalizeAtendimentoStatus(p.status)
                const aceitoPorMim = p?.aceite?.id === meuId
                const temAceitador = !!p?.aceite?.id
                const mapOk = !!(p?.local?.lat != null && p?.local?.lng != null)
                const freshness = getRequestFreshness(p, pedidosFreshnessNow)

                const b = boostInfo(p)
                const cardAberto = cardAbertoId === p.id
                const abrindoEstePedido = abrindoPedidoId === p.id

                const catObj = getCatObj(p?.categoriaId || p?.categoria)
                const combinaComigo =
                  isProfissional && p?.categoriaId && (minhasCategoriasProf || []).includes(p.categoriaId)

                const statusLabel =
                    status === ATENDIMENTO_STATUS.FINALIZADO
                    ? 'Finalizado'
                    : isPedidoAtivoStatus(status)
                      ? 'Aceito'
                      : 'Aberto'
                const valorNumerico = getValorPedido(p.valor)
                const temValor = p.valor != null && Number.isFinite(valorNumerico) && valorNumerico > 0
                const tituloPedido = p.titulo || '(sem titulo)'
                const pedidoTheme = getPedidoCardTheme({
                  categoriaId: p?.categoriaId || p?.categoria,
                  categoriaLabel: catObj?.label,
                  titulo: tituloPedido,
                  index,
                })
                const distanciaPedido = formatDistancePedido(p, meuUserNode)
                const tempoPostado = formatTempoPostado(p.criadoEm || p.createdAt || p.atualizadoEm)
                const dataCurtaPedido = formatDataCurtaPedido(p.criadoEm || p.createdAt || p.atualizadoEm)

                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 22, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.34, delay: Math.min(index * 0.055, 0.35), ease: 'easeOut' }}
                    whileHover={{ y: -3, scale: 1.008 }}
                    whileTap={{ scale: 0.985 }}
                    className={[
                      "corre-card-clean group relative flex min-h-[182px] w-full flex-col overflow-hidden rounded-[20px] border-[1.5px] bg-white text-slate-950",
                      "shadow-[0_8px_18px_rgba(15,23,42,0.10)] ring-1 ring-slate-300/60 transition [content-visibility:auto] [contain-intrinsic-size:190px] md:min-h-[190px] md:max-w-[360px] md:rounded-[22px]",
                      cardAberto ? "shadow-[0_20px_48px_rgba(15,23,42,0.16)]" : "",
                      b.destaque ? "border-fuchsia-300/80 ring-2 ring-fuchsia-300/30" : "",
                      b.emergencia ? "border-red-400 ring-2 ring-red-400/55" : "",
                    ].join(" ")}
                    style={
                      !b.emergencia && !b.destaque
                        ? {
                            borderColor: `${pedidoTheme.accent}70`,
                            boxShadow: cardAberto
                              ? '0 16px 34px rgba(15,23,42,0.16), 0 0 0 1px rgba(15,23,42,0.08)'
                              : `0 8px 18px rgba(15,23,42,0.10), 0 0 0 1px ${pedidoTheme.accent}22`,
                          }
                        : undefined
                    }
                  >
                    <span className={["absolute left-1.5 top-1.5 z-20 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black text-white shadow-[0_8px_16px_rgba(15,23,42,0.18)]", pedidoTheme.badge].join(" ")}>
                      {index + 1}
                    </span>
                    {b.emergencia ? (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-red-500 via-orange-300 to-red-600 shadow-[0_0_36px_rgba(239,68,68,0.95)] animate-pulse" />
                    ) : b.destaque ? (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-fuchsia-500 via-amber-300 to-blue-500 shadow-[0_0_32px_rgba(217,70,239,0.75)]" />
                    ) : (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-1" style={{ backgroundColor: pedidoTheme.accent }} />
                    )}
                    {b.emergencia ? (
                      <div className="pointer-events-none absolute -right-12 -top-12 h-24 w-24 rounded-full bg-red-400/35 blur-2xl animate-pulse md:h-36 md:w-36" />
                    ) : b.destaque ? (
                      <div className="pointer-events-none absolute -right-12 -top-12 h-24 w-24 rounded-full bg-fuchsia-400/30 blur-2xl md:h-36 md:w-36" />
                    ) : status === 'aberto' ? (
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-slate-50 via-white to-transparent md:h-20" />
                    ) : null}
                    <div className="pointer-events-none absolute -right-7 top-11 h-14 w-14 rounded-full blur-xl transition md:h-20 md:w-20" style={{ backgroundColor: pedidoTheme.soft }} />
                    <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-8 w-full opacity-70" viewBox="0 0 360 70" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M0 42 C70 16 112 62 184 39 C246 19 296 42 360 22 L360 70 L0 70 Z" fill={pedidoTheme.wave} />
                    </svg>

                    <div className="relative z-10 grid min-h-[182px] flex-1 grid-rows-[auto_1fr_auto] gap-2.5 p-3 pt-5 md:min-h-[190px] md:p-3.5 md:pt-5">
                      <button
                        type="button"
                        onClick={() => abrirFichaPedido(p)}
                        aria-busy={abrindoEstePedido}
                        className="min-w-0 text-left"
                        title={tituloPedido}
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                          <span
                            className={[
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8.5px] font-black uppercase tracking-[0.08em]",
                              status === 'aberto'
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : isPedidoAtivoStatus(status)
                                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                  : "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
                            ].join(" ")}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {statusLabel}
                          </span>
                          <span className="min-w-0 max-w-[72px] truncate text-[10px] font-bold text-slate-500 min-[390px]:max-w-[90px] md:max-w-[180px] md:text-[11px]" title={catObj ? catObj.label : p?.categoriaId ? String(p.categoriaId) : 'Geral'} aria-label={catObj ? catObj.label : p?.categoriaId ? String(p.categoriaId) : 'Geral'}>
                            {catObj ? catObj.label : p?.categoriaId ? String(p.categoriaId) : 'Geral'}
                          </span>
                          {status === ATENDIMENTO_STATUS.ABERTO && freshness.status !== 'recente' ? (
                            <span className={["rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ring-1", getFreshnessBadgeClass(freshness.status)].join(" ")}>
                              {freshness.label}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 line-clamp-2 min-h-[40px] break-words text-[17px] font-black leading-[1.12] text-slate-950 md:text-[18px]">
                          {tituloPedido}
                        </div>

                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-bold leading-tight text-slate-500 md:text-[11px]">
                          <span className="line-clamp-1">{distanciaPedido}</span>
                          <span className="text-slate-300">•</span>
                          <span className="line-clamp-1">{tempoPostado}</span>
                          <span className="text-slate-300">•</span>
                          <span className="line-clamp-1">{dataCurtaPedido}</span>
                          {combinaComigo && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="line-clamp-1 text-emerald-700">Combina</span>
                            </>
                          )}
                        </div>
                      </button>

                      <div className="flex w-full items-center justify-between gap-0.5 text-right min-[390px]:gap-1">
                        <div
                          className="max-w-[42px] break-words rounded-full px-0.5 py-0.5 text-left text-[9.5px] font-black leading-tight text-blue-950 min-[390px]:max-w-[58px] min-[390px]:text-[10px] md:max-w-[96px] md:px-1 md:text-xs"
                        >
                          {temValor ? formatMoneyBR(valorNumerico) : 'Combinar'}
                        </div>
                        <div
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm shadow-[0_8px_14px_rgba(15,23,42,0.08)] ring-1 ring-white/80 min-[390px]:h-7 min-[390px]:w-7 min-[390px]:text-base md:h-9 md:w-9 md:text-xl"
                          style={{ backgroundColor: pedidoTheme.soft, color: pedidoTheme.accent }}
                        >
                          <span className="drop-shadow-sm">{pedidoTheme.icon}</span>
                        </div>
                        {status === 'aberto' && !cardAberto ? (
                          <button
                            data-tutorial="aceitar-pedido"
                            className="min-h-[38px] min-w-[48px] flex-1 rounded-[13px] px-1 py-2 text-[10px] font-black text-white shadow-[0_10px_18px_rgba(15,23,42,0.14)] transition hover:brightness-105 disabled:opacity-60 min-[390px]:min-w-[52px] min-[390px]:px-1.5 min-[390px]:text-[10.5px] md:min-w-[58px] md:px-2 md:text-xs"
                            style={{ backgroundColor: pedidoTheme.accent }}
                            onClick={(event) => {
                              event.stopPropagation()
                              abrirFichaPedido(p)
                            }}
                            disabled={aceitandoId === p.id || abrindoEstePedido}
                            aria-busy={abrindoEstePedido}
                            type="button"
                          >
                            {abrindoEstePedido ? 'Abrindo...' : aceitandoId === p.id ? '...' : 'Aceitar'}
                          </button>
                        ) : (
                          <span className="min-h-[38px] min-w-[48px] flex-1 rounded-[13px] bg-slate-100 px-1 py-2 text-center text-[9px] font-black uppercase tracking-[0.06em] text-slate-600 ring-1 ring-slate-200 min-[390px]:min-w-[52px] min-[390px]:px-1.5 min-[390px]:text-[9.5px] md:min-w-[58px] md:px-2">
                            {statusLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="hidden">
                      <button
                        className="min-h-[34px] rounded-[13px] bg-white/10 px-2 text-[11px] font-black text-white shadow-sm ring-1 ring-white/10 transition hover:bg-white/15"
                        onClick={() => setCardAbertoId(p.id)}
                        type="button"
                      >
                        Detalhes
                      </button>
                      <button
                        className="min-h-[34px] rounded-[13px] bg-[#071535] px-2 text-[11px] font-black text-white shadow-sm transition hover:bg-blue-950"
                        onClick={() => abrirChatFocado(p)}
                        type="button"
                      >
                        Chat
                      </button>
                      <button
                        className={[
                          "min-h-[34px] rounded-[13px] px-2 text-[11px] font-black shadow-sm transition",
                          mapOk ? "bg-blue-700 text-white hover:bg-blue-800" : "bg-white/10 text-slate-500",
                        ].join(" ")}
                        onClick={() => {
                          if (!mapOk) return
                          setMapItem(p)
                        }}
                        disabled={!mapOk}
                        type="button"
                      >
                        Mapa
                      </button>
                    </div>

                    <div className="hidden">
                      <div className="min-w-0 flex-1">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700 shadow-sm backdrop-blur md:gap-2 md:px-2.5 md:py-1 md:text-[10px] md:tracking-[0.16em]">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                          Disponível
                        </div>
                        <div className="mt-1.5 line-clamp-2 break-words text-lg font-black leading-tight text-slate-950 md:mt-2 md:text-xl">{p.titulo || '(sem título)'}</div>
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
                    <div className="hidden">
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

                    <div className="hidden">
                      <div className="min-w-0 text-[10px] font-black uppercase tracking-[0.08em] md:text-xs">
                        {b.emergencia ? (
                          <span className="text-red-700">🚨 Resposta rápida</span>
                        ) : b.destaque ? (
                          <span className="text-fuchsia-700">🚀 Mais visibilidade</span>
                        ) : (
                          <span className="text-blue-800">⚡ Disponível agora</span>
                        )}
                      </div>
                      {p.valor != null && Number.isFinite(Number(p.valor)) ? (
                        <div className="shrink-0 rounded-[16px] border border-yellow-300 bg-[#ffd91a] px-3 py-1.5 text-sm font-black text-blue-950 shadow-[0_10px_22px_rgba(250,204,21,0.25)] md:px-4 md:text-base">
                          R$ {Number(p.valor).toFixed(2)}
                        </div>
                      ) : (
                        <div className="shrink-0 rounded-[16px] border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-black text-blue-800 md:px-4 md:text-xs">
                          combinar
                        </div>
                      )}
                    </div>

                    <div className="hidden">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-600 text-[12px] text-white shadow-[0_8px_18px_rgba(37,99,235,0.22)]">✓</span>
                      <div className="min-w-0">
                        <span className="mr-1 font-black uppercase tracking-[0.12em] text-sky-700">Próximo</span>
                        <span className="line-clamp-1 font-semibold">{getProximoPassoPedido(p, meuId)}</span>
                      </div>
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

                      </>
                    )}

                    <div className={cardAberto ? "relative z-10 mt-1 grid grid-cols-4 gap-1.5 border-t border-slate-100/80 bg-white/90 p-2.5 backdrop-blur md:flex md:flex-wrap md:gap-2 md:p-3" : "hidden"}>
                      <button
                        className="flex min-h-[38px] items-center justify-center rounded-[16px] border border-slate-200 bg-white px-2 py-2 text-[11px] font-black text-blue-950 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 md:min-h-[38px] md:px-4 md:text-sm"
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

                      {([ATENDIMENTO_STATUS.EM_ANDAMENTO, ATENDIMENTO_STATUS.CHEGOU, ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO, ATENDIMENTO_STATUS.FINALIZADO].includes(status)) && (souCriador(p) || souAceitador(p)) ? (
                        <button className={btnDark} onClick={() => abrirChatFocado(p)} type="button">
                          💬 Chat
                        </button>
                      ) : null}

                      {status === ATENDIMENTO_STATUS.ACEITO && (souCriador(p) || souAceitador(p)) ? (
                        <button className={btnDark} onClick={() => abrirFichaPedido(p)} type="button">
                          Detalhes
                        </button>
                      ) : null}

                      {aceitoPorMim && status === ATENDIMENTO_STATUS.ACEITO && (
                        <button
                          className={`${btnPrimary} col-span-2 disabled:opacity-60 md:col-span-1`}
                          onClick={() => avancarAtendimento(p, ATENDIMENTO_STATUS.EM_ANDAMENTO)}
                          disabled={atendimentoId === p.id}
                          type="button"
                        >
                          {atendimentoId === p.id ? 'Iniciando...' : 'Iniciar atendimento'}
                        </button>
                      )}

                      {([ATENDIMENTO_STATUS.ACEITO, ATENDIMENTO_STATUS.EM_ANDAMENTO, ATENDIMENTO_STATUS.CHEGOU, ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO].includes(status)) && (souCriador(p) || souAceitador(p)) && (
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
                          data-tutorial="aceitar-pedido"
                          className={`${btnPrimary} disabled:opacity-60`}
                          onClick={() => aceitarCorre(p)}
                          disabled={aceitandoId === p.id}
                          type="button"
                        >
                          {aceitandoId === p.id ? 'Aceitando…' : 'Aceitar'}
                        </button>
                      )}

                      {aceitoPorMim && status === ATENDIMENTO_STATUS.ACEITO && (
                        <button
                          className={`${btnDanger} col-span-2 disabled:opacity-60 md:col-span-1`}
                          onClick={() => cancelarAceite(p)}
                          disabled={cancelandoId === p.id}
                          type="button"
                        >
                          {cancelandoId === p.id ? 'Cancelando…' : 'Cancelar'}
                        </button>
                      )}

                      {aceitoPorMim && status === ATENDIMENTO_STATUS.EM_ANDAMENTO && (
                        <button
                          className={`${btnPrimary} col-span-2 disabled:opacity-60 md:col-span-1`}
                          onClick={() => avancarAtendimento(p, ATENDIMENTO_STATUS.CHEGOU)}
                          disabled={atendimentoId === p.id}
                          type="button"
                        >
                          {atendimentoId === p.id ? 'Atualizando...' : 'Cheguei ao local'}
                        </button>
                      )}

                      {aceitoPorMim && status === ATENDIMENTO_STATUS.CHEGOU && (
                        <button
                          className={`${btnPrimary} col-span-2 disabled:opacity-60 md:col-span-1`}
                          onClick={() => avancarAtendimento(p, ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO)}
                          disabled={atendimentoId === p.id}
                          type="button"
                        >
                          {atendimentoId === p.id ? 'Solicitando...' : 'Solicitar finalização'}
                        </button>
                      )}

                      {status === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO && souCriador(p) && (
                        <button
                          className="col-span-2 min-h-[38px] rounded-[16px] bg-emerald-600 px-2 py-2 text-[11px] font-black text-white shadow-md shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:opacity-60 md:col-span-1 md:px-3 md:text-xs"
                          onClick={() => abrirConclusao(p)}
                          disabled={serviçondoId === p.id}
                          type="button"
                        >
                          {serviçondoId === p.id ? 'Confirmando…' : 'Concluir'}
                        </button>
                      )}

                      {status === ATENDIMENTO_STATUS.FINALIZADO && souCriador(p) && !p?.avaliacao ? (
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
                          outroUser={getOutroUserComPresence(p)}
                          planoAtual={meuUserNode?.plano || 'free'}
                          mostrarAnuncio={false}
                          onToast={showToast}
                        />
                      </div>
                    )}
                  </motion.div>
                )
              })}

              {!loadingPedidos && !erroPedidos && pedidosTotalElegivel > 0 ? (
                <div className="col-span-full flex flex-col items-center gap-2 rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-3 text-center">
                  <div className="text-[11px] font-black text-slate-500">
                    {pedidosTotalRenderizado} de {pedidosTotalElegivel} pedidos
                  </div>
                  {pedidosTemMais ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPedidosRenderLimit((current) => Math.min(current + PEDIDOS_PAGE_SIZE, pedidosTotalElegivel))
                      }}
                      className="min-h-10 rounded-full bg-blue-950 px-4 text-xs font-black text-white shadow-[0_10px_20px_rgba(15,23,42,0.16)] transition hover:bg-blue-900 active:scale-[0.98]"
                    >
                      Carregar mais pedidos
                    </button>
                  ) : (
                    <div className="text-xs font-bold text-slate-500">Todos os pedidos foram carregados.</div>
                  )}
                </div>
              ) : null}
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
                  outroUser={getOutroUserComPresence(chatPedido)}
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
          onPedirServico={(u, servico) => {
            criarPedidoDiretoPortfolio(u, servico)
          }}
          onAgendar={(u, servico) => {
            setUsuarioSelecionado(null)
            abrirAgendaCliente(u, servico)
          }}
        />
      )}

      {/* ✅ BARRA INFERIOR REAL DO CLIENTE
          Pedidos e Conversas não ficam mais como caixa no meio.
          A barra fica fixa embaixo e cada opção abre uma tela própria com rolagem. */}
      


      {modoApp === 'cliente' && !isMapOpen && !openIA && (
        <div
          className={[
            'fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.45rem)] z-[99980] px-3 pointer-events-none transition-all duration-300 ease-out md:left-1/2 md:right-auto md:bottom-7 md:w-full md:max-w-[1024px] md:-translate-x-1/2 md:px-[52px]',
            bottomBarsHidden ? 'translate-y-[135%] opacity-0' : 'translate-y-0 opacity-100',
          ].join(' ')}
        >
          <div className="pointer-events-auto mx-auto grid h-[66px] w-full max-w-[360px] grid-cols-[1fr_1fr_72px_1fr] items-center gap-1 rounded-[28px] border border-slate-200 bg-white px-2 text-slate-950 shadow-[0_18px_58px_rgba(15,23,42,0.22)] md:h-[146px] md:max-w-[820px] md:grid-cols-[1fr_1fr_132px_1fr] md:gap-4 md:rounded-[36px] md:border-slate-100 md:bg-white md:px-8 md:text-slate-700">
            <button
              type="button"
              onClick={() => {
                setClientePainelBaixo('')
                setChatPedido(null)
                try {
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                } catch {}
              }}
              title="Inicio"
              className={[
                'relative flex h-[54px] min-w-0 flex-col items-center justify-center rounded-[20px] text-[10px] font-black transition-all duration-200 active:scale-[0.96] md:h-[104px] md:rounded-[30px] md:text-[20px]',
                !clientePainelBaixo
                  ? 'bg-[#ffd91a] text-blue-950 shadow-[0_10px_24px_rgba(250,204,21,0.24)]'
                  : 'text-slate-600 hover:bg-slate-100 md:text-slate-500 md:hover:bg-slate-50 md:hover:text-blue-950',
              ].join(' ')}
            >
              <svg className="h-[22px] w-[22px] md:h-11 md:w-11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 11.5 12 4l9 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 10.5V20h13v-9.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9.5 20v-5h5v5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="mt-0.5 leading-none">Inicio</span>
            </button>

            <button
              type="button"
              onClick={() => setClientePainelBaixo('meusPedidos')}
              title="Pedidos"
              className={[
                'relative flex h-[54px] min-w-0 flex-col items-center justify-center rounded-[20px] text-[10px] font-black transition-all duration-200 active:scale-[0.96] md:h-[104px] md:rounded-[30px] md:text-[20px]',
                clientePainelBaixo === 'meusPedidos'
                  ? 'bg-[#ffd91a] text-blue-950 shadow-[0_10px_24px_rgba(250,204,21,0.24)]'
                  : 'text-slate-600 hover:bg-slate-100 md:text-slate-500 md:hover:bg-slate-50 md:hover:text-blue-950',
              ].join(' ')}
            >
              <svg className="h-[22px] w-[22px] md:h-11 md:w-11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 8.5 12 4l7 4.5v7L12 20l-7-4.5v-7Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
                <path d="m5.5 8.8 6.5 4 6.5-4M12 13v6.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="mt-0.5 leading-none">Pedidos</span>
              {navCountBadge(clientePedidosCount)}
            </button>

            <button
              type="button"
              onClick={() => setOpenIA(true)}
              title="Novo pedido"
              data-tutorial="criar-pedido"
            className="-mt-8 grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full border-[6px] border-white bg-[#ffd91a] text-blue-950 shadow-[0_18px_38px_rgba(250,204,21,0.34)] transition active:scale-[0.96] md:-mt-[72px] md:h-[116px] md:w-[116px] md:border-[8px] md:border-white"
            >
              <span className="flex flex-col items-center leading-none">
                <span className="text-2xl font-black leading-none md:text-[56px]">+</span>
                <span className="mt-1 text-[9px] font-black md:text-[18px]">Novo</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setClientePainelBaixo('conversas')}
              title="Conversas"
              data-tutorial="chat"
              className={[
                'relative flex h-[54px] min-w-0 flex-col items-center justify-center rounded-[20px] text-[10px] font-black transition-all duration-200 active:scale-[0.96] md:h-[104px] md:rounded-[30px] md:text-[20px]',
                clientePainelBaixo === 'conversas' || clientePainelBaixo === 'chat'
                  ? 'bg-[#ffd91a] text-blue-950 shadow-[0_10px_24px_rgba(250,204,21,0.24)]'
                  : 'text-slate-600 hover:bg-slate-100 md:text-slate-500 md:hover:bg-slate-50 md:hover:text-blue-950',
              ].join(' ')}
            >
              <svg className="h-[22px] w-[22px] md:h-11 md:w-11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21 11.5a7.5 7.5 0 0 1-9.9 7.1L5 20l1.5-5.3A7.5 7.5 0 1 1 21 11.5Z" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
                <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
              </svg>
              <span className="mt-0.5 leading-none">Chat</span>
              {navCountBadge(unreadInbox)}
            </button>

          </div>

          <div className="hidden pointer-events-auto mx-auto h-[70px] w-full max-w-[330px] items-center justify-between rounded-full border border-slate-200 bg-white px-3 text-slate-950 shadow-[0_18px_58px_rgba(15,23,42,0.24)] backdrop-blur-xl md:max-w-[360px] md:border-white/10 md:bg-slate-950/92 md:px-4 md:text-white">
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
              {navCountBadge(unreadInbox)}
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
              {navCountBadge(problemasVisiveisCount)}
            </button>
          </div>
        </div>
      )}

      {modoApp === 'cliente' && clientePainelBaixo && (
        <div
          className={[
            'fixed inset-0 z-[99990] flex justify-center',
            clientePainelBaixo === 'meusPedidos' ? 'bg-slate-100' : 'bg-[#0f172a]',
          ].join(' ')}
        >
          <div
            className={[
              'h-[100dvh] w-full shadow-[0_0_40px_rgba(0,0,0,0.25)] flex flex-col',
              clientePainelBaixo === 'meusPedidos'
                ? 'max-w-[1560px] bg-white text-slate-950'
                : 'max-w-[900px] bg-[#0f172a] text-white',
            ].join(' ')}
          >
            <div
              className={[
                'shrink-0 px-3 pt-3 pb-2.5 border-b shadow-md md:px-4 md:pt-4 md:pb-3',
                clientePainelBaixo === 'meusPedidos' ? 'bg-white border-slate-200' : 'bg-[#111827] border-slate-700',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div
                    className={[
                      'text-[10px] font-black uppercase tracking-[0.16em] md:text-xs md:tracking-[0.18em]',
                      clientePainelBaixo === 'meusPedidos' ? 'text-blue-600' : 'text-blue-300',
                    ].join(' ')}
                  >
                    Corre Aqui
                  </div>
                  <div
                    className={[
                      'mt-0.5 truncate text-lg font-black md:mt-1 md:text-xl',
                      clientePainelBaixo === 'meusPedidos' ? 'text-slate-950' : 'text-white',
                    ].join(' ')}
                  >
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
                  className={[
                    'h-9 w-9 rounded-xl font-black border transition active:scale-[0.97] md:h-11 md:w-11 md:rounded-2xl',
                    clientePainelBaixo === 'meusPedidos'
                      ? 'bg-white text-slate-900 border-slate-200 shadow-sm hover:bg-blue-50'
                      : 'bg-[#1e293b] hover:bg-[#263449] text-white border-slate-700',
                  ].join(' ')}
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>

            <div
              className={[
                'flex-1 overflow-y-auto overscroll-contain p-2.5 pb-24 md:p-5 md:pb-28',
                clientePainelBaixo === 'meusPedidos' ? 'bg-slate-50' : 'bg-[#0f172a]',
              ].join(' ')}
            >
              {clientePainelBaixo === 'meusPedidos' && (
                <MeusPedidosCliente
                  meuId={meuId}
                  corres={corres}
                  privateRequests={privateRequests}
                  onAbrirChat={abrirChatFocado}
                  onVerMapa={(pedido) => {
                    setMapItem(pedido)
                  }}
                  onConfirmarServicoFeito={(pedido) => {
                    abrirConclusao(pedido)
                  }}
                  onProblemaServico={abrirProblema}
                  onAvaliarServico={abrirAvaliacao}
                  onBoostPedido={abrirBoostPedido}
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
                  onAction={abrirAcaoNotificacao}
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
                      outroUser={getOutroUserComPresence(chatPedido)}
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

      {COMMERCIAL_HIGHLIGHTS_UI_ENABLED && boostPedidoModal ? (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md md:p-4">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="w-full max-w-md overflow-hidden rounded-[26px] border border-amber-200 bg-white text-slate-950 shadow-[0_28px_95px_rgba(15,23,42,0.32)]"
          >
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-950 via-blue-900 to-slate-950 px-5 py-5 text-white">
              <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full border-[22px] border-amber-300/15" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#ffd91a] text-2xl text-blue-950 shadow-[0_12px_26px_rgba(245,158,11,0.28)]">
                  🚀
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">Impulso comercial</div>
                  <h2 className="mt-1 text-xl font-black">Impulsionar pedido</h2>
                  <p className="mt-1 line-clamp-1 text-xs font-semibold text-blue-100">
                    {boostPedidoModal?.titulo || 'Seu pedido'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-[20px] border border-blue-100 bg-blue-50/70 p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-700">Preco fixo</div>
                    <div className="mt-1 text-3xl font-black text-blue-950">R$ 9,99</div>
                  </div>
                  <span className="rounded-full bg-[#ffd91a] px-3 py-1.5 text-[11px] font-black text-blue-950">
                    ate 24h
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-600">
                  Seu pedido entra em &quot;Pedidos em Destaque&quot; para profissionais compativeis da sua regiao.
                </p>
              </div>

              <ul className="space-y-2 text-sm font-bold text-slate-700">
                <li className="flex gap-2"><span className="text-emerald-600">✓</span> Mais exposicao no carrossel superior.</li>
                <li className="flex gap-2"><span className="text-emerald-600">✓</span> Encerramento automatico ao ser aceito, cancelado ou finalizado.</li>
                <li className="flex gap-2"><span className="text-emerald-600">✓</span> Nao altera ordem organica, avaliacao ou reputacao.</li>
              </ul>

              <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-900">
                O impulso aumenta a visibilidade, mas nao garante aceite ou contratacao.
              </div>

              {boostCheckoutResult ? (
                <div
                  className={[
                    'rounded-[18px] px-4 py-3 text-sm font-bold',
                    boostCheckoutResult.type === 'success'
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border border-red-200 bg-red-50 text-red-700',
                  ].join(' ')}
                >
                  {boostCheckoutResult.message}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setBoostPedidoModal(null)
                    setBoostCheckoutResult(null)
                  }}
                  className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                  disabled={boostCheckoutLoading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={criarCheckoutBoost}
                  className="h-12 rounded-2xl bg-blue-600 text-sm font-black text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
                  disabled={boostCheckoutLoading}
                >
                  {boostCheckoutLoading ? 'Criando...' : 'Impulsionar'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}

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

      {showGlobalProfileFab ? (
        <GlobalProfileFab
          fotoURL={fotoURL}
          avatarEmoji={avatarEmoji}
          iniciais={minhasIniciais}
          count={profileFabCount}
          minBottomInset={profileFabMinBottomInset}
          onClick={() => setOpenProfileMenu(true)}
        />
      ) : null}

      <GlobalProfileMenu
        open={openProfileMenu}
        onClose={() => setOpenProfileMenu(false)}
        nome={meuNome}
        fotoURL={fotoURL}
        avatarEmoji={avatarEmoji}
        iniciais={minhasIniciais}
        nota={Number(profissionalStats?.notaMedia || 0)}
        avaliacoes={Number(profissionalStats?.avaliacoes || 0)}
        emServico={tab === 'servico'}
        clientePedidosCount={clientePedidosCount}
        unreadInbox={unreadInbox}
        problemasCount={problemasVisiveisCount}
        onDados={() => abrirPerfilDrawer('dados')}
        onEnderecos={() => abrirPerfilDrawer('enderecos')}
        onHistorico={() => abrirPainelCliente('meusPedidos')}
        onFavoritos={() => abrirRecursoEmBreve('Favoritos')}
        onAvaliacoesCliente={() => abrirRecursoEmBreve('Avaliações como cliente')}
        onPerfilProfissional={() => abrirPerfilDrawer('profissional', 'perfilProfissional')}
        onPortfolio={() => abrirPerfilDrawer('profissional', 'portfolio')}
        onAgenda={() => abrirAreaProfissional('agenda')}
        onGanhos={() => abrirAreaProfissional('ganhos')}
        onAvaliacoesRecebidas={() => abrirPerfilDrawer('profissional', 'avaliacoes')}
        onConfiguracoes={() => abrirPerfilDrawer('config')}
        onAjuda={() => abrirPerfilDrawer('ajuda')}
      />

      <PerfilDrawer
        open={openPerfil}
        onClose={() => setOpenPerfil(false)}
        uid={meuId}
        initialTab={perfilInitialTab}
        initialProfSection={perfilInitialProfSection}
      />

      <ModalAgenda
        open={!!agendaClienteUser}
        profissional={agendaClienteUser}
        servico={agendaClienteService}
        onClose={() => {
          setAgendaClienteUser(null)
          setAgendaClienteService(null)
        }}
      />

      {modoApp === 'corre' && !openIA && !isMapOpen ? (
        <button
          type="button"
          onClick={() => onBottomTab('disponivel')}
          aria-pressed={correDisponivel}
          title={correDisponivel ? 'Você está online' : 'Você está offline'}
          className={[
            'fixed right-4 z-[99979] flex flex-col items-center transition-all duration-300 active:scale-[0.96] md:right-7',
            tab === 'agenda' ? 'gap-0' : 'gap-2',
            bottomBarsHidden
              ? 'bottom-[calc(env(safe-area-inset-bottom)+1rem)]'
              : 'bottom-[calc(env(safe-area-inset-bottom)+5.35rem)] md:bottom-28',
          ].join(' ')}
        >
          <span className={['rounded-xl bg-slate-950 px-3 py-1.5 text-center text-[11px] font-black leading-tight text-white shadow-[0_10px_28px_rgba(0,0,0,0.28)] ring-1 ring-white/10', tab === 'agenda' ? 'sr-only' : ''].join(' ')}>
            Você<br />
            está {correDisponivel ? 'online' : 'offline'}
          </span>
          <span
            className={[
              'grid place-items-center rounded-full border-2 text-white shadow-[0_14px_28px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.35)] transition',
              tab === 'agenda' ? 'h-12 w-12 md:h-14 md:w-14' : 'h-14 w-14 md:h-[60px] md:w-[60px]',
              correDisponivel
                ? 'border-emerald-300/70 bg-gradient-to-br from-emerald-400 via-emerald-600 to-green-700'
                : 'border-slate-500/70 bg-gradient-to-br from-slate-500 via-slate-700 to-slate-950',
            ].join(' ')}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v9" />
              <path d="M6.3 7.2a8 8 0 1 0 11.4 0" />
            </svg>
          </span>
        </button>
      ) : null}

      {modoApp === 'corre' && !openIA && (
        <BottomBar
          active={tab === 'corre' ? 'inicio' : tab}
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
