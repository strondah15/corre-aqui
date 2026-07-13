'use client'

import { ATENDIMENTO_STATUS, getAtendimentoStep, normalizeAtendimentoStatus } from '@/lib/atendimento'

const STEP_LABELS = ['Aceito', 'Em andamento', 'Chegou', 'Finalizado']

function getFluxoState(pedido) {
  const status = normalizeAtendimentoStatus(pedido?.status)
  const avaliado = Boolean(pedido?.avaliacao?.nota || pedido?.avaliacao)
  const problema = Boolean(pedido?.problemaServico)

  if (status === ATENDIMENTO_STATUS.CANCELADO) {
    return { activeStep: -1, problema, cancelado: true, resumo: 'Pedido cancelado' }
  }

  if (status === ATENDIMENTO_STATUS.FINALIZADO) {
    return {
      activeStep: getAtendimentoStep(status),
      problema,
      cancelado: false,
      resumo: avaliado ? 'Servico avaliado' : 'Atendimento finalizado',
    }
  }

  if (status === ATENDIMENTO_STATUS.AGUARDANDO_CONFIRMACAO) {
    return { activeStep: getAtendimentoStep(status), problema, cancelado: false, resumo: 'Confirmacao pendente' }
  }

  if ([ATENDIMENTO_STATUS.ACEITO, ATENDIMENTO_STATUS.EM_ANDAMENTO, ATENDIMENTO_STATUS.CHEGOU].includes(status)) {
    const resumo = status === ATENDIMENTO_STATUS.ACEITO
      ? 'Servico aceito'
      : status === ATENDIMENTO_STATUS.CHEGOU
        ? 'Profissional chegou'
        : 'Atendimento em andamento'
    return { activeStep: getAtendimentoStep(status), problema, cancelado: false, resumo }
  }

  return { activeStep: -1, problema, cancelado: false, resumo: 'Aguardando aceite' }
}

export default function StatusFluxoServico({ pedido, tone = 'light', compact = false, className = '' }) {
  const { activeStep, problema, cancelado, resumo } = getFluxoState(pedido)
  const dark = tone === 'dark'
  const shell = dark ? 'border-white/10 bg-white/[0.045] text-slate-100' : 'border-slate-200 bg-white/85 text-slate-800'
  const muted = dark ? 'text-slate-400' : 'text-slate-500'
  const rail = dark ? 'bg-white/10' : 'bg-slate-200'
  const railActive = problema ? 'bg-red-400' : cancelado ? 'bg-slate-500' : 'bg-emerald-400'

  return (
    <div className={[`rounded-xl border md:rounded-2xl ${shell}`, compact ? 'px-2.5 py-1.5 md:px-3 md:py-2' : 'p-3 md:p-4', className].join(' ')}>
      <div className="mb-2 flex items-center justify-between gap-2 md:mb-3 md:gap-3">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-sky-400 md:text-[10px] md:tracking-[0.16em]">Status do servico</div>
        <div className={[
          'rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] md:px-2.5 md:py-1 md:text-[10px] md:tracking-[0.12em]',
          problema ? 'border border-red-300/35 bg-red-500/15 text-red-300' : cancelado ? 'border border-slate-300/25 bg-slate-500/15 text-slate-300' : 'border border-emerald-300/35 bg-emerald-500/15 text-emerald-300',
        ].join(' ')}>
          {problema ? 'Problema' : resumo}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 md:gap-2">
        {STEP_LABELS.map((label, index) => {
          const done = !cancelado && index <= activeStep
          const current = !cancelado && index === activeStep
          return (
            <div key={label} className="min-w-0">
              <div className="flex items-center gap-1 md:gap-1.5">
                <div className={[
                  'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black shadow-sm md:h-6 md:w-6 md:text-[11px]',
                  done ? (problema ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white') : dark ? 'bg-white/10 text-slate-500' : 'bg-slate-100 text-slate-400',
                ].join(' ')} aria-hidden="true">
                  {done ? '✓' : index + 1}
                </div>
                {index < STEP_LABELS.length - 1 ? <div className={`h-1 min-w-0 flex-1 rounded-full ${done ? railActive : rail}`} /> : null}
              </div>
              <div className={[
                'mt-1 truncate text-[9px] font-black uppercase tracking-[0.06em] md:text-[10px] md:tracking-[0.08em]',
                current ? (problema ? 'text-red-300' : 'text-emerald-300') : muted,
              ].join(' ')}>
                {label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
