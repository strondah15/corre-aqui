'use client'

import { useMemo, useState } from 'react'
import { CATEGORIES } from '@/constants/categories'
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
  const c = CATEGORIES.find((x) => x.id === id)
  return c ? `${c.emoji} ${c.label}` : '—'
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

function ProviderMiniCard({ item, modo, onAbrirPerfil, onAgendar }) {
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
  const categoria = CATEGORIES.find((cat) => cat.id === categoriaId)
  const titulo = modo === 'corre'
    ? safeStr(item?.correTitulo) || 'Corre rápido'
    : safeStr(item?.profResumo) || 'Serviço profissional'
  const regiao = safeStr(item?.correRegiao || item?.profCidadeAtende || item?.regiao) || 'Perto de você'
  const preco = safeStr(item?.profPrecoBase || item?.correPreco || item?.precoBase) || 'A combinar'

  return (
    <article className="w-[154px] shrink-0 overflow-hidden rounded-[22px] border border-slate-100 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.11)]">
      <button
        type="button"
        onClick={() => onAbrirPerfil?.(item)}
        className="block w-full text-left"
      >
        <div className="relative grid h-28 place-items-center bg-gradient-to-br from-amber-50 via-cyan-50 to-emerald-50">
          {item?.fotoURL ? (
            <div
              aria-label={nome}
              className="h-16 w-16 rounded-[24px] bg-cover bg-center ring-4 ring-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
              style={{ backgroundImage: `url("${item.fotoURL}")` }}
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-[24px] bg-slate-950 text-lg font-black text-white ring-4 ring-white shadow-[0_10px_24px_rgba(15,23,42,0.16)]">
              {item?.avatarEmoji || iniciais}
            </div>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white">
            online
          </span>
        </div>

        <div className="p-3">
          <div className="line-clamp-1 text-[15px] font-black leading-tight text-slate-950">
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
          onClick={() => onAbrirPerfil?.(item)}
          className="h-8 rounded-xl bg-slate-950 text-[11px] font-black text-white"
        >
          Ver
        </button>
        <button
          type="button"
          onClick={() => onAgendar?.(item)}
          className="h-8 rounded-xl bg-[#ffd91a] text-[11px] font-black text-slate-950"
        >
          Agendar
        </button>
      </div>
    </article>
  )
}

export default function ClienteHome({
  meuNome = 'Anônimo',
  onCriarPedido,
  onIrAoVivo,
  onlineUsers = [],
  onAbrirPerfil,
  onAgendar,
}) {
  const [modo, setModo] = useState('corre') // corre | profissional
  const [catId, setCatId] = useState('')

  // ✅ NOVO: a tela do cliente agora usa uma lista limpa.
  // Os botões Corre/Profissionais ficam no card principal e a ficha entra direto abaixo,
  // sem repetir busca, categoria e filtros no meio da tela.
  const busca = ''
  const nomeExibicao = safeStr(meuNome) || 'Anônimo'
  const iniciais = nomeExibicao
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('') || 'CA'
  const categoriasRapidas = useMemo(() => [{ id: '', label: 'Todos', emoji: '✨' }, ...(CATEGORIES || []).slice(0, 7)], [])

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
          return cats.includes(catId)
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

  return (
    <>
    <div className="md:hidden -mx-2 -mt-2 min-h-[calc(100dvh-4rem)] overflow-hidden rounded-t-[28px] bg-white pb-24 text-slate-950 shadow-[0_-12px_60px_rgba(255,255,255,0.08)]">
      <div className="bg-[#ffe76a] px-4 pb-8 pt-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onAbrirPerfil?.()}
            className="relative grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[24px] bg-white/55 text-base font-black text-slate-950 shadow-[0_12px_26px_rgba(15,23,42,0.12)]"
            title="Abrir perfil"
          >
            <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-rose-500 ring-4 ring-[#ffe76a]" />
            {iniciais}
          </button>

          <button
            type="button"
            onClick={() => onAbrirPerfil?.()}
            className="min-w-0 flex-1 text-left"
          >
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-600">
              Perto de você
            </div>
            <div className="mt-0.5 flex items-center gap-1 truncate text-lg font-black text-slate-950">
              <span className="truncate">{nomeExibicao}</span>
              <span>›</span>
            </div>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setCatId('servicos_gerais')}
              className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-500 text-lg font-black text-white shadow-[0_10px_24px_rgba(16,185,129,0.26)]"
              title="Serviços rápidos"
            >
              %
            </button>
            <button
              type="button"
              onClick={() => onIrAoVivo?.()}
              className="grid h-10 w-10 place-items-center rounded-2xl bg-white/50 text-xl font-black text-slate-950"
              title="Mapa"
            >
              🗺️
            </button>
            <button
              type="button"
              onClick={() => onAbrirPerfil?.()}
              className="relative grid h-10 w-10 place-items-center rounded-2xl bg-white/50 text-xl font-black text-slate-950"
              title="Notificações"
            >
              🔔
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-[#ffe76a]">
                !
              </span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onCriarPedido?.()}
          className="mt-4 flex h-14 w-full items-center gap-3 rounded-[22px] bg-white/74 px-4 text-left text-lg font-black text-slate-500 shadow-[0_12px_24px_rgba(15,23,42,0.08)] backdrop-blur"
        >
          <span className="text-2xl">⌕</span>
          <span className="truncate">buscar ajuda rápida</span>
        </button>

        <button
          type="button"
          onClick={() => onCriarPedido?.()}
          className="mt-4 block w-full overflow-hidden rounded-[26px] bg-[#ffd91a] text-left shadow-[0_18px_34px_rgba(15,23,42,0.14)]"
        >
          <div className="relative min-h-[152px] p-5">
            <div className="absolute -right-8 -top-6 h-40 w-40 rounded-[36px] bg-emerald-500/22 rotate-12" />
            <div className="absolute bottom-4 right-4 grid h-24 w-24 place-items-center rounded-[30px] bg-white/70 text-5xl shadow-lg">
              ⚡
            </div>
            <div className="relative max-w-[210px]">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-700">
                Corre Aqui
              </div>
              <div className="mt-1 text-3xl font-black leading-[0.92] text-slate-950">
                Precisa resolver hoje?
              </div>
              <div className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-slate-950 shadow">
                Criar pedido agora
              </div>
            </div>
          </div>
        </button>
      </div>

      <div className="-mt-5 rounded-t-[30px] bg-white px-4 pt-4">
        <div className="flex items-center gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            ['🛵', 'Corre rápido'],
            ['⚡', 'No horário'],
            ['🛡️', 'Seguro'],
            ['💬', 'Chat'],
          ].map(([icon, label]) => (
            <div key={label} className="flex shrink-0 items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-sm font-black text-slate-950">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#ffd91a] text-base">{icon}</span>
              {label}
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categoriasRapidas.map((cat) => {
            const ativo = catId === cat.id
            return (
              <button
                key={cat.id || 'todos-mobile'}
                type="button"
                onClick={() => setCatId(cat.id)}
                className="w-[72px] shrink-0 text-center"
              >
                <span className={[
                  'mx-auto grid h-16 w-16 place-items-center rounded-[24px] text-3xl shadow-[0_12px_24px_rgba(15,23,42,0.08)]',
                  ativo ? 'bg-[#ffd91a]' : 'bg-slate-50',
                ].join(' ')}>
                  {cat.emoji}
                </span>
                <span className="mt-2 block line-clamp-2 text-[12px] font-bold leading-tight text-slate-800">
                  {cat.label}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setModo('corre')}
            className="min-h-[112px] rounded-[24px] bg-gradient-to-br from-orange-300 to-amber-500 p-4 text-left shadow-[0_14px_30px_rgba(245,158,11,0.22)]"
          >
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-800">Corres</div>
            <div className="mt-1 text-2xl font-black leading-none text-slate-950">{providers.filter((p) => p.isCorre).length}</div>
            <div className="mt-1 text-xs font-black text-slate-800">disponíveis</div>
          </button>
          <button
            type="button"
            onClick={() => setModo('profissional')}
            className="min-h-[112px] rounded-[24px] bg-gradient-to-br from-cyan-200 to-emerald-300 p-4 text-left shadow-[0_14px_30px_rgba(45,212,191,0.2)]"
          >
            <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-800">Profissionais</div>
            <div className="mt-1 text-2xl font-black leading-none text-slate-950">{providers.filter((p) => p.isProfissional).length}</div>
            <div className="mt-1 text-xs font-black text-slate-800">com ficha</div>
          </button>
        </div>

        <section className="mt-7">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black leading-none text-slate-950">Melhores perto</h2>
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

          <div className="mt-4 flex gap-3 overflow-x-auto pb-2 pl-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(list.length ? list : providers).slice(0, 8).map((item) => (
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

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black leading-none text-slate-950">Todos disponíveis</h2>
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

          <div className="overflow-hidden rounded-[24px] bg-slate-950 p-1.5">
            <ListaProfissionais
              mode={modo}
              categoriaId={catId}
              search={busca}
              limit={200}
              onAbrirPerfil={onAbrirPerfil}
              onAgendar={onAgendar}
              showHeader={false}
              compact
            />
          </div>
        </section>
      </div>
    </div>

    <div className="hidden mt-2 space-y-2.5 px-2 pb-20 select-none bg-transparent md:block md:mt-3 md:space-y-4 md:px-3 md:pb-28 sm:px-0">
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
                    ? 'border-white bg-white text-slate-950 shadow-lg shadow-black/15'
                    : 'border-white/12 bg-white/8 text-slate-200 hover:bg-white/12',
                ].join(' ')}
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
            onAbrirPerfil={onAbrirPerfil}
            onAgendar={onAgendar}
            showHeader={false}
            compact
          />
        </div>
      </div>
    </div>
    </>
  )

}
