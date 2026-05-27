'use client'

import { motion } from 'framer-motion'

export default function BottomBar({
  active,
  onTab,
  unreadCount = 0,
  agendaCount = 0,
  agendaConfirmados = 0,
  agendaRecusados = 0,
  problemasCount = 0,
  hidden = false,
  modoApp = 'corre',
  disponivel = true,
  collapsed = false,
}) {
  if (hidden) return null
  if (modoApp !== 'corre') return null

  const totalAgenda = Number(agendaCount || 0) + Number(agendaConfirmados || 0) + Number(agendaRecusados || 0)

  const navItems = [
    { id: 'corre', label: 'Trabalhos', icon: '🎯', count: 0 },
    { id: 'inbox', label: 'Inbox', icon: '💬', count: unreadCount },
    { id: 'agenda', label: 'Agenda', icon: '📅', count: totalAgenda },
    { id: 'seguranca', label: 'Segurança', icon: '🛡️', count: problemasCount },
  ]

  const navButton = (item) => {
    const selected = active === item.id

    return (
      <motion.button
        key={item.id}
        type="button"
        whileTap={{ scale: 0.96 }}
        onClick={() => onTab?.(item.id)}
        title={item.label}
        className={[
          'relative h-12 min-w-0 rounded-2xl px-1 text-[10px] font-black transition-all duration-200 active:scale-[0.96] md:h-12 md:rounded-2xl md:px-2 md:text-xs',
          'flex flex-col items-center justify-center gap-0.5',
          selected
            ? 'bg-[#ffd91a] text-blue-950 shadow-[0_10px_24px_rgba(250,204,21,0.24)]'
            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950',
        ].join(' ')}
        aria-pressed={selected}
      >
        <span className="text-xl leading-none">{item.icon}</span>
        <span className="hidden leading-none min-[380px]:inline md:inline">{item.label}</span>
        {item.count > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-white md:h-6 md:min-w-6 md:text-[11px]">
            {item.count > 99 ? '99+' : item.count}
          </span>
        ) : null}
      </motion.button>
    )
  }

  return (
    <div
      className={[
        'fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.45rem)] z-[9998] px-3 transition-all duration-300 ease-out will-change-transform md:inset-x-auto md:right-6 md:bottom-6 md:px-0',
        collapsed ? 'translate-y-[135%] opacity-0 pointer-events-none' : 'translate-y-0 opacity-100',
      ].join(' ')}
    >
      <div className="mx-auto flex h-[70px] w-full max-w-[390px] items-center justify-between rounded-full border border-slate-200 bg-white px-3 text-slate-950 shadow-[0_18px_58px_rgba(15,23,42,0.24)] backdrop-blur-xl md:max-w-[460px] md:px-4">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => onTab?.('disponivel')}
          className={[
            'h-12 min-w-[106px] rounded-full border px-3 text-left text-white shadow-[0_14px_30px_rgba(16,185,129,0.18)] transition md:min-w-[142px] md:px-4',
            disponivel
              ? 'border-emerald-300/70 bg-gradient-to-r from-emerald-500 to-teal-600'
              : 'border-rose-300/70 bg-gradient-to-r from-rose-500 to-red-700',
          ].join(' ')}
          aria-pressed={disponivel}
          title={disponivel ? 'Ficar indisponível' : 'Ficar disponível'}
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={[
                'h-2 w-2 rounded-full ring-[3px] ring-white/18 md:h-2.5 md:w-2.5 md:ring-4',
                disponivel ? 'bg-emerald-100 animate-pulse' : 'bg-rose-100',
              ].join(' ')}
            />
            <span className="text-[11px] font-black md:text-xs sm:text-sm">{disponivel ? 'Disponível' : 'Indisponível'}</span>
          </div>
          <div className="mt-0.5 hidden text-[10px] font-bold text-white/75 md:block">
            {disponivel ? 'visível para clientes' : 'oculto agora'}
          </div>
        </motion.button>

        <div className="grid flex-1 grid-cols-4 gap-1">
          {navItems.map(navButton)}
        </div>
      </div>
    </div>
  )
}
