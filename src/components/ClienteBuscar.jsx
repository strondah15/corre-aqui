'use client'

import { useMemo, useState } from 'react'
import ListaProfissionais from './ListaProfissionais'
import { CATEGORIES } from '@/constants/categories'

export default function ClienteBuscar({ initialMode = 'profissional', onAbrirPerfil }) {
  const [mode, setMode] = useState(initialMode) // profissional | corre | ambos
  const [categoriaId, setCategoriaId] = useState('')
  const [search, setSearch] = useState('')

  const chips = useMemo(
    () => [
      { id: 'profissional', label: 'Profissional', icon: '🧑‍🔧' },
      { id: 'corre', label: 'Corre', icon: '⚡' },
      { id: 'ambos', label: 'Ambos', icon: '🧭' },
    ],
    []
  )

  return (
    <div className="mx-auto w-full max-w-[820px] px-3 pb-28">
      <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[#07111f]/88 p-3 text-white shadow-[0_22px_70px_rgba(0,0,0,0.28)] backdrop-blur-2xl md:p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_90%_0%,rgba(255,217,26,0.14),transparent_32%)]" />

        <div className="relative">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">Busca inteligente</div>
          <div className="mt-1 text-xl font-black text-white">Buscar ajuda</div>
          <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-400 md:text-sm">
            Encontre profissionais, corres rápidos ou os dois em uma busca compacta.
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-3 gap-2 rounded-[18px] border border-white/10 bg-white/[0.045] p-1.5">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setMode(c.id)}
              className={[
                'h-11 rounded-[14px] text-xs font-black transition active:scale-[0.98] md:h-12 md:text-sm',
                mode === c.id
                  ? 'bg-[#ffd91a] text-blue-950 shadow-[0_10px_24px_rgba(250,204,21,0.2)]'
                  : 'text-slate-300 hover:bg-white/[0.07]',
              ].join(' ')}
            >
              <span className="mr-1">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.07] px-3 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-cyan-400/35"
          >
            <option value="" className="text-black">
              (Todas as categorias)
            </option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id} className="text-black">
                {c.emoji} {c.label}
              </option>
            ))}
          </select>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome, cidade ou palavra-chave..."
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.07] px-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400/35"
          />
        </div>
      </div>

      <div className="mt-3">
        <ListaProfissionais
          mode={mode}
          categoriaId={categoriaId}
          search={search}
          onAbrirPerfil={onAbrirPerfil}
        />
      </div>
    </div>
  )
}
