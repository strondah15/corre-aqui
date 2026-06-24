'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, categoryMatches, getCategoryById } from '@/constants/categories'
import ListaProfissionais from './ListaProfissionais'

const glass =
  'bg-white/[0.08] border border-white/10 shadow-[0_22px_80px_rgba(0,0,0,0.24)] text-white backdrop-blur-xl select-none'

const floatingSection =
  'bg-white/[0.08] border border-white/10 shadow-[0_22px_80px_rgba(0,0,0,0.22)] text-white backdrop-blur-xl select-none'

const safeStr = (v) => String(v || '').trim()

const safeUrl = (v) => {
  const url = safeStr(v)
  if (!url) return ''
  if (/^(https?:\/\/|data:image\/|blob:|\/)/i.test(url)) return url
  return ''
}

const normalizePortfolioFotos = (item = {}) => {
  const raw = [
    ...(Array.isArray(item.fotos) ? item.fotos : []),
    ...(Array.isArray(item.photos) ? item.photos : []),
    ...(Array.isArray(item.imagens) ? item.imagens : []),
    item.fotoURL,
    item.imageURL,
    item.imagemURL,
    item.photoURL,
  ]

  return Array.from(new Set(raw.map((foto) => safeUrl(foto)).filter(Boolean))).slice(0, 5)
}

const getFotoPersonalizada = (u) => safeStr(
  u?.fotoURL ||
    u?.avatarUrl ||
    u?.avatarURL ||
    u?.imagem ||
    u?.imageUrl ||
    u?.profile?.fotoURL ||
    u?.profile?.avatarUrl ||
    u?.profile?.avatarURL ||
    u?.profile?.imagem ||
    u?.profile?.imageUrl ||
    u?.perfil?.fotoURL ||
    u?.profissional?.fotoURL ||
    u?.corre?.fotoURL ||
    ''
)

const getGoogleFoto = (u) => safeStr(
  u?.photoURL ||
    u?.profile?.photoURL ||
    u?.perfil?.photoURL ||
    u?.profissional?.photoURL ||
    u?.corre?.photoURL ||
    ''
)

const getLabelCategoria = (id) => {
  const c = getCategoryById(id)
  return c ? `${c.emoji} ${c.label}` : '—'
}

const normalizePortfolioEntries = (...values) => values
  .flatMap((value) => {
    if (!value) return []
    if (Array.isArray(value)) return value
    if (typeof value === 'object') return Object.values(value)
    return []
  })
  .filter(Boolean)

const isActivePortfolioService = (service) => {
  if (!service || typeof service !== 'object') return false
  if (service.ativo === false || service.active === false) return false
  const fotos = normalizePortfolioFotos(service)
  return !!safeStr(
    service.nome ||
      service.titulo ||
      service.title ||
      service.descricao ||
      service.description ||
      service.valor ||
      service.preco ||
      service.faixaPreco ||
      service.fotoURL
  ) || fotos.length > 0
}

const providerHasPortfolio = (item) => normalizePortfolioEntries(item?.portfolio).some(isActivePortfolioService)

function ClienteMapBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[#f8fbff]" />

      <div
        className="absolute inset-0 bg-cover bg-center opacity-100"
        style={{ backgroundImage: "url('/cliente-home-map-bg.png')" }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,.54),transparent_34%),linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.38)_78%,rgba(255,255,255,.78))]" />
    </div>
  )
}

function SearchIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.2" stroke="currentColor" strokeWidth="2.2" />
      <path d="m16 16 4.2 4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  )
}

function MapMiniIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="m3.8 6.2 5-2.1 6.4 2.1 5-2.1v13.7l-5 2.1-6.4-2.1-5 2.1V6.2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M8.8 4.1v13.7M15.2 6.2v13.7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17.8 8.1c-2 0-3.6 1.6-3.6 3.5 0 2.5 3.1 5.8 3.4 6.1.1.1.3.1.4 0 .4-.4 3.4-3.6 3.4-6.1 0-2-1.6-3.5-3.6-3.5Z" fill="#ffd91a" stroke="white" strokeWidth="1.2" />
      <circle cx="17.8" cy="11.6" r="1.1" fill="currentColor" />
    </svg>
  )
}

function BellMiniIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M18 10.7c0-3.4-2.2-6.1-6-6.1s-6 2.7-6 6.1v2.9l-1.6 2.5h15.2L18 13.6v-2.9Z" fill="#ffd91a" stroke="#f59e0b" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M9.6 18.4a2.5 2.5 0 0 0 4.8 0" stroke="#1e3a8a" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  )
}

function ClienteHeroMapIcon() {
  return (
    <svg viewBox="0 0 96 112" className="h-[58px] w-[50px] opacity-[0.9] drop-shadow-[0_10px_16px_rgba(37,99,235,0.16)] min-[390px]:h-[64px] min-[390px]:w-[56px] md:h-[84px] md:w-[72px]" fill="none" aria-hidden="true">
      <path d="M48 6c-21 0-38 16.4-38 36.7 0 26.2 32.6 57.6 36.3 61 .9.8 2.5.8 3.4 0 3.7-3.4 36.3-34.8 36.3-61C86 22.4 69 6 48 6Z" fill="#2f80ff" />
      <path d="M48 17c-14.4 0-26 11.3-26 25.3 0 18 22.3 39.6 24.9 42 .6.6 1.7.6 2.2 0 2.6-2.4 24.9-24 24.9-42C74 28.3 62.4 17 48 17Z" fill="#2563eb" />
      <circle cx="48" cy="42" r="11" fill="white" />
    </svg>
  )
}

