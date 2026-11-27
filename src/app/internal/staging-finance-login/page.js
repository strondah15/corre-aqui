'use client'

import { useRef, useState } from 'react'
import { browserSessionPersistence, setPersistence, signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { announceSubscriptionRequired } from '@/lib/subscriptionClient'

function maskId(value) {
  return typeof value === 'string' && /^\d{5,30}$/.test(value) ? `…${value.slice(-4)}` : null
}

function safeStatus(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{0,47}$/.test(value) ? value : null
}

function safeDate(value) {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function safeReport(payload) {
  return {
    status: safeStatus(payload?.status),
    nextPaymentDate: safeDate(payload?.nextPaymentDate),
    intervalMonths: Number.isSafeInteger(payload?.intervalMonths) ? payload.intervalMonths : null,
    amountInCents: Number.isSafeInteger(payload?.amountInCents) ? payload.amountInCents : null,
    invoices: (Array.isArray(payload?.invoices) ? payload.invoices.slice(0, 5) : []).map((invoice) => ({
      invoice: maskId(invoice?.invoice),
      status: safeStatus(invoice?.status),
      debitDate: safeDate(invoice?.debitDate),
      payment: invoice?.payment ? {
        id: maskId(invoice.payment.id),
        state: safeStatus(invoice.payment.state),
        detail: safeStatus(invoice.payment.detail),
        amountInCents: Number.isSafeInteger(invoice.payment.amountInCents) ? invoice.payment.amountInCents : null,
        currency: invoice.payment.currency === 'BRL' ? 'BRL' : null,
        approvedAt: safeDate(invoice.payment.approvedAt),
        liveMode: typeof invoice.payment.liveMode === 'boolean' ? invoice.payment.liveMode : null,
        collectorMatches: typeof invoice.payment.collectorMatches === 'boolean' ? invoice.payment.collectorMatches : null,
      } : null,
    })),
  }
}

export default function StagingFinanceLoginPage() {
  const running = useRef(false)
  const [pending, setPending] = useState('')
  const [message, setMessage] = useState('')
  const [report, setReport] = useState(null)
  const [checkoutUid, setCheckoutUid] = useState('')

  if (auth.app.options.projectId !== 'corre-aqui-staging') return null

  async function run(action) {
    if (running.current) return
    const login = action === 'login'
    running.current = true
    setPending(action)
    setMessage('')
    setReport(null)
    setCheckoutUid('')
    try {
      await auth.authStateReady()
      const currentUser = auth.currentUser
      if (!currentUser) {
        setMessage('Entre primeiro com a conta autorizada neste Preview.')
        return
      }
      const idToken = await currentUser.getIdToken()
      if (auth.currentUser?.uid !== currentUser.uid) {
        setMessage('A conta ativa mudou. Confira a sessão e tente novamente.')
        return
      }
      const response = await fetch('/api/internal/staging-finance-login', {
        method: login ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${idToken}` },
        cache: 'no-store',
      })
      if (!response.ok) {
        setMessage(response.status === 403 ? 'Esta sessão não pode acessar a homologação.' : 'A operação está indisponível agora.')
        return
      }
      const payload = await response.json()
      if (auth.currentUser?.uid !== currentUser.uid) {
        setMessage('A conta ativa mudou. Confira a sessão e tente novamente.')
        return
      }
      if (!login) {
        setReport(safeReport(payload))
        if (payload.allowTestCheckout === true && payload.status === 'no_test_subscription') setCheckoutUid(currentUser.uid)
        return
      }
      const { token } = payload
      if (typeof token !== 'string' || !token) {
        setMessage('Não foi possível confirmar a sessão de teste.')
        return
      }
      await setPersistence(auth, browserSessionPersistence)
      if (auth.currentUser?.uid !== currentUser.uid) {
        setMessage('A conta ativa mudou. Confira a sessão e tente novamente.')
        return
      }
      await signInWithCustomToken(auth, token)
      window.location.replace('/')
    } catch {
      setMessage('Não foi possível concluir a operação. Confira a conexão e tente novamente.')
    } finally {
      running.current = false
      setPending('')
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-6">
      <h1 className="text-2xl font-bold">Homologação financeira</h1>
      <p>Use este Preview para abrir a conta isolada de teste.</p>
      <button
        type="button"
        disabled={Boolean(pending)}
        onClick={() => run('login')}
        className="rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60"
      >
        {pending === 'login' ? 'Abrindo sessão de teste…' : 'Abrir sessão de teste'}
      </button>
      <button
        type="button"
        disabled={Boolean(pending)}
        onClick={() => run('inspect')}
        className="rounded-2xl border border-blue-700 px-5 py-3 font-semibold text-blue-700 disabled:opacity-60"
      >
        {pending === 'inspect' ? 'Consultando o Mercado Pago…' : 'Consultar faturas no Mercado Pago'}
      </button>
      {checkoutUid ? (
        <button
          type="button"
          onClick={() => {
            if (auth.currentUser?.uid !== checkoutUid) return
            setCheckoutUid('')
            announceSubscriptionRequired({ kind: 'client' })
          }}
          className="rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white"
        >
          Abrir checkout de teste do Plano Cliente
        </button>
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
      {report ? <pre className="overflow-x-auto rounded-xl bg-slate-100 p-4 text-sm">{JSON.stringify(report, null, 2)}</pre> : null}
    </main>
  )
}
