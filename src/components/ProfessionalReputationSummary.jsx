import {
  buildProfessionalReputation,
  formatMemberSince,
  formatProfessionalResponseTime,
} from '@/lib/professionalReputation'

const toneClasses = {
  light: {
    text: 'text-slate-950',
    muted: 'text-slate-500',
    border: 'border-slate-200',
    surface: 'bg-slate-50',
  },
  dark: {
    text: 'text-white',
    muted: 'text-slate-400',
    border: 'border-white/10',
    surface: 'bg-white/[0.04]',
  },
}

export default function ProfessionalReputationSummary({
  source,
  reputation: reputationInput,
  compact = false,
  tone = 'light',
  className = '',
  ...rootProps
}) {
  const reputation = buildProfessionalReputation(source, reputationInput)
  const styles = toneClasses[tone] || toneClasses.light
  const responseLabel = formatProfessionalResponseTime(
    reputation.averageResponseTimeMs,
    reputation.responseSamples
  )
  const memberLabel = formatMemberSince(reputation.memberSince)

  if (compact) {
    return (
      <div {...rootProps} className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold ${styles.muted} ${className}`}>
        <span className={reputation.rating ? 'text-amber-600' : styles.muted}>
          {reputation.rating
            ? `★ ${reputation.rating.toFixed(1)} (${reputation.reviewCount})`
            : 'Novo no app'}
        </span>
        <span>{reputation.completedServices} concluído{reputation.completedServices === 1 ? '' : 's'}</span>
        {responseLabel ? <span>{responseLabel}</span> : null}
      </div>
    )
  }

  const items = [
    {
      icon: '★',
      value: reputation.rating ? `${reputation.rating.toFixed(1)} (${reputation.reviewCount})` : 'Sem avaliações',
      label: reputation.rating ? 'Avaliação de clientes' : 'Ainda não recebeu avaliações',
      accent: 'text-amber-600',
    },
    {
      icon: '✓',
      value: String(reputation.completedServices),
      label: reputation.completedServices === 1 ? 'Serviço concluído no app' : 'Serviços concluídos no app',
      accent: 'text-emerald-600',
    },
    {
      icon: '◷',
      value: responseLabel || 'Ainda sem média',
      label: responseLabel
        ? `Média baseada em ${reputation.responseSamples} respostas`
        : 'Disponível após respostas suficientes',
      accent: 'text-blue-600',
    },
  ]

  return (
    <section {...rootProps} className={`${styles.surface} ${styles.border} ${styles.text} rounded-[18px] border p-4 ${className}`} aria-label="Reputação profissional">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black">Reputação profissional</h3>
          <p className={`mt-0.5 text-xs font-semibold ${styles.muted}`}>Dados reais de atendimentos no Corre Aqui.</p>
        </div>
        {memberLabel ? <span className={`max-w-[150px] text-right text-[11px] font-bold ${styles.muted}`}>{memberLabel}</span> : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className={`min-w-0 rounded-[12px] border p-3 ${styles.border}`}>
            <div className={`text-lg font-black ${item.accent}`} aria-hidden="true">{item.icon}</div>
            <div className="mt-1 break-words text-sm font-black">{item.value}</div>
            <div className={`mt-1 text-[11px] font-semibold leading-4 ${styles.muted}`}>{item.label}</div>
          </div>
        ))}
      </div>

      {reputation.returningClients > 0 ? (
        <p className={`mt-3 text-xs font-bold ${styles.muted}`}>
          {reputation.returningClients} cliente{reputation.returningClients === 1 ? '' : 's'} voltou{reputation.returningClients === 1 ? '' : 'aram'} a contratar.
        </p>
      ) : null}
    </section>
  )
}