function CategoryTileIcon({ id }) {
  const common = 'h-10 w-10 drop-shadow-[0_8px_14px_rgba(37,99,235,0.12)] md:h-14 md:w-14'

  if (!id) {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <rect x="8" y="8" width="13" height="13" rx="4" fill="currentColor" />
        <rect x="27" y="8" width="13" height="13" rx="4" fill="currentColor" opacity="0.72" />
        <rect x="8" y="27" width="13" height="13" rx="4" fill="currentColor" opacity="0.72" />
        <rect x="27" y="27" width="13" height="13" rx="4" fill="currentColor" />
        <path d="M14.5 14.5h.1M33.5 14.5h.1M14.5 33.5h.1M33.5 33.5h.1" stroke="white" strokeLinecap="round" strokeWidth="3" opacity="0.85" />
      </svg>
    )
  }

  if (id === 'servicos_gerais') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="M26.5 4.5 11 27.2h11.2l-2 16.3L37 19.2H25.8l.7-14.7Z" fill="currentColor" />
        <path d="M25.8 10.8 16.4 24h10.2l-.9 8.2 7.2-10.8H22.7l3.1-10.6Z" fill="white" opacity="0.44" />
      </svg>
    )
  }

  if (id === 'entregas') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="M18 13h14c2.4 0 4.5 1.7 5 4l2.1 9.7H18V13Z" fill="currentColor" opacity="0.18" />
        <path d="M14 27h20.2l3-9.3h-11l-3-6.1H15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <path d="M34.2 17.8h4.1c1.2 0 2.2.8 2.5 2l1.9 7.2H35" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <circle cx="14" cy="33" r="5" fill="currentColor" />
        <circle cx="35" cy="33" r="5" fill="currentColor" />
        <circle cx="14" cy="33" r="2" fill="white" opacity="0.86" />
        <circle cx="35" cy="33" r="2" fill="white" opacity="0.86" />
      </svg>
    )
  }

  if (id === 'compras') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="M12.4 13.2h27l-3.7 16.5H16.4l-4-20.2H7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <path d="M16.8 17.8h17.5l-1.5 7.3H18.2l-1.4-7.3Z" fill="currentColor" opacity="0.2" />
        <circle cx="18.5" cy="37" r="4.4" fill="currentColor" />
        <circle cx="34" cy="37" r="4.4" fill="currentColor" />
        <circle cx="18.5" cy="37" r="1.7" fill="white" opacity="0.86" />
        <circle cx="34" cy="37" r="1.7" fill="white" opacity="0.86" />
      </svg>
    )
  }

  if (id === 'casa') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="m7.5 23 16.5-14 16.5 14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <path d="M12.5 21.5v18h23v-18" fill="currentColor" opacity="0.16" />
        <path d="M12.5 21.5v18h23v-18" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
        <path d="M20.5 39.5v-10h7v10" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
        <path d="M31 15.2v-5h5v9.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      </svg>
    )
  }

  if (id === 'reparos') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="M28.8 8.5a9.4 9.4 0 0 0 10.7 10.7L20.2 38.5a5.2 5.2 0 0 1-7.4-7.4L32.1 11.8a9.4 9.4 0 0 0-3.3-3.3Z" fill="currentColor" opacity="0.18" />
        <path d="M28.8 8.5a9.4 9.4 0 0 0 10.7 10.7L20.2 38.5a5.2 5.2 0 0 1-7.4-7.4L32.1 11.8a9.4 9.4 0 0 0-3.3-3.3Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <path d="m15.6 33.8 4.6 4.6" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
      </svg>
    )
  }

  if (id === 'limpeza') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="M28.5 7 15 35" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
        <path d="m14.8 27.5 13 6.2" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
        <path d="M10 35h18.2v5H10z" fill="currentColor" />
        <path d="M13.5 39.5h2.5M20 39.5h2.5" stroke="white" strokeLinecap="round" strokeWidth="2.2" opacity="0.75" />
      </svg>
    )
  }

  if (id === 'beleza') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="M16.5 14.5c4.8-8.1 17.9-6 18.2 4.4.3 8.7-8 12.9-16.1 20.6C16 31 11.8 22.4 16.5 14.5Z" fill="currentColor" opacity="0.2" />
        <path d="M15 14.5c5.2-8.8 19.4-6.5 19.7 4.8.3 9.4-8.7 14-17.6 22.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <path d="M24 11v9M19.5 15.5h9" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      </svg>
    )
  }

  if (id === 'aulas') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="M8 15.5 24 8l16 7.5L24 23 8 15.5Z" fill="currentColor" />
        <path d="M14 20v9.5c0 3.6 4.5 6.5 10 6.5s10-2.9 10-6.5V20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <path d="M40 16v11" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
        <path d="M15 16.2 24 20l9-3.8" stroke="white" strokeLinecap="round" strokeWidth="2.4" opacity="0.55" />
      </svg>
    )
  }

  if (id === 'pets') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <circle cx="15" cy="17" r="4.2" fill="currentColor" opacity="0.72" />
        <circle cx="24" cy="12" r="4.5" fill="currentColor" />
        <circle cx="33" cy="17" r="4.2" fill="currentColor" opacity="0.72" />
        <circle cx="17.5" cy="27" r="4.2" fill="currentColor" />
        <circle cx="30.5" cy="27" r="4.2" fill="currentColor" />
        <path d="M15 36c0-6 4.3-10.5 9-10.5S33 30 33 36c0 3.2-2.4 5.3-5.5 4.1-2.2-.8-4.8-.8-7 0-3.1 1.2-5.5-.9-5.5-4.1Z" fill="currentColor" opacity="0.88" />
      </svg>
    )
  }

  if (id === 'tecnologia') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <rect x="9" y="11" width="30" height="22" rx="4" fill="currentColor" opacity="0.2" />
        <rect x="9" y="11" width="30" height="22" rx="4" stroke="currentColor" strokeWidth="4" />
        <path d="M18 39h12M24 33v6" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
        <path d="M16 18h9M16 24h16" stroke="currentColor" strokeLinecap="round" strokeWidth="3" opacity="0.65" />
      </svg>
    )
  }

  if (id === 'transporte') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="M10 25.5 14.2 16c.7-1.6 2.2-2.5 3.9-2.5h12c1.7 0 3.2.9 3.9 2.5l4 9.5v9H10v-9Z" fill="currentColor" opacity="0.18" />
        <path d="M10 25.5 14.2 16c.7-1.6 2.2-2.5 3.9-2.5h12c1.7 0 3.2.9 3.9 2.5l4 9.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <path d="M10 25.5h28v9H10v-9Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="4" />
        <circle cx="17" cy="35" r="3.5" fill="currentColor" />
        <circle cx="31" cy="35" r="3.5" fill="currentColor" />
      </svg>
    )
  }

  if (id === 'mudancas') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="M9 17.5 24 10l15 7.5v16L24 41 9 33.5v-16Z" fill="currentColor" opacity="0.2" />
        <path d="M9 17.5 24 10l15 7.5M9 17.5 24 25m-15-7.5v16L24 41m0-16 15-7.5M24 25v16m15-23.5v16L24 41" stroke="currentColor" strokeLinejoin="round" strokeWidth="3.4" />
        <path d="m16 14 15 7.5" stroke="currentColor" strokeLinecap="round" strokeWidth="3.4" opacity="0.75" />
      </svg>
    )
  }

  if (id === 'eventos') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="M24 7 28.2 19 41 19.4 30.8 27.1 34.4 39.5 24 32.2 13.6 39.5 17.2 27.1 7 19.4 19.8 19 24 7Z" fill="currentColor" />
        <path d="M14 8.5v5.5M9.5 13h9M37.5 8.5v5.5M33 13h9" stroke="currentColor" strokeLinecap="round" strokeWidth="3" opacity="0.65" />
        <path d="m20.5 22.5 3.5-9.3 3.5 9.3" stroke="white" strokeLinecap="round" strokeWidth="2.4" opacity="0.5" />
      </svg>
    )
  }

  if (id === 'midia') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <rect x="8" y="14" width="32" height="24" rx="6" fill="currentColor" opacity="0.2" />
        <rect x="8" y="14" width="32" height="24" rx="6" stroke="currentColor" strokeWidth="4" />
        <path d="M17 14l2.8-5h8.4l2.8 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <circle cx="24" cy="26" r="6" fill="currentColor" />
        <circle cx="24" cy="26" r="2.5" fill="white" opacity="0.86" />
      </svg>
    )
  }

  if (id === 'cuidados') {
    return (
      <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
        <path d="M24 40s-14-8-14-20.2C10 13.3 15.2 9 20.7 11.2c1.6.6 2.7 1.8 3.3 3 .6-1.2 1.7-2.4 3.3-3C32.8 9 38 13.3 38 19.8 38 32 24 40 24 40Z" fill="currentColor" opacity="0.88" />
        <path d="M18 24h12M24 18v12" stroke="white" strokeLinecap="round" strokeWidth="4" opacity="0.82" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 48 48" className={common} fill="none" aria-hidden="true">
      <path d="M26.5 4.5 11 27.2h11.2l-2 16.3L37 19.2H25.8l.7-14.7Z" fill="currentColor" />
      <path d="M25.8 10.8 16.4 24h10.2l-.9 8.2 7.2-10.8H22.7l3.1-10.6Z" fill="white" opacity="0.44" />
    </svg>
  )
}

