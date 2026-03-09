'use client'

import { useEffect } from 'react'
import Image from 'next/image'

export default function SplashScreen({ onFinish }) {
  useEffect(() => {
    const t = setTimeout(() => {
      onFinish()
    }, 2000) // tempo do splash

    return () => clearTimeout(t)
  }, [onFinish])

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black">
      <Image
        src="/logo-corre-aqui.png.png"
        alt="Corre Aqui"
        width={180}
        height={180}
        priority
      />
    </div>
  )
}
