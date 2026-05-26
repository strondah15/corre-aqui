'use client'
import dynamic from 'next/dynamic'
import LoginGate from '@/components/LoginGate'
import UsuariosOnline from '@/components/UsuariosOnline'

const Mapadinamico = dynamic(() => import('@/components/Mapadinamico'), {
  ssr: false,
})

export default function Page() {
  return (
    <LoginGate>
      <Mapadinamico initialMode="cliente" />
      <UsuariosOnline />
    </LoginGate>
  )
}
