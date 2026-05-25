'use client'

import { useRouter } from 'next/navigation'
import LoginGate from '@/components/LoginGate'
import Mapadinamico from '@/components/Mapadinamico'

export default function ClientePage() {
  const router = useRouter()

  return (
    <LoginGate>
      <Mapadinamico initialMode="cliente" onBackToMode={() => router.replace('/')} />
    </LoginGate>
  )
}
