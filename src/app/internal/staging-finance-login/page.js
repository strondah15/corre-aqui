'use client'

import { useRef, useState } from 'react'
import { browserSessionPersistence, setPersistence, signInWithCustomToken, signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { announceSubscriptionRequired } from '@/lib/subscriptionClient'

const errors = {
  operator_required: 'Esta sessão não pode acessar a homologação.',
  sandbox_binding_unconfirmed: 'O servidor não confirmou a aplicação e as contas de teste.',
  test_session_closed: 'A sessão está encerrada ou possui uma tentativa que precisa ser conferida.',
  test_uid_already_exists: 'O UID já possuía cadastro. A gratuidade de teste não foi preparada.',
  trial_seed_conflict: 'A gratuidade de teste não pode ser preparada para este UID.',
  test_subscription_mismatch: 'A tentativa ainda não pôde ser vinculada à assinatura de teste.',
  test_cancellation_required: 'O cancelamento da renovação precisa ser confirmado antes da revogação.',
  test_owner_required: 'A confirmação do comprador é exclusiva da sessão descartável.',
  payer_finalization_not_confirmed: 'A evidência oficial ainda não permite confirmar o comprador deste pagamento de teste.',
  payer_finalization_conflict: 'O registro mudou durante a confirmação. Consulte a homologação novamente.',
  payer_finalization_pending: 'O processamento do pagamento de teste ainda não foi confirmado. Consulte o resultado.',
}

export default function StagingFinanceLoginPage() {
  const running = useRef(false)
  const [pending, setPending] = useState('')
  const [message, setMessage] = useState('')
  const [report, setReport] = useState(null)
  const [checkoutUid, setCheckoutUid] = useState('')
  const [resumeCheckout, setResumeCheckout] = useState(null)

  if (auth.app.options.projectId !== 'corre-aqui-staging') return null

  async function run(action) {
    if (running.current || (action === 'DELETE' && report?.canRevoke !== true)
      || (action === 'PATCH' && report?.canFinalizeSandboxPayer !== true)) return
    running.current = true
    setPending(action)
    setMessage('')
    setReport(null)
    setCheckoutUid('')
    setResumeCheckout(null)
    try {
      await auth.authStateReady()
      const user = auth.currentUser
      if (!user) {
        setMessage('Entre primeiro com a conta autorizada neste Preview.')
        return
      }
      const token = await user.getIdToken()
      if (auth.currentUser?.uid !== user.uid) return
      const response = await fetch('/api/internal/staging-finance-login', {
        method: action,
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const payload = await response.json()
      if (!response.ok) {
        setMessage(Object.hasOwn(errors, payload.error) ? errors[payload.error] : 'A operação de homologação está indisponível.')
        return
      }
      if (auth.currentUser?.uid !== user.uid) return
      if (action === 'GET') {
        const { resumeCheckoutUrl, ...diagnostics } = payload
        setReport(diagnostics)
        if (typeof resumeCheckoutUrl === 'string' && resumeCheckoutUrl) {
          setResumeCheckout({ url: resumeCheckoutUrl, uid: user.uid })
        }
        if (payload.canOpenCheckout === true) setCheckoutUid(user.uid)
      } else if (action === 'DELETE') {
        if (payload.revoked !== true) throw new Error('revocation_unconfirmed')
        if (payload.signOut === true) await signOut(auth)
        setMessage('Acesso temporário revogado.')
      } else if (action === 'PATCH') {
        if (payload.finalized !== true) throw new Error('payer_finalization_unconfirmed')
        setMessage(payload.alreadyProcessed === true
          ? 'O pagamento de teste já estava processado.'
          : 'Comprador confirmado. O pagamento de teste foi reprocessado.')
      } else {
        if (typeof payload.token !== 'string' || !payload.token) throw new Error('test_token_missing')
        await setPersistence(auth, browserSessionPersistence)
        if (auth.currentUser?.uid !== user.uid) return
        await signInWithCustomToken(auth, payload.token)
        window.location.replace('/')
      }
    } catch {
      setMessage('Não foi possível concluir a operação. Confira a conexão e tente novamente.')
    } finally {
      running.current = false
      setPending('')
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-4 px-6">
      <h1 className="text-2xl font-bold">Homologação financeira</h1>
      <button type="button" disabled={Boolean(pending)} onClick={() => run('GET')} className="rounded-xl border border-blue-700 px-5 py-3 text-blue-700">
        Consultar aplicação, assinatura e faturas
      </button>
      <button type="button" disabled={Boolean(pending)} onClick={() => run('POST')} className="rounded-xl bg-blue-700 px-5 py-3 text-white">
        Abrir sessão de teste
      </button>
      {checkoutUid ? (
        <button
          type="button"
          className="rounded-xl bg-blue-700 px-5 py-3 text-white"
          onClick={() => {
            if (auth.currentUser?.uid !== checkoutUid) return
            setCheckoutUid('')
            announceSubscriptionRequired({ kind: 'professional' })
          }}
        >
          Abrir checkout de teste do Plano Profissional
        </button>
      ) : null}
      {resumeCheckout ? (
        <a
          href={resumeCheckout.url}
          referrerPolicy="no-referrer"
          className="rounded-xl bg-blue-700 px-5 py-3 text-center text-white"
          onClick={(event) => {
            if (auth.currentUser?.uid !== resumeCheckout.uid) event.preventDefault()
          }}
        >
          Retomar o checkout existente
        </a>
      ) : null}
      {report?.canRevoke === true ? (
        <button type="button" disabled={Boolean(pending)} onClick={() => run('DELETE')} className="rounded-xl border border-blue-700 px-5 py-3 text-blue-700">
          Revogar acesso temporário
        </button>
      ) : null}
      {report?.canFinalizeSandboxPayer === true ? (
        <button type="button" disabled={Boolean(pending)} onClick={() => run('PATCH')} className="rounded-xl border border-blue-700 px-5 py-3 text-blue-700">
          Confirmar comprador e reprocessar pagamento de teste
        </button>
      ) : null}
      {pending ? <p role="status">Verificando a homologação…</p> : null}
      {message ? <p role="alert">{message}</p> : null}
      {report ? <pre className="overflow-x-auto rounded-xl bg-slate-100 p-4 text-sm">{JSON.stringify(report, null, 2)}</pre> : null}
    </main>
  )
}
