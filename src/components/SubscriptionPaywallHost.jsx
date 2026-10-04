'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import {
  CLIENT_ANNUAL_PRICE_CENTS,
  CLIENT_ANNUAL_PRODUCT_ID,
  PROFESSIONAL_ANNUAL_PRICE_CENTS,
  PROFESSIONAL_ANNUAL_PRODUCT_ID,
  formatSubscriptionPrice,
  isSubscriptionSessionCurrent,
} from '@/lib/subscriptions'
import {
  clearPendingSubscriptionCheckout,
  getSubscriptionStatus,
  readPendingSubscriptionCheckout,
  startAnnualSubscriptionCheckout,
} from '@/lib/subscriptionClient'
import {
  subscriptionKindFromProduct,
  verifyAuthoritativeSubscriptionReturn,
} from '@/lib/subscriptionReturn'
import { auth } from '@/lib/firebase'

const copy = {
  client: {
    eyebrow: 'Plano Cliente',
    title: 'Continue usando o Corre Aqui',
    lead: 'Seu primeiro pedido foi grátis.',
    description: 'Continue criando pedidos durante todo o ano.',
    price: CLIENT_ANNUAL_PRICE_CENTS,
    monthly: 'Menos de R$ 1,70 por mês',
    productId: CLIENT_ANNUAL_PRODUCT_ID,
  },
  professional: {
    eyebrow: 'Plano Profissional',
    title: 'Continue trabalhando pelo Corre Aqui',
    lead: 'Seu período gratuito de 3 meses terminou.',
    description: 'Continue encontrando oportunidades durante todo o ano.',
    price: PROFESSIONAL_ANNUAL_PRICE_CENTS,
    monthly: 'Cerca de R$ 4,16 por mês',
    productId: PROFESSIONAL_ANNUAL_PRODUCT_ID,
  },
}

const directClientCopy = {
  ...copy.client,
  title: 'Agende diretamente pelo Corre Aqui',
  lead: 'Para agendar diretamente com um profissional, ative o Plano Cliente.',
  description: 'Crie novas solicitações diretas com segurança durante todo o ano.',
  validity: 'Plano válido por 12 meses após a confirmação do pagamento.',
  benefits: [
    'Agendamentos e pedidos diretos com profissionais',
    'Acompanhamento pelo chat, agenda e histórico',
  ],
}

const checkoutReturnValues = new Set(['success', 'pending', 'failure'])
const checkoutQueryKeys = [
  'checkout',
  'collection_id',
  'collection_status',
  'payment_id',
  'status',
  'external_reference',
  'payment_type',
  'merchant_order_id',
  'preference_id',
  'site_id',
  'processing_mode',
  'merchant_account_id',
]

function dateLabel(timestamp) {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(timestamp))
}

