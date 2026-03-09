'use client'

import { useState } from 'react'
import SplashScreen from '@/components/SplashScreen'
import LoginGate from '@/components/LoginGate'
import ModoGate from '@/components/ModoGate'
export default function Page() {
  const [mostrarLogo, setMostrarLogo] = useState(true)

  // 1️⃣ PRIMEIRO: logo
  if (mostrarLogo) {
    return <SplashScreen onFinish={() => setMostrarLogo(false)} />
  }

  // 2️⃣ DEPOIS: app normal
  return (
    <LoginGate>
      <ModoGate />
    </LoginGate>
  )
}
