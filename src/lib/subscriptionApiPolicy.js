import { createHash } from 'node:crypto'
import { consumeFixedWindowLimit } from './serverRateLimit.js'

const WINDOW_MS = 60_000
const MAX_REQUESTS = { checkout: 8, cancel: 4 }

const commonErrors = {
  checkout_configuration_incomplete: [503, 'O gerenciamento de assinaturas está temporariamente indisponível.'],
  missing_auth_token: [401, 'Entre na sua conta para continuar.'],
  invalid_auth_token: [401, 'Sua sessão expirou ou não pôde ser validada. Entre novamente para continuar.'],
  subscription_rate_limit_unavailable: [503, 'O serviço de assinaturas está temporariamente indisponível. Tente novamente em instantes.'],
}

const operationErrors = {
  checkout: {
    invalid_recurring_product: [400, 'Escolha um plano válido.'],
    mercado_pago_payer_collector_mismatch: [409, 'O Mercado Pago recusou a combinação de contas. Confira a conta compradora e tente novamente.'],
    mercado_pago_staging_buyer_unavailable: [503, 'A conta compradora de teste ainda não está configurada neste Preview.'],
    mercado_pago_checkout_url_missing: [502, 'O Mercado Pago não retornou o link de checkout. Verifique sua assinatura antes de tentar novamente.'],
    subscription_already_active: [409, 'Esta assinatura já está ativa. Consulte os detalhes em Assinatura.'],
    subscription_checkout_in_progress: [409, 'Sua solicitação de assinatura está em andamento. Aguarde alguns instantes.'],
    subscription_checkout_pending_confirmation: [409, 'Já existe uma tentativa de assinatura. Confira seu estado em Assinatura.'],
    subscription_checkout_previous_price: [409, 'Existe uma autorização com o valor anterior. Consulte a autorização em Assinatura.'],
    verified_email_required: [409, 'Sua conta precisa ter um e-mail verificado para autorizar a assinatura.'],
  },
  cancel: {
    invalid_subscription_kind: [400, 'Escolha uma assinatura válida.'],
    recurring_subscription_not_found: [409, 'Nenhuma assinatura com renovação foi encontrada para este plano.'],
    subscription_ownership_mismatch: [409, 'Não foi possível validar esta assinatura para cancelamento.'],
    subscription_cancellation_not_confirmed: [502, 'O Mercado Pago ainda não confirmou o cancelamento. Confira o estado em Assinatura.'],
    subscription_cancellation_sync_failed: [502, 'Não foi possível atualizar o estado da assinatura. Confira os detalhes em Assinatura.'],
  },
}

const invalidAuthCodes = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/tenant-id-mismatch',
  'auth/user-disabled',
  'auth/user-not-found',
])

const fallbackErrors = {
  checkout: ['checkout_failed', 'Não foi possível abrir o checkout. Confira o estado em Assinatura antes de tentar novamente.'],
  cancel: ['subscription_cancellation_failed', 'Não foi possível confirmar o cancelamento. Confira o estado em Assinatura antes de tentar novamente.'],
}

export async function getSubscriptionRateLimit(database, uid, operation) {
  const userKey = createHash('sha256').update(uid).digest('hex')
  let decision
  try {
    decision = await consumeFixedWindowLimit({
      database,
      path: `serverUsage/subscriptions/${userKey}/${operation}`,
      windowMs: WINDOW_MS,
      maxRequests: MAX_REQUESTS[operation],
    })
  } catch {
    throw new Error('subscription_rate_limit_unavailable')
  }
  if (decision.allowed) return null
  return {
    retryAfter: String(Math.max(1, Math.ceil(decision.retryAfterMs / 1000))),
    error: 'rate_limited',
    message: 'Muitas tentativas em pouco tempo. Aguarde alguns instantes e tente novamente.',
  }
}

export function getSubscriptionApiError(error, operation) {
  const operationMap = operationErrors[operation]
  const code = invalidAuthCodes.has(error?.code) ? 'invalid_auth_token' : error?.message
  if (typeof code === 'string') {
    const known = Object.hasOwn(commonErrors, code)
      ? commonErrors[code]
      : Object.hasOwn(operationMap, code) ? operationMap[code] : null
    if (known) return { code, status: known[0], message: known[1] }
  }

  const [fallbackCode, message] = fallbackErrors[operation]
  const status = [409, 502, 503].includes(error?.status) ? error.status : 500
  return { code: fallbackCode, status, message }
}
