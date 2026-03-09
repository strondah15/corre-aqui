'use client'
import React from 'react'

export default function ListaFlutuante({
  open = false,            // 👈 nova prop
  usuarios = [],
  onFechar = () => {},
  buscarUsuario = () => {},
  busca = '',
  setBusca = () => {},
}) {
  const lista = Array.isArray(usuarios) ? usuarios : []

  // não renderiza quando fechado (evita véu escuro sobre o mapa)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1500] bg-black/10 flex items-center justify-center">
      <div className="bg-white w-[92%] max-w-[520px] rounded-2xl shadow-2xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Usuários online</h3>
          <button
            onClick={onFechar}
            className="text-gray-500 hover:text-gray-700 text-xl"
            title="Fechar"
          >
            ×
          </button>
        </div>

        {/* Busca */}
        <div className="px-4 py-3 flex gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="🔍 Buscar nome ou ID"
            className="flex-1 px-3 py-2 border rounded-lg text-sm"
          />
          <button
            onClick={buscarUsuario}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm"
          >
            Buscar
          </button>
        </div>

        {/* Lista */}
        <div className="max-h-[50vh] overflow-y-auto px-4 pb-4">
          {lista.length === 0 ? (
            <p className="text-sm text-gray-500">Ninguém online agora.</p>
          ) : (
            <ul className="space-y-2">
              {lista.map((u) => (
                <li
                  key={u.id || u.idUnico}
                  className="p-3 rounded-lg border flex items-center justify-between"
                >
                  <div className="text-sm">
                    <div className="font-medium text-gray-800">
                      {u.nome || 'Sem nome'}
                    </div>
                    <div className="text-gray-500">
                      ID: {u.idUnico || '—'}
                    </div>
                    {u.local?.lat && u.local?.lng && (
                      <div className="text-gray-400 text-xs mt-1">
                        lat: {u.local.lat} • lng: {u.local.lng}
                      </div>
                    )}
                  </div>
                  {/* Botão de ação (opcional: centralizar no mapa pelo buscarUsuario via busca) */}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
