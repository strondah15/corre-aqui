const firstFiniteNumber = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const countCollection = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).length
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean).length
  return 0
}

export const parseReputationDate = (value) => {
  if (!value) return null
  if (typeof value === 'object' && Number.isFinite(Number(value.seconds))) {
    return Number(value.seconds) * 1000
  }

  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const buildProfessionalReputation = (source = {}, overrides = {}) => {
  const profile = source?.profile || source?.perfil || {}
  const trustStats = source?.trustStats || {}
  const stored = source?.reputation || source?.reputacao || {}

  const reviewCount = Math.max(
    0,
    Math.trunc(
      firstFiniteNumber(
        overrides.reviewCount,
        stored.reviewCount,
        stored.totalAvaliacoes,
        source.totalAvaliacoes,
        profile.totalAvaliacoes,
        trustStats.totalAvaliacoes,
        countCollection(source.avaliacoes),
        countCollection(profile.avaliacoes)
      ) || 0
    )
  )

  const ratingCandidate = firstFiniteNumber(
    overrides.rating,
    stored.rating,
    stored.notaMedia,
    source.avaliacaoMedia,
    source.notaMedia,
    profile.avaliacaoMedia,
    profile.notaMedia,
    trustStats.notaMedia
  )
  const rating = reviewCount > 0 && ratingCandidate > 0
    ? Math.min(5, Math.max(0, ratingCandidate))
    : null

  const explicitCompleted = firstFiniteNumber(
    overrides.completedServices,
    stored.completedServices,
    stored.servicosConcluidos,
    source.servicosConcluidos,
    source.entregas,
    profile.servicosConcluidos,
    profile.entregas
  )
  const legacyCompleted = Math.max(0, Number(source.servicosCorre || 0))
    + Math.max(0, Number(source.servicosProf || 0))
  const completedServices = Math.max(
    0,
    Math.trunc(explicitCompleted === null ? legacyCompleted : explicitCompleted)
  )

  const responseSamples = Math.max(
    0,
    Math.trunc(
      firstFiniteNumber(
        overrides.responseSamples,
        stored.responseSamples,
        stored.amostrasResposta,
        source.amostrasResposta
      ) || 0
    )
  )
  const responseCandidate = firstFiniteNumber(
    overrides.averageResponseTimeMs,
    stored.averageResponseTimeMs,
    stored.tempoMedioRespostaMs,
    source.tempoMedioRespostaMs
  )
  const averageResponseTimeMs = responseSamples >= 3 && responseCandidate > 0
    ? responseCandidate
    : null

  const returningClients = Math.max(
    0,
    Math.trunc(
      firstFiniteNumber(
        overrides.returningClients,
        stored.returningClients,
        stored.clientesRecorrentes,
        source.clientesRecorrentes
      ) || 0
    )
  )

  const memberSince = parseReputationDate(
    overrides.memberSince
      || stored.memberSince
      || source.createdAt
      || source.criadoEm
      || profile.createdAt
      || profile.criadoEm
  )

  return {
    rating,
    reviewCount,
    completedServices,
    memberSince,
    averageResponseTimeMs,
    responseSamples,
    returningClients,
  }
}

export const formatProfessionalResponseTime = (averageResponseTimeMs, responseSamples = 0) => {
  if (!averageResponseTimeMs || responseSamples < 3) return null
  const minutes = averageResponseTimeMs / 60_000
  if (minutes <= 5) return 'Responde em poucos minutos'
  if (minutes <= 15) return 'Responde em cerca de 15 min'
  if (minutes <= 60) return 'Responde em até 1 hora'
  return 'Responde em algumas horas'
}

export const formatMemberSince = (memberSince) => {
  if (!memberSince) return null
  const date = new Date(memberSince)
  if (Number.isNaN(date.getTime())) return null
  return `No Corre Aqui desde ${date.toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric',
  })}`
}
