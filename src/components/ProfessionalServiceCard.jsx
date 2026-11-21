'use client'

import { getProfessionalServicePhotoUrls } from '@/lib/professionalServiceModel'

export default function ProfessionalServiceCard({ service, pending = false, onEdit, onDelete }) {
  const cover = getProfessionalServicePhotoUrls(service)[0] || ''
  const active = service?.ativo !== false

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900">
      <div className="flex min-h-[108px] gap-3 p-3">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-blue-50 via-slate-100 to-emerald-50 dark:from-blue-950 dark:via-slate-800 dark:to-emerald-950">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <div className="grid h-full place-items-center text-2xl text-blue-300" aria-hidden="true">▧</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="line-clamp-2 text-sm font-black leading-snug text-blue-950 dark:text-blue-100">
                {service?.nome || 'Serviço sem nome'}
              </h4>
              <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {service?.categoriaNome || 'Categoria não informada'}
              </p>
            </div>
            <span className={[
              'shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide',
              active
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
            ].join(' ')}>
              {active ? 'Ativo' : 'Oculto'}
            </span>
          </div>
          <div className="mt-2 text-sm font-black text-emerald-600 dark:text-emerald-400">
            {service?.faixaPreco || 'A combinar'}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onEdit?.(service)}
              disabled={pending}
              className="min-h-10 flex-1 rounded-xl border border-blue-100 bg-blue-50 px-3 text-xs font-black text-blue-700 transition active:scale-[0.98] disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(service)}
              disabled={pending}
              className="min-h-10 flex-1 rounded-xl border border-rose-100 bg-rose-50 px-3 text-xs font-black text-rose-600 transition active:scale-[0.98] disabled:opacity-50 dark:border-rose-950 dark:bg-rose-950/60 dark:text-rose-300"
            >
              Excluir
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
