export const COMMERCIAL_PRICE_CENTS = 999
export const COMMERCIAL_CURRENCY = 'BRL'

export const PROFESSIONAL_FEATURED_PLAN_ID = 'corre_aqui_professional_featured'
export const REQUEST_BOOST_PRODUCT_ID = 'corre_aqui_request_boost'

export const COMMERCIAL_PRODUCTS = {
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
