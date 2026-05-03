'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, query, limitToLast } from 'firebase/database'
import { database } from '@/lib/firebase'
import CardProfissional from './CardProfissional'
import { CATEGORIES } from '@/constants/categories'


const safeStr = (v) => String(v || '').trim()

function getFotoURL(user = {}, profile = {}, profissional = {}) {
  // Busca a foto nos nomes mais comuns que já usamos no projeto.
  // Isso faz a foto salva no perfil aparecer também no card do cliente.
  return safeStr(
    user.fotoURL ||
      user.photoURL ||
      user.avatarUrl ||
      user.avatarURL ||
      user.imagem ||
      user.imageUrl ||
      profile.fotoURL ||
      profile.photoURL ||
      profile.avatarUrl ||
      profile.avatarURL ||
      profile.imagem ||
      profile.imageUrl ||
      user.perfil?.fotoURL ||
      user.perfil?.photoURL ||
      profissional.fotoURL ||
      profissional.photoURL ||
      user.corre?.fotoURL ||
      user.corre?.photoURL ||
      profile.corre?.fotoURL ||
      profile.corre?.photoURL ||
      ''
  )
}

function normalizeUsers(raw) {
  const obj = raw || {}

  // ✅ mantém tudo que já existe e cria campos "planos" para a lista funcionar
  // mesmo quando os dados estão salvos em users/{uid}/profile ou users/{uid}/profissional
  return Object.entries(obj).map(([uid, v]) => {
    const user = v || {}
    const profile = user.profile || {}
    const profissional = user.profissional || {}

    return {
      uid,
      ...user,
      nome: user.nome || profile.nome || 'Profissional',
      fotoURL: getFotoURL(user, profile, profissional),
      avatarEmoji: user.avatarEmoji || profile.avatarEmoji || user.perfil?.avatarEmoji || '',
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
  onAbrirPerfil,
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)

    // ✅ leitura simples (depois otimizamos com índices / queries)
    const usersRef = query(ref(database, 'users'), limitToLast(Number(limit) || 200))

    const off = onValue(
      usersRef,
      (snap) => {
        const list = normalizeUsers(snap.val())
        setItems(list)
        setLoading(false)
      },
      () => setLoading(false)
    )

    return () => off()
  }, [limit])

  const categoriaLabel = useMemo(() => {
    const c = CATEGORIES.find((x) => x.id === categoriaId)
    return c ? `${c.emoji} ${c.label}` : ''
  }, [categoriaId])

  const filtrados = useMemo(() => {
    const t = String(search || '').trim().toLowerCase()
    return (items || [])
      .filter((u) => {
        const isProf = !!u.isProfissional
        const isCorre = !!u.isCorre
        if (mode === 'profissional' && !isProf) return false
        if (mode === 'corre' && !isCorre) return false
        if (mode === 'ambos' && !(isProf || isCorre)) return false

        // categoria
        if (categoriaId) {
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
          if (!cats.includes(categoriaId)) return false
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
      .sort((a, b) => Number(b.updatedAt || b.updatedAtMs || 0) - Number(a.updatedAt || a.updatedAtMs || 0))
  }, [items, mode, categoriaId, search])

  const openWhatsapp = (u) => {
    const w = String(u?.profWhats || '').replace(/[^\d]/g, '')
    if (!w) return
    const url = `https://wa.me/55${w}`
    window.open(url, '_blank', 'noreferrer')
  }

  const glass =
    'bg-white/95 border border-slate-200 shadow-[0_18px_60px_rgba(15,23,42,0.12)]'

  return (
    <div className={`rounded-3xl overflow-hidden ${glass}`}>
      <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-br from-white to-slate-50">
        <div className="text-sm font-extrabold text-slate-950">
          {mode === 'corre' ? '🧍 Corres / Bicos disponíveis' : mode === 'ambos' ? '🧭 Corres + Profissionais' : '🧑‍🔧 Profissionais'}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {categoriaLabel ? <>Filtro: <b className="text-slate-700">{categoriaLabel}</b></> : mode === 'corre' ? 'Capina, entulho, mudança, ajudante e bicos rápidos.' : 'Escolha uma categoria para refinar.'}
          {' '}· {filtrados.length} encontrados
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="text-sm text-slate-600">Carregando profissionais…</div>
        ) : filtrados.length === 0 ? (
          <div className="rounded-2xl p-4 bg-slate-50 border border-slate-200 text-slate-700">
            <div className="font-semibold text-slate-900">Nada encontrado</div>
            <div className="text-xs text-slate-500 mt-1">
              Tente trocar a categoria ou procurar por cidade/nome.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtrados.map((u) => (
              <CardProfissional
                key={u.uid}
                item={u}
                onAbrir={onAbrirPerfil}
                onWhatsapp={openWhatsapp}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
