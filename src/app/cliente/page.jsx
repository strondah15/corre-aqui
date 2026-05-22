'use client'

import LoginGate from '@/components/LoginGate'
import Mapadinamico from '@/components/Mapadinamico'

export default function ClientePage() {
  return (
    <LoginGate>
      <Mapadinamico initialMode="cliente" />
    </LoginGate>
  )
}
