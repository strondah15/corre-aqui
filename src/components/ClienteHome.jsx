'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, categoryMatches, getCategoryById } from '@/constants/categories'
import ListaProfissionais from './ListaProfissionais'

const glass =
  'bg-white/[0.08] border border-white/10 shadow-[0_22px_80px_rgba(0,0,0,0.24)] text-white backdrop-blur-xl select-none'

const floatingSection =
  'bg-white/[0.08] border border-white/10 shadow-[0_22px_80px_rgba(0,0,0,0.22)] text-white backdrop-blur-xl select-none'

const safeStr = (v) => String(v || '').trim()


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

function ClienteHeroMapIcon() {
  return (
    <div className="relative h-16 w-16 min-[390px]:h-20 min-[390px]:w-20 md:h-32 md:w-32" aria-hidden="true">
      <div className="absolute -bottom-2 -right-2 h-full w-full rounded-[26px] bg-[#ffd91a] opacity-95 shadow-[0_18px_30px_rgba(245,158,11,0.22)] md:rounded-[38px]" />
      <div className="relative h-full w-full overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#0969ff_0%,#08b9c8_52%,#ffe35c_115%)] shadow-[0_18px_36px_rgba(15,23,42,0.22)] md:rounded-[34px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(255,255,255,0.22),transparent_24%),radial-gradient(circle_at_82%_86%,rgba(255,217,26,0.34),transparent_36%)]" />
        <div
          className="absolute -bottom-5 left-0 h-20 w-[130%] -rotate-[10deg] opacity-45 md:-bottom-7 md:h-28"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.28) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        />
        <div className="absolute left-[18%] top-[35%] grid gap-1.5 md:gap-2">
          <span className="block h-2 w-10 rounded-full bg-white shadow-[0_2px_8px_rgba(255,255,255,0.35)] md:h-3 md:w-14" />
          <span className="block h-2 w-7 rounded-full bg-white shadow-[0_2px_8px_rgba(255,255,255,0.35)] md:h-3 md:w-10" />
          <span className="block h-2 w-10 rounded-full bg-white shadow-[0_2px_8px_rgba(255,255,255,0.35)] md:h-3 md:w-14" />
        </div>
        <svg
          viewBox="0 0 120 120"
          className="absolute right-[11%] top-[18%] h-[64%] w-[52%] drop-shadow-[0_10px_14px_rgba(15,23,42,0.22)]"
          role="img"
          aria-label="Localizacao rapida"
        >
          <path
            d="M60 6C38.5 6 21 23.4 21 44.8c0 28.4 33.1 64.4 37.1 68.6a2.6 2.6 0 0 0 3.8 0C65.9 109.2 99 73.2 99 44.8 99 23.4 81.5 6 60 6Zm0 54.6c-9.5 0-17.2-7.6-17.2-17.1S50.5 26.4 60 26.4s17.2 7.6 17.2 17.1S69.5 60.6 60 60.6Z"
            fill="white"
          />
        </svg>
      </div>
    </div>
  )
}

const normalizeProvider = (u) => {
  const uid = u?.uid || u?.id || null
  if (!uid) return null

  const nome = u?.nome || u?.profile?.nome || 'Usuário'
  const avatarEmoji = safeStr(u?.avatarEmoji || u?.profile?.avatarEmoji || u?.perfil?.avatarEmoji || '')
  const fotoURL = getFotoPersonalizada(u) || (!avatarEmoji ? getGoogleFoto(u) : '')

  const isCorre = !!(u?.isCorre || u?.profissional?.isCorre)
  const isProfissional = !!(u?.isProfissional || u?.profissional?.isProfissional)

  const profCategorias = Array.isArray(u?.profCategorias)
    ? u.profCategorias
    : Array.isArray(u?.profissional?.profCategorias)
      ? u.profissional.profCategorias
      : []

  const profResumo = safeStr(u?.profResumo || u?.profissional?.profResumo || '')
  const profCidadeAtende = safeStr(
    u?.profCidadeAtende || u?.profissional?.profCidadeAtende || u?.profile?.cidade || ''
  )
  const profPrecoBase = safeStr(u?.profPrecoBase || u?.profissional?.profPrecoBase || '')
  const profWhats = safeStr(u?.profWhats || u?.profissional?.profWhats || '')

  const local = u?.local || null
  const lat = Number(local?.lat)
  const lng = Number(local?.lng)
  const okLoc = Number.isFinite(lat) && Number.isFinite(lng)

  const corre = u?.corre || u?.profile?.corre || {}
  const correCategorias = Array.isArray(u?.correCategorias)
    ? u.correCategorias
    : Array.isArray(u?.profile?.correCategorias)
      ? u.profile.correCategorias
      : Array.isArray(corre?.categorias)
        ? corre.categorias
        : []

  const correTitulo = safeStr(u?.correTitulo || corre?.titulo || 'Corre rápido')
  const correResumo = safeStr(u?.correResumo || corre?.bio || u?.profile?.bio || '')
  const correRegiao = safeStr(u?.correRegiao || corre?.regiao || profCidadeAtende || u?.profile?.cidade || '')
  const correTransporte = safeStr(u?.correTransporte || corre?.transporte || '')
  const correDisponibilidade = safeStr(u?.correDisponibilidade || corre?.disponibilidade || '')
  const profExperiencia = safeStr(u?.profExperiencia || u?.profissional?.profExperiencia || u?.profissional?.experiencia || '')

  return {
    uid,
    nome,
    fotoURL,
    avatarEmoji,
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
    regiao: correRegiao || profCidadeAtende,
    local: okLoc ? { lat, lng } : null,
  }
}

