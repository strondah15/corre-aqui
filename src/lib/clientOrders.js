'use client'

import { auth } from '@/lib/firebase'
import { announceSubscriptionRequired } from '@/lib/subscriptionClient'

export class ClientOrderError extends Error {
  constructor(message, code = 'order_creation_failed', details = {}) {
    super(message)
    this.name = 'ClientOrderError'
    this.code = code
    this.details = details
  }
}

export async function createAuthorizedClientOrder(order = {}) {
  const user = auth.currentUser
  if (!user) throw new ClientOrderError('Entre na sua conta antes de publicar o pedido.', 'authentication_required')

  const token = await user.getIdToken()
  const response = await fetch('/api/pedidos/create', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data?.ok) {
    const code = data?.reason || data?.error || 'order_creation_failed'
    if (response.status === 402 || code === 'client_subscription_required') {
      announceSubscriptionRequired({ kind: 'client', reason: code })
    }
    throw new ClientOrderError(
      data?.message || (code === 'free_order_in_progress'
        ? 'Finalize seu primeiro pedido antes de criar outro sem assinatura.'
        : 'Não foi possível publicar o pedido agora.'),
      code,
      data,
    )
  }
  return data.order
}
