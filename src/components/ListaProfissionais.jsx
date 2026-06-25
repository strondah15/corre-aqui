'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ref, onValue, query, limitToLast } from 'firebase/database'
import { database } from '@/lib/firebase'
import CardProfissional from './CardProfissional'
import { CATEGORIES, categoryMatches, getCategoryById } from '@/constants/categories'


const safeStr = (v) => String(v || '').trim()
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

    return {
      uid,
      ...user,
      nome: user.nome || profile.nome || 'Profissional',
      fotoURL: getFotoURL(user, profile, profissional, avatarEmoji),
      avatarEmoji,
      cidade: user.cidade || profile.cidade || '',
      isProfissional: !!(user.isProfissional || profile.isProfissional || profissional?.ativo || profissional),
      isCorre: !!(user.isCorre || profile.isCorre || profile?.corre?.ativo || user?.corre?.ativo),
      profCategorias: Array.isArray(user.profCategorias)
        ? user.profCategorias
        : Array.isArray(profile.profCategorias)
          ? profile.profCategorias
          : Array.isArray(profissional.profCategorias)
            ? profissional.profCategorias
            : [],
      correCategorias: Array.isArray(user.correCategorias)
        ? user.correCategorias
        : Array.isArray(profile.correCategorias)
          ? profile.correCategorias
          : Array.isArray(user.servicos)
            ? user.servicos
            : Array.isArray(profile.servicos)
              ? profile.servicos
              : [],
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
  const sourceItems = useMemo(
    () => (hasExternalItems ? normalizeUsers(itemsSource) : items),
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
    if (hasExternalItems) {
      setLoading(false)
      return undefined
    }

    setLoading(true)

    // ✅ leitura simples (depois otimizamos com índices / queries)
    const usersRef = query(ref(database, 'users'), limitToLast(Number(limit) || 200))

    const off = onValue(
      usersRef,
      (snap) => {
        const list = normalizeUsers(snap.val())
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
    const t = String(buscaLocal || '').trim().toLowerCase()
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
        const nome = String(u.nome || u.profile?.nome || '').toLowerCase()
        const resumo = String(
          u.profResumo ||
          u.correResumo ||
          u.profissional?.descricao ||
          u.profile?.descricao ||
          ''
        ).toLowerCase()
        const cidade = String(
          u.profCidadeAtende ||
          u.correRegiao ||
          u.cidade ||
          u.profile?.cidade ||
          ''
        ).toLowerCase()
        const titulo = String(
          u.profissional?.titulo ||
          u.profile?.titulo ||
          u.correTitulo ||
          ''
        ).toLowerCase()
        const transporte = String(u.correTransporte || '').toLowerCase()
        return nome.includes(t) || resumo.includes(t) || cidade.includes(t) || titulo.includes(t) || transporte.includes(t)
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
          <div className={compact ? 'grid grid-cols-1 items-stretch gap-2 md:grid-cols-2 md:gap-4 xl:grid-cols-3 2xl:grid-cols-4' : 'grid grid-cols-1 items-stretch gap-2.5 md:grid-cols-2 md:gap-4 xl:grid-cols-3 2xl:grid-cols-4'}>
            {filtrados.map((u) => (
              <CardProfissional
                key={u.uid}
                item={u}
                onAbrir={onAbrirPerfil}
                onWhatsapp={openWhatsapp}
                onAgendar={onAgendar}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
