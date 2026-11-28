export function replacePublicRequestCards(nextRows = []) {
  return Array.isArray(nextRows) ? [...nextRows] : []
}

export function removePublicRequestCard(rows = [], pedidoId = '') {
  const id = String(pedidoId || '').trim()
  return (Array.isArray(rows) ? rows : []).filter((row) => String(row?.id || '') !== id)
}

export function createClaimUiCheck({ pedidoId, cardPresent, publicExistsNow, publicStatus } = {}) {
  const exists = publicExistsNow === true
  return {
    pedidoId: String(pedidoId || '').trim(),
    cardPresent: cardPresent === true,
    publicExistsNow: exists,
    publicStatus: exists ? String(publicStatus || '').trim().toLowerCase() : '',
    claimRequested: exists,
  }
}
