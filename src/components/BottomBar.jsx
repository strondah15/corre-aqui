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
          'relative h-9 min-w-0 rounded-[14px] px-1 text-[10px] font-black transition border md:h-12 md:rounded-2xl md:px-2 md:text-xs sm:px-3',
          'flex items-center justify-center gap-1 sm:gap-2',
          selected
            ? 'bg-white text-slate-950 border-white shadow-[0_12px_28px_rgba(255,255,255,0.14)]'
            : 'bg-white/[0.055] text-slate-300 border-white/10 hover:bg-white/[0.1] hover:text-white',
        ].join(' ')}
        aria-pressed={selected}
      >
        <span className="text-sm leading-none md:text-base">{item.icon}</span>
        <span className="hidden sm:inline">{item.label}</span>
        {item.count > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-slate-950 md:h-5 md:min-w-5 md:text-[10px]">
            {item.count > 99 ? '99+' : item.count}
          </span>
        ) : null}
      </motion.button>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.35rem)] z-[9998] px-2 md:inset-x-auto md:right-6 md:bottom-6 md:px-0">
      <div className="mx-auto flex w-full max-w-[360px] items-center gap-1 rounded-[20px] border border-white/10 bg-slate-950/92 p-1 shadow-[0_18px_54px_rgba(0,0,0,0.34)] backdrop-blur-xl md:max-w-[430px] md:gap-1.5 md:rounded-[24px] md:p-1.5 sm:gap-2 sm:rounded-[26px] sm:p-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => onTab?.('disponivel')}
          className={[
            'h-9 min-w-[78px] rounded-[14px] px-2 text-left text-white transition border shadow-[0_12px_28px_rgba(16,185,129,0.18)] md:h-12 md:min-w-[104px] md:rounded-2xl md:px-2.5 sm:min-w-[132px] sm:px-4',
            disponivel
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 border-emerald-300/70'
              : 'bg-gradient-to-r from-rose-500 to-red-700 border-rose-300/70',
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
            <span className="text-[10px] font-black md:text-xs sm:text-sm">{disponivel ? 'Disponível' : 'Indisponível'}</span>
          </div>
          <div className="mt-0.5 hidden text-[10px] font-bold text-white/75 sm:block">
            {disponivel ? 'visível para clientes' : 'oculto agora'}
          </div>
        </motion.button>

        <div className="grid flex-1 grid-cols-4 gap-1 md:gap-1.5">
          {navItems.map(navButton)}
        </div>
      </div>
    </div>
  )
}
