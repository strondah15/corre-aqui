'use client'

import LoginGate from '@/components/LoginGate'
import Mapadinamico from '@/components/Mapadinamico'

export default function CorrePage() {
  return (
    <LoginGate>
      <Mapadinamico initialMode="corre" />
    </LoginGate>
  )
}
