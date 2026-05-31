'use client'

import LoginGate from '@/components/LoginGate'
import CorrePainelPage from '@/components/CorrePainelPage'

export default function InboxCorrePage() {
  return (
    <LoginGate>
      <CorrePainelPage tipo="inbox" />
    </LoginGate>
  )
}
