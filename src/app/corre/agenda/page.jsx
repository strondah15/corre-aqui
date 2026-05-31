'use client'

import LoginGate from '@/components/LoginGate'
import CorrePainelPage from '@/components/CorrePainelPage'

export default function AgendaCorrePage() {
  return (
    <LoginGate>
      <CorrePainelPage tipo="agenda" />
    </LoginGate>
  )
}
