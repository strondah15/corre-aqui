'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ref, onValue, query, limitToLast } from '@/lib/firebaseDebug'
import { database } from '@/lib/firebase'
import CardProfissional from './CardProfissional'
import { CATEGORIES, categoryMatches, getCategoryById } from '@/constants/categories'
import { getProfessionDisplayName, getProfessionSearchText, normalizeProfessionSearchText } from '@/constants/professions'
import { canAppearInPublicDirectory } from '@/lib/publicWorkProfile'
import { buildProfessionalReputation } from '@/lib/professionalReputation'


const safeStr = (v) => String(v || '').trim()
const DIRECTORY_PAGE_SIZE = 12
let profissionaisCache = []
let profissionaisCacheReady = false

function getFotoPersonalizada(user = {}, profile = {}, profissional = {}) {
  return safeStr(
    user.fotoURL ||
      user.avatarUrl ||
      user.avatarURL ||
      user.imagem ||
      user.imageUrl ||
      profile.fotoURL ||
      profile.avatarUrl ||
      profile.avatarURL ||
      profile.imagem ||
      profile.imageUrl ||
      user.perfil?.fotoURL ||
      profissional.fotoURL ||
      user.corre?.fotoURL ||
      profile.corre?.fotoURL ||
      ''
  )
}

function getGoogleFoto(user = {}, profile = {}, profissional = {}) {
  return safeStr(
    user.photoURL ||
      profile.photoURL ||
      user.perfil?.photoURL ||
      profissional.photoURL ||
      user.corre?.photoURL ||
      profile.corre?.photoURL ||
      ''
  )
}

function getFotoURL(user = {}, profile = {}, profissional = {}, avatarEmoji = '') {
  // Ordem de exibicao: foto salva no app, emoji/avatar, foto do Google, iniciais.
  return getFotoPersonalizada(user, profile, profissional) || (!avatarEmoji ? getGoogleFoto(user, profile, profissional) : '')
}

function safeImageUrl(v) {
  const s = safeStr(v)
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (/^blob:/i.test(s)) return s
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(s)) return s
  return ''
}

function getFirstCategoryId(...values) {
  for (const value of values) {
    if (!value) continue
    if (Array.isArray(value)) {
      const found = value.find(Boolean)
      if (found) return found
      continue
    }
    return value
  }
  return ''
}

function isSpecificProfessionLabel(label) {
  const normalized = normalizeProfessionSearchText(label)
  return normalized && !['corre rapido', 'profissional local', 'profissional'].includes(normalized)
}

function getCompactCategoryLabel(item = {}, mode = 'profissional') {
  const profile = item?.profile || {}
  const profissional = item?.profissional || {}
  const corre = item?.corre || {}
  const professionLabel = getProfessionDisplayName(item, { mode, fallback: '' })
  if (isSpecificProfessionLabel(professionLabel)) return professionLabel

  const categoryId = mode === 'corre'
    ? getFirstCategoryId(item?.correCategorias, profile?.correCategorias, corre?.categorias, item?.servicos, profile?.servicos)
    : getFirstCategoryId(item?.profCategorias, profile?.profCategorias, profissional?.profCategorias, profissional?.categorias)
  const category = getCategoryById(categoryId)

  return safeStr(
    category?.label ||
      (mode === 'corre'
        ? item?.correTitulo || corre?.titulo || 'Corre rápido'
        : profissional?.titulo || item?.profTitulo || profile?.titulo || item?.titulo || 'Profissional')
  )
}

function getCompactLocation(item = {}) {
  const profile = item?.profile || {}
  const profissional = item?.profissional || {}
  const corre = item?.corre || {}

  return safeStr(
    item?.bairro ||
      profile?.bairro ||
      item?.profCidadeAtende ||
      profissional?.regiao ||
      profissional?.cidade ||
      item?.correRegiao ||
      corre?.regiao ||
      item?.cidade ||
      profile?.cidade
  )
}

