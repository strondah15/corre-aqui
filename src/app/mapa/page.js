'use client'
import dynamic from 'next/dynamic'
import UsuariosOnline from '@/components/UsuariosOnline'

const Mapadinamico = dynamic(() => import('@/components/Mapadinamico'), {
  ssr: false,
})

export default function Page() {
  return (
    <>
      <Mapadinamico initialMode="cliente" />
      <UsuariosOnline />
    </>
  )
}
