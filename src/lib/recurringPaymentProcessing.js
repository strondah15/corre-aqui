import { mercadoPagoApiRequest, processApprovedCommercialPayment } from '@/lib/commercialServer'
import { resolveAuthorizedPaymentId, resolveInvoicePreapprovalId } from '@/lib/recurringSubscriptions'

const RESOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/

export function normalizeMercadoPagoResourceId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  return typeof value === 'string' && RESOURCE_ID.test(value) ? value : ''
}

export async function readMercadoPagoResource(endpoint, id, signal) {
  if (!normalizeMercadoPagoResourceId(id)) throw new Error('invalid_mercado_pago_resource_id')
  const record = await mercadoPagoApiRequest(`${endpoint}/${encodeURIComponent(id)}`, { signal })
  if (normalizeMercadoPagoResourceId(record?.id) !== String(id)) {
    throw new Error('mercado_pago_resource_id_mismatch')
  }
  return record
}

export async function processRecurringInvoicePayment({ database, invoice, preapprovalId, signal, onStage }) {
  const linkedPreapprovalId = normalizeMercadoPagoResourceId(resolveInvoicePreapprovalId(invoice))
  const paymentId = normalizeMercadoPagoResourceId(resolveAuthorizedPaymentId(invoice))
  if (!linkedPreapprovalId || linkedPreapprovalId !== preapprovalId || !paymentId) return null

  onStage?.('read_invoice_payment')
  const payment = await readMercadoPagoResource('/v1/payments', paymentId, signal)
  onStage?.('apply_invoice_payment')
  return processApprovedCommercialPayment({ database, payment, recurringInvoicePreapprovalId: preapprovalId })
}
