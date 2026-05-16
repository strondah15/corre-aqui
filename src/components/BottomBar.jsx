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
    'h-[40px] md:h-[60px] rounded-[16px] md:rounded-[24px] border flex items-center justify-center gap-1.5 md:gap-2 transition-all duration-300-all duration-200 active:scale-[0.97] shadow-[0_12px_34px_rgba(15,23,42,0.18)]'

  const itemInactive =
    'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-950'

  const itemActive =
    'bg-slate-950 text-white border-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.24)]'

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
          'px-1.5 md:px-4 min-w-[68px] md:min-w-[96px]',
          isActive ? itemActive : itemInactive,
          extra,
        ].join(' ')}
        aria-pressed={isActive}
      >
        <span className="text-[10px] md:text-lg">{item.icon}</span>
        <span className="text-[8px] md:text-[12px] font-extrabold leading-none">{item.label}</span>
      </motion.button>
    )
  }

  return (
    <div className="fixed bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-[9998] w-[min(96vw,460px)] md:w-[min(92vw,560px)]">
      <div className="rounded-[24px] md:rounded-[34px] bg-white border border-slate-200 shadow-[0_22px_70px_rgba(15,23,42,0.22)] p-1.5 md:p-2">
        <div className="grid grid-cols-[1fr_1.25fr_1fr] md:grid-cols-[1fr_1.45fr_1fr] gap-1 md:gap-2 items-stretch">
          {/* esquerda */}
          <div className="grid grid-rows-3 gap-1.5 md:gap-2">
            {smallBtn({ id: 'corre', label: 'Trabalhos', icon: '🎯' })}
            <div className="relative">
              {smallBtn({ id: 'inbox', label: 'Inbox', icon: '💬' }, 'w-full')}
              {unreadCount > 0 && (
                <div className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-amber-400 text-black text-[12px] font-extrabold flex items-center justify-center border border-amber-200 shadow">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
            </div>
            <div className="relative">
              {smallBtn({ id: 'agenda', label: 'Agenda', icon: '📅' }, 'w-full')}
              {agendaCount > 0 && (
                <div className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-red-500 text-white text-[12px] font-extrabold flex items-center justify-center border border-red-200 shadow">
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
              'min-h-[72px] md:min-h-[184px] rounded-[18px] md:rounded-[30px] border text-white flex flex-col items-center justify-center gap-1.5 md:gap-2 transition-all duration-300-all duration-200 active:scale-[0.98]',
              'shadow-[0_22px_60px_rgba(16,185,129,0.28)]',
              disponivel
                ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 border-emerald-300/50 hover:from-emerald-300'
                : 'bg-gradient-to-b from-rose-500 to-red-700 border-rose-300/40 hover:from-rose-400',
            ].join(' ')}
            aria-pressed={disponivel}
            title={disponivel ? 'Clique para ficar indisponível' : 'Clique para ficar disponível'}
          >
            <span
              className={[
                'w-5 h-5 md:w-10 md:h-10 rounded-full shadow-[0_0_0_8px_rgba(255,255,255,0.14)]',
                disponivel ? 'bg-emerald-200 animate-pulse' : 'bg-rose-200',
              ].join(' ')}
            />
            <span className="text-[10px] md:text-[15px] font-black tracking-wide leading-none">
              {disponivel ? 'Disponível' : 'Indisponível'}
            </span>
            <span className="hidden md:block text-[10px] font-bold text-white/75 text-center leading-tight">
              {disponivel ? '{typeof window !== "undefined" && window.innerWidth < 768 ? "" : "clientes podem te ver"}' : 'oculto agora'}
            </span>
          </motion.button>

          {/* direita: agenda resumida */}
          <div className="rounded-[16px] border border-slate-200 bg-white/95 backdrop-blur-md p-1.5 md:p-3 shadow-[0_12px_34px_rgba(15,23,42,0.10)] flex flex-col justify-between">
            <button
              type="button"
              onClick={() => onTab?.('agenda')}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-6 w-6 md:h-10 md:w-10 rounded-lg md:rounded-2xl bg-violet-100 border border-violet-200 flex items-center justify-center text-xl shrink-0">
                  📅
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] md:text-base font-black text-slate-950 leading-none">Agenda</div>
                  <div className="hidden md:block mt-0.5 text-[11px] font-bold text-slate-500 leading-none">Resumo</div>
                </div>
              </div>
              <div className="text-slate-400 text-xl">›</div>
            </button>

            <div className="mt-1 space-y-1">
              <button
                type="button"
                onClick={() => onTab?.('agenda')}
                className="w-full rounded-2xl bg-orange-50 border border-orange-100 px-1 py-0.5 md:px-2.5 md:py-1.5 flex items-center justify-between gap-2"
                title="Pendentes"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm">🕒</span>
                  <span className="text-[8px] md:text-[11px] font-black text-orange-800 truncate">Pendentes</span>
                </span>
                <span className="min-w-[16px] h-4 md:min-w-[24px] md:h-6 px-1.5 rounded-full bg-orange-500 text-white text-[8px] md:text-xs font-black flex items-center justify-center">
                  {agendaCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTab?.('agenda')}
                className="w-full rounded-2xl bg-emerald-50 border border-emerald-100 px-1 py-0.5 md:px-2.5 md:py-1.5 flex items-center justify-between gap-2"
                title="Confirmados"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm">✅</span>
                  <span className="text-[8px] md:text-[11px] font-black text-emerald-800 truncate">Confirmado</span>
                </span>
                <span className="min-w-[16px] h-4 md:min-w-[24px] md:h-6 px-1.5 rounded-full bg-emerald-500 text-white text-[8px] md:text-xs font-black flex items-center justify-center">
                  {agendaConfirmados}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTab?.('agenda')}
                className="w-full rounded-2xl bg-rose-50 border border-rose-100 px-1 py-0.5 md:px-2.5 md:py-1.5 flex items-center justify-between gap-2"
                title="Recusados"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm">❌</span>
                  <span className="text-[8px] md:text-[11px] font-black text-rose-800 truncate">Recusado</span>
                </span>
                <span className="min-w-[16px] h-4 md:min-w-[24px] md:h-6 px-1.5 rounded-full bg-rose-500 text-white text-[8px] md:text-xs font-black flex items-center justify-center">
                  {agendaRecusados}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onTab?.('agenda')}
              className="mt-2 md:mt-3 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-2 text-[8px] md:text-xs font-black text-white shadow-[0_8px_24px_rgba(139,92,246,0.22)]"
            >
              Abrir agenda
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