function StatCardArt({ type }) {
  return (
    <svg viewBox="0 0 160 96" className="pointer-events-none absolute inset-y-0 right-0 h-full w-32 opacity-55 md:w-[260px]" fill="none" aria-hidden="true">
      <path d="M0 82c34-32 66-42 96-30 24 10 34 28 64 16" stroke={type === 'corre' ? '#facc15' : '#93c5fd'} strokeWidth="1.1" />
      <path d="M0 91c34-32 66-42 96-30 24 10 34 28 64 16" stroke={type === 'corre' ? '#facc15' : '#93c5fd'} strokeWidth="1.1" />
      {type === 'corre' ? (
        <path d="M116 18c-6.2 0-11.2 4.9-11.2 11 0 7.8 9.6 17.2 10.7 18.3.3.3.8.3 1.1 0 1.1-1.1 10.7-10.5 10.7-18.3 0-6.1-5.1-11-11.3-11Z" stroke="#f59e0b" strokeWidth="2" />
      ) : (
        <path d="M105 48c3-8 9.4-12.3 18-12.3S138 40 141 48M123 19.8a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z" stroke="#60a5fa" strokeLinecap="round" strokeWidth="2" />
      )}
    </svg>
  )
}

function getClientCategoryColor(id, fallback) {
  const colors = {
    servicos_gerais: '#facc15',
    entregas: '#43b96f',
    compras: '#2f80ff',
  }

  return colors[id || ''] || (id ? fallback || '#2563eb' : '#2f80ff')
}

const normalizeProvider = (u) => {
  const uid = u?.uid || u?.id || null
  if (!uid) return null

  const profile = u?.profile || {}
  const privacy = u?.privacy || profile?.privacy || {}
  const explicitPrivate = privacy.profileVisible === false && (
    privacy.profileVisibilityExplicit === true ||
    privacy.profileVisibleExplicit === true
  )
  const profileVisible = !explicitPrivate
  const nome = u?.nome || profile?.nome || 'Usuário'
  const avatarEmoji = safeStr(u?.avatarEmoji || profile?.avatarEmoji || u?.perfil?.avatarEmoji || '')
  const fotoURL = getFotoPersonalizada(u) || (!avatarEmoji ? getGoogleFoto(u) : '')

  const isCorre = !!(
    u?.isCorre ||
    profile?.isCorre ||
    u?.corre?.ativo ||
    profile?.corre?.ativo ||
    u?.profissional?.isCorre ||
    u?.correTitulo ||
    profile?.correTitulo ||
    (Array.isArray(u?.correCategorias) && u.correCategorias.length > 0) ||
    (Array.isArray(profile?.correCategorias) && profile.correCategorias.length > 0)
  )
  const isProfissional = !!(
    u?.isProfissional ||
    profile?.isProfissional ||
    u?.profissional?.ativo ||
    profile?.profissional?.ativo ||
    u?.profissional?.isProfissional ||
    u?.profResumo ||
    profile?.profResumo ||
    profile?.titulo ||
    profile?.descricao ||
    u?.profPortfolio ||
    profile?.profPortfolio ||
    u?.portfolio ||
    profile?.portfolio ||
    (Array.isArray(u?.profCategorias) && u.profCategorias.length > 0) ||
    (Array.isArray(profile?.profCategorias) && profile.profCategorias.length > 0)
  )

  const profCategorias = Array.isArray(u?.profCategorias)
    ? u.profCategorias
    : Array.isArray(profile?.profCategorias)
      ? profile.profCategorias
    : Array.isArray(u?.profissional?.profCategorias)
      ? u.profissional.profCategorias
      : Array.isArray(profile?.profissional?.profCategorias)
        ? profile.profissional.profCategorias
      : []

  const profResumo = safeStr(u?.profResumo || profile?.profResumo || profile?.descricao || profile?.titulo || u?.profissional?.profResumo || u?.profissional?.descricao || u?.profissional?.titulo || profile?.profissional?.descricao || profile?.profissional?.titulo || '')
  const profCidadeAtende = safeStr(
    u?.profCidadeAtende || profile?.profCidadeAtende || u?.profissional?.profCidadeAtende || profile?.profissional?.regiao || profile?.cidade || ''
  )
  const profPrecoBase = safeStr(u?.profPrecoBase || profile?.profPrecoBase || profile?.preco || u?.profissional?.profPrecoBase || u?.profissional?.preco || profile?.profissional?.preco || '')
  const profWhats = safeStr(u?.profWhats || profile?.profWhats || u?.profissional?.profWhats || u?.profissional?.whatsapp || profile?.profissional?.whatsapp || '')

  const local = u?.local || null
  const lat = Number(local?.lat)
  const lng = Number(local?.lng)
  const okLoc = Number.isFinite(lat) && Number.isFinite(lng)

  const corre = u?.corre || profile?.corre || {}
  const correCategorias = Array.isArray(u?.correCategorias)
    ? u.correCategorias
    : Array.isArray(profile?.correCategorias)
      ? profile.correCategorias
      : Array.isArray(corre?.categorias)
        ? corre.categorias
        : []

  const correTitulo = safeStr(u?.correTitulo || corre?.titulo || 'Corre rápido')
  const correResumo = safeStr(u?.correResumo || profile?.correResumo || corre?.bio || profile?.bio || '')
  const correRegiao = safeStr(u?.correRegiao || profile?.correRegiao || corre?.regiao || profCidadeAtende || profile?.cidade || '')
  const correTransporte = safeStr(u?.correTransporte || corre?.transporte || '')
  const correDisponibilidade = safeStr(u?.correDisponibilidade || corre?.disponibilidade || '')
  const profExperiencia = safeStr(u?.profExperiencia || u?.profissional?.profExperiencia || u?.profissional?.experiencia || '')
  const portfolio = normalizePortfolioEntries(
    u?.portfolio,
    u?.profPortfolio,
    profile?.portfolio,
    profile?.profPortfolio,
    u?.profissional?.portfolio,
    u?.profissional?.profPortfolio,
    profile?.profissional?.portfolio,
    profile?.profissional?.profPortfolio
  ).filter(isActivePortfolioService)

  return {
    uid,
    id: uid,
    nome,
    fotoURL,
    avatarEmoji,
    online: u?.online === true,
    profileVisible,
    isCorre,
    isProfissional,
    profCategorias,
    correCategorias,
    profResumo,
    profCidadeAtende,
    profPrecoBase,
    profWhats,
    profExperiencia,
    correTitulo,
    correResumo,
    correRegiao,
    correTransporte,
    correDisponibilidade,
    portfolio,
    regiao: correRegiao || profCidadeAtende,
    local: okLoc ? { lat, lng } : null,
  }
}

