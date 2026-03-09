'use client'
import dynamic from 'next/dynamic'
import UsuariosOnline from '@/components/UsuariosOnline'

const MapaPedidos = dynamic(() => import('@/lib/mapapedidos'), {
  ssr: false,
})

export default function Page() {
  return (
    <>
      <MapaPedidos />
      <UsuariosOnline />
    </>
  )
}