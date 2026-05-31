'use client'

import LoginGate from '@/components/LoginGate'
import CorrePainelPage from '@/components/CorrePainelPage'

export default function SegurancaCorrePage() {
  return (
    <LoginGate>
      <CorrePainelPage tipo="seguranca" />
    </LoginGate>
  )
}
