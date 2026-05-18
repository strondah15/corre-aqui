'use client'

import { motion } from 'framer-motion'

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

  const totalAgenda = Number(agendaCount || 0) + Number(agendaConfirmados || 0) + Number(agendaRecusados || 0)

  const navItems = [
    { id: 'corre', label: 'Trabalhos', icon: '🎯', count: 0 },
    { id: 'inbox', label: 'Inbox', icon: '💬', count: unreadCount },
    { id: 'agenda', label: 'Agenda', icon: '📅', count: totalAgenda },
  ]

  const navButton = (item) => {
    const selected = active === item.id

    return (
      <motion.button
        key={item.id}
        type="button"
        whileTap={{ scale: 0.96 }}
        onClick={() => onTab?.(item.id)}
        className={[
          'relative h-12 min-w-0 rounded-2xl px-2 sm:px-3 text-xs font-black transition border',
          'flex items-center justify-center gap-2',
          selected
            ? 'bg-slate-950 text-white border-slate-950 shadow-[0_12px_28px_rgba(15,23,42,0.24)]'
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
        ].join(' ')}
        aria-pressed={selected}
      >
        <span className="text-base leading-none">{item.icon}</span>
        <span>{item.label}</span>
        {item.count > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white ring-2 ring-white">
            {item.count > 99 ? '99+' : item.count}
          </span>
        ) : null}
      </motion.button>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-3 z-[9998] px-3 md:inset-x-auto md:right-6 md:bottom-6 md:px-0">
      <div className="mx-auto flex w-full max-w-[520px] items-center gap-2 rounded-[26px] border border-slate-200 bg-white/94 p-2 shadow-[0_24px_80px_rgba(15,23,42,0.26)] backdrop-blur-xl md:max-w-none">
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => onTab?.('disponivel')}
          className={[
            'h-12 min-w-[112px] sm:min-w-[132px] rounded-2xl px-3 sm:px-4 text-left text-white transition border shadow-[0_14px_34px_rgba(16,185,129,0.22)]',
            disponivel
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 border-emerald-300/70'
              : 'bg-gradient-to-r from-rose-500 to-red-700 border-rose-300/70',
          ].join(' ')}
          aria-pressed={disponivel}
          title={disponivel ? 'Ficar indisponível' : 'Ficar disponível'}
        >
          <div className="flex items-center gap-2">
            <span
              className={[
                'h-2.5 w-2.5 rounded-full ring-4 ring-white/18',
                disponivel ? 'bg-emerald-100 animate-pulse' : 'bg-rose-100',
              ].join(' ')}
            />
            <span className="text-sm font-black">{disponivel ? 'Disponível' : 'Indisponível'}</span>
          </div>
          <div className="mt-0.5 text-[10px] font-bold text-white/75">
            {disponivel ? 'visível para clientes' : 'oculto agora'}
          </div>
        </motion.button>

        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {navItems.map(navButton)}
        </div>
      </div>
    </div>
  )
}
