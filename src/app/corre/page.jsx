'use client'

import { useRouter } from 'next/navigation'
import LoginGate from '@/components/LoginGate'
import Mapadinamico from '@/components/Mapadinamico'

export default function CorrePage() {
  const router = useRouter()

  return (
    <LoginGate>
      <Mapadinamico initialMode="corre" onBackToMode={() => router.replace('/')} />
    </LoginGate>
  )
}
