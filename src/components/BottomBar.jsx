'use client'

import React from 'react'

/**
 * BottomBar do Corre/Profissional
 * - Esse menu é usado somente no modo corre/profissional.
 * - Sem botão de mapa: o mapa ao vivo já fica no topo.
 * - Ação principal: Disponível / Indisponível.
 */
export default function BottomBar({
  active,
  onTab,
  unreadCount = 0,
  hidden = false,
  modoApp = 'corre',
  disponivel = true,
}) {
  if (hidden) return null
  if (modoApp !== 'corre') return null

  const itemBase =
    'h-[58px] rounded-[24px] border flex items-center justify-center gap-2 transition active:scale-[0.98] backdrop-blur-xl shadow-[0_16px_45px_rgba(0,0,0,0.22)]'

  const itemInactive =
    'bg-slate-900/78 text-white border-white/10 hover:bg-slate-800/90'

  const itemActive =
    'bg-white text-slate-950 border-white'

  const smallBtn = (item, extra = '') => {
    const isActive = active === item.id

    return (
      <button
        type="button"
        onClick={() => onTab?.(item.id)}
        className={[
          itemBase,
          'px-4 min-w-[96px]',
          isActive ? itemActive : itemInactive,
          extra,
        ].join(' ')}
        aria-pressed={isActive}
      >
        <span className="text-lg">{item.icon}</span>
        <span className="text-[12px] font-extrabold">{item.label}</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9998] w-[min(94vw,460px)]">
      <div className="rounded-[32px] bg-slate-950/55 border border-white/10 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.35)] p-2">
        <div className="grid grid-cols-[1fr_1.45fr_1fr] gap-2 items-stretch">
          {/* esquerda */}
          <div className="grid grid-rows-2 gap-2">
            {smallBtn({ id: 'corre', label: 'Trabalhos', icon: '🎯' })}
            <div className="relative">
              {smallBtn({ id: 'inbox', label: 'Inbox', icon: '💬' }, 'w-full')}
              {unreadCount > 0 && (
                <div className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-amber-400 text-black text-[12px] font-extrabold flex items-center justify-center border border-amber-200 shadow">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
            </div>
          </div>

          {/* centro principal */}
          <button
            type="button"
            onClick={() => onTab?.('disponivel')}
            className={[
              'min-h-[124px] rounded-[30px] border text-white flex flex-col items-center justify-center gap-2 transition active:scale-[0.98]',
              'shadow-[0_22px_70px_rgba(0,0,0,0.30)]',
              disponivel
                ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 border-emerald-300/50 hover:from-emerald-300'
                : 'bg-gradient-to-b from-rose-500 to-red-700 border-rose-300/40 hover:from-rose-400',
            ].join(' ')}
            aria-pressed={disponivel}
            title={disponivel ? 'Clique para ficar indisponível' : 'Clique para ficar disponível'}
          >
            <span
              className={[
                'w-10 h-10 rounded-full shadow-[0_0_0_8px_rgba(255,255,255,0.14)]',
                disponivel ? 'bg-emerald-200 animate-pulse' : 'bg-rose-200',
              ].join(' ')}
            />
            <span className="text-[15px] font-black tracking-wide">
              {disponivel ? 'Disponível' : 'Indisponível'}
            </span>
            <span className="text-[10px] font-bold text-white/75">
              {disponivel ? 'clientes podem te ver' : 'oculto agora'}
            </span>
          </button>

          {/* direita */}
          <div className="grid grid-rows-2 gap-2">
            {smallBtn({ id: 'perfil', label: 'Perfil', icon: '👤' })}
            <button
              type="button"
              onClick={() => onTab?.('disponivel')}
              className={[
                itemBase,
                'px-3 text-[12px] font-extrabold',
                disponivel
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200',
              ].join(' ')}
            >
              {disponivel ? '🟢 Online' : '🔴 Offline'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
