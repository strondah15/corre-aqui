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
import { getSubscriptionStatus, startAnnualSubscriptionCheckout } from '@/lib/subscriptionClient'
import { auth } from '@/lib/firebase'

function dateLabel(timestamp) {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(timestamp))
}

function daysUntil(timestamp) {
  if (!timestamp) return 0
  return Math.max(0, Math.ceil((Number(timestamp) - Date.now()) / (24 * 60 * 60 * 1000)))
}

function StatusBadge({ tone = 'blue', children }) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
    amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
    rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
  }
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${tones[tone]}`}>{children}</span>
}

function PlanButton({ children, loading, disabled, onClick, tone = 'blue' }) {
  const color = tone === 'emerald'
    ? 'bg-emerald-700 text-white shadow-[0_12px_24px_rgba(4,120,87,0.18)] hover:bg-emerald-600'
    : 'bg-blue-700 text-white shadow-[0_12px_24px_rgba(29,78,216,0.18)] hover:bg-blue-600'
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-xs font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${color}`}>
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" /> : null}
      {loading ? 'Abrindo checkout...' : children}
    </button>
  )
}

function PlanShell({ icon, title, subtitle, tone = 'blue', children }) {
  const accent = tone === 'emerald'
    ? 'from-emerald-500/12 via-emerald-50/60 to-white border-emerald-200 dark:from-emerald-400/12 dark:via-slate-900 dark:to-slate-950 dark:border-emerald-400/20'
    : 'from-blue-500/12 via-blue-50/60 to-white border-blue-200 dark:from-blue-400/12 dark:via-slate-900 dark:to-slate-950 dark:border-blue-400/20'
  const iconTone = tone === 'emerald' ? 'bg-emerald-700' : 'bg-blue-700'
  return (
    <article className={`relative overflow-hidden rounded-[24px] border bg-gradient-to-br p-4 text-slate-950 shadow-[0_14px_34px_rgba(15,23,42,0.07)] dark:text-white ${accent}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-black text-white shadow-lg ${iconTone}`}>{icon}</span>
        <div className="min-w-0">
          <h3 className="text-base font-black tracking-tight">{title}</h3>
          <p className="mt-0.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </article>
  )
}