const ProviderMiniCard = memo(function ProviderMiniCard({ item, modo, onAbrirPerfil, onAgendar }) {
  const nome = safeStr(item?.nome) || 'Profissional'
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
          <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
            online
          </span>
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
          Ver
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
  onAbrirPedidos,
  onAbrirNotificacoes,
  onlineUsers = [],
  onAbrirPerfil,
  onAgendar,
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

  const providers = useMemo(() => {
    const list = Array.isArray(onlineUsers) ? onlineUsers : []
    return list.map(normalizeProvider).filter(Boolean)
  }, [onlineUsers])

  const list = useMemo(() => {
    const t = busca.trim().toLowerCase()

    const base = providers.filter((p) =>
      modo === 'corre' ? p.isCorre : p.isProfissional
    )

    const byCat = catId
      ? base.filter((p) => {
          const cats = modo === 'corre' ? (p.correCategorias || []) : (p.profCategorias || [])
          // Se o corre ainda não cadastrou segmentos, ele continua aparecendo em "serviços gerais".
          if (modo === 'corre' && cats.length === 0 && catId === 'servicos_gerais') return true
          return cats.some((cat) => categoryMatches(cat, catId))
        })
      : base

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
  }, [providers, modo, busca, catId])

  const providerCounts = useMemo(() => {
    return providers.reduce(
      (acc, provider) => {
        if (provider.isCorre) acc.corre += 1
        if (provider.isProfissional) acc.profissional += 1
        return acc
      },
      { corre: 0, profissional: 0 }
    )
  }, [providers])

  const destaqueProviders = useMemo(
    () => (list.length ? list : providers).slice(0, 8),
    [list, providers]
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
          <span className="text-lg text-blue-600">⌕</span>
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

    <div className="-mx-2.5 -mt-2 min-h-[calc(100dvh-4rem)] overflow-hidden bg-white pb-24 text-slate-950 md:mx-0 md:mt-0 md:min-h-0 md:rounded-[34px] md:pb-8 md:shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
      <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_45%,#ffe36b_100%)] px-4 pb-5 pt-4 md:px-8 md:pb-10 md:pt-7">
        <div className="pointer-events-none absolute -right-14 top-12 h-44 w-44 rounded-[48px] bg-yellow-200/35 rotate-12 md:-right-8 md:top-6 md:h-72 md:w-72 md:rounded-[72px]" />
        <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-white/16 md:h-64 md:w-64" />
        <div className="relative flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onAbrirPerfil?.()}
            className="relative grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[24px] bg-white/92 text-base font-black text-blue-700 shadow-[0_12px_26px_rgba(15,23,42,0.16)] md:h-16 md:w-16 md:rounded-[28px] md:text-xl"
            title="Abrir perfil"
          >
            <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-[#ffd91a] ring-4 ring-blue-500" />
            {iniciais}
          </button>

          <button
            type="button"
            onClick={() => onAbrirPerfil?.()}
            className="min-w-0 flex-1 text-left"
          >
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/75 md:text-xs">
              Perto de você
            </div>
            <div className="mt-0.5 flex items-center gap-1 truncate text-lg font-black text-white md:text-2xl">
              <span className="truncate">{nomeExibicao}</span>
              <span>›</span>
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onAbrirPedidos?.()}
              className="grid h-10 w-10 place-items-center rounded-2xl bg-[#ffd91a] text-xl font-black text-blue-950 shadow-[0_10px_24px_rgba(245,158,11,0.22)] md:h-12 md:w-12 md:rounded-[20px]"
              title="Pedidos"
            >
              📦
            </button>
            <button
              type="button"
              onClick={() => onIrAoVivo?.()}
              className="grid h-10 w-10 place-items-center rounded-2xl bg-white/86 text-xl font-black text-blue-700 md:h-12 md:w-12 md:rounded-[20px]"
              title="Mapa"
            >
              🗺️
            </button>
            <button
              type="button"
              onClick={() => onAbrirNotificacoes?.()}
              className="relative grid h-10 w-10 place-items-center rounded-2xl bg-white/86 text-xl font-black text-blue-700 md:h-12 md:w-12 md:rounded-[20px]"
              title="Notificações"
            >
              🔔
            </button>
          </div>
        </div>

        <label ref={buscaTopoRef} className="relative z-30 mt-3 flex h-12 w-full items-center gap-3 rounded-[20px] border border-white/70 bg-white/92 px-4 text-left text-base font-black text-slate-500 shadow-[0_12px_24px_rgba(15,23,42,0.12)] backdrop-blur md:mt-6 md:h-16 md:max-w-3xl md:px-5 md:text-xl">
          <span className="text-2xl text-blue-600">⌕</span>
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

        <section className="relative mt-3 block w-full overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#ffdd28_0%,#ffe977_45%,#158cff_100%)] text-left shadow-[0_16px_30px_rgba(15,23,42,0.16)] md:mt-6 md:rounded-[34px]">
          <div className="relative min-h-[116px] p-4 md:min-h-[210px] md:p-8">
            <div className="absolute -right-8 -top-6 h-32 w-32 rounded-[32px] bg-blue-700/20 rotate-12 md:h-72 md:w-72 md:rounded-[64px]" />
            <div className="absolute bottom-4 right-3 md:bottom-8 md:right-10">
              <ClienteHeroMapIcon />
            </div>
            <div className="relative max-w-[205px] min-[390px]:max-w-[230px] md:max-w-xl">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-700 md:text-xs">
                Corre Aqui
              </div>
              <div className="mt-1 text-[1.7rem] font-black leading-[0.93] text-slate-950 min-[390px]:text-[1.9rem] md:text-6xl">
                Encontre ajuda perto de você.
              </div>
              <p className="mt-3 hidden max-w-[180px] text-xs font-black leading-snug text-blue-950/75 min-[390px]:block md:mt-5 md:max-w-md md:text-base">
                Crie um pedido pelo botão principal e acompanhe tudo pelo chat.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="-mt-2 bg-white px-4 pt-2 md:rounded-t-[30px] md:px-8 md:pt-5">
        <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:gap-7 [&::-webkit-scrollbar]:hidden">
          {categoriasRapidas.map((cat) => {
            const ativo = catId === cat.id
            return (
              <button
                key={cat.id || 'todos-mobile'}
                type="button"
                onClick={() => setCatId(cat.id)}
                className="w-[58px] shrink-0 text-center md:w-[92px]"
              >
                <span
                  className={[
                    'mx-auto grid h-14 w-14 place-items-center rounded-[20px] text-2xl shadow-[0_12px_24px_rgba(15,23,42,0.08)] md:h-20 md:w-20 md:rounded-[28px] md:text-4xl',
                    ativo ? 'ring-2 ring-blue-500/35' : 'ring-1 ring-slate-200/80',
                  ].join(' ')}
                  style={{
                    backgroundColor: ativo ? cat.accent || '#ffd91a' : cat.soft || '#eff6ff',
                    color: ativo ? '#ffffff' : cat.accent || '#0f172a',
                  }}
                >
                  {cat.emoji}
                </span>
                <span className="mt-1.5 block line-clamp-2 text-[11px] font-bold leading-tight text-slate-800 md:text-sm">
                  {cat.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:mt-8 md:gap-5">
          <button
            type="button"
            onClick={() => setModo('corre')}
            className="min-h-[112px] rounded-[24px] bg-gradient-to-br from-yellow-300 via-amber-300 to-blue-500 p-4 text-left shadow-[0_14px_30px_rgba(37,99,235,0.18)] md:min-h-[150px] md:rounded-[30px] md:p-6"
          >
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-800">Corres</div>
            <div className="mt-1 text-2xl font-black leading-none text-slate-950 md:text-4xl">{providerCounts.corre}</div>
            <div className="mt-1 text-xs font-black text-slate-800 md:text-sm">disponíveis</div>
          </button>
          <button
            type="button"
            onClick={() => setModo('profissional')}
            className="min-h-[112px] rounded-[24px] bg-gradient-to-br from-cyan-100 via-blue-200 to-sky-500 p-4 text-left shadow-[0_14px_30px_rgba(37,99,235,0.2)] md:min-h-[150px] md:rounded-[30px] md:p-6"
          >
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-800">Profissionais</div>
            <div className="mt-1 text-2xl font-black leading-none text-slate-950 md:text-4xl">{providerCounts.profissional}</div>
            <div className="mt-1 text-xs font-black text-slate-800 md:text-sm">com ficha</div>
          </button>
        </div>

        <section className="mt-7 md:mt-10">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black leading-none text-slate-950 md:text-4xl">Melhores perto</h2>
              <p className="mt-1 text-sm font-semibold text-slate-400">{modo === 'corre' ? 'Corres rápidos disponíveis' : 'Profissionais para contratar'}</p>
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
                modo={modo}
                onAbrirPerfil={onAbrirPerfil}
                onAgendar={onAgendar}
              />
            ))}
            {!providers.length ? (
              <div className="w-full rounded-[22px] bg-slate-50 p-4 text-sm font-bold text-slate-500">
                Assim que houver perfis online, eles aparecem aqui.
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-6 md:mt-10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black leading-none text-slate-950 md:text-4xl">Todos disponíveis</h2>
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
