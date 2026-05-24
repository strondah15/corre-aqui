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

export default function ClienteHome({
  meuNome = 'Anônimo',
  onCriarPedido,
  onIrAoVivo,
  onlineUsers = [],
  onAbrirPerfil,
  onAgendar,
}) {
  const [modo, setModo] = useState('corre') // corre | profissional

  // ✅ NOVO: a tela do cliente agora usa uma lista limpa.
  // Os botões Corre/Profissionais ficam no card principal e a ficha entra direto abaixo,
  // sem repetir busca, categoria e filtros no meio da tela.
  const busca = ''
  const catId = ''

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
    <div className="mt-3 space-y-4 px-3 sm:px-0 pb-28 select-none bg-transparent">
      <div className={`rounded-[28px] p-4 md:p-5 ${glass}`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-base md:text-lg font-black text-white truncate">
              Olá, {meuNome || 'Anônimo'}
            </div>
            <div className="mt-1 text-sm text-slate-300 leading-snug">
              Crie um pedido ou escolha alguém disponível perto de você.
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onCriarPedido?.()}
              className="h-11 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 shadow-lg shadow-black/20 transition hover:bg-slate-100 active:scale-[0.98]"
            >
              Criar pedido
            </button>
            <button
              type="button"
              onClick={() => onIrAoVivo?.()}
              className="h-11 rounded-2xl border border-white/12 bg-white/10 px-4 text-sm font-black text-white transition hover:bg-white/14 active:scale-[0.98]"
            >
              Mapa
            </button>
          </div>
        </div>

        {/* ✅ CONTROLE ÚNICO: Corre / Profissionais */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-[22px] bg-black/20 p-1.5 border border-white/10">
          <button
            type="button"
            onClick={() => setModo('corre')}
            className={[
              'w-full h-11 rounded-2xl text-sm font-black border transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2',
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
              'w-full h-11 rounded-2xl text-sm font-black border transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2',
              modo === 'profissional'
                ? 'bg-white text-slate-950 border-white shadow-[0_12px_28px_rgba(255,255,255,0.12)]'
                : 'bg-transparent text-slate-300 border-transparent hover:bg-white/8 hover:text-white',
            ].join(' ')}
          >
            <span>👷</span>
            <span>Profissionais</span>
          </button>
        </div>
      </div>

      {/* ✅ LISTA LIMPA: sem busca duplicada, sem filtros duplicados, sem botão flutuante */}
      <div className="space-y-4">
        <div className={`px-4 sm:px-5 py-4 rounded-[26px] ${floatingSection}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                Lista da região
              </div>
              <div className="mt-1 text-base sm:text-lg font-black text-white truncate">
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
          />
        </div>
      </div>
    </div>
  )

}
