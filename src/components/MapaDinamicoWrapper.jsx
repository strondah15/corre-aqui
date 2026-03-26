'use client'

import dynamic from 'next/dynamic'

// 🔥 Importa mapa SEM SSR (resolve erro da Vercel)
const Mapadinamico = dynamic(() => import('./Mapadinamico'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      color: 'white'
    }}>
      Carregando mapa...
    </div>
  )
})

export default function MapaDinamicoWrapper() {
  return <Mapadinamico />
}