const normalizePortfolioService = (service, provider = {}, index = 0) => {
  if (!isActivePortfolioService(service)) return null

  const providerUid = safeStr(
    service.profissionalId ||
      service.uid ||
      service.ownerId ||
      provider.uid ||
      provider.id
  )
  if (!providerUid) return null

  const categoriaId = safeStr(service.categoriaId || service.categoryId)
  const categoriaMeta = getCategoryById(categoriaId)
  const categoriaNome = safeStr(
    service.categoriaNome ||
      service.categoryName ||
      service.categoria ||
      service.category ||
      categoriaMeta?.label
  )
  const fotos = normalizePortfolioFotos(service)
  const titulo = safeStr(service.nome || service.titulo || service.title || 'Serviço cadastrado')
  const valor = safeStr(service.faixaPreco || service.valor || service.preco || service.priceRange || service.price)
  const providerName = safeStr(
    service.profissionalNome ||
      service.providerName ||
      provider.nome ||
      provider.profile?.nome ||
      'Profissional'
  )
  const providerFoto = safeUrl(service.profissionalFotoURL || service.providerFotoURL || provider.fotoURL || provider.photoURL)
  const updatedAt = Number(service.updatedAt || service.atualizadoEm || service.createdAt || service.criadoEm || 0) || 0

  return {
    id: `${providerUid}_${safeStr(service.id || service.key || index)}`,
    serviceId: safeStr(service.id || service.key || index),
    profissionalId: providerUid,
    titulo,
    descricao: safeStr(service.descricao || service.description),
    valor,
    categoriaId,
    categoriaNome,
    categoria: categoriaNome,
    tempoMedio: safeStr(service.tempoMedio || service.tempo || service.duration),
    regiao: safeStr(service.regiao || service.regiaoAtendimento || service.region || provider.regiao || provider.correRegiao || provider.profCidadeAtende),
    atendeDomicilio: service.atendeDomicilio ?? service.domicilio ?? true,
    urgente: service.urgente === true || service.urgent === true,
    fotos,
    fotoURL: fotos[0] || '',
    providerName,
    providerFoto,
    isCorre: service.isCorre ?? provider.isCorre ?? false,
    isProfissional: service.isProfissional ?? provider.isProfissional ?? true,
    updatedAt,
    provider: {
      ...provider,
      uid: providerUid,
      id: providerUid,
      nome: providerName,
      fotoURL: providerFoto || provider.fotoURL,
      isCorre: service.isCorre ?? provider.isCorre ?? false,
      isProfissional: service.isProfissional ?? provider.isProfissional ?? true,
    },
  }
}

const normalizePublicPortfolioServices = (publicPortfolio = {}) => {
  if (!publicPortfolio || typeof publicPortfolio !== 'object') return []

  return Object.entries(publicPortfolio).flatMap(([uid, services]) =>
    normalizePortfolioEntries(services).map((service, index) =>
      normalizePortfolioService(service, {
        uid,
        id: uid,
        nome: service?.profissionalNome || service?.providerName,
        fotoURL: service?.profissionalFotoURL || service?.providerFotoURL,
        isCorre: service?.isCorre,
        isProfissional: service?.isProfissional,
        regiao: service?.regiao,
      }, index)
    )
  ).filter(Boolean)
}