export default function SubscriptionStatusCard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState('')
  const [error, setError] = useState('')
  const checkoutBusyRef = useRef(false)

  const loadStatus = useCallback(async ({ quiet = false, expectedUid = auth.currentUser?.uid } = {}) => {
    if (!isSubscriptionSessionCurrent(expectedUid, auth.currentUser?.uid)) return
    if (!quiet) setLoading(true)
    setError('')
    try {
      const result = await getSubscriptionStatus()
      if (!isSubscriptionSessionCurrent(expectedUid, auth.currentUser?.uid)) return
      setData(result.subscriptions)
    } catch (statusError) {
      if (!isSubscriptionSessionCurrent(expectedUid, auth.currentUser?.uid)) return
      setError(statusError?.message || 'Não foi possível carregar sua assinatura agora.')
    } finally {
      if (!quiet && isSubscriptionSessionCurrent(expectedUid, auth.currentUser?.uid)) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      checkoutBusyRef.current = false
      setCheckoutLoading('')
      setData(null)
      setError('')
      if (user?.uid) loadStatus({ expectedUid: user.uid })
      else setLoading(false)
    })
    const refresh = () => loadStatus({ quiet: true, expectedUid: auth.currentUser?.uid })
    window.addEventListener('correaqui:subscription-status-refresh', refresh)
    return () => {
      unsubscribeAuth()
      window.removeEventListener('correaqui:subscription-status-refresh', refresh)
    }
  }, [loadStatus])

  const checkout = useCallback(async (productId) => {
    if (checkoutBusyRef.current) return
    checkoutBusyRef.current = true
    let redirecting = false
    setCheckoutLoading(productId)
    setError('')
    try {
      const result = await startAnnualSubscriptionCheckout(productId)
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl)
        redirecting = true
        return
      }
      setError(result.message || 'O checkout ainda não está disponível neste ambiente.')
    } catch (checkoutError) {
      setError(checkoutError?.message || 'Não foi possível abrir o checkout. Tente novamente.')
    } finally {
      if (!redirecting) {
        checkoutBusyRef.current = false
        setCheckoutLoading('')
      }
    }
  }, [])

  if (loading) {
    return (
      <section className="rounded-[24px] border border-blue-100 bg-white p-4 shadow-[0_12px_30px_rgba(37,99,235,0.06)] dark:border-white/10 dark:bg-slate-950">
        <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">{[0, 1].map((item) => <div key={item} className="h-44 animate-pulse rounded-[22px] bg-slate-100 dark:bg-slate-800" />)}</div>
      </section>
    )
  }

  if (!data) {
    return (
      <section className="rounded-[24px] border border-rose-200 bg-white p-4 text-slate-950 dark:border-rose-400/20 dark:bg-slate-950 dark:text-white">
        <h2 className="text-lg font-black">Assinatura</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{error || 'Não foi possível carregar seus planos.'}</p>
        <button type="button" onClick={() => loadStatus()} className="mt-3 h-10 rounded-xl bg-blue-700 px-4 text-xs font-black text-white">Tentar novamente</button>
      </section>
    )
  }

  const client = data.client || {}
  const professional = data.professional || {}
  const clientPrice = formatSubscriptionPrice(CLIENT_ANNUAL_PRICE_CENTS)
  const professionalPrice = formatSubscriptionPrice(PROFESSIONAL_ANNUAL_PRICE_CENTS)
  const clientExpired = client.status === 'expired'
  const professionalPaidExpired = professional.status === 'expired' && Boolean(professional.expiresAt)
  const checkoutDisabled = Boolean(checkoutLoading)

  return (
    <section data-subscription-area className="rounded-[26px] border border-blue-100 bg-white p-4 text-slate-950 shadow-[0_16px_40px_rgba(37,99,235,0.08)] dark:border-white/10 dark:bg-slate-950 dark:text-white md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Corre Aqui</div>
          <h2 className="mt-1 text-xl font-black tracking-tight md:text-2xl">Assinatura</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Veja seus benefícios, validade e opções de renovação.</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#ffd91a] text-lg font-black text-blue-950 shadow-[0_10px_24px_rgba(245,158,11,0.22)]" aria-hidden="true">✓</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <PlanShell icon="C" title="Plano Cliente" subtitle="Para continuar criando pedidos">
          {client.active ? (
            <>
              <StatusBadge tone="emerald">Assinatura ativa</StatusBadge>
              <div className="mt-3 text-2xl font-black text-blue-950 dark:text-white">{clientPrice} <span className="text-sm text-slate-500 dark:text-slate-400">/ ano</span></div>
              <p className="mt-2 text-sm font-black">Válida até: {dateLabel(client.expiresAt)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{daysUntil(client.expiresAt)} dias restantes</p>
              <PlanButton loading={checkoutLoading === CLIENT_ANNUAL_PRODUCT_ID} disabled={checkoutDisabled} onClick={() => checkout(CLIENT_ANNUAL_PRODUCT_ID)}>Renovar assinatura</PlanButton>
              <p className="mt-2 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400">A renovação soma mais 12 meses à validade atual.</p>
            </>
          ) : clientExpired ? (
            <>
              <StatusBadge tone="rose">Assinatura vencida</StatusBadge>
              <div className="mt-3 text-xl font-black">Renove por {clientPrice}/ano</div>
              {client.expiresAt ? <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Venceu em {dateLabel(client.expiresAt)}</p> : null}
              <PlanButton loading={checkoutLoading === CLIENT_ANNUAL_PRODUCT_ID} disabled={checkoutDisabled} onClick={() => checkout(CLIENT_ANNUAL_PRODUCT_ID)}>Renovar assinatura</PlanButton>
            </>
          ) : client.freeOrderUsed ? (
            <>
              <StatusBadge tone="amber">1º pedido utilizado</StatusBadge>
              <div className="mt-3 text-xl font-black">Continue por {clientPrice}/ano</div>
              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Crie novos pedidos durante todo o ano.</p>
              <PlanButton loading={checkoutLoading === CLIENT_ANNUAL_PRODUCT_ID} disabled={checkoutDisabled} onClick={() => checkout(CLIENT_ANNUAL_PRODUCT_ID)}>Assinar por R$ 19,90/ano</PlanButton>
            </>
          ) : (
            <>
              <StatusBadge tone="blue">1º pedido grátis</StatusBadge>
              <div className="mt-3 text-xl font-black">Sua gratuidade está disponível</div>
              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Ela só é utilizada quando um pedido é realmente publicado.</p>
              <div className="mt-4 rounded-2xl border border-blue-100 bg-white/75 px-3 py-2.5 text-xs font-bold text-blue-900 dark:border-white/10 dark:bg-white/5 dark:text-blue-100">Depois: {clientPrice}/ano</div>
            </>
          )}
        </PlanShell>

        <PlanShell icon="P" title="Plano Profissional" subtitle="Para Corre e Profissional" tone="emerald">
          {professional.active ? (
            <>
              <StatusBadge tone="emerald">Assinatura ativa</StatusBadge>
              <div className="mt-3 text-2xl font-black text-emerald-950 dark:text-white">{professionalPrice} <span className="text-sm text-slate-500 dark:text-slate-400">/ ano</span></div>
              <p className="mt-2 text-sm font-black">Válida até: {dateLabel(professional.expiresAt)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{daysUntil(professional.expiresAt)} dias restantes</p>
              <PlanButton tone="emerald" loading={checkoutLoading === PROFESSIONAL_ANNUAL_PRODUCT_ID} disabled={checkoutDisabled} onClick={() => checkout(PROFESSIONAL_ANNUAL_PRODUCT_ID)}>Renovar assinatura</PlanButton>
              <p className="mt-2 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400">A renovação soma mais 12 meses à validade atual.</p>
            </>
          ) : professional.status === 'trial' ? (
            <>
              <StatusBadge tone="emerald">Período grátis</StatusBadge>
              <div className="mt-3 text-2xl font-black">{professional.daysRemaining} dias restantes</div>
              <p className="mt-2 text-sm font-black">Grátis até {dateLabel(professional.trialEndsAt)}</p>
              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Depois: {professionalPrice}/ano</p>
              <PlanButton tone="emerald" loading={checkoutLoading === PROFESSIONAL_ANNUAL_PRODUCT_ID} disabled={checkoutDisabled} onClick={() => checkout(PROFESSIONAL_ANNUAL_PRODUCT_ID)}>Assinar antecipadamente</PlanButton>
            </>
          ) : professional.status === 'expired' ? (
            <>
              <StatusBadge tone="rose">{professionalPaidExpired ? 'Assinatura vencida' : 'Período grátis encerrado'}</StatusBadge>
              <div className="mt-3 text-xl font-black">{professionalPaidExpired ? `Renove por ${professionalPrice}/ano` : `Continue por ${professionalPrice}/ano`}</div>
              {professional.expiresAt ? <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Venceu em {dateLabel(professional.expiresAt)}</p> : professional.trialEndsAt ? <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Período encerrado em {dateLabel(professional.trialEndsAt)}</p> : null}
              <PlanButton tone="emerald" loading={checkoutLoading === PROFESSIONAL_ANNUAL_PRODUCT_ID} disabled={checkoutDisabled} onClick={() => checkout(PROFESSIONAL_ANNUAL_PRODUCT_ID)}>{professionalPaidExpired ? 'Renovar por R$ 49,90/ano' : 'Assinar por R$ 49,90/ano'}</PlanButton>
            </>
          ) : (
            <>
              <StatusBadge tone="blue">3 meses grátis</StatusBadge>
              <div className="mt-3 text-xl font-black">Período grátis disponível</div>
              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Começa quando você entrar pela primeira vez em Trabalhar.</p>
              <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Depois: {professionalPrice}/ano</p>
              <PlanButton tone="emerald" loading={checkoutLoading === PROFESSIONAL_ANNUAL_PRODUCT_ID} disabled={checkoutDisabled} onClick={() => checkout(PROFESSIONAL_ANNUAL_PRODUCT_ID)}>Assinar antecipadamente</PlanButton>
            </>
          )}
        </PlanShell>
      </div>

      {error ? <p role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">{error}</p> : null}
    </section>
  )
}
