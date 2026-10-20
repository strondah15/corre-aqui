import {
  CLIENT_ANNUAL_PRICE_CENTS,
  CLIENT_ANNUAL_PRODUCT_ID,
  PROFESSIONAL_ANNUAL_PRICE_CENTS,
  PROFESSIONAL_ANNUAL_PRODUCT_ID,
} from '@/lib/subscriptions'

export const COMMERCIAL_PRICE_CENTS = 999
export const COMMERCIAL_CURRENCY = 'BRL'

export const PROFESSIONAL_FEATURED_PLAN_ID = 'corre_aqui_professional_featured'
export const REQUEST_BOOST_PRODUCT_ID = 'corre_aqui_request_boost'

export const COMMERCIAL_PRODUCTS = {
  [CLIENT_ANNUAL_PRODUCT_ID]: {
    id: CLIENT_ANNUAL_PRODUCT_ID,
    name: 'Corre Aqui Cliente Anual',
    displayPrice: 'R$ 19,90',
    amountInCents: CLIENT_ANNUAL_PRICE_CENTS,
    currency: COMMERCIAL_CURRENCY,
    type: 'client_subscription',
    billingMode: 'annual_manual',
    durationMonths: 12,
  },
  [PROFESSIONAL_ANNUAL_PRODUCT_ID]: {
    id: PROFESSIONAL_ANNUAL_PRODUCT_ID,
    name: 'Corre Aqui Profissional Anual',
    displayPrice: 'R$ 49,90',
    amountInCents: PROFESSIONAL_ANNUAL_PRICE_CENTS,
    currency: COMMERCIAL_CURRENCY,
    type: 'professional_subscription',
    billingMode: 'annual_manual',
    durationMonths: 12,
  },
  [PROFESSIONAL_FEATURED_PLAN_ID]: {
    id: PROFESSIONAL_FEATURED_PLAN_ID,
    name: 'Corre Aqui Destaque',
    displayPrice: 'R$ 9,99',
    amountInCents: COMMERCIAL_PRICE_CENTS,
    currency: COMMERCIAL_CURRENCY,
    type: 'professional_featured',
    billingMode: '30_days_manual',
    durationDays: 30,
  },
  [REQUEST_BOOST_PRODUCT_ID]: {
    id: REQUEST_BOOST_PRODUCT_ID,
    name: 'Impulsionar pedido',
    displayPrice: 'R$ 9,99',
    amountInCents: COMMERCIAL_PRICE_CENTS,
    currency: COMMERCIAL_CURRENCY,
    type: 'request_boost',
    billingMode: 'single_purchase',
    durationHours: 24,
    endsWhenAccepted: true,
  },
}

export function getCommercialProduct(productId) {
  return COMMERCIAL_PRODUCTS[String(productId || '').trim()] || null
}

export function formatCommercialPrice(amountInCents = COMMERCIAL_PRICE_CENTS) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: COMMERCIAL_CURRENCY,
  }).format(Number(amountInCents || 0) / 100)
}

export function commercialNow() {
  return Date.now()
}
