'use client'

import { motion } from 'framer-motion'
import { ATENDIMENTO_STATUS, normalizeAtendimentoStatus } from '@/lib/attendanceState'
import { getAttendanceProgressModel } from '@/lib/attendanceProgress'

function StepIcon({ index, completed, loading }) {
  if (loading) {
    return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" />
  }
  if (completed) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4" aria-hidden="true">
        <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return <span className="text-[10px] font-black" aria-hidden="true">{index + 1}</span>
}

export default function AttendanceProgress({
  status,
  action,
  loadingActionId = '',
  disabled = false,
  reducedMotion = false,
  rating = null,
  onAction,
  onRate,
}) {
  const model = getAttendanceProgressModel(status, action)
  const finalizado = normalizeAtendimentoStatus(status) === ATENDIMENTO_STATUS.FINALIZADO
  const cancelado = normalizeAtendimentoStatus(status) === ATENDIMENTO_STATUS.CANCELADO
  const progressIndex = finalizado ? 5 : Math.max(0, model.findIndex((step) => step.current))

  return (
    <div className="shrink-0 bg-[#030b15] px-3 pb-2 pt-1 sm:px-5 sm:pb-3" data-tutorial="progresso">
      <div className="mx-auto rounded-[18px] border border-white/[0.08] bg-white/[0.025] px-2 py-2.5 shadow-[0_12px_28px_rgba(0,0,0,0.18)] sm:px-4 sm:py-3">
        <div className="relative">
          <div className="absolute left-[10%] right-[10%] top-[18px] h-0.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500"
              initial={false}
              animate={{ width: cancelado ? '0%' : `${(progressIndex / 5) * 100}%` }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.32, ease: 'easeOut' }}
            />
          </div>

          <div className="relative grid grid-cols-6 gap-0.5">
            {model.map((step) => {
              const actionable = step.actionable && !disabled
              const loading = actionable && loadingActionId === action?.id
              return (
                <motion.button
                  key={step.id}
                  type="button"
                  disabled={!actionable || Boolean(loadingActionId)}
                  onClick={() => actionable && onAction?.(action)}
                  aria-current={step.current ? 'step' : undefined}
                  aria-label={actionable ? action?.label : step.label}
                  title={actionable ? action?.label : step.label}
                  initial={false}
                  animate={{ scale: actionable ? 1.04 : 1 }}
                  whileTap={actionable && !reducedMotion ? { scale: 0.94 } : undefined}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' }}
                  className="group min-w-0 cursor-default text-center disabled:cursor-default"
                >
                  <span
                    className={[
                      'mx-auto grid place-items-center rounded-full border transition-all',
                      actionable ? 'h-10 w-10 cursor-pointer' : 'h-9 w-9',
                      step.completed ? 'border-emerald-300 bg-emerald-500 text-white' : 'border-slate-600 bg-[#0d1a29] text-slate-500',
                      step.current && !actionable ? 'border-cyan-300 bg-cyan-500/85 text-white ring-4 ring-cyan-400/15' : '',
                      actionable ? 'border-yellow-300 bg-blue-900 text-yellow-200 ring-4 ring-yellow-300/15 shadow-[0_0_18px_rgba(250,204,21,0.2)]' : '',
                    ].join(' ')}
                  >
                    <StepIcon index={step.index} completed={step.completed && !actionable} loading={loading} />
                  </span>
                  <span className={[
                    'mt-1 block min-h-[18px] break-words text-[7px] font-black leading-[1.05] min-[390px]:text-[8px] sm:text-[9px]',
                    actionable ? 'text-yellow-200' : step.current ? 'text-cyan-300' : step.completed ? 'text-slate-200' : 'text-slate-500',
                  ].join(' ')}>
                    {loading ? 'Aguarde' : step.label}
                  </span>
                </motion.button>
              )
            })}
          </div>
        </div>

        {cancelado ? (
          <div className="mt-2 rounded-xl border border-rose-300/20 bg-rose-500/[0.08] px-3 py-1.5 text-center text-[10px] font-black text-rose-200" role="status">
            Atendimento cancelado
          </div>
        ) : null}

        {!cancelado && action && action.id !== 'rate' ? (
          <div className="mt-2 text-center text-[9px] font-bold text-slate-400 sm:text-[10px]">
            Próxima ação: <span className="text-yellow-200">{action.label}</span>
          </div>
        ) : null}

        {finalizado && rating ? (
          <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-yellow-300/15 bg-yellow-400/[0.06] px-3 py-1.5">
            <span className="text-sm tracking-[0.08em] text-yellow-300" aria-label={`${rating.nota || 5} de 5 estrelas`}>
              {[1, 2, 3, 4, 5].map((star) => <span key={star} className={star <= Number(rating.nota || 5) ? '' : 'text-slate-600'}>★</span>)}
            </span>
            <span className="text-[9px] font-black uppercase tracking-[0.08em] text-yellow-100">Atendimento avaliado</span>
          </div>
        ) : finalizado && action?.id === 'rate' ? (
          <button
            type="button"
            onClick={onRate}
            disabled={disabled}
            className="mx-auto mt-2 block rounded-full border border-yellow-300/25 bg-yellow-400/[0.07] px-3 py-1.5 text-[10px] font-black text-yellow-200 transition hover:bg-yellow-400/15 disabled:opacity-50"
          >
            Avaliar atendimento
          </button>
        ) : null}
      </div>
    </div>
  )
}
