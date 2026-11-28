const ACTIVE_SERVICE_STATUSES = new Set([
  'aceito',
  'aguardando_inicio',
  'em_andamento',
  'em_atendimento',
  'a_caminho',
  'em_deslocamento',
  'chegou',
  'em_local',
  'chegando',
  'aguardando_confirmacao',
  'agendado',
])

const text = (value) => String(value || '').trim()

export function sanitizePhoneDigits(value) {
  let digits = text(value).replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length >= 12 && digits.length <= 15 ? digits : ''
}

export function isServiceContactActiveStatus(value) {
  return ACTIVE_SERVICE_STATUSES.has(text(value).toLowerCase())
}

export function getServiceParticipants(record = {}, kind = 'pedido') {
  if (kind === 'privateRequest') {
    return {
      clientId: text(record?.clienteId),
      professionalId: text(record?.profissionalId),
    }
  }

  return {
    clientId: text(record?.criador?.id),
    professionalId: text(record?.aceite?.id),
  }
}

export function isServiceParticipant(record, kind, uid) {
  const participantId = text(uid)
  const { clientId, professionalId } = getServiceParticipants(record, kind)
  return Boolean(participantId && (participantId === clientId || participantId === professionalId))
}

export function getOwnPrivatePhone(userNode = {}) {
  const candidates = [
    userNode?.telefone,
    userNode?.phone,
    userNode?.profile?.telefone,
    userNode?.profile?.phone,
    userNode?.whatsapp,
    userNode?.profile?.whatsapp,
    userNode?.profWhats,
    userNode?.profissional?.whatsapp,
    userNode?.profile?.profissional?.whatsapp,
  ]

  return candidates.map(sanitizePhoneDigits).find(Boolean) || ''
}

export function getAuthorizedPhoneContact({
  publicProfile,
  serviceContact,
  pedidoStatus,
  isParticipant,
}) {
  if (!isParticipant || !isServiceContactActiveStatus(pedidoStatus)) return { href: '', source: '' }

  const privateDigits = sanitizePhoneDigits(serviceContact?.phone)
  if (privateDigits) return { href: `tel:+${privateDigits}`, source: 'active_service' }

  if (publicProfile?.allowPublicContact !== true) return { href: '', source: '' }
  const publicDigits = sanitizePhoneDigits(
    publicProfile?.profWhats || publicProfile?.profissional?.whatsapp,
  )
  return publicDigits ? { href: `tel:+${publicDigits}`, source: 'public_profile' } : { href: '', source: '' }
}