const PortfolioServiceCard = memo(function PortfolioServiceCard({ service, onAbrirPerfil, onAgendar }) {
  const categoria = getCategoryById(service?.categoriaId)
  const handleAbrir = useCallback(() => onAbrirPerfil?.(service?.provider), [onAbrirPerfil, service])
  const handleAgendar = useCallback(() => onAgendar?.(service?.provider), [onAgendar, service])

  return (
    <article className="w-[210px] shrink-0 overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.12)] md:w-[260px]">
      <button type="button" onClick={handleAbrir} className="block w-full text-left">
        <div
          className="relative h-28 bg-gradient-to-br from-blue-50 via-cyan-50 to-yellow-50 bg-cover bg-center md:h-36"
          style={service?.fotoURL ? { backgroundImage: `url(${JSON.stringify(service.fotoURL)})` } : undefined}
        >
          {!service?.fotoURL ? (
            <div className="grid h-full place-items-center text-4xl">
              {categoria?.emoji || '⚡'}
            </div>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/58 to-transparent" />
          {service?.urgente ? (
            <span className="absolute left-2 top-2 rounded-full bg-[#ffd91a] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-blue-950 shadow-sm">
              Urgente
            </span>
          ) : null}
          <span className="absolute bottom-2 left-2 rounded-full bg-white/92 px-2.5 py-1 text-[10px] font-black text-blue-700 shadow-sm">
            {service?.fotos?.length || 0} foto(s)
          </span>
        </div>

        <div className="p-3.5">
          <div className="line-clamp-2 min-h-[38px] text-[15px] font-black leading-tight text-slate-950 md:text-base">
            {service?.titulo || 'Serviço cadastrado'}
          </div>
          {service?.descricao ? (
            <p className="mt-1 line-clamp-2 min-h-[32px] text-xs font-semibold leading-snug text-slate-500">
              {service.descricao}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">
              {categoria?.emoji ? `${categoria.emoji} ` : ''}{service?.categoriaNome || categoria?.label || 'Serviço'}
            </span>
            {service?.valor ? (
              <span className="rounded-full bg-[#ffd91a] px-2.5 py-1 text-[10px] font-black text-blue-950">
                {service.valor}
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <div
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-950 bg-cover bg-center text-[10px] font-black text-white"
              style={service?.providerFoto ? { backgroundImage: `url(${JSON.stringify(service.providerFoto)})` } : undefined}
            >
              {service?.providerFoto ? <span className="sr-only">{service.providerName}</span> : service?.providerName?.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-black text-slate-800">{service?.providerName}</div>
              <div className="truncate text-[11px] font-semibold text-slate-500">{service?.regiao || 'Perto de você'}</div>
            </div>
          </div>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-1 border-t border-slate-100 p-2">
        <button type="button" onClick={handleAbrir} className="h-9 rounded-xl bg-slate-950 text-[11px] font-black text-white">
          Ver serviço
        </button>
        <button type="button" onClick={handleAgendar} className="h-9 rounded-xl bg-[#ffd91a] text-[11px] font-black text-slate-950">
          Agendar
        </button>
      </div>
    </article>
  )
})

const ProviderMiniCard = memo(function ProviderMiniCard({ item, modo, onAbrirPerfil, onAgendar }) {
  const nome = safeStr(item?.nome) || 'Profissional'
  const isOnline = item?.online === true
  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('') || 'CA'
  const categoriaId = modo === 'corre'
    ? item?.correCategorias?.[0] || item?.profCategorias?.[0] || 'servicos_gerais'
    : item?.profCategorias?.[0] || 'servicos_gerais'
  const categoria = getCategoryById(categoriaId)
  const titulo = modo === 'corre'
    ? safeStr(item?.correTitulo) || 'Corre rápido'
    : safeStr(item?.profResumo) || 'Serviço profissional'
  const regiao = safeStr(item?.correRegiao || item?.profCidadeAtende || item?.regiao) || 'Perto de você'
  const preco = safeStr(item?.profPrecoBase || item?.correPreco || item?.precoBase) || 'A combinar'
  const avatarStyle = useMemo(
    () => (item?.fotoURL ? { backgroundImage: `url("${item.fotoURL}")` } : undefined),
    [item]
  )
  const temPortfolio = useMemo(() => providerHasPortfolio(item), [item])
  const handleAbrir = useCallback(() => onAbrirPerfil?.(item), [item, onAbrirPerfil])
  const handleAgendar = useCallback(() => onAgendar?.(item), [item, onAgendar])

  return (
    <article className="w-[154px] shrink-0 overflow-hidden rounded-[22px] border border-slate-100 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.11)] md:w-[190px] md:rounded-[26px]">
      <button
        type="button"
        onClick={handleAbrir}
        className="block w-full text-left"
      >
        <div className="relative grid h-28 place-items-center bg-gradient-to-br from-amber-50 via-cyan-50 to-emerald-50 md:h-36">
          {item?.fotoURL ? (
            <div
              aria-label={nome}
              className="h-16 w-16 rounded-[24px] bg-cover bg-center ring-4 ring-white shadow-[0_10px_24px_rgba(15,23,42,0.16)] md:h-20 md:w-20 md:rounded-[28px]"
              style={avatarStyle}
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-[24px] bg-slate-950 text-lg font-black text-white ring-4 ring-white shadow-[0_10px_24px_rgba(15,23,42,0.16)] md:h-20 md:w-20 md:rounded-[28px] md:text-xl">
              {item?.avatarEmoji || iniciais}
            </div>
          )}
          <span className={[
            'absolute left-2 top-2 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white',
            isOnline ? 'bg-emerald-500' : 'bg-slate-500',
          ].join(' ')}>
            {isOnline ? 'online' : 'perfil'}
          </span>
          {temPortfolio ? (
            <span className="absolute right-2 top-2 rounded-full bg-[#ffd91a] px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-blue-950 shadow-sm">
              Portfolio
            </span>
          ) : null}
        </div>

        <div className="p-3 md:p-4">
          <div className="line-clamp-1 text-[15px] font-black leading-tight text-slate-950 md:text-lg">
            {nome}
          </div>
          <div className="mt-1 line-clamp-2 min-h-[32px] text-[12px] font-bold leading-tight text-slate-600">
            {titulo}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] font-black text-emerald-700">
            <span>⚡</span>
            <span>{preco}</span>
          </div>
          <div className="mt-1 line-clamp-1 text-[11px] font-semibold text-slate-500">
            {categoria?.emoji || '🧰'} {categoria?.label || 'Serviços'} · {regiao}
          </div>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-1 border-t border-slate-100 p-2">
        <button
          type="button"
          onClick={handleAbrir}
          className="h-8 rounded-xl bg-slate-950 text-[11px] font-black text-white"
        >
          {temPortfolio ? 'Serviços' : 'Ver'}
        </button>
        <button
          type="button"
          onClick={handleAgendar}
          className="h-8 rounded-xl bg-[#ffd91a] text-[11px] font-black text-slate-950"
        >
          Agendar
        </button>
      </div>
    </article>
  )
})

export default function ClienteHome({
  meuNome = 'Anônimo',
  onCriarPedido,
  onIrAoVivo,
  onAbrirNotificacoes,
  onlineUsers = [],
  registeredUsers = [],
  publicPortfolio = {},
  onAbrirPerfil,
  onAgendar,
  onBackToMode,
}) {
  const [modo, setModo] = useState('corre') // corre | profissional
  const [catId, setCatId] = useState('')
  const [busca, setBusca] = useState('')
  const [mostrarBuscaFlutuante, setMostrarBuscaFlutuante] = useState(false)
  const buscaTopoRef = useRef(null)

  // ✅ NOVO: a tela do cliente agora usa uma lista limpa.
  // Os botões Corre/Profissionais ficam no card principal e a ficha entra direto abaixo,
  // sem repetir busca, categoria e filtros no meio da tela.
  const nomeExibicao = safeStr(meuNome) || 'Anônimo'
  const iniciais = nomeExibicao
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('') || 'CA'
  const categoriasRapidas = useMemo(() => [{ id: '', label: 'Todos', emoji: '✨', accent: '#0f172a', soft: '#eef5ff' }, ...(CATEGORIES || [])], [])

  const onlineProviders = useMemo(() => {
    const list = Array.isArray(onlineUsers) ? onlineUsers : []
    return list.map((item) => normalizeProvider({ ...item, online: true })).filter(Boolean)
  }, [onlineUsers])

  const registeredProviders = useMemo(() => {
    const list = Array.isArray(registeredUsers) ? registeredUsers : []
    return list
      .map((item) => normalizeProvider({ ...item, online: false }))
      .filter((provider) => provider && provider.profileVisible !== false && (provider.isCorre || provider.isProfissional))
  }, [registeredUsers])

  const portfolioProviders = useMemo(() => {
    const byUid = new Map()
    normalizePublicPortfolioServices(publicPortfolio).forEach((service) => {
      const uid = service.profissionalId
      if (!uid) return
      const current = byUid.get(uid) || {
        uid,
        id: uid,
        nome: service.providerName || 'Profissional',
        fotoURL: service.providerFoto || '',
        isCorre: service.isCorre === true,
        isProfissional: true,
        profCategorias: [],
        correCategorias: [],
        profResumo: service.descricao || service.titulo || '',
        profCidadeAtende: service.regiao || '',
        profPrecoBase: service.valor || '',
        portfolio: [],
        online: false,
        profileVisible: true,
      }
      const categorias = new Set([...(current.profCategorias || [])])
      if (service.categoriaId) categorias.add(service.categoriaId)
      byUid.set(uid, {
        ...current,
        nome: current.nome || service.providerName || 'Profissional',
        fotoURL: current.fotoURL || service.providerFoto || '',
        profCidadeAtende: current.profCidadeAtende || service.regiao || '',
        profPrecoBase: current.profPrecoBase || service.valor || '',
        profCategorias: Array.from(categorias),
        portfolio: [...(current.portfolio || []), service],
      })
    })
    return Array.from(byUid.values()).map(normalizeProvider).filter(Boolean)
  }, [publicPortfolio])

  const providers = useMemo(() => {
    const byUid = new Map()
    portfolioProviders.forEach((provider) => {
      byUid.set(provider.uid, provider)
    })
    registeredProviders.forEach((provider) => {
      const current = byUid.get(provider.uid) || {}
      byUid.set(provider.uid, {
        ...current,
        ...provider,
        portfolio: provider.portfolio?.length ? provider.portfolio : current.portfolio || [],
      })
    })
    onlineProviders.forEach((provider) => {
      const current = byUid.get(provider.uid) || {}
      byUid.set(provider.uid, {
        ...current,
        ...provider,
        portfolio: provider.portfolio?.length ? provider.portfolio : current.portfolio || [],
        profileVisible: current.profileVisible === false || provider.profileVisible === false ? false : true,
        online: true,
      })
    })

    return Array.from(byUid.values()).filter((provider) => (
      provider.profileVisible !== false && (provider.isCorre || provider.isProfissional)
    ))
  }, [onlineProviders, registeredProviders, portfolioProviders])

  const allFilteredProviders = useMemo(() => {
    const t = busca.trim().toLowerCase()

    const byCat = catId
      ? providers.filter((p) => {
          const correCats = Array.isArray(p.correCategorias) ? p.correCategorias : []
          const profCats = Array.isArray(p.profCategorias) ? p.profCategorias : []
          if (p.isCorre && correCats.length === 0 && catId === 'servicos_gerais') return true
          return [...correCats, ...profCats].some((cat) => categoryMatches(cat, catId))
        })
      : providers

    const bySearch = !t
      ? byCat
      : byCat.filter((p) => {
          const nome = safeStr(p.nome).toLowerCase()
          const cidade = safeStr(p.profCidadeAtende || p.correRegiao || p.regiao).toLowerCase()
          const resumo = safeStr(p.profResumo || p.correResumo).toLowerCase()
          const titulo = safeStr(p.correTitulo).toLowerCase()
          return nome.includes(t) || cidade.includes(t) || resumo.includes(t) || titulo.includes(t)
        })

    return bySearch.slice(0, 60)
  }, [providers, busca, catId])

  const list = useMemo(() => {
    return allFilteredProviders.filter((p) =>
      modo === 'corre' ? p.isCorre : p.isProfissional
    )
  }, [allFilteredProviders, modo])

  const onlineList = useMemo(() => allFilteredProviders.filter((provider) => provider.online === true), [allFilteredProviders])
  const offlineList = useMemo(() => allFilteredProviders.filter((provider) => provider.online !== true), [allFilteredProviders])

  const providerCounts = useMemo(() => {
    return providers.reduce(
      (acc, provider) => {
        if (provider.isCorre) acc.corre += 1
        if (provider.isProfissional) acc.profissional += 1
        if (provider.online && provider.isCorre) acc.correOnline += 1
        if (provider.online && provider.isProfissional) acc.profissionalOnline += 1
        return acc
      },
      { corre: 0, profissional: 0, correOnline: 0, profissionalOnline: 0 }
    )
  }, [providers])

  const portfolioServices = useMemo(() => {
    const publicServices = normalizePublicPortfolioServices(publicPortfolio)
    const onlineServices = providers.flatMap((provider) =>
      normalizePortfolioEntries(provider.portfolio).map((service, index) =>
        normalizePortfolioService(service, provider, index)
      )
    ).filter(Boolean)

    const dedup = new Map()
    ;[...publicServices, ...onlineServices].forEach((service) => {
      const key = `${service.profissionalId}_${service.serviceId}`
      if (!dedup.has(key)) {
        dedup.set(key, service)
        return
      }

      const current = dedup.get(key)
      if ((service.updatedAt || 0) >= (current.updatedAt || 0)) {
        dedup.set(key, { ...current, ...service, provider: { ...current.provider, ...service.provider } })
      }
    })

    return Array.from(dedup.values())
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 12)
  }, [providers, publicPortfolio])

  const destaqueProviders = useMemo(
    () => onlineList.slice(0, 8),
    [onlineList]
  )

  const offlineProviders = useMemo(
    () => offlineList.slice(0, 12),
    [offlineList]
  )

  const renderLegacyHidden = false

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let ticking = false
    const updateFloatingSearch = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0
      const isMobile = window.innerWidth < 768
      const rect = buscaTopoRef.current?.getBoundingClientRect()
      const buscaTopoVisivel = !!rect && rect.bottom > 16 && rect.top < 120

      setMostrarBuscaFlutuante(isMobile && y > 80 && !buscaTopoVisivel)
    }

    updateFloatingSearch()

    const onScrollOrResize = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        updateFloatingSearch()
        ticking = false
      })
    }

    window.addEventListener('scroll', onScrollOrResize, { passive: true })
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [])

  return (
    <>
    {mostrarBuscaFlutuante ? (
      <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.55rem)] z-[99960] px-3 md:hidden">
        <label className="mx-auto flex h-11 max-w-[430px] items-center gap-2 rounded-[18px] border border-blue-100 bg-white/96 px-3 text-sm font-black text-slate-700 shadow-[0_14px_38px_rgba(15,23,42,0.18)] backdrop-blur-xl">
          <SearchIcon className="h-5 w-5 shrink-0 text-blue-600" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={modo === 'corre' ? 'buscar corre perto' : 'buscar profissional'}
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

    <div className="-mx-2.5 -mt-2 min-h-[calc(100dvh-4rem)] overflow-hidden bg-white pb-24 text-slate-950 md:mx-auto md:mt-0 md:min-h-0 md:w-full md:max-w-[1024px] md:rounded-[40px] md:pb-8 md:shadow-[0_24px_90px_rgba(0,0,0,0.18)]">
      <div className="relative min-h-[405px] overflow-hidden bg-[#f8fbff] px-7 pb-6 pt-5 md:min-h-[820px] md:px-[52px] md:pb-0 md:pt-8">
        <ClienteMapBackdrop />

        <div className="relative mt-3 flex items-center justify-between gap-2 md:mt-14 md:gap-5">
          {typeof onBackToMode === 'function' ? (
            <button
              type="button"
              onClick={onBackToMode}
              className="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-[16px] border border-yellow-200/80 bg-[#ffd91a] text-blue-950 shadow-[0_12px_22px_rgba(245,158,11,0.18),inset_0_1px_0_rgba(255,255,255,0.72)] transition hover:-translate-y-0.5 active:scale-[0.96] min-[390px]:h-[52px] min-[390px]:w-[52px] md:h-24 md:w-24 md:rounded-[30px]"
              title="Voltar para escolher Cliente ou Corre"
              aria-label="Trocar modo"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px] md:h-9 md:w-9"
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

          <button
            type="button"
            onClick={() => onAbrirPerfil?.()}
            className="relative grid h-[62px] w-[62px] shrink-0 place-items-center rounded-full bg-white text-xl font-black text-blue-600 shadow-[0_14px_28px_rgba(37,99,235,0.13)] min-[390px]:h-[66px] min-[390px]:w-[66px] md:h-[136px] md:w-[136px] md:text-[48px]"
            title="Abrir perfil"
          >
            <span className="absolute right-1 top-0 h-3.5 w-3.5 rounded-full bg-[#ffd91a] ring-[3px] ring-white md:right-4 md:top-0 md:h-6 md:w-6 md:ring-[5px]" />
            {iniciais}
          </button>

          <button
            type="button"
            onClick={() => onAbrirPerfil?.()}
            className="min-w-0 flex-1 text-left"
          >
            <div className="truncate whitespace-nowrap text-[8px] font-black uppercase tracking-[0.1em] text-blue-600 min-[390px]:text-[9px] md:text-[20px] md:tracking-[0.18em]">
              Perto de você
            </div>
            <div className="mt-0.5 flex items-center gap-1 truncate whitespace-nowrap text-[14px] font-black text-blue-950 min-[390px]:text-[16px] md:mt-2 md:text-[32px]">
              <span className="truncate">{nomeExibicao}</span>
              <span className="text-blue-700">›</span>
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-2 md:gap-6">
            <button
              type="button"
              onClick={() => onIrAoVivo?.()}
              className="grid h-[46px] w-[46px] place-items-center rounded-[17px] bg-white text-blue-700 shadow-[0_12px_24px_rgba(37,99,235,0.11)] min-[390px]:h-[52px] min-[390px]:w-[52px] md:h-24 md:w-24 md:rounded-[28px]"
              title="Mapa"
            >
              <MapMiniIcon className="h-[22px] w-[22px] min-[390px]:h-6 min-[390px]:w-6 md:h-10 md:w-10" />
            </button>
            <button
              type="button"
              onClick={() => onAbrirNotificacoes?.()}
              className="relative grid h-[46px] w-[46px] place-items-center rounded-[17px] bg-white text-blue-700 shadow-[0_12px_24px_rgba(37,99,235,0.11)] min-[390px]:h-[52px] min-[390px]:w-[52px] md:h-24 md:w-24 md:rounded-[28px]"
              title="Notificações"
            >
              <BellMiniIcon className="h-[22px] w-[22px] min-[390px]:h-6 min-[390px]:w-6 md:h-10 md:w-10" />
            </button>
          </div>
        </div>

        <label ref={buscaTopoRef} className="relative z-30 mt-8 flex h-[46px] w-full max-w-[720px] items-center gap-3 rounded-[18px] border border-white/90 bg-white/96 px-4 text-left text-sm font-black text-slate-500 shadow-[0_12px_26px_rgba(37,99,235,0.09)] backdrop-blur md:mt-10 md:h-[94px] md:max-w-none md:gap-8 md:rounded-[28px] md:px-9 md:text-[32px]">
          <SearchIcon className="h-6 w-6 shrink-0 text-blue-600 md:h-11 md:w-11" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busca.trim()) onCriarPedido?.()
            }}
            placeholder="buscar ajuda rápida"
            className="min-w-0 flex-1 bg-transparent font-black text-slate-700 outline-none placeholder:text-slate-500"
          />
        </label>

        <section className="relative z-20 mt-11 min-h-[150px] text-left md:mt-[92px] md:min-h-[330px]">
          <div className="relative max-w-[520px]">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 md:text-[24px] md:tracking-[0.14em]">
              Corre Aqui
            </div>
            <div className="mt-2 max-w-[265px] text-[25px] font-black leading-[0.98] text-blue-950 min-[390px]:max-w-[300px] min-[390px]:text-[30px] md:mt-5 md:max-w-[460px] md:text-[52px] md:leading-[0.98]">
              Encontre ajuda perto de você.
            </div>
            <p className="mt-3 max-w-[230px] text-[12.5px] font-bold leading-[1.36] text-slate-600 min-[390px]:max-w-[250px] min-[390px]:text-[13px] md:mt-6 md:max-w-[420px] md:text-[24px] md:leading-[1.35]">
              Crie um pedido pelo botão principal e acompanhe tudo pelo chat.
            </p>
          </div>
        </section>
        <div className="absolute left-[66%] top-[58%] z-10 -translate-x-1/2 -translate-y-1/2 min-[390px]:left-[68%] min-[390px]:top-[57%] md:left-[70%] md:top-[64%]">
          <ClienteHeroMapIcon />
        </div>
      </div>

      <div className="-mt-1 rounded-t-[30px] bg-white px-5 pt-5 md:mt-0 md:rounded-t-none md:px-[52px] md:pt-9">
        <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] md:gap-[34px] [&::-webkit-scrollbar]:hidden">
          {categoriasRapidas.map((cat) => {
            const ativo = catId === cat.id
            const tileColor = getClientCategoryColor(cat.id, cat.accent)
            return (
              <button
                key={cat.id || 'todos-mobile'}
                type="button"
                onClick={() => setCatId(cat.id)}
                className={[
                  'flex h-[100px] w-[80px] shrink-0 flex-col items-center justify-center rounded-[20px] border bg-white text-center shadow-[0_16px_34px_rgba(37,99,235,0.08)] transition active:scale-[0.97] min-[390px]:h-[112px] min-[390px]:w-[92px] md:h-[202px] md:w-[199px] md:rounded-[30px]',
                  ativo ? 'border-blue-200 ring-2 ring-blue-500/20' : 'border-slate-100',
                ].join(' ')}
                style={{ color: tileColor }}
              >
                <span className="grid h-12 place-items-center md:h-20">
                  <CategoryTileIcon id={cat.id} />
                </span>
                <span className="mt-2 block max-w-[72px] text-[11px] font-black leading-[1.08] text-slate-800 md:mt-4 md:max-w-[150px] md:text-[24px]">
                  {cat.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:mt-10 md:gap-8">
          <button
            type="button"
            onClick={() => setModo('corre')}
            className={[
              'relative min-h-[112px] overflow-hidden rounded-[22px] border p-4 text-left shadow-[0_14px_30px_rgba(245,158,11,0.12)] transition active:scale-[0.98] md:min-h-[238px] md:rounded-[30px] md:p-10',
              modo === 'corre' ? 'border-yellow-200 bg-[#fff1b8]' : 'border-yellow-100 bg-[#fff7d6]',
            ].join(' ')}
          >
            <StatCardArt type="corre" />
            <div className="relative text-[11px] font-black uppercase tracking-[0.12em] text-amber-600 md:text-[24px]">Corres</div>
            <div className="relative mt-3 text-3xl font-black leading-none text-blue-950 md:mt-7 md:text-[64px]">{providerCounts.corre}</div>
            <div className="relative mt-1 text-sm font-bold text-blue-950 md:text-[24px]">cadastrados</div>
          </button>
          <button
            type="button"
            onClick={() => setModo('profissional')}
            className={[
              'relative min-h-[112px] overflow-hidden rounded-[22px] border p-4 text-left shadow-[0_14px_30px_rgba(37,99,235,0.12)] transition active:scale-[0.98] md:min-h-[238px] md:rounded-[30px] md:p-10',
              modo === 'profissional' ? 'border-blue-200 bg-[#e7f2ff]' : 'border-blue-100 bg-[#edf7ff]',
            ].join(' ')}
          >
            <StatCardArt type="profissional" />
            <div className="relative text-[11px] font-black uppercase tracking-[0.12em] text-blue-600 md:text-[24px]">Profissionais</div>
            <div className="relative mt-3 text-3xl font-black leading-none text-blue-950 md:mt-7 md:text-[64px]">{providerCounts.profissional}</div>
            <div className="relative mt-1 text-sm font-bold text-blue-950 md:text-[24px]">com ficha</div>
          </button>
        </div>

        {portfolioServices.length ? (
          <section className="mt-7 md:mt-10">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black leading-none text-slate-950 md:text-4xl">Serviços do portfólio</h2>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  Trabalhos com fotos, preço e descrição cadastrados pelos perfis.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-[#ffd91a] px-3 py-1.5 text-[11px] font-black text-blue-950">
                {portfolioServices.length}
              </span>
            </div>

            <div className="mt-4 flex gap-3 overflow-x-auto pb-2 pl-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:gap-4 [&::-webkit-scrollbar]:hidden">
              {portfolioServices.map((service) => (
                <PortfolioServiceCard
                  key={service.id}
                  service={service}
                  onAbrirPerfil={onAbrirPerfil}
                  onAgendar={onAgendar}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6 md:mt-10">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black leading-none text-slate-950 md:text-4xl">Online agora</h2>
              <p className="mt-1 text-sm font-semibold text-slate-400">{onlineList.length} perfil(is) online agora</p>
            </div>
            <button
              type="button"
              onClick={() => onIrAoVivo?.()}
              className="shrink-0 text-sm font-black text-slate-950"
            >
              Ver mapa ›
            </button>
          </div>

          <div className="mt-4 flex gap-3 overflow-x-auto pb-2 pl-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:gap-4 [&::-webkit-scrollbar]:hidden">
            {destaqueProviders.map((item) => (
              <ProviderMiniCard
                key={item.uid}
                item={item}
                modo={item.isCorre && (!item.isProfissional || modo === 'corre') ? 'corre' : 'profissional'}
                onAbrirPerfil={onAbrirPerfil}
                onAgendar={onAgendar}
              />
            ))}
            {!onlineList.length ? (
              <div className="w-full rounded-[22px] bg-slate-50 p-4 text-sm font-bold text-slate-500">
                Ninguém online nesta categoria agora. Veja os perfis cadastrados abaixo.
              </div>
            ) : null}
          </div>
        </section>

        {offlineProviders.length ? (
          <section className="mt-6 md:mt-10">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black leading-none text-slate-950 md:text-4xl">Perfis cadastrados</h2>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  Aparecem mesmo offline para o cliente conhecer e chamar depois.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-black text-blue-700">
                {offlineList.length}
              </span>
            </div>

            <div className="mt-4 flex gap-3 overflow-x-auto pb-2 pl-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:gap-4 [&::-webkit-scrollbar]:hidden">
              {offlineProviders.map((item) => (
                <ProviderMiniCard
                  key={item.uid}
                  item={item}
                  modo={item.isCorre && (!item.isProfissional || modo === 'corre') ? 'corre' : 'profissional'}
                  onAbrirPerfil={onAbrirPerfil}
                  onAgendar={onAgendar}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6 md:mt-10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black leading-none text-slate-950 md:text-4xl">Todos os perfis</h2>
              <p className="mt-1 text-sm font-semibold text-slate-400">{list.length} encontrado(s)</p>
            </div>
            <div className="grid grid-cols-2 rounded-full bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setModo('corre')}
                className={[
                  'rounded-full px-3 py-1.5 text-xs font-black',
                  modo === 'corre' ? 'bg-slate-950 text-white' : 'text-slate-500',
                ].join(' ')}
              >
                Corre
              </button>
              <button
                type="button"
                onClick={() => setModo('profissional')}
                className={[
                  'rounded-full px-3 py-1.5 text-xs font-black',
                  modo === 'profissional' ? 'bg-slate-950 text-white' : 'text-slate-500',
                ].join(' ')}
              >
                Pro
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[24px] bg-slate-950 p-1.5 md:rounded-[30px] md:p-2">
            <ListaProfissionais
              mode={modo}
              categoriaId={catId}
              search={busca}
              limit={200}
              itemsSource={providers}
              onAbrirPerfil={onAbrirPerfil}
              onAgendar={onAgendar}
              showHeader={false}
              compact
            />
          </div>
        </section>
      </div>
    </div>

    {renderLegacyHidden ? (
    <div className="hidden">
      <div className={`rounded-[20px] p-2.5 md:rounded-[28px] md:p-5 ${glass}`}>
        <div className="flex items-center justify-between gap-2.5 md:gap-4">
          <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
            <button
              type="button"
              onClick={() => onAbrirPerfil?.()}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.08] text-sm font-black text-white shadow-[0_10px_28px_rgba(0,0,0,0.2)] md:h-12 md:w-12 md:text-base"
              title="Abrir perfil"
            >
              {iniciais}
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-white md:text-lg">
                Olá, {nomeExibicao}
              </div>
              <div className="mt-0.5 truncate text-[11px] leading-snug text-slate-300 md:mt-1 md:text-sm">
                Encontre ajuda perto de você.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onAbrirPerfil?.()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.08] text-base font-black text-white transition hover:bg-white/[0.12] active:scale-[0.98] md:h-11 md:w-11"
            title="Notificações e perfil"
          >
            🔔
          </button>
        </div>

        <button
          type="button"
          onClick={() => onCriarPedido?.()}
          className="mt-2.5 flex h-11 w-full items-center gap-2 rounded-2xl border border-white/10 bg-white px-3 text-left text-sm font-black text-slate-950 shadow-[0_14px_34px_rgba(0,0,0,0.18)] transition hover:bg-slate-100 active:scale-[0.99] md:mt-4 md:h-12 md:px-4 md:text-base"
        >
          <span className="text-base md:text-lg">🔍</span>
          <span className="min-w-0 flex-1 truncate">O que você precisa agora?</span>
          <span className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white md:text-[11px]">
            pedir
          </span>
        </button>

        <div className="mt-2.5 grid grid-cols-2 gap-1.5 md:mt-4 md:flex md:justify-end md:gap-2">
          <button
            type="button"
            onClick={() => onCriarPedido?.()}
            className="h-9 rounded-xl bg-blue-600 px-3 text-[11px] font-black text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-500 active:scale-[0.98] md:h-11 md:rounded-2xl md:px-4 md:text-sm"
          >
            Criar pedido
          </button>
          <button
            type="button"
            onClick={() => onIrAoVivo?.()}
            className="h-9 rounded-xl border border-white/12 bg-white/10 px-3 text-[11px] font-black text-white transition hover:bg-white/14 active:scale-[0.98] md:h-11 md:rounded-2xl md:px-4 md:text-sm"
          >
            Mapa
          </button>
        </div>

        {/* ✅ CONTROLE ÚNICO: Corre / Profissionais */}
        <div className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-[16px] bg-black/20 p-1 border border-white/10 md:mt-4 md:gap-2 md:rounded-[22px] md:p-1.5">
          <button
            type="button"
            onClick={() => setModo('corre')}
            className={[
              'flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border text-xs font-black transition-all duration-200 active:scale-[0.98] md:h-11 md:gap-2 md:rounded-2xl md:text-sm',
              modo === 'corre'
                ? 'bg-white text-slate-950 border-white shadow-[0_12px_28px_rgba(255,255,255,0.12)]'
                : 'bg-transparent text-slate-300 border-transparent hover:bg-white/8 hover:text-white',
            ].join(' ')}
          >
            <span>⚡</span>
            <span>Corres</span>
          </button>

          <button
            type="button"
            onClick={() => setModo('profissional')}
            className={[
              'flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border text-xs font-black transition-all duration-200 active:scale-[0.98] md:h-11 md:gap-2 md:rounded-2xl md:text-sm',
              modo === 'profissional'
                ? 'bg-white text-slate-950 border-white shadow-[0_12px_28px_rgba(255,255,255,0.12)]'
                : 'bg-transparent text-slate-300 border-transparent hover:bg-white/8 hover:text-white',
            ].join(' ')}
          >
            <span>👷</span>
            <span>Profissionais</span>
          </button>
        </div>

        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] md:mt-4 md:gap-2 [&::-webkit-scrollbar]:hidden">
          {categoriasRapidas.map((cat) => {
            const ativo = catId === cat.id
            return (
              <button
                key={cat.id || 'todos'}
                type="button"
                onClick={() => setCatId(cat.id)}
                className={[
                  'shrink-0 rounded-full border px-2.5 py-1.5 text-[11px] font-black transition active:scale-[0.97] md:px-3.5 md:py-2 md:text-xs',
                  ativo
                    ? 'border-white text-white shadow-lg shadow-black/15'
                    : 'border-white/12 bg-white/8 text-slate-200 hover:bg-white/12',
                ].join(' ')}
                style={ativo ? { backgroundColor: cat.accent || '#ffffff' } : undefined}
              >
                <span className="mr-1">{cat.emoji}</span>
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ✅ LISTA LIMPA: sem busca duplicada, sem filtros duplicados, sem botão flutuante */}
      <div className="space-y-3 md:space-y-4">
        <div className={`rounded-[20px] px-3 py-3 md:rounded-[26px] md:px-4 md:py-4 sm:px-5 ${floatingSection}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                Lista da região
              </div>
              <div className="mt-1 truncate text-sm font-black text-white sm:text-lg">
                {modo === 'corre' ? '⚡ Corres disponíveis' : '👷 Profissionais disponíveis'}
              </div>
            </div>

            <span className={[
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black border',
              modo === 'corre'
                ? 'bg-amber-300/15 text-amber-100 border-amber-200/25'
                : 'bg-blue-400/15 text-blue-100 border-blue-200/25',
            ].join(' ')}>
              {list.length} ativo(s)
            </span>
          </div>
        </div>

        <div className="p-0 bg-transparent">
          <ListaProfissionais
            mode={modo}
            categoriaId={catId}
            search={busca}
            limit={200}
            itemsSource={providers}
            onAbrirPerfil={onAbrirPerfil}
            onAgendar={onAgendar}
            showHeader={false}
            compact
          />
        </div>
      </div>
    </div>
    ) : null}
    </>
  )

}
