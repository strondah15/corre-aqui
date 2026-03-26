'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'

import { database } from '@/lib/firebase'
import { ref, onValue, update, onDisconnect } from 'firebase/database'

export default function Mapadinamico() {
  const [usuarios, setUsuarios] = useState([])

  // 🔥 Atualiza localização
  function atualizarLocalizacao(pos) {
    const uid = localStorage.getItem('meuId')
    if (!uid) return

    update(ref(database, `users/${uid}`), {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      online: true,
      atualizadoEm: Date.now()
    })
  }

  // 🔥 GPS realtime
  useEffect(() => {
    const watch = navigator.geolocation.watchPosition(
      atualizarLocalizacao,
      (err) => console.log(err),
      { enableHighAccuracy: true }
    )

    return () => navigator.geolocation.clearWatch(watch)
  }, [])

  // 🔥 Offline automático
  useEffect(() => {
    const uid = localStorage.getItem('meuId')
    if (!uid) return

    const userRef = ref(database, `users/${uid}`)

    onDisconnect(userRef).update({
      online: false
    })
  }, [])

  // 🔥 Buscar usuários
  useEffect(() => {
    const usersRef = ref(database, 'users')

    const off = onValue(usersRef, (snap) => {
      const data = snap.val() || {}

      const lista = Object.entries(data)
        .map(([id, u]) => ({ id, ...u }))
        .filter(u => u.online && u.latitude && u.longitude)

      setUsuarios(lista)
    })

    return () => off()
  }, [])

  // 🔥 Icone PRO
  function criarIcon(u) {
    return L.divIcon({
      className: '',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center">
          <div style="
            width:42px;
            height:42px;
            border-radius:50%;
            overflow:hidden;
            border:3px solid #22c55e;
            background:#111;
          ">
            ${
              u.foto
                ? `<img src="${u.foto}" style="width:100%;height:100%;object-fit:cover"/>`
                : `<div style="display:flex;align-items:center;justify-content:center;height:100%">
                    ${u.emoji || '🙂'}
                  </div>`
            }
          </div>
          <div style="font-size:10px;color:white;margin-top:2px">
            ${u.nome || 'Usuário'}
          </div>
        </div>
      `,
      iconSize: [50, 60]
    })
  }

  return (
    <MapContainer center={[-23.55, -46.63]} zoom={13} style={{ height: '100vh' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {usuarios.map((u) => (
        <Marker
          key={u.id}
          position={[u.latitude, u.longitude]}
          icon={criarIcon(u)}
        />
      ))}
    </MapContainer>
  )
}
