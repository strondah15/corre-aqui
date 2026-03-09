'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, query, limitToLast } from 'firebase/database'
import { database } from '@/lib/firebase'
import CardProfissional from './CardProfissional'
import { CATEGORIES } from '@/constants/categories'

function normalizeUsers(raw) {
  const obj = raw || {}
  return Object.entries(obj).map(([uid, v]) => ({ uid, ...(v || {}) }))
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
          const cats = Array.isArray(u.profCategorias) ? u.profCategorias : []
          if (!cats.includes(categoriaId)) return false
        }

        if (!t) return true
        const nome = String(u.nome || u.profile?.nome || '').toLowerCase()
        const resumo = String(u.profResumo || '').toLowerCase()
        const cidade = String(u.profCidadeAtende || u.cidade || '').toLowerCase()
        return nome.includes(t) || resumo.includes(t) || cidade.includes(t)
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
    'bg-white/10 backdrop-blur-md border border-white/10 shadow-xl shadow-black/30'

  return (
    <div className={`rounded-2xl overflow-hidden ${glass}`}>
      <div className="px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="text-sm font-semibold text-gray-100">
          {mode === 'corre' ? '⚡ Corre disponíveis' : mode === 'ambos' ? '🧭 Corre + Profissionais' : '🧑‍🔧 Profissionais'}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          {categoriaLabel ? <>Filtro: <b className="text-gray-200">{categoriaLabel}</b></> : 'Escolha uma categoria para refinar.'}
          {' '}· {filtrados.length} encontrados
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="text-sm text-gray-300">Carregando…</div>
        ) : filtrados.length === 0 ? (
          <div className="rounded-2xl p-4 bg-white/5 border border-white/10 text-gray-200">
            <div className="font-semibold text-gray-100">Nada encontrado</div>
            <div className="text-xs text-gray-400 mt-1">
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
