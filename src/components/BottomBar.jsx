'use client'

import React from 'react'
import { motion } from 'framer-motion'

/**
 * BottomBar do Corre/Profissional
 * - Esse menu é usado somente no modo corre/profissional.
 * - Sem botão de mapa: o mapa ao vivo já fica no topo.
 * - Ação principal: Disponível / Indisponível.
 * - Perfil/configurações agora ficam na tela inicial de escolha do modo.
 */
export default function BottomBar({
  active,
  onTab,
  unreadCount = 0,
  agendaCount = 0,
  agendaConfirmados = 0,
  agendaRecusados = 0,
  hidden = false,
  modoApp = 'corre',
  disponivel = true,
}) {
  if (hidden) return null
  if (modoApp !== 'corre') return null

  const itemBase =
    'h-[30px] md:h-[60px] rounded-[13px] md:rounded-[24px] border flex items-center justify-center gap-1 md:gap-2 transition-all duration-200 active:scale-[0.96] shadow-[0_8px_22px_rgba(0,0,0,0.24)] md:shadow-[0_12px_34px_rgba(15,23,42,0.18)]'

  const itemInactive =
    'bg-white/[0.07] md:bg-white text-white/78 md:text-slate-700 border-white/10 md:border-slate-200 hover:bg-white/[0.11] md:hover:bg-slate-50 hover:text-white md:hover:text-slate-950'

  const itemActive =
    'bg-gradient-to-r from-blue-500 to-violet-500 text-white border-blue-300/35 shadow-[0_10px_28px_rgba(59,130,246,0.34),0_0_22px_rgba(139,92,246,0.22)] md:bg-slate-950 md:bg-none md:border-slate-950 md:shadow-[0_12px_30px_rgba(15,23,42,0.24)]'

  const smallBtn = (item, extra = '') => {
    const isActive = active === item.id

    return (
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        whileHover={{ y: -2 }}
        onClick={() => onTab?.(item.id)}
        className={[
          itemBase,
          'px-2 md:px-4 min-w-[58px] md:min-w-[96px]',
          isActive ? itemActive : itemInactive,
          extra,
        ].join(' ')}
        aria-pressed={isActive}
      >
        <span className="text-[11px] md:text-lg leading-none">{item.icon}</span>
        <span className="text-[8px] md:text-[12px] font-extrabold leading-none tracking-[0.01em]">{item.label}</span>
      </motion.button>
    )
  }

  return (
    <div className="fixed bottom-3 md:bottom-6 left-1/2 -translate-x-1/2 z-[9998] w-[min(93vw,348px)] md:w-[min(92vw,560px)]">
      <div className="rounded-[22px] md:rounded-[34px] bg-[#07111f]/78 md:bg-white border border-white/12 md:border-slate-200 shadow-[0_18px_54px_rgba(0,0,0,0.46),0_0_34px_rgba(37,99,235,0.14)] md:shadow-[0_22px_70px_rgba(15,23,42,0.22)] p-1.5 md:p-2 backdrop-blur-2xl md:backdrop-blur-none">
        <div className="grid grid-cols-[0.82fr_0.9fr_0.9fr] md:grid-cols-[1fr_1.45fr_1fr] gap-1.5 md:gap-2 items-stretch">
          {/* esquerda */}
          <div className="grid grid-rows-3 gap-1 md:gap-2">
            {smallBtn({ id: 'corre', label: 'Trabalhos', icon: '🎯' })}
            <div className="relative">
              {smallBtn({ id: 'inbox', label: 'Inbox', icon: '💬' }, 'w-full')}
              {unreadCount > 0 && (
                <div className="absolute -top-1 -right-1 min-w-[18px] md:min-w-[22px] h-[18px] md:h-[22px] px-1 rounded-full bg-amber-400 text-black text-[10px] md:text-[12px] font-extrabold flex items-center justify-center border border-amber-200 shadow">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
            </div>
            <div className="relative">
              {smallBtn({ id: 'agenda', label: 'Agenda', icon: '📅' }, 'w-full')}
              {agendaCount > 0 && (
                <div className="absolute -top-1 -right-1 min-w-[18px] md:min-w-[22px] h-[18px] md:h-[22px] px-1 rounded-full bg-red-500 text-white text-[10px] md:text-[12px] font-extrabold flex items-center justify-center border border-red-200 shadow">
                  {agendaCount > 99 ? '99+' : agendaCount}
                </div>
              )}
            </div>
          </div>

          {/* centro principal */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -2 }}
            onClick={() => onTab?.('disponivel')}
            className={[
              'min-h-[92px] md:min-h-[184px] rounded-[17px] md:rounded-[30px] border text-white flex flex-col items-center justify-center gap-1 md:gap-2 transition-all duration-200 active:scale-[0.98]',
              'shadow-[0_12px_30px_rgba(16,185,129,0.22)] md:shadow-[0_22px_60px_rgba(16,185,129,0.28)]',
              disponivel
                ? 'bg-gradient-to-b from-emerald-400/95 to-emerald-700 border-emerald-200/35 hover:from-emerald-300'
                : 'bg-gradient-to-b from-rose-500/95 to-red-800 border-rose-300/35 hover:from-rose-400',
            ].join(' ')}
            aria-pressed={disponivel}
            title={disponivel ? 'Clique para ficar indisponível' : 'Clique para ficar disponível'}
          >
            <span
              className={[
                'w-4 h-4 md:w-10 md:h-10 rounded-full shadow-[0_0_0_6px_rgba(255,255,255,0.12)] md:shadow-[0_0_0_8px_rgba(255,255,255,0.14)]',
                disponivel ? 'bg-emerald-200 animate-pulse' : 'bg-rose-200',
              ].join(' ')}
            />
            <span className="text-[10px] md:text-[15px] font-black leading-none">
              {disponivel ? 'Disponível' : 'Indisponível'}
            </span>
            <span className="hidden md:block text-[10px] font-bold text-white/75 text-center leading-tight">
              {disponivel ? 'clientes podem te ver' : 'oculto agora'}
            </span>
          </motion.button>

          {/* direita: agenda resumida */}
          <div className="rounded-[17px] md:rounded-[16px] border border-white/10 md:border-slate-200 bg-white/[0.06] md:bg-white/95 backdrop-blur-xl md:backdrop-blur-md p-1.5 md:p-3 shadow-[0_10px_26px_rgba(0,0,0,0.22)] md:shadow-[0_12px_34px_rgba(15,23,42,0.10)] flex flex-col justify-between">
            <button
              type="button"
              onClick={() => onTab?.('agenda')}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 md:h-10 md:w-10 rounded-xl md:rounded-2xl bg-violet-400/14 md:bg-violet-100 border border-violet-200/20 md:border-violet-200 flex items-center justify-center text-sm md:text-xl shrink-0 text-white md:text-slate-950">
                  📅
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] md:text-base font-black text-white md:text-slate-950 leading-none">Agenda</div>
                  <div className="hidden md:block mt-0.5 text-[11px] font-bold text-slate-500 leading-none">Resumo</div>
                </div>
              </div>
              <div className="text-white/35 md:text-slate-400 text-lg md:text-xl">›</div>
            </button>

            <div className="mt-1 space-y-0.5 md:space-y-1">
              <button
                type="button"
                onClick={() => onTab?.('agenda')}
                className="w-full rounded-xl md:rounded-2xl bg-orange-400/10 md:bg-orange-50 border border-orange-200/10 md:border-orange-100 px-1 py-0.5 md:px-2.5 md:py-1.5 flex items-center justify-between gap-1 md:gap-2"
                title="Pendentes"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="hidden md:inline text-sm">🕒</span>
                  <span className="text-[8px] md:text-[11px] font-black text-orange-100 md:text-orange-800 truncate">Pend.</span>
                </span>
                <span className="min-w-[16px] h-4 md:min-w-[24px] md:h-6 px-1.5 rounded-full bg-orange-500 text-white text-[8px] md:text-xs font-black flex items-center justify-center">
                  {agendaCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTab?.('agenda')}
                className="w-full rounded-xl md:rounded-2xl bg-emerald-400/10 md:bg-emerald-50 border border-emerald-200/10 md:border-emerald-100 px-1 py-0.5 md:px-2.5 md:py-1.5 flex items-center justify-between gap-1 md:gap-2"
                title="Confirmados"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="hidden md:inline text-sm">✅</span>
                  <span className="text-[8px] md:text-[11px] font-black text-emerald-100 md:text-emerald-800 truncate">Conf.</span>
                </span>
                <span className="min-w-[16px] h-4 md:min-w-[24px] md:h-6 px-1.5 rounded-full bg-emerald-500 text-white text-[8px] md:text-xs font-black flex items-center justify-center">
                  {agendaConfirmados}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTab?.('agenda')}
                className="w-full rounded-xl md:rounded-2xl bg-rose-400/10 md:bg-rose-50 border border-rose-200/10 md:border-rose-100 px-1 py-0.5 md:px-2.5 md:py-1.5 flex items-center justify-between gap-1 md:gap-2"
                title="Recusados"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="hidden md:inline text-sm">❌</span>
                  <span className="text-[8px] md:text-[11px] font-black text-rose-100 md:text-rose-800 truncate">Rec.</span>
                </span>
                <span className="min-w-[16px] h-4 md:min-w-[24px] md:h-6 px-1.5 rounded-full bg-rose-500 text-white text-[8px] md:text-xs font-black flex items-center justify-center">
                  {agendaRecusados}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onTab?.('agenda')}
              className="hidden md:block mt-2 md:mt-3 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-2 text-[8px] md:text-xs font-black text-white shadow-[0_8px_24px_rgba(139,92,246,0.22)]"
            >
              Abrir agenda
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
