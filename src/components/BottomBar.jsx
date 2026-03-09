'use client'

import React from 'react'

/**
 * BottomBar (Pirâmide)
 * - modoApp: 'cliente' | 'corre'
 * - active: id da aba
 * - onTab: callback(id)
 * - unreadCount: número de não lidas
 * - hidden: esconde quando o mapa/modal estiver aberto (não ficar na frente)
 */
export default function BottomBar({ active, onTab, unreadCount = 0, hidden = false, modoApp = 'cliente' }) {
  if (hidden) return null

  const isCliente = modoApp === 'cliente'

  const leftTop = isCliente
    ? { id: 'cliente', label: 'Pedir', icon: '🧭' }
    : { id: 'corre', label: 'Trabalhos', icon: '🎯' }

  const leftBottom = { id: 'inbox', label: 'Inbox', icon: '💬' }
  const rightTop = { id: 'aovivo', label: 'Mapa', icon: '🗺️' }
  const rightBottom = { id: 'perfil', label: 'Perfil', icon: '👤' }

  const center = isCliente
    ? { id: 'criar', label: 'Criar', icon: '➕' }
    : { id: 'criar', label: 'Disponível', icon: '🟢' }

  const btn = (item, extra = '') => {
    const isActive = active === item.id
    return (
      <button
        type="button"
        onClick={() => onTab?.(item.id)}
        className={[
          'w-[92px] h-[54px] rounded-2xl border text-white flex items-center justify-center gap-2 transition',
          'active:scale-[0.98]',
          isActive ? 'bg-white text-black border-white' : 'bg-white/10 border-white/10 hover:bg-white/15',
          extra,
        ].join(' ')}
        aria-pressed={isActive}
      >
        <span className="text-lg">{item.icon}</span>
        <span className="text-[12px] font-semibold">{item.label}</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9998]">
      <div className="relative w-[340px]">
        {/* coluna esquerda */}
        <div className="absolute left-0 bottom-0 flex flex-col gap-2">
          {btn(leftTop)}
          {btn(leftBottom)}
        </div>

        {/* coluna direita */}
        <div className="absolute right-0 bottom-0 flex flex-col gap-2">
          {btn(rightTop)}
          {btn(rightBottom)}
        </div>

        {/* centro (topo da pirâmide) */}
        <div className="mx-auto w-[140px]">
          <button
            type="button"
            onClick={() => onTab?.(center.id)}
            className={[
              'w-full h-[64px] rounded-3xl border text-white flex flex-col items-center justify-center gap-1 transition',
              'active:scale-[0.98] shadow-2xl shadow-black/40',
              'bg-gradient-to-b from-white/20 to-white/5 border-white/10 hover:from-white/25',
              active === center.id ? 'ring-2 ring-white/50' : '',
            ].join(' ')}
          >
            <div className="text-2xl">{center.icon}</div>
            <div className="text-[12px] font-extrabold tracking-wide">{center.label}</div>
          </button>
        </div>

        {/* badge inbox */}
        {unreadCount > 0 && (
          <div className="absolute left-[92px] bottom-[56px]">
            <div className="min-w-[22px] h-[22px] px-1 rounded-full bg-amber-400 text-black text-[12px] font-extrabold flex items-center justify-center border border-amber-200 shadow">
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
