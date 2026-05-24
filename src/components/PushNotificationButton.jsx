'use client'

import { useEffect, useState } from 'react'
import { ativarPushNotifications, getPushCapabilities, testarPushNotification } from '@/lib/pushClient'

function tokenPreview(token) {
  const value = String(token || '')
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

export default function PushNotificationButton({ uid, compact = false, className = '' }) {
  const [info, setInfo] = useState({
    supported: false,
    permission: 'default',
    reason: 'Verificando notificacoes...',
  })
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    let active = true

    getPushCapabilities()
      .then((next) => {
        if (active) setInfo(next)
      })
      .catch((error) => {
        if (!active) return
        setInfo({
          supported: false,
          permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
          reason: error?.message || 'Push indisponivel agora.',
        })
      })

    return () => {
      active = false
    }
  }, [])

  async function handleAtivar() {
    if (loading) return
    if (!uid) {
      setStatus('Entre no app para salvar o token neste perfil.')
      return
    }

    try {
      setLoading(true)
      setStatus('Abrindo permissao do navegador...')

      const result = await ativarPushNotifications(uid)
      setInfo((prev) => ({ ...prev, supported: true, permission: result.permission }))
      setStatus(`Permissão concedida\nToken salvo: ${tokenPreview(result.token)}`)
    } catch (error) {
      const nextInfo = await getPushCapabilities().catch(() => null)
      if (nextInfo) setInfo(nextInfo)
      setStatus(error?.message || 'Nao consegui ativar notificacoes agora.')
    } finally {
      setLoading(false)
    }
  }

  async function handleTestar() {
    if (testing) return
    if (!uid) {
      setStatus('Faça login para testar.')
      return
    }

    try {
      setTesting(true)
      setStatus('Pedindo permissão...')

      const result = await ativarPushNotifications(uid)
      setInfo((prev) => ({ ...prev, supported: true, permission: result.permission }))
      setStatus(`Permissão concedida\nToken salvo: ${tokenPreview(result.token)}\nEnviando notificação teste...`)

      const sent = await testarPushNotification(uid)
      setStatus(
        [
          'Permissão concedida',
          `Token salvo: ${tokenPreview(result.token)}`,
          `Notificação teste enviada (${sent.successCount || 0} entregue, ${sent.failureCount || 0} falha).`,
        ].join('\n')
      )
    } catch (error) {
      const nextInfo = await getPushCapabilities().catch(() => null)
      if (nextInfo) setInfo(nextInfo)
      setStatus(error?.message || 'Nao consegui testar notificacoes agora.')
    } finally {
      setTesting(false)
    }
  }

  const permission = info.permission || 'default'
  const disabled = loading || testing || !uid

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleAtivar}
        disabled={disabled}
        className={[
          'relative z-50 w-full pointer-events-auto rounded-[20px] font-black text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
          compact ? 'h-11 px-4 text-xs' : 'h-13 px-5 py-4 text-sm',
          permission === 'granted'
            ? 'bg-emerald-600 shadow-[0_14px_34px_rgba(16,185,129,0.24)] hover:bg-emerald-500'
            : 'bg-gradient-to-r from-blue-600 to-cyan-500 shadow-[0_14px_34px_rgba(37,99,235,0.28)] hover:from-blue-500 hover:to-cyan-400',
        ].join(' ')}
      >
        {loading ? 'Ativando...' : permission === 'granted' ? 'Reativar notificações' : 'Ativar notificações'}
      </button>

      <button
        type="button"
        onClick={handleTestar}
        disabled={disabled}
        className={[
          'relative z-50 mt-2 w-full pointer-events-auto rounded-[20px] border border-white/10 bg-white/[0.06] font-black text-white transition hover:bg-white/[0.1] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
          compact ? 'h-11 px-4 text-xs' : 'h-12 px-5 text-sm',
        ].join(' ')}
      >
        {testing ? 'Testando...' : '🔔 Testar notificação'}
      </button>

      <div className={compact ? 'mt-2 text-[11px] font-bold text-slate-400' : 'mt-2 text-xs font-semibold leading-relaxed text-slate-400'}>
        Permissao: {permission}
        {!info.supported && info.reason ? ` · ${info.reason}` : ''}
      </div>

      {status ? (
        <div className={compact ? 'mt-2 whitespace-pre-line text-[11px] font-bold text-cyan-200' : 'mt-2 whitespace-pre-line rounded-2xl border border-cyan-300/15 bg-cyan-400/10 px-3 py-2 text-xs font-bold text-cyan-100'}>
          {status}
        </div>
      ) : null}
    </div>
  )
}
