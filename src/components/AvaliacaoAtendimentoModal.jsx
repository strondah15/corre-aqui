'use client'

import { motion, useReducedMotion } from 'framer-motion'
import StatusFluxoServico from '@/components/StatusFluxoServico'
import { SERVICE_RATING_COMMENT_LIMIT } from '@/lib/serviceRatings'

export default function AvaliacaoAtendimentoModal({
  pedido,
  nota,
  comentario,
  salvando = false,
  onNotaChange,
  onComentarioChange,
  onEnviar,
  onAgoraNao,
}) {
  const reduzirMovimento = useReducedMotion()
  if (!pedido) return null

  return (
    <div className="fixed inset-0 z-[100002] flex items-center justify-center bg-slate-950/82 p-3 backdrop-blur-md">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="avaliacao-atendimento-titulo"
        initial={reduzirMovimento ? false : { opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduzirMovimento ? { duration: 0 } : { duration: 0.22, ease: 'easeOut' }}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-[22px] border border-white/10 bg-[#07111f] p-3 text-white shadow-[0_28px_95px_rgba(0,0,0,0.62)] sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300 sm:text-xs">
              Avaliação pós-serviço
            </div>
            <h2 id="avaliacao-atendimento-titulo" className="mt-1 text-lg font-black sm:text-2xl">
              Como foi a experiência?
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300 sm:text-sm">
              A avaliação fica no histórico e ajuda a comunidade a reconhecer bons atendimentos.
            </p>
          </div>
          <button
            type="button"
            onClick={onAgoraNao}
            disabled={salvando}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/10 font-black hover:bg-white/15 disabled:opacity-50"
            aria-label="Avaliar agora não"
          >
            ×
          </button>
        </div>

        <StatusFluxoServico
          pedido={{ ...pedido, status: 'finalizado' }}
          tone="dark"
          className="mt-4"
        />

        <div className="mt-4 flex justify-center gap-1.5 sm:gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onNotaChange?.(value)}
              disabled={salvando}
              className={[
                'grid h-10 w-10 place-items-center rounded-xl border text-xl transition disabled:opacity-50 sm:h-12 sm:w-12 sm:text-2xl',
                value <= nota
                  ? 'border-amber-300 bg-amber-400 text-slate-950 shadow-[0_0_28px_rgba(251,191,36,0.28)]'
                  : 'border-white/10 bg-white/[0.06] text-slate-500 hover:bg-white/10',
              ].join(' ')}
              aria-label={`${value} estrela${value === 1 ? '' : 's'}`}
              aria-pressed={value === nota}
            >
              ★
            </button>
          ))}
        </div>

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-300">
          Comentário opcional
          <textarea
            value={comentario}
            onChange={(event) => onComentarioChange?.(event.target.value.slice(0, SERVICE_RATING_COMMENT_LIMIT))}
            maxLength={SERVICE_RATING_COMMENT_LIMIT}
            disabled={salvando}
            placeholder="Ex.: chegou no horário, resolveu bem e combinou tudo pelo chat."
            className="mt-2 min-h-[88px] w-full resize-y rounded-2xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/40 disabled:opacity-60 sm:min-h-[110px] sm:px-4 sm:py-3"
          />
          <span className="mt-1 block text-right text-[10px] font-bold normal-case tracking-normal text-slate-500">
            {comentario.length}/{SERVICE_RATING_COMMENT_LIMIT}
          </span>
        </label>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.6fr]">
          <button
            type="button"
            onClick={onAgoraNao}
            disabled={salvando}
            className="min-h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-3 text-sm font-black text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            Agora não
          </button>
          <button
            type="button"
            disabled={salvando}
            onClick={onEnviar}
            className="min-h-11 rounded-2xl bg-amber-400 px-3 text-sm font-black text-slate-950 hover:bg-amber-300 disabled:opacity-60"
          >
            {salvando ? 'Enviando...' : 'Enviar avaliação'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
