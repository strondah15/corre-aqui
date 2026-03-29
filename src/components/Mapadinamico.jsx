'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import PerfilPublico from '@/components/PerfilPublico'

export default function Mapadinamico() {
  const [usuarioSelecionado, setUsuarioSelecionado] = useState(null)

  // 🔥 MOCK (substitui depois pelo Firebase)
  const [usuarios, setUsuarios] = useState([
    {
      id: '1',
      nome: 'João Eletricista',
      cidade: 'São Paulo',
      latitude: -23.55,
      longitude: -46.63,
      profissional: {
        titulo: 'Eletricista',
        descricao: 'Instalação e manutenção elétrica',
        preco: '50',
        whatsapp: '5511999999999'
      }
    }
  ])

  return (
    <>
      <MapContainer
        center={[-23.55, -46.63]}
        zoom={13}
        style={{ height: '100vh' }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {usuarios.map((u) => (
          <Marker
            key={u.id}
            position={[u.latitude, u.longitude]}
            eventHandlers={{
              click: () => setUsuarioSelecionado(u)
            }}
          />
        ))}
      </MapContainer>

      {usuarioSelecionado && (
        <PerfilPublico
          user={usuarioSelecionado}
          onClose={() => setUsuarioSelecionado(null)}
        />
      )}
    </>
  )
}
