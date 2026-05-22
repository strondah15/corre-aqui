'use client'

const STEP_LABELS = ['Aberto', 'Aceito', 'Concluído', 'Avaliado']

function getFluxoState(pedido) {
  const status = String(pedido?.status || 'aberto').toLowerCase()
  const avaliado = !!pedido?.avaliacao?.nota || !!pedido?.avaliacao
  const problema = !!pedido?.problemaServico

  if (status === 'cancelado') {
    return {
      activeStep: 0,
      problema,
      cancelado: true,
      resumo: 'Pedido cancelado',
    }
  }

  if (status === 'concluido') {
    return {
      activeStep: avaliado ? 3 : 2,
      problema,
      cancelado: false,
      resumo: avaliado ? 'Serviço avaliado' : 'Aguardando avaliação',
    }
  }

  if (status === 'aceito') {
    return {
      activeStep: 1,
      problema,
      cancelado: false,
      resumo: 'Serviço em andamento',
    }
  }

  return {
    activeStep: 0,
    problema,
    cancelado: false,
    resumo: 'Aguardando aceite',
  }
}

export default function StatusFluxoServico({
  pedido,
  tone = 'light',
  compact = false,
  className = '',
}) {
  const { activeStep, problema, cancelado, resumo } = getFluxoState(pedido)
  const dark = tone === 'dark'

  const shell = dark
    ? 'border-white/10 bg-white/[0.045] text-slate-100'
    : 'border-slate-200 bg-white/85 text-slate-800'
  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const rail = dark ? 'bg-white/10' : 'bg-slate-200'
  const railActive = problema
    ? 'bg-red-400'
    : cancelado
      ? 'bg-slate-500'
      : 'bg-emerald-400'

  return (
    <div className={[`rounded-2xl border ${shell}`, compact ? 'px-3 py-2' : 'p-4', className].join(' ')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-400">
          Status do serviço
        </div>
        <div
          className={[
            'rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]',
            problema
              ? 'border border-red-300/35 bg-red-500/15 text-red-300'
              : cancelado
                ? 'border border-slate-300/25 bg-slate-500/15 text-slate-300'
                : 'border border-emerald-300/35 bg-emerald-500/15 text-emerald-300',
          ].join(' ')}
        >
          {problema ? 'Problema' : resumo}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {STEP_LABELS.map((label, index) => {
          const done = !cancelado && index <= activeStep
          const current = !cancelado && index === activeStep

          return (
            <div key={label} className="min-w-0">
              <div className="flex items-center gap-1.5">
                <div
                  className={[
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black shadow-sm',
                    done
                      ? problema
                        ? 'bg-red-500 text-white'
                        : 'bg-emerald-500 text-white'
                      : dark
                        ? 'bg-white/10 text-slate-500'
                        : 'bg-slate-100 text-slate-400',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {done ? '✓' : index + 1}
                </div>
                {index < STEP_LABELS.length - 1 ? (
                  <div className={`h-1 min-w-0 flex-1 rounded-full ${done ? railActive : rail}`} />
                ) : null}
              </div>
              <div
                className={[
                  'mt-1 truncate text-[10px] font-black uppercase tracking-[0.08em]',
                  current ? (problema ? 'text-red-300' : 'text-emerald-300') : muted,
                ].join(' ')}
              >
                {label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
