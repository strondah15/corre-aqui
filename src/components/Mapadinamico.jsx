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
  get,
  query,
  limitToLast,
  runTransaction,
} from 'firebase/database'
import { getOnlineTimestamp, getUserOnlinePreference, setUserOnlinePreference, splitUsuariosOnline } from '@/lib/presence'

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
import { CATEGORIES, categoryMatches, getCanonicalCategoryId, getCategoryById } from '@/constants/categories'

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

const safeText = (v) => String(v || '').trim()

const publicTime = (...values) => {
  for (const value of values) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
    const parsed = Date.parse(String(value || ''))
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return Date.now()
}

const isExplicitPrivateProfile = (privacy = {}) =>
  privacy.profileVisible === false &&
  (privacy.profileVisibilityExplicit === true || privacy.profileVisibleExplicit === true)

const normalizePublicPortfolioItems = (...values) => values
  .flatMap((value) => {
    if (!value) return []
    if (Array.isArray(value)) return value
    if (typeof value === 'object') {
      return Object.entries(value).map(([key, item]) => ({
        id: item?.id || key,
        ...(item || {}),
      }))
    }
    return []
  })
  .filter((item) => item && typeof item === 'object')
  .slice(0, 12)

const buildPublicVitrinePayload = (uid, user = {}, fallback = {}) => {
  if (!uid || !user || typeof user !== 'object') return { profile: null, portfolio: null }

  const profile = user.profile || {}
  const privacy = user.privacy || profile.privacy || {}
  if (isExplicitPrivateProfile(privacy)) return { profile: null, portfolio: null }

  const corre = user.corre || profile.corre || {}
  const profissional = user.profissional || profile.profissional || {}
  const fotoPrincipal = pickFoto(
    fallback.fotoURL,
    user.fotoURL,
    profile.fotoURL,
    user.photoURL,
    profile.photoURL,
    user.avatar,
    profile.avatar
  )
  const avatarEmoji =
    user.avatarEmoji ||
    profile.avatarEmoji ||
    (!isFotoValor(user.avatar) ? user.avatar : '') ||
    (!isFotoValor(profile.avatar) ? profile.avatar : '') ||
    fallback.avatarEmoji ||
    ''
  const nome = safeText(user.nome || profile.nome || fallback.nome || 'Profissional')
  const cidade = safeText(user.cidade || profile.cidade || profissional.regiao || corre.regiao || '')
  const isCorre = !!(user.isCorre || profile.isCorre || corre.ativo)
  const isProfissional = !!(user.isProfissional || profile.isProfissional || profissional.ativo)
  const portfolioItems = normalizePublicPortfolioItems(
    user.profPortfolio,
    user.portfolio,
    profile.profPortfolio,
    profile.portfolio,
    profissional.profPortfolio,
    profissional.portfolio
  )

  if (!isCorre && !isProfissional && !portfolioItems.length) {
    return { profile: null, portfolio: null }
  }

  const publicPortfolio = portfolioItems.reduce((acc, item, index) => {
    const id = safeText(item.id || item.key || `portfolio_${uid}_${index}`)
    const categoriaMeta = getCategoryById(item.categoriaId || item.categoria)
    const categoriaId = safeText(item.categoriaId || categoriaMeta?.id || '')
    const categoriaNome = safeText(item.categoriaNome || item.categoria || categoriaMeta?.label || '')
    const nomeServico = safeText(item.nome || item.titulo || item.title)
    const fotos = normalizePublicPortfolioItems(item.fotos)
    const fotoURL = pickFoto(item.fotoURL, item.foto, fotos[0]?.url, fotos[0]) || ''
    const serviceFotos = Array.isArray(item.fotos)
      ? item.fotos.map((foto) => pickFoto(foto?.url, foto)).filter(Boolean).slice(0, 5)
      : fotoURL
        ? [fotoURL]
        : []

    if (!id || !nomeServico || item.ativo === false) return acc

    acc[id] = {
      id,
      nome: nomeServico,
      titulo: nomeServico,
      descricao: safeText(item.descricao || item.description),
      categoriaId,
      categoriaNome,
      categoria: categoriaNome,
      preco: safeText(item.preco || item.price),
      faixaPreco: safeText(item.faixaPreco || item.valor || item.priceRange || item.preco),
      valor: safeText(item.faixaPreco || item.valor || item.priceRange || item.preco),
      tempoMedio: safeText(item.tempoMedio || item.tempo || item.duration),
      fotos: serviceFotos,
      fotoURL: serviceFotos[0] || '',
      regiao: safeText(item.regiao || item.regiaoAtendimento || item.region || cidade),
      atendeDomicilio: item.atendeDomicilio ?? item.domicilio ?? true,
      urgente: item.urgente === true || item.urgent === true,
      ativo: true,
      profissionalId: uid,
      uid,
      profissionalNome: nome,
      providerName: nome,
      profissionalFotoURL: fotoPrincipal || '',
      providerFotoURL: fotoPrincipal || '',
      cidade,
      isCorre,
      isProfissional: true,
      createdAt: publicTime(item.createdAt, item.criadoEm),
      updatedAt: publicTime(item.updatedAt, item.atualizadoEm, item.createdAt, item.criadoEm),
    }
    return acc
  }, {})

  const profPortfolio = Object.values(publicPortfolio)
  const publicProfile = {
    uid,
    id: uid,
    nome,
    fotoURL: fotoPrincipal || null,
    photoURL: fotoPrincipal || null,
    avatar: fotoPrincipal || avatarEmoji || '',
    avatarEmoji,
    cidade,
    bio: safeText(user.bio || profile.bio || corre.bio || profissional.descricao),
    visivel: user.visivel !== false && profile.visivel !== false,
    profileVisible: true,
    profileVisibilityExplicit: privacy.profileVisibilityExplicit === true || privacy.profileVisibleExplicit === true,
    showOnlineStatus: user.showOnlineStatus ?? privacy.showOnlineStatus ?? true,
    allowPublicContact: user.allowPublicContact ?? privacy.allowPublicContact ?? false,
    isCorre,
    isProfissional,
    correCategorias: Array.isArray(user.correCategorias) ? user.correCategorias : Array.isArray(profile.correCategorias) ? profile.correCategorias : [],
    profCategorias: Array.isArray(user.profCategorias) ? user.profCategorias : Array.isArray(profile.profCategorias) ? profile.profCategorias : [],
    correTitulo: safeText(user.correTitulo || profile.correTitulo || corre.titulo || 'Corre rapido'),
    correResumo: safeText(user.correResumo || profile.correResumo || corre.bio || profile.bio),
    correRegiao: safeText(user.correRegiao || profile.correRegiao || corre.regiao || cidade),
    correTransporte: safeText(user.correTransporte || profile.correTransporte || corre.transporte),
    profResumo: safeText(user.profResumo || profile.profResumo || profile.descricao || profissional.descricao || profissional.titulo),
    profCidadeAtende: safeText(user.profCidadeAtende || profile.profCidadeAtende || profissional.regiao || cidade),
    profPrecoBase: safeText(user.profPrecoBase || profile.profPrecoBase || profile.preco || profissional.preco),
    profWhats: safeText(user.profWhats || profile.profWhats || profissional.whatsapp),
    profExperiencia: safeText(user.profExperiencia || profile.profExperiencia || profissional.experiencia),
    corre: {
      ativo: isCorre,
      titulo: safeText(corre.titulo || user.correTitulo || profile.correTitulo || 'Corre rapido'),
      bio: safeText(corre.bio || user.correResumo || profile.correResumo || profile.bio),
      transporte: safeText(corre.transporte || user.correTransporte || profile.correTransporte),
      regiao: safeText(corre.regiao || user.correRegiao || profile.correRegiao || cidade),
    },
    profissional: {
      ativo: isProfissional,
      titulo: safeText(profissional.titulo || profile.titulo),
      descricao: safeText(profissional.descricao || profile.descricao),
      preco: safeText(profissional.preco || profile.preco),
      whatsapp: safeText(profissional.whatsapp || profile.whatsapp),
      regiao: safeText(profissional.regiao || profile.profRegiao || cidade),
      experiencia: safeText(profissional.experiencia || profile.profExperiencia),
      agendaAberta: user.agendaAberta ?? profissional.agendaAberta ?? true,
    },
    profPortfolio,
    portfolio: publicPortfolio,
    plano: user.plano || profile.plano || 'Free',
    statusProfissional: user.statusProfissional || profile.statusProfissional || profissional.statusProfissional || 'disponivel',
    agendaAberta: user.agendaAberta ?? profile.agendaAberta ?? profissional.agendaAberta ?? true,
    updatedAt: Date.now(),
    atualizadoEm: Date.now(),
  }

  return {
    profile: publicProfile,
    portfolio: Object.keys(publicPortfolio).length ? publicPortfolio : null,
  }
}

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
   🔥 PATENTE + TAXA + BOOST + MISSÕES
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
  patenteProf,
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
          <Patente tipo="prof" nivel={patenteProf || 1} size="sm" />
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
  onPatentes,
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
            <ProfileMenuRow icon="♦" label="Patentes" onClick={onPatentes} />
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
  const [notifPermission, setNotifPermission] = useState('default')
  const notificacoesInicializadasRef = useRef(false)
  const notificacoesVistasRef = useRef(new Set())
  const showToast = useCallback((t) => setToast({ ms: 2800, ...t }), [])

  const [loadingPedidos, setLoadingPedidos] = useState(() => !pedidosCacheReady)
  const [erroPedidos, setErroPedidos] = useState(null)
  const [abrindoPedidoId, setAbrindoPedidoId] = useState(null)

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
    if (typeof window === 'undefined') return

    try {
      const raw = window.sessionStorage.getItem(listStateKey)
      const saved = raw ? JSON.parse(raw) : null
      if (!saved || Date.now() - Number(saved.ts || 0) > 10 * 60 * 1000) return

      if (saved.modoApp === 'cliente' || saved.modoApp === 'corre') setModoApp(saved.modoApp)
      if (saved.tab) setTab(saved.tab)
      if (saved.filtro) setFiltro(saved.filtro)
      if (typeof saved.busca === 'string') setBusca(saved.busca)
      if (saved.categoriaFiltro) setCategoriaFiltro(saved.categoriaFiltro)
      if (typeof saved.clientePainelBaixo === 'string') setClientePainelBaixo(saved.clientePainelBaixo)
      setCardAbertoId(saved.cardAbertoId || null)

      const finishRestore = () => {
        window.scrollTo({ top: Number(saved.scrollY || 0), left: 0, behavior: 'auto' })
        if (DEBUG_NAV_PERF && window.sessionStorage.getItem(LIST_RETURN_FLAG) === listStateKey) {
          console.timeEnd('back-list')
          window.sessionStorage.removeItem(LIST_RETURN_FLAG)
        }
      }

      window.requestAnimationFrame(() => window.requestAnimationFrame(finishRestore))
    } catch {}
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
    if (!meuId) {
      setNotificacoesNaoLidas(0)
      return
    }
    const userAtual = meuUserProfile || {}
    const notificacoesAtivas = userAtual?.profile?.notificacoes !== false
    if (!notificacoesAtivas) {
      setNotificacoesNaoLidas(0)
      return
    }

    const nRef = query(ref(database, `notificacoes/${meuId}`), limitToLast(20))
    const off = onValue(nRef, (snap) => {
      const raw = snap.val() || {}
      const lista = Object.entries(raw)
        .map(([id, n]) => ({ id, ...(n || {}) }))
        .sort((a, b) => Number(b?.criadoEm || 0) - Number(a?.criadoEm || 0))
      setNotificacoesNaoLidas(lista.filter((n) => n?.lida !== true).length)

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
  }, [meuId, showToast, meuUserProfile])

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

  useEffect(() => {
    if (!meuId || !meuUserProfile) return undefined

    let cancelled = false
    const payload = buildPublicVitrinePayload(meuId, meuUserProfile, {
      nome: meuNome,
      fotoURL,
      avatarEmoji,
    })

    ;(async () => {
      try {
        await set(ref(database, `publicProfiles/${meuId}`), payload.profile)
      } catch (error) {
        console.warn('[CLIENTE_HOME] erro publicando publicProfiles', error)
      }

      if (cancelled) return

      try {
        await set(ref(database, `publicPortfolio/${meuId}`), payload.portfolio)
      } catch (error) {
        console.warn('[CLIENTE_HOME] erro publicando publicPortfolio', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [meuId, meuUserProfile, meuNome, fotoURL, avatarEmoji])

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

  const { usuariosOnlineLista, usuariosOnlineMapa } = useMemo(() => {
    return splitUsuariosOnline(usersObj)
  }, [usersObj])

  const onlineUsers = usuariosOnlineLista

  const registeredUsers = useMemo(() => {
    return Object.entries(registeredUsersObj || {}).map(([uid, value]) => ({
      uid,
      id: uid,
      ...(value || {}),
    }))
  }, [registeredUsersObj])

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

  const meuUserNode = useMemo(() => {
    if (!meuId) return null
    const presenceNode = usersObj?.[meuId] || {}
    const profileNode = meuUserProfile || {}
    return {
      ...presenceNode,
      ...profileNode,
      online: presenceNode?.online ?? profileNode?.online,
      lastSeen: presenceNode?.lastSeen ?? profileNode?.lastSeen,
      updatedAt: presenceNode?.updatedAt ?? profileNode?.updatedAt,
      local: presenceNode?.local ?? profileNode?.local,
      latitude: presenceNode?.latitude ?? profileNode?.latitude,
      longitude: presenceNode?.longitude ?? profileNode?.longitude,
    }
  }, [usersObj, meuId, meuUserProfile])

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

  const minhaPatenteCorre = useMemo(() => {
    const servicos = Number(meuUserNode?.servicosCorre ?? meuUserNode?.['serviçosCorre'] ?? 0)
    return Math.max(Number(meuUserNode?.patenteCorre || 1), calcularPatentePorServicos(servicos))
  }, [meuUserNode])
  const minhaPatenteProf = useMemo(
    () => {
      if (!isProfissional) return 0
      const servicos = Number(meuUserNode?.servicosProf ?? meuUserNode?.['serviçosProf'] ?? 0)
      return Math.max(Number(meuUserNode?.patenteProf || 1), calcularPatentePorServicos(servicos))
    },
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

        if (filtro === 'abertos' && (p.status || 'aberto') !== 'aberto') return false
        if (filtro === 'meus' && p?.aceite?.id !== meuId) return false
        if (filtro === 'finalizados' && String(p?.status || '').toLowerCase() !== 'concluido') return false

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
      .sort((a, b) => {
        const pa = prioridadePedido(a)
        const pb = prioridadePedido(b)
        if (pb !== pa) return pb - pa

        const ta = getMs(a?.criadoEm || a?.createdAt || a?.atualizadoEm || 0)
        const tb = getMs(b?.criadoEm || b?.createdAt || b?.atualizadoEm || 0)
        return tb - ta
      })
  }, [corres, filtro, buscaTerm, meuId, categoriaFiltro, isProfissional])

  const categoriaPedidosCount = useMemo(() => {
    const counts = { todas: 0, sem: 0 }
    ;(CATEGORIES || []).forEach((cat) => {
      counts[cat.id] = 0
    })

    ;(corres || []).forEach((p) => {
      const modo = String(p?.modoPedido || 'geral').toLowerCase()
      if (modo === 'profissional' && !isProfissional) return

      const status = String(p?.status || 'aberto').toLowerCase()
      if (filtro === 'abertos' && status !== 'aberto') return
      if (filtro === 'meus' && p?.aceite?.id !== meuId) return
      if (filtro === 'finalizados' && status !== 'concluido') return

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
  }, [corres, filtro, buscaTerm, meuId, isProfissional])

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
        const status = String(p?.status || 'aberto').toLowerCase()
        if (status === 'aberto') acc.abertos += 1
        if (p?.aceite?.id === meuId) acc.meus += 1
        if (status === 'concluido') acc.concluidos += 1
        return acc
      },
      { abertos: 0, meus: 0, concluidos: 0 }
    )
  }, [corres, meuId])

  const profissionalStats = useMemo(() => {
    const meus = (Array.isArray(corres) ? corres : []).filter((p) => p?.aceite?.id === meuId)
    const concluidos = meus.filter((p) => String(p?.status || '').toLowerCase() === 'concluido')
    const ativos = meus.filter((p) => String(p?.status || '').toLowerCase() === 'aceito')
    const notas = concluidos
      .map((p) => Number(p?.avaliacao?.nota || p?.avaliacaoNota || 0))
      .filter((n) => Number.isFinite(n) && n > 0)
    const ganhosTotal = concluidos.reduce((sum, p) => sum + getValorPedido(p?.valor), 0)
    const taxaConclusao = meus.length ? Math.round((concluidos.length / meus.length) * 100) : 0
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
      semana,
    }
  }, [corres, meuId])

  const ganhosStatsPorModo = useMemo(() => {
    const meus = (Array.isArray(corres) ? corres : []).filter((p) => p?.aceite?.id === meuId)

    const buildStats = (modo) => {
      const modoProf = modo === 'prof'
      const pedidosModo = meus.filter((p) => {
        const isProf = String(p?.modoPedido || 'geral').toLowerCase() === 'profissional'
        return modoProf ? isProf : !isProf
      })
      const concluidos = pedidosModo.filter((p) => String(p?.status || '').toLowerCase() === 'concluido')
      const ativos = pedidosModo.filter((p) => String(p?.status || '').toLowerCase() === 'aceito')
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

      router.push(`/pedido/${encodeURIComponent(String(p.id))}?voltar=corre&aceito=1`)
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

  const abrirAgendaCliente = useCallback((u) => {
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

  const abrirPerfilDrawer = useCallback((initialTab = 'config', initialProfSection = '') => {
    setPerfilInitialTab(initialTab && initialTab !== 'perfil' ? initialTab : 'config')
    setPerfilInitialProfSection(initialProfSection || '')
    setOpenProfileMenu(false)
    setOpenPerfil(true)
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

      <div className="relative z-10 w-full max-w-[1280px] mx-auto px-2.5 pt-0 pb-24 md:px-4 md:py-5 md:pb-32 sm:px-5 lg:px-6">
        {/* CORRE: Header + Inbox */}
        {modoApp === 'corre' && (
          <>
            <div className="relative -mx-2.5 mb-0 overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#16b8d1_46%,#ffdf2e_100%)] text-slate-950 shadow-[0_22px_70px_rgba(37,99,235,0.22)] backdrop-blur-xl md:mx-0 md:rounded-[34px]">
              <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-500/24 md:h-96 md:w-96" />
              <div className="pointer-events-none absolute -right-16 top-0 h-80 w-60 rotate-12 rounded-[70px] bg-yellow-100/42 md:-right-6 md:h-[30rem] md:w-80" />
              <div className="pointer-events-none absolute bottom-10 right-5 h-32 w-52 rotate-12 rounded-[44px] bg-blue-600/26 md:bottom-12 md:right-12 md:h-52 md:w-80" />

              <div className="relative p-4 pb-5 md:p-8 md:pb-10">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 md:gap-3">
                  <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
                    {typeof onBackToMode === 'function' ? (
                      <button
                        onClick={voltarModoLimpo}
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] border border-yellow-200/80 bg-[#ffd91a] text-blue-950 shadow-[0_14px_28px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.58)] transition hover:-translate-y-0.5 active:scale-[0.96] min-[390px]:h-14 min-[390px]:w-14 min-[390px]:rounded-[20px] md:h-16 md:w-16 md:rounded-[24px]"
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
                      <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-[19px] bg-white text-base font-black text-blue-700 shadow-[0_14px_30px_rgba(15,23,42,0.16)] min-[390px]:h-14 min-[390px]:w-14 min-[390px]:rounded-[22px] min-[390px]:text-lg md:h-20 md:w-20 md:rounded-[30px] md:text-2xl">
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

                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="max-w-[8.6rem] truncate text-[9px] font-black uppercase tracking-[0.18em] text-white min-[390px]:max-w-[10rem] min-[390px]:text-[10px] md:max-w-none md:text-xs md:tracking-[0.22em]">
                        Perto de você
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenProfileMenu(true)}
                        className="mt-0.5 block w-full max-w-[9.2rem] truncate text-left text-[1.55rem] font-black leading-none text-white drop-shadow-sm transition hover:opacity-90 min-[390px]:max-w-[11rem] min-[390px]:text-2xl md:max-w-none md:text-4xl"
                      >
                        {meuNome || 'Visitante'} ›
                      </button>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenMapaAoVivo(true)}
                      title="Mapa ao vivo"
                      className="grid h-10 w-10 place-items-center rounded-[16px] bg-white/90 text-base shadow-[0_12px_26px_rgba(15,23,42,0.14)] transition hover:scale-[1.03] min-[390px]:h-11 min-[390px]:w-11 min-[390px]:rounded-[18px] min-[390px]:text-lg md:h-14 md:w-14 md:rounded-[22px]"
                    >
                      🗺️
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('inbox')}
                      title="Notificações e conversas"
                      className="relative grid h-10 w-10 place-items-center rounded-[16px] bg-white/90 text-base shadow-[0_12px_26px_rgba(15,23,42,0.14)] transition hover:scale-[1.03] min-[390px]:h-11 min-[390px]:w-11 min-[390px]:rounded-[18px] min-[390px]:text-lg md:h-14 md:w-14 md:rounded-[22px]"
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

                    <div className="mt-4 rounded-[20px] border border-white/14 bg-slate-950/18 p-3 text-white shadow-[0_14px_34px_rgba(15,23,42,0.12)] backdrop-blur md:mt-8 md:rounded-[28px] md:p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/75">Resumo do dia</div>
                          <div className="mt-1 text-sm font-black md:text-lg">
                            {correDisponivel ? 'Visivel para clientes' : 'Oculto agora'}
                          </div>
                        </div>
                        <span className="rounded-full bg-[#ffd91a] px-3 py-1 text-[10px] font-black text-blue-950">
                          {corresFiltrados.length} pedidos
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                          ['Faturamento', formatMoneyBR(profissionalStats.ganhosSemana)],
                          ['Serviços', profissionalStats.total || 0],
                          ['Avaliação', profissionalStats.notaMedia ? `${profissionalStats.notaMedia.toFixed(1)} ★` : '--'],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-2xl border border-white/10 bg-white/10 px-2 py-2 text-center">
                            <div className="truncate text-sm font-black md:text-xl">{value}</div>
                            <div className="mt-0.5 truncate text-[9px] font-black uppercase tracking-[0.1em] text-white/65">{label}</div>
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
              <div className="mb-4">
                <div className="hidden">
                  <div className="text-xl font-black text-white">📅 Minha agenda</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Solicitações futuras dos clientes. Aceite, recuse e organize sua fila.
                  </div>
                </div>

                <div>
                  <AgendaProfissional
                    uid={meuId}
                    nome={meuNome}
                    fotoURL={fotoURL}
                    notificacoesCount={notificacoesNaoLidas}
                    onAbrirPerfil={() => setOpenProfileMenu(true)}
                    onAbrirNotificacoes={() => setTab('inbox')}
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
              meuNome={meuNome}
              onlineUsers={onlineUsers}
              registeredUsers={registeredUsers}
              publicPortfolio={publicPortfolioObj}
              onCriarPedido={() => setOpenIA(true)}
              onIrAoVivo={() => {
                setOpenMapaAoVivo(true)
              }}
              onAbrirNotificacoes={() => setClientePainelBaixo('notificacoes')}
              onAbrirPerfil={abrirPerfilCliente}
              onAgendar={abrirAgendaCliente}
              onBackToMode={typeof onBackToMode === 'function' ? voltarModoLimpo : undefined}
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
          <div className="relative z-20 -mx-2.5 -mt-4 rounded-t-[30px] bg-white px-4 pt-5 pb-28 text-slate-950 shadow-[0_-14px_34px_rgba(15,23,42,0.08)] md:mx-0 md:-mt-6 md:rounded-[36px] md:px-8 md:pt-6 md:pb-10">
            {/* Painel de filtros do Corre */}
            <div className="mb-3 md:mb-8">
              <div>
                <div className="flex gap-1.5 overflow-x-auto pt-1.5 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] md:mt-6 md:gap-2 md:pt-2 [&::-webkit-scrollbar]:hidden">
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
                {corresFiltrados.length}
              </span>
            </div>

            <div className="grid grid-cols-1 items-stretch gap-2.5 pb-44 md:gap-3 md:pb-28 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 sm:pb-40">
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
                const abrindoEstePedido = abrindoPedidoId === p.id

                const catObj = getCatObj(p?.categoriaId || p?.categoria)
                const combinaComigo =
                  isProfissional && p?.categoriaId && (minhasCategoriasProf || []).includes(p.categoriaId)

                const criadorId = p?.criador?.id
                const userCriador = criadorId ? usersObj?.[criadorId] : null
                const patenteCriadorCorre = Number(userCriador?.patenteCorre || 1)
                const patenteCriadorProf = Number(userCriador?.patenteProf || 0)

                const statusLabel =
                  status === 'concluido' || status === 'finalizado'
                    ? 'Finalizado'
                    : status === 'aceito'
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
                      "corre-card-clean group relative flex min-h-[132px] flex-col overflow-hidden rounded-[16px] border-[1.5px] bg-white text-slate-950",
                      "shadow-[0_12px_26px_rgba(15,23,42,0.14)] ring-1 ring-slate-300/70 transition [content-visibility:auto] [contain-intrinsic-size:160px] md:min-h-[136px] md:rounded-[18px]",
                      cardAberto ? "shadow-[0_20px_48px_rgba(15,23,42,0.16)]" : "",
                      b.destaque ? "border-fuchsia-300/80 ring-2 ring-fuchsia-300/30" : "",
                      b.emergencia ? "border-red-400 ring-2 ring-red-400/55" : "",
                    ].join(" ")}
                    style={
                      !b.emergencia && !b.destaque
                        ? {
                            borderColor: `${pedidoTheme.accent}70`,
                            boxShadow: cardAberto
                              ? '0 20px 48px rgba(15,23,42,0.18), 0 0 0 1px rgba(15,23,42,0.08)'
                              : `0 12px 26px rgba(15,23,42,0.14), 0 0 0 1px ${pedidoTheme.accent}24`,
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
                    <div className="pointer-events-none absolute -right-8 top-8 h-20 w-20 rounded-full blur-xl transition md:h-24 md:w-24" style={{ backgroundColor: pedidoTheme.soft }} />
                    <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-11 w-full opacity-95" viewBox="0 0 360 70" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M0 42 C70 16 112 62 184 39 C246 19 296 42 360 22 L360 70 L0 70 Z" fill={pedidoTheme.wave} />
                    </svg>

                    <div className="relative z-10 grid flex-1 grid-cols-[minmax(0,1fr)_auto] gap-2.5 p-3.5 pt-5 md:gap-3 md:p-4 md:pt-5">
                      <button
                        type="button"
                        onClick={() => abrirFichaPedido(p)}
                        aria-busy={abrindoEstePedido}
                        className="min-w-0 text-left"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span
                            className={[
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em]",
                              status === 'aberto'
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : status === 'aceito'
                                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                  : "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
                            ].join(" ")}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {statusLabel}
                          </span>
                          <span className="min-w-0 max-w-[150px] truncate text-[10px] font-bold text-slate-500 md:max-w-[220px]">
                            {catObj ? catObj.label : p?.categoriaId ? String(p.categoriaId) : 'Geral'}
                          </span>
                        </div>

                        <div className="mt-2 line-clamp-2 break-words text-lg font-black leading-[1.05] text-slate-950 md:text-[21px]">
                          {tituloPedido}
                        </div>

                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold text-slate-500 md:text-xs">
                          <span>{distanciaPedido}</span>
                          <span className="text-slate-300">•</span>
                          <span>{tempoPostado}</span>
                          <span className="text-slate-300">•</span>
                          <span>{dataCurtaPedido}</span>
                          {combinaComigo && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-emerald-700">Combina com voce</span>
                            </>
                          )}
                        </div>
                      </button>

                      <div className="flex shrink-0 flex-col items-end justify-between gap-1.5 text-right">
                        <div
                          className="rounded-full px-1.5 py-0.5 text-[12px] font-black text-blue-950 md:text-sm"
                        >
                          {temValor ? formatMoneyBR(valorNumerico) : 'Combinar'}
                        </div>
                        <div
                          className="grid h-12 w-12 place-items-center rounded-full text-2xl shadow-[0_12px_22px_rgba(15,23,42,0.08)] ring-1 ring-white/80 md:h-14 md:w-14 md:text-3xl"
                          style={{ backgroundColor: pedidoTheme.soft, color: pedidoTheme.accent }}
                        >
                          <span className="drop-shadow-sm">{pedidoTheme.icon}</span>
                        </div>
                        {status === 'aberto' && !cardAberto ? (
                          <button
                            className="rounded-[10px] px-3.5 py-1.5 text-[11px] font-black text-white shadow-[0_12px_22px_rgba(15,23,42,0.16)] transition hover:brightness-105 disabled:opacity-60 md:text-xs"
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
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 ring-1 ring-slate-200">
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

                    {/* patentes do criador */}
                    <div className="relative z-10 mx-3 flex gap-2 flex-wrap md:mx-4">
                      <Patente tipo="corre" nivel={patenteCriadorCorre} size="sm" showLabel={false} />
                      {patenteCriadorProf > 0 && <Patente tipo="prof" nivel={patenteCriadorProf} size="sm" />}
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
      


      {modoApp === 'cliente' && !isMapOpen && !openIA && (
        <div
          className={[
            'fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.45rem)] z-[99980] px-3 pointer-events-none transition-all duration-300 ease-out will-change-transform md:left-1/2 md:right-auto md:bottom-7 md:w-full md:max-w-[1024px] md:-translate-x-1/2 md:px-[52px]',
            bottomBarsHidden ? 'translate-y-[135%] opacity-0' : 'translate-y-0 opacity-100',
          ].join(' ')}
        >
          <div className="pointer-events-auto mx-auto grid h-[66px] w-full max-w-[360px] grid-cols-[1fr_1fr_72px_1fr] items-center gap-1 rounded-[28px] border border-slate-200 bg-white px-2 text-slate-950 shadow-[0_18px_58px_rgba(15,23,42,0.22)] backdrop-blur-xl md:h-[146px] md:max-w-[820px] md:grid-cols-[1fr_1fr_132px_1fr] md:gap-4 md:rounded-[36px] md:border-slate-100 md:bg-white md:px-8 md:text-slate-700">
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
        onEnderecos={() => abrirRecursoEmBreve('Endereços')}
        onHistorico={() => abrirPainelCliente('meusPedidos')}
        onFavoritos={() => abrirRecursoEmBreve('Favoritos')}
        onAvaliacoesCliente={() => abrirRecursoEmBreve('Avaliações como cliente')}
        onPerfilProfissional={() => abrirPerfilDrawer('profissional', 'perfilProfissional')}
        onPortfolio={() => abrirPerfilDrawer('profissional', 'portfolio')}
        onAgenda={() => abrirAreaProfissional('agenda')}
        onGanhos={() => abrirAreaProfissional('ganhos')}
        onPatentes={() => abrirPerfilDrawer('profissional', 'patentes')}
        onAvaliacoesRecebidas={() => abrirPerfilDrawer('profissional', 'avaliacoes')}
        onConfiguracoes={() => abrirPerfilDrawer('config')}
        onAjuda={() => abrirPerfilDrawer('profissional', 'ajuda')}
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
        onClose={() => setAgendaClienteUser(null)}
      />

      {modoApp === 'corre' && !openIA && !isMapOpen ? (
        <button
          type="button"
          onClick={() => onBottomTab('disponivel')}
          aria-pressed={correDisponivel}
          title={correDisponivel ? 'Você está online' : 'Você está offline'}
          className={[
            'fixed right-4 z-[99979] flex flex-col items-center gap-2 transition-all duration-300 active:scale-[0.96] md:right-7',
            bottomBarsHidden
              ? 'bottom-[calc(env(safe-area-inset-bottom)+1rem)]'
              : 'bottom-[calc(env(safe-area-inset-bottom)+5.35rem)] md:bottom-28',
          ].join(' ')}
        >
          <span className="rounded-xl bg-slate-950/88 px-3 py-1.5 text-center text-[11px] font-black leading-tight text-white shadow-[0_10px_28px_rgba(0,0,0,0.28)] ring-1 ring-white/10 backdrop-blur">
            Você<br />
            está {correDisponivel ? 'online' : 'offline'}
          </span>
          <span
            className={[
              'grid h-14 w-14 place-items-center rounded-full border-2 text-white shadow-[0_14px_28px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.35)] transition md:h-[60px] md:w-[60px]',
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
