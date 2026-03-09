'use client'
import dynamic from 'next/dynamic'

// Carrega o mapa apenas no client (sem SSR)
const MapaDinamico = dynamic(() => import('./MapaDinamico'), { ssr: false })

export default function MapaDinamicoWrapper() {
  // Nada de useState/useEffect aqui!
  return <MapaDinamico />
}
