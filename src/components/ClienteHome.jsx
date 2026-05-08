'use client'

import { useMemo, useState } from 'react'
import { CATEGORIES } from '@/constants/categories'
import ListaProfissionais from './ListaProfissionais'

const glass =
  'bg-white border border-slate-200 shadow-[0_18px_55px_rgba(15,23,42,0.12)] text-slate-900 select-none'

const floatingSection =
  'bg-white border border-slate-200 shadow-[0_18px_55px_rgba(15,23,42,0.12)] text-slate-900 select-none'

const safeStr = (v) => String(v || '').trim()


const getFotoProvider = (u) => safeStr(
  u?.fotoURL ||
    u?.photoURL ||
    u?.avatarUrl ||
    u?.avatarURL ||
    u?.imagem ||
    u?.imageUrl ||
    u?.profile?.fotoURL ||
    u?.profile?.photoURL ||
    u?.profile?.avatarUrl ||
    u?.profile?.avatarURL ||
    u?.profile?.imagem ||
    u?.profile?.imageUrl ||
    u?.perfil?.fotoURL ||
    u?.perfil?.photoURL ||
    u?.profissional?.fotoURL ||
    u?.profissional?.photoURL ||
    u?.corre?.fotoURL ||
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
  const fotoURL = getFotoProvider(u)
  const avatarEmoji = safeStr(u?.avatarEmoji || u?.profile?.avatarEmoji || u?.perfil?.avatarEmoji || '')

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
    <div className="mt-3 space-y-5 px-3 sm:px-0 pb-36 select-none bg-transparent">
      <div className={`rounded-[2.25rem] p-4 sm:p-5 lg:p-6 ${glass}`}>
        <div className="text-sm sm:text-base font-black text-slate-900">
          👋 Olá, {meuNome || 'Anônimo'}
        </div>
        <div className="mt-1 text-xs sm:text-sm text-slate-600 leading-snug">
          Crie um pedido e encontre quem está disponível.
        </div>

        {/* ✅ CONTROLE ÚNICO: Corre / Profissionais */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-[1.7rem] bg-slate-100 p-1.5 border border-slate-200">
          <button
            type="button"
            onClick={() => setModo('corre')}
            className={[
              'w-full h-12 rounded-[1.35rem] text-sm font-black border transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2',
              modo === 'corre'
                ? 'bg-amber-300 text-black border-yellow-300 shadow-[0_10px_25px_rgba(245,158,11,0.20)]'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-950',
            ].join(' ')}
          >
            <span>⚡</span>
            <span>Corres</span>
          </button>

          <button
            type="button"
            onClick={() => setModo('profissional')}
            className={[
              'w-full h-12 rounded-[1.35rem] text-sm font-black border transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2',
              modo === 'profissional'
                ? 'bg-blue-500 text-white border-blue-500 shadow-[0_10px_25px_rgba(59,130,246,0.22)]'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-950',
            ].join(' ')}
          >
            <span>👷</span>
            <span>Profissionais</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onCriarPedido?.()}
            className="w-full px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-black transition-all duration-200 active:scale-[0.98] shadow-[0_12px_30px_rgba(37,99,235,0.25)]"
          >
            🎯 Criar pedido
          </button>

          <button
            type="button"
            onClick={() => onIrAoVivo?.()}
            className="w-full px-4 py-3 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-900 text-sm font-black transition-all duration-200 active:scale-[0.98] shadow-sm"
          >
            🗺️ Ver mapa ao vivo
          </button>
        </div>
      </div>

      {/* ✅ LISTA LIMPA: sem busca duplicada, sem filtros duplicados, sem botão flutuante */}
      <div className="space-y-4">
        <div className={[
          'px-4 sm:px-5 py-4 rounded-[2rem] border border-slate-200 shadow-[0_18px_55px_rgba(15,23,42,0.12)]',
          modo === 'corre'
            ? 'bg-gradient-to-br from-white via-amber-50 to-orange-100/80'
            : 'bg-gradient-to-br from-white via-slate-50 to-blue-100/80',
        ].join(' ')}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                Lista da região
              </div>
              <div className="mt-1 text-base sm:text-lg font-black text-slate-950 truncate">
                {modo === 'corre' ? '⚡ Corres disponíveis' : '👷 Profissionais disponíveis'}
              </div>
            </div>

            <span className={[
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black border',
              modo === 'corre'
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-blue-100 text-blue-800 border-blue-200',
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
          />
        </div>
      </div>
    </div>
  )

}
