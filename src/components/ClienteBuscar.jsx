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
      { id: 'profissional', label: '🧑‍🔧 Profissional' },
      { id: 'corre', label: '⚡ Corre' },
      { id: 'ambos', label: '🧭 Ambos' },
    ],
    []
  )

  const glass =
    'bg-white/10 backdrop-blur-md border border-white/10 shadow-xl shadow-black/30'

  const chipBase =
    'px-3 py-2 rounded-2xl text-sm font-semibold border transition active:scale-[0.98]'
  const chipOn = 'bg-white text-black border-white'
  const chipOff = 'bg-white/10 text-gray-100 border-white/10 hover:bg-white/15'

  return (
    <div className="w-full max-w-[760px] mx-auto px-3 pb-28">
      <div className={`rounded-2xl p-4 ${glass}`}>
        <div className="text-lg font-bold text-gray-100">Buscar ajuda</div>
        <div className="text-xs text-gray-400 mt-1">
          Você procura um <b className="text-gray-200">profissional</b> (por categoria) ou um <b className="text-gray-200">corre</b> (bicos rápidos).
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setMode(c.id)}
              className={`${chipBase} ${mode === c.id ? chipOn : chipOff}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={categoriaId}
            onChange={(e) => setCategoriaId(e.target.value)}
            className="w-full px-3 py-3 rounded-2xl bg-white/10 border border-white/10 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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
            placeholder="🔍 Nome / cidade / palavra-chave…"
            className="w-full px-3 py-3 rounded-2xl bg-white/10 border border-white/10 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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