function cleanCheckoutParams(url) {
  checkoutQueryKeys.forEach((key) => url.searchParams.delete(key))
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

function ReturnIcon({ state }) {
  if (state === 'approved') {
    return <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl font-black text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200" aria-hidden="true">✓</span>
  }
  if (state === 'failed') {
    return <span className="grid h-16 w-16 place-items-center rounded-full bg-rose-100 text-2xl font-black text-rose-700 dark:bg-rose-400/15 dark:text-rose-200" aria-hidden="true">!</span>
  }
  if (state === 'checking') return (
    <span className="grid h-16 w-16 place-items-center rounded-full bg-blue-100 dark:bg-blue-400/15" aria-hidden="true">
      <span className="h-7 w-7 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700 dark:border-blue-300/25 dark:border-t-blue-200" />
    </span>
  )
  return <span className="grid h-16 w-16 place-items-center rounded-full bg-amber-100 text-3xl font-black text-amber-700 dark:bg-amber-400/15 dark:text-amber-200" aria-hidden="true">…</span>
}

export default function SubscriptionPaywallHost() {
  const [kind, setKind] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [paymentReturn, setPaymentReturn] = useState(null)
  const [sessionUid, setSessionUid] = useState(undefined)
  const checkoutBusyRef = useRef(false)
  const verificationRunRef = useRef(0)
  const verificationAbortRef = useRef(null)
  const activeUidRef = useRef(auth.currentUser?.uid || '')

  const cancelPaymentVerification = useCallback(() => {
    verificationRunRef.current += 1
    verificationAbortRef.current?.abort()
    verificationAbortRef.current = null
  }, [])

  const verifyPayment = useCallback(async ({ expectedKind = '', expectedUid = '', automatic = false, baselineExpiresAt = 0, checkoutCreatedAt = 0 } = {}) => {
    if (!isSubscriptionSessionCurrent(expectedUid, auth.currentUser?.uid)) return
    verificationAbortRef.current?.abort()
    const runId = verificationRunRef.current + 1
    verificationRunRef.current = runId
    const controller = new AbortController()
    verificationAbortRef.current = controller
    setPaymentReturn((current) => ({
      ...current,
      kind: expectedKind || current?.kind || '',
      baselineExpiresAt: Number(baselineExpiresAt || current?.baselineExpiresAt || 0),
      checkoutCreatedAt: Number(checkoutCreatedAt || current?.checkoutCreatedAt || 0),
      state: 'checking',
      error: '',
    }))

    try {
      const outcome = await verifyAuthoritativeSubscriptionReturn({
        readStatus: getSubscriptionStatus,
        expectedKind,
        baselineExpiresAt,
        checkoutCreatedAt,
        automatic,
        signal: controller.signal,
        shouldContinue: () => verificationRunRef.current === runId
          && isSubscriptionSessionCurrent(expectedUid, auth.currentUser?.uid),
      })
      if (outcome.state === 'cancelled'
        || verificationRunRef.current !== runId
        || !isSubscriptionSessionCurrent(expectedUid, auth.currentUser?.uid)) return

      if (outcome.state === 'approved') {
        const url = new URL(window.location.href)
        if (checkoutReturnValues.has(url.searchParams.get('checkout'))) cleanCheckoutParams(url)
        clearPendingSubscriptionCheckout()
        setPaymentReturn({
          kind: expectedKind,
          state: 'approved',
          expiresAt: outcome.expiresAt,
          error: '',
        })
        window.dispatchEvent(new CustomEvent('correaqui:subscription-status-refresh'))
        return
      }

      const recoveryMessage = outcome.reason === 'status_timeout'
        ? 'A consulta demorou mais que o esperado. O pagamento pode ainda estar sendo processado.'
        : outcome.reason === 'status_error'
          ? 'Não foi possível consultar o status agora. Tente verificar novamente em instantes.'
          : 'O pagamento pode ainda estar sendo processado. Verifique novamente em alguns instantes.'
      setPaymentReturn((current) => ({
        ...current,
        kind: expectedKind || current?.kind || '',
        baselineExpiresAt: Number(baselineExpiresAt || current?.baselineExpiresAt || 0),
        checkoutCreatedAt: Number(checkoutCreatedAt || current?.checkoutCreatedAt || 0),
        state: 'pending',
        error: recoveryMessage,
      }))
    } finally {
      if (verificationAbortRef.current === controller) verificationAbortRef.current = null
    }
  }, [])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const nextUid = user?.uid || ''
      if (activeUidRef.current && activeUidRef.current !== nextUid) {
        cancelPaymentVerification()
        checkoutBusyRef.current = false
        setKind('')
        setReason('')
        setLoading(false)
        setError('')
        setPaymentReturn(null)
      }
      activeUidRef.current = nextUid
      setSessionUid(nextUid)
    })
    return () => {
      unsubscribe()
      cancelPaymentVerification()
    }
  }, [cancelPaymentVerification])

  useEffect(() => {
    const open = (event) => {
      const nextKind = event?.detail?.kind === 'professional' ? 'professional' : 'client'
      cancelPaymentVerification()
      setPaymentReturn(null)
      setKind(nextKind)
      setReason(String(event?.detail?.reason || ''))
      setError('')
    }
    window.addEventListener('correaqui:subscription-required', open)
    return () => window.removeEventListener('correaqui:subscription-required', open)
  }, [cancelPaymentVerification])

  useEffect(() => {
    if (sessionUid === undefined) return undefined
    const url = new URL(window.location.href)
    const checkoutReturn = url.searchParams.get('checkout')
    if (!checkoutReturnValues.has(checkoutReturn)) return undefined

    if (!sessionUid) {
      setPaymentReturn({ kind: '', state: 'failed', error: 'Entre na conta que iniciou o pagamento para confirmar.' })
      return undefined
    }

    const pendingCheckout = readPendingSubscriptionCheckout(sessionUid)
    if (!pendingCheckout) {
      setPaymentReturn({ kind: '', state: 'failed', error: 'Este retorno de pagamento não pertence à sessão atual.' })
      return undefined
    }
    const returnKind = subscriptionKindFromProduct(pendingCheckout.productId)
    if (checkoutReturn === 'failure') {
      clearPendingSubscriptionCheckout()
      setPaymentReturn({ kind: returnKind, state: 'failed', error: '' })
      return undefined
    }

    verifyPayment({
      expectedKind: returnKind,
      expectedUid: sessionUid,
      automatic: true,
      baselineExpiresAt: pendingCheckout?.baselineExpiresAt,
      checkoutCreatedAt: pendingCheckout?.createdAt,
    })
    return cancelPaymentVerification
  }, [cancelPaymentVerification, sessionUid, verifyPayment])

  const close = () => {
    cancelPaymentVerification()
    const url = new URL(window.location.href)
    if (checkoutReturnValues.has(url.searchParams.get('checkout'))) cleanCheckoutParams(url)
    setKind('')
    setReason('')
    setPaymentReturn(null)
    setError('')
  }

  const retryAfterFailure = (requestedKind = '') => {
    cancelPaymentVerification()
    const retryKind = requestedKind || paymentReturn?.kind
    const url = new URL(window.location.href)
    if (checkoutReturnValues.has(url.searchParams.get('checkout'))) cleanCheckoutParams(url)
    setPaymentReturn(null)
    if (retryKind) setKind(retryKind)
  }

  const checkout = async () => {
    if (!kind || checkoutBusyRef.current) return
    checkoutBusyRef.current = true
    let redirecting = false
    setLoading(true)
    setError('')
    try {
      const data = await startAnnualSubscriptionCheckout(copy[kind].productId)
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl)
        redirecting = true
        return
      }
      setError(data.message || 'O checkout ainda não está disponível neste ambiente.')
    } catch (checkoutError) {
      setError(checkoutError?.message || 'Não foi possível abrir o checkout agora. Tente novamente.')
    } finally {
      if (!redirecting) {
        checkoutBusyRef.current = false
        setLoading(false)
      }
    }
  }

  if (paymentReturn) {
    const isApproved = paymentReturn.state === 'approved'
    const isFailed = paymentReturn.state === 'failed'
    const isChecking = paymentReturn.state === 'checking'
    const returnCopy = isApproved
      ? {
          title: 'Pagamento confirmado!',
          description: 'Sua assinatura Corre Aqui está ativa.',
        }
      : isFailed
        ? {
            title: 'Pagamento não concluído',
            description: 'O pagamento foi cancelado ou não pôde ser aprovado. Você pode tentar novamente quando quiser.',
          }
        : isChecking
          ? {
              title: 'Estamos confirmando seu pagamento',
              description: 'Isso pode levar alguns instantes. A assinatura será liberada automaticamente após a confirmação segura.',
            }
          : {
              title: 'Pagamento em processamento',
              description: 'A confirmação segura ainda não chegou. Você pode verificar novamente ou continuar usando o app.',
            }

    return (
      <div className="fixed inset-0 z-[120000] grid place-items-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="payment-return-title">
        <section className="my-auto w-full max-w-[430px] rounded-[30px] border border-white/20 bg-white p-6 text-center text-slate-950 shadow-[0_30px_100px_rgba(2,6,23,0.55)] dark:border-slate-700 dark:bg-slate-900 dark:text-white sm:p-7">
          <div className="mx-auto w-fit"><ReturnIcon state={paymentReturn.state} /></div>
          <div className="mt-5 text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">Mercado Pago</div>
          <h2 id="payment-return-title" className="mt-2 text-2xl font-black leading-tight">{returnCopy.title}</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">{returnCopy.description}</p>

          {isApproved && paymentReturn.expiresAt ? (
            <div className="mt-5 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-400/20 dark:bg-emerald-400/10">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-200">Nova validade</div>
              <div className="mt-1 text-xl font-black text-emerald-950 dark:text-white">{dateLabel(paymentReturn.expiresAt)}</div>
            </div>
          ) : null}

          {!isApproved && !isFailed ? (
            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-100">
              Não é necessário pagar novamente. Vamos consultar o status com segurança.
            </div>
          ) : null}

          {paymentReturn.error ? <p role="alert" className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">{paymentReturn.error}</p> : null}

          {isApproved ? (
            <button type="button" onClick={close} className="mt-5 min-h-12 w-full rounded-2xl bg-emerald-700 px-4 text-sm font-black text-white shadow-[0_14px_30px_rgba(4,120,87,0.2)] transition active:scale-[0.98]">Continuar no Corre Aqui</button>
          ) : isFailed ? (
            <>
              {paymentReturn.kind ? (
                <button type="button" onClick={() => retryAfterFailure()} className="mt-5 min-h-12 w-full rounded-2xl bg-blue-700 px-4 text-sm font-black text-white shadow-[0_14px_30px_rgba(29,78,216,0.2)] transition active:scale-[0.98]">Tentar novamente</button>
              ) : (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => retryAfterFailure('client')} className="min-h-12 rounded-2xl bg-blue-700 px-3 text-xs font-black text-white transition active:scale-[0.98]">Plano Cliente</button>
                  <button type="button" onClick={() => retryAfterFailure('professional')} className="min-h-12 rounded-2xl bg-emerald-700 px-3 text-xs font-black text-white transition active:scale-[0.98]">Plano Profissional</button>
                </div>
              )}
              <button type="button" onClick={close} className="mt-2 min-h-11 w-full rounded-2xl text-sm font-black text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">Agora não</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => verifyPayment({ expectedKind: paymentReturn.kind, expectedUid: sessionUid, baselineExpiresAt: paymentReturn.baselineExpiresAt, checkoutCreatedAt: paymentReturn.checkoutCreatedAt })} disabled={paymentReturn.state === 'checking' || !paymentReturn.kind} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 text-sm font-black text-white shadow-[0_14px_30px_rgba(29,78,216,0.2)] transition active:scale-[0.98] disabled:opacity-60">
                {paymentReturn.state === 'checking' ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" /> : null}
                {paymentReturn.state === 'checking' ? 'Verificando...' : 'Verificar novamente'}
              </button>
              <button type="button" onClick={close} className="mt-2 min-h-11 w-full rounded-2xl text-sm font-black text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5">Continuar no app</button>
            </>
          )}
        </section>
      </div>
    )
  }

  if (!kind) return null
  const content = kind === 'client' && reason === 'client_direct_subscription_required'
    ? directClientCopy
    : copy[kind]

  return (
    <div className="fixed inset-0 z-[120000] grid place-items-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="subscription-title">
      <section className="my-auto w-full max-w-[430px] overflow-hidden rounded-[30px] border border-white/20 bg-white text-slate-950 shadow-[0_30px_100px_rgba(2,6,23,0.55)] dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        <div className="bg-gradient-to-br from-blue-800 via-blue-600 to-cyan-500 p-6 text-white sm:p-7">
          <div className="inline-flex rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">{content.eyebrow}</div>
          <h2 id="subscription-title" className="mt-4 text-2xl font-black leading-tight">{content.title}</h2>
          <p className="mt-3 text-sm font-black text-white">{content.lead}</p>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-blue-50">{content.description}</p>
        </div>
        <div className="p-6 sm:p-7">
          <div className="rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 text-center dark:border-amber-400/20 dark:from-amber-400/10 dark:to-slate-900">
            <div className="text-4xl font-black tracking-tight text-blue-950 dark:text-white">{formatSubscriptionPrice(content.price)} <span className="text-base text-slate-500 dark:text-slate-400">/ ano</span></div>
            <div className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200">{content.monthly}</div>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-slate-600 dark:bg-white/5 dark:text-slate-300">
            <span className="mt-0.5 text-emerald-600 dark:text-emerald-300" aria-hidden="true">🔒</span>
            Checkout seguro pelo Mercado Pago. A assinatura só é ativada após a confirmação do pagamento.
          </div>
          {content.validity ? <p className="mt-3 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400">{content.validity}</p> : null}
          {content.benefits?.length ? (
            <ul className="mt-3 grid gap-2 text-left text-xs font-bold text-slate-700 dark:text-slate-200">
              {content.benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2">
                  <span className="text-emerald-600 dark:text-emerald-300" aria-hidden="true">✓</span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? <p role="alert" className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{error}</p> : null}
          <button type="button" onClick={checkout} disabled={loading} className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#ffd91a] px-4 text-sm font-black text-blue-950 shadow-[0_14px_30px_rgba(245,158,11,0.25)] transition hover:bg-[#ffe34f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-950/25 border-t-blue-950" aria-hidden="true" /> : null}
            {loading ? 'Abrindo checkout seguro...' : 'Assinar agora'}
          </button>
          <button type="button" onClick={close} disabled={loading} className="mt-2 min-h-11 w-full rounded-2xl text-sm font-black text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/5">Agora não</button>
        </div>
      </section>
    </div>
  )
}