function CompactDirectoryCard({ item, mode, onAbrir }) {
  const profile = item?.profile || {}
  const profissional = item?.profissional || {}
  const corre = item?.corre || {}
  const nome = safeStr(item?.nome || profile?.nome || 'Profissional')
  const emoji = safeStr(item?.avatarEmoji || profile?.avatarEmoji || item?.perfil?.avatarEmoji) || (mode === 'corre' ? '⚡' : '💼')
  const fotoURL = safeImageUrl(item?.fotoURL || profile?.fotoURL || profissional?.fotoURL || corre?.fotoURL || item?.photoURL || profile?.photoURL)
  const tipoLabel = mode === 'corre' ? 'Corre rápido' : 'Profissional'
  const especialidade = getCompactCategoryLabel(item, mode)
  const cidade = getCompactLocation(item) || 'Região não informada'
  const isOnline = item?.online === true
  const reputation = buildProfessionalReputation(item)
  const ratingLabel = reputation.rating ? `★ ${reputation.rating.toFixed(1).replace('.', ',')} · ${reputation.reviewCount}` : 'Novo no app'
  const servicesLabel = `${reputation.completedServices} serviço${reputation.completedServices === 1 ? '' : 's'}`
  const avatarStyle = fotoURL ? { backgroundImage: `url(${JSON.stringify(fotoURL)})` } : undefined
  const handleAbrir = () => onAbrir?.(item)

  return (
    <article
      className="group relative flex min-h-[176px] flex-col overflow-hidden rounded-[20px] border border-blue-100 bg-white p-3 text-left shadow-[0_8px_22px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_28px_rgba(37,99,235,0.12)] min-[390px]:min-h-[170px] md:min-h-[184px] md:p-3.5"
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-20 w-20 rounded-full bg-blue-100/70 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-8 h-20 w-20 rounded-full bg-yellow-100/80 blur-2xl" />

      <div className="relative flex min-w-0 items-start gap-2.5">
        <div
          className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white bg-slate-100 bg-cover bg-center shadow-[0_8px_18px_rgba(15,23,42,0.12)] ring-[3px] ring-blue-50"
          style={avatarStyle}
          aria-label={nome}
        >
          {fotoURL ? (
            <span className="sr-only">{nome}</span>
          ) : (
            <div className="grid h-full w-full place-items-center text-xl" aria-hidden="true">{emoji}</div>
          )}
          {isOnline ? <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" /> : null}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[13px] font-black leading-[1.08] text-slate-950 md:text-sm" title={nome}>
            {nome}
          </h3>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className={[
              'rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em]',
              mode === 'corre' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800',
            ].join(' ')}>
              {tipoLabel}
            </span>
            {isOnline ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-700">
                Online
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative mt-2 min-w-0 space-y-1">
        <p className="truncate text-[11px] font-black text-slate-700 md:text-xs" title={especialidade}>
          {especialidade}
        </p>
        <p className="truncate text-[11px] font-semibold text-slate-500" title={cidade}>
          {cidade}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-black text-slate-500 md:text-[11px]">
          <span className={reputation.rating ? 'text-amber-600' : 'text-slate-500'}>{ratingLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{servicesLabel}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleAbrir}
        className="relative mt-auto h-9 w-full rounded-xl bg-blue-600 px-3 text-[11px] font-black text-white shadow-[0_8px_18px_rgba(37,99,235,0.2)] transition hover:bg-blue-500 active:scale-[0.98] md:h-10 md:text-xs"
      >
        Ver perfil
      </button>
    </article>
  )
}

function normalizeUsers(raw) {
  const entries = Array.isArray(raw)
    ? raw.map((value, index) => [value?.uid || value?.id || `provider_${index}`, value])
    : Object.entries(raw || {})

  // ✅ mantém tudo que já existe e cria campos "planos" para a lista funcionar
  // mesmo quando os dados estão salvos em users/{uid}/profile ou users/{uid}/profissional
  return entries.map(([uid, v]) => {
    const user = v || {}
    const profile = user.profile || {}
    const profissional = user.profissional || {}
    const avatarEmoji = user.avatarEmoji || profile.avatarEmoji || user.perfil?.avatarEmoji || ''
    const primaryCategoryId = safeStr(
      user.primaryCategoryId ||
        user.categoriaId ||
        user.categoryId ||
        profile.primaryCategoryId ||
        profile.categoriaId ||
        profile.categoryId ||
        ''
    )
    const professionId = safeStr(
      user.professionId ||
        user.profissaoId ||
        profile.professionId ||
        profile.profissaoId ||
        profissional.professionId ||
        user.corre?.professionId ||
        profile.corre?.professionId ||
        ''
    )
    const professionName = safeStr(
      user.professionName ||
        user.profissaoNome ||
        user.customProfession ||
        profile.professionName ||
        profile.profissaoNome ||
        profile.customProfession ||
        profissional.professionName ||
        profissional.profissaoNome ||
        user.profTitulo ||
        profile.profTitulo ||
        user.correTitulo ||
        profile.correTitulo ||
        ''
    )
    const professionSource = safeStr(user.professionSource || profile.professionSource || (professionId ? 'catalog' : professionName ? 'custom' : ''))
    const hasProfissionalNode = profissional && typeof profissional === 'object' && Object.keys(profissional).length > 0
    const isProfissional = !!(user.isProfissional || profile.isProfissional || profissional?.ativo || (hasProfissionalNode && profissional.ativo !== false))
    const isCorre = !!(user.isCorre || profile.isCorre || profile?.corre?.ativo || user?.corre?.ativo)
    const profCategoriasBase = Array.isArray(user.profCategorias)
      ? user.profCategorias
      : Array.isArray(profile.profCategorias)
        ? profile.profCategorias
        : Array.isArray(profissional.profCategorias)
          ? profissional.profCategorias
          : []
    const correCategoriasBase = Array.isArray(user.correCategorias)
      ? user.correCategorias
      : Array.isArray(profile.correCategorias)
        ? profile.correCategorias
        : Array.isArray(user.servicos)
          ? user.servicos
          : Array.isArray(profile.servicos)
            ? profile.servicos
            : []

    return {
      uid,
      ...user,
      nome: user.nome || profile.nome || 'Profissional',
      fotoURL: getFotoURL(user, profile, profissional, avatarEmoji),
      avatarEmoji,
      cidade: user.cidade || profile.cidade || '',
      profileStatus: user.profileStatus || user.publicStatus || user.statusPublico || profile.profileStatus || profile.publicStatus || '',
      primaryCategoryId,
      categoriaId: primaryCategoryId,
      professionId,
      professionName,
      professionSource,
      customProfession: safeStr(user.customProfession || profile.customProfession || ''),
      profissaoId: professionId,
      profissaoNome: professionName,
      isProfissional,
      isCorre,
      profCategorias: profCategoriasBase.length || !primaryCategoryId || !isProfissional ? profCategoriasBase : [primaryCategoryId],
      correCategorias: correCategoriasBase.length || !primaryCategoryId || !isCorre ? correCategoriasBase : [primaryCategoryId],
      corre: user.corre || profile.corre || {},
      correTitulo:
        user?.corre?.titulo ||
        profile?.corre?.titulo ||
        profile?.correTitulo ||
        user?.correTitulo ||
        'Corre rápido',
      correResumo:
        user?.corre?.bio ||
        profile?.corre?.bio ||
        profile?.correBio ||
        user?.correBio ||
        profile.bio ||
        '',
      correTransporte:
        user?.corre?.transporte ||
        profile?.corre?.transporte ||
        profile?.correTransporte ||
        user?.correTransporte ||
        '',
      correRegiao:
        user?.corre?.regiao ||
        profile?.corre?.regiao ||
        profile?.correRegiao ||
        user?.correRegiao ||
        profile.cidade ||
        user.cidade ||
        '',
      correDisponibilidade:
        user?.corre?.disponibilidade ||
        profile?.corre?.disponibilidade ||
        profile?.correDisponibilidade ||
        user?.correDisponibilidade ||
        '',
      correExperiencia:
        user?.corre?.experiencia ||
        profile?.corre?.experiencia ||
        profile?.correExperiencia ||
        user?.correExperiencia ||
        '',
      profResumo:
        user.profResumo ||
        profile.descricao ||
        profile.bio ||
        profissional.descricao ||
        profissional.titulo ||
        '',
      profCidadeAtende:
        user.profCidadeAtende ||
        profile.cidade ||
        profissional.regiao ||
        profissional.cidade ||
        user.cidade ||
        '',
      profPrecoBase: user.profPrecoBase || profile.preco || profissional.preco || '',
      profWhats: user.profWhats || profile.whatsapp || profissional.whatsapp || '',
      profExperiencia: user.profExperiencia || profile.profExperiencia || profissional.experiencia || '',
      statusProfissional: user.statusProfissional || profile.statusProfissional || profissional.statusProfissional || 'disponivel',
      ocupadoAte: user.ocupadoAte || profile.ocupadoAte || profissional.ocupadoAte || null,
      agendaAberta: user.agendaAberta ?? profile.agendaAberta ?? profissional.agendaAberta ?? true,
      profile,
      profissional,
    }
  })
}

export default function ListaProfissionais({
  mode = 'profissional', // profissional | corre | ambos
  categoriaId = '', // filtra por categoria
  search = '',
  limit = 200,
  itemsSource = null,
  onAbrirPerfil,
  onAgendar,
  showHeader = true,
  compact = false,
}) {
  const hasExternalItems = Array.isArray(itemsSource)
  const [items, setItems] = useState(() => (profissionaisCacheReady ? profissionaisCache : []))
  const [loading, setLoading] = useState(() => !hasExternalItems && !profissionaisCacheReady)
  const [buscaLocal, setBuscaLocal] = useState(search || '')
  const [categoriaLocal, setCategoriaLocal] = useState(categoriaId || '')
  const [visibleLimit, setVisibleLimit] = useState(DIRECTORY_PAGE_SIZE)
  const sourceItems = useMemo(
    () => (hasExternalItems ? normalizeUsers(itemsSource) : items).filter((item) => canAppearInPublicDirectory(item)),
    [hasExternalItems, itemsSource, items]
  )

  // Mantém compatível com o Mapadinamico: se o pai mandar busca/categoria,
  // a lista atualiza; se não mandar, o próprio componente controla tudo.
  useEffect(() => {
    setBuscaLocal(search || '')
  }, [search])

  useEffect(() => {
    setCategoriaLocal(categoriaId || '')
  }, [categoriaId])

  useEffect(() => {
    if (compact) setVisibleLimit(DIRECTORY_PAGE_SIZE)
  }, [compact, mode, buscaLocal, categoriaLocal])

  useEffect(() => {
    if (hasExternalItems) {
      setLoading(false)
      return undefined
    }

    setLoading(true)

    // ✅ leitura simples (depois otimizamos com índices / queries)
    const usersRef = query(ref(database, 'publicProfiles'), limitToLast(Number(limit) || 200))

    const off = onValue(
      usersRef,
      (snap) => {
        const list = normalizeUsers(snap.val()).filter((item) => canAppearInPublicDirectory(item))
        profissionaisCache = list
        profissionaisCacheReady = true
        setItems(list)
        setLoading(false)
      },
      () => setLoading(false)
    )

    return () => off()
  }, [hasExternalItems, limit])

  const categoriasFiltro = useMemo(() => {
    const base = Array.isArray(CATEGORIES) ? CATEGORIES : []
    return [{ id: '', label: 'Todos', emoji: '✨', accent: '#0f172a' }, ...base]
  }, [])

  const categoriaLabel = useMemo(() => {
    const c = getCategoryById(categoriaLocal)
    return c ? `${c.emoji} ${c.label}` : ''
  }, [categoriaLocal])

  const filtrados = useMemo(() => {
    const t = normalizeProfessionSearchText(buscaLocal)
    return (sourceItems || [])
      .filter((u) => {
        const isProf = !!u.isProfissional
        const isCorre = !!u.isCorre
        if (mode === 'profissional' && !isProf) return false
        if (mode === 'corre' && !isCorre) return false
        if (mode === 'ambos' && !(isProf || isCorre)) return false

        // categoria
        if (categoriaLocal) {
          const cats =
            mode === 'corre'
              ? Array.isArray(u.correCategorias)
                ? u.correCategorias
                : Array.isArray(u.profCategorias)
                  ? u.profCategorias
                  : []
              : Array.isArray(u.profCategorias)
                ? u.profCategorias
                : []
          if (!cats.some((cat) => categoryMatches(cat, categoriaLocal))) return false
        }

        if (!t) return true
        const nome = normalizeProfessionSearchText(u.nome || u.profile?.nome || '')
        const resumo = normalizeProfessionSearchText(
          u.profResumo ||
          u.correResumo ||
          u.profissional?.descricao ||
          u.profile?.descricao ||
          ''
        )
        const cidade = normalizeProfessionSearchText(
          u.profCidadeAtende ||
          u.correRegiao ||
          u.cidade ||
          u.profile?.cidade ||
          ''
        )
        const titulo = normalizeProfessionSearchText(
          u.profissional?.titulo ||
          u.profile?.titulo ||
          u.correTitulo ||
          ''
        )
        const transporte = normalizeProfessionSearchText(u.correTransporte || '')
        const profissao = getProfessionSearchText(u)
        return nome.includes(t) || resumo.includes(t) || cidade.includes(t) || titulo.includes(t) || transporte.includes(t) || profissao.includes(t)
      })
      .sort((a, b) => {
        const onlineDiff = Number(b.online === true) - Number(a.online === true)
        if (onlineDiff) return onlineDiff
        return Number(b.updatedAt || b.updatedAtMs || 0) - Number(a.updatedAt || a.updatedAtMs || 0)
      })
  }, [sourceItems, mode, categoriaLocal, buscaLocal])

  const openWhatsapp = useCallback((u) => {
    const w = String(u?.profWhats || '').replace(/[^\d]/g, '')
    if (!w) return
    const url = `https://wa.me/55${w}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  const renderedItems = compact ? filtrados.slice(0, visibleLimit) : filtrados
  const hasMore = compact && visibleLimit < filtrados.length

  const glass =
    'bg-white/[0.08] border border-white/10 shadow-[0_22px_80px_rgba(0,0,0,0.22)] ring-1 ring-white/5 backdrop-blur-xl'

  return (
    <div className={`overflow-hidden ${showHeader ? 'rounded-[22px] md:rounded-[28px]' : 'rounded-[18px] md:rounded-[24px]'} ${glass}`}>
      {showHeader ? (
      <div className="border-b border-white/10 bg-white/[0.03] px-3 py-3 md:px-4 md:py-4 sm:px-5">
        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Busca inteligente</div>
        <div className="mt-1 text-sm font-black text-white md:text-base">
          {mode === 'corre' ? '🧍 Corres / Bicos disponíveis' : mode === 'ambos' ? '🧭 Corres + Profissionais' : '🧑‍🔧 Profissionais'}
        </div>

        <div className="mt-2.5 space-y-2 md:mt-3 md:space-y-2.5">
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
            <input
              value={buscaLocal}
              onChange={(e) => setBuscaLocal(e.target.value)}
              placeholder={mode === 'corre' ? 'Buscar corre, cidade ou serviço rápido...' : 'Buscar profissional, cidade ou serviço...'}
              className="w-full rounded-xl border border-white/10 bg-white px-10 py-2.5 text-sm font-semibold text-slate-800 shadow-[0_10px_26px_rgba(0,0,0,0.1)] outline-none transition placeholder:text-slate-500 focus:border-blue-300 focus:ring-4 focus:ring-blue-500/15 md:rounded-2xl md:px-11 md:py-3 md:shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
            />
            {buscaLocal ? (
              <button
                type="button"
                onClick={() => setBuscaLocal('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-100"
                aria-label="Limpar busca"
              >
                ✕
              </button>
            ) : null}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categoriasFiltro.map((cat) => {
              const ativo = categoriaLocal === cat.id
              return (
                <button
                  key={cat.id || 'todos'}
                  type="button"
                  onClick={() => setCategoriaLocal(cat.id)}
                  className={[
                    'shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-black transition-all duration-200 active:scale-[0.96] md:px-3.5 md:py-2 md:text-xs',
                    ativo
                      ? 'border-white text-white shadow-lg shadow-black/15'
                      : 'border-white/12 bg-white/8 text-slate-200 hover:bg-white/12 hover:text-white',
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

        <div className="text-xs text-slate-300 mt-3">
          {categoriaLabel ? <>Filtro: <b className="text-white">{categoriaLabel}</b></> : mode === 'corre' ? 'Capina, entulho, mudança, ajudante e bicos rápidos.' : 'Escolha uma categoria para refinar.'}
          {' '}· {filtrados.length} encontrados
        </div>
      </div>
      ) : null}

      <div className={`${showHeader ? 'bg-white/[0.03]' : 'bg-transparent'} p-2 md:p-3 ${compact ? 'sm:p-3' : 'sm:p-4'}`}>
        {loading ? (
          <div className="text-sm text-slate-300">Carregando profissionais…</div>
        ) : filtrados.length === 0 ? (
          <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3 text-slate-300 md:rounded-2xl md:p-4">
            <div className="font-semibold text-white">Nada encontrado</div>
            <div className="text-xs text-slate-400 mt-1">
              Tente trocar a categoria ou procurar por cidade/nome.
            </div>
          </div>
        ) : (
          <div className={compact ? 'space-y-3' : ''}>
            <div className={compact ? 'grid grid-cols-1 items-stretch gap-2.5 min-[360px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' : 'grid grid-cols-1 items-stretch gap-2.5 md:grid-cols-2 md:gap-4 xl:grid-cols-3 2xl:grid-cols-4'}>
              {renderedItems.map((u) => (
                compact ? (
                  <CompactDirectoryCard
                    key={u.uid}
                    item={u}
                    mode={mode}
                    onAbrir={onAbrirPerfil}
                  />
                ) : (
                  <CardProfissional
                    key={u.uid}
                    item={u}
                    onAbrir={onAbrirPerfil}
                    onWhatsapp={openWhatsapp}
                    onAgendar={onAgendar}
                  />
                )
              ))}
            </div>

            {hasMore ? (
              <button
                type="button"
                onClick={() => setVisibleLimit((value) => value + DIRECTORY_PAGE_SIZE)}
                className="mx-auto flex h-10 min-w-[180px] items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 text-xs font-black text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)] transition hover:bg-white/15 active:scale-[0.98]"
              >
                Carregar mais {Math.min(DIRECTORY_PAGE_SIZE, filtrados.length - visibleLimit)}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
