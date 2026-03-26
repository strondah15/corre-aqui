'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'

import { database } from '@/lib/firebase'
import { ref, onValue, update, onDisconnect } from 'firebase/database'

export default function Mapadinamico() {
  const [usuarios, setUsuarios] = useState([])
  const [busca, setBusca] = useState('')

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

  useEffect(() => {
    if (typeof window === 'undefined') return

    const watch = navigator.geolocation.watchPosition(
      atualizarLocalizacao,
      (err) => console.log(err),
      { enableHighAccuracy: true }
    )

    return () => navigator.geolocation.clearWatch(watch)
  }, [])

  useEffect(() => {
    const uid = localStorage.getItem('meuId')
    if (!uid) return

    const userRef = ref(database, `users/${uid}`)

    onDisconnect(userRef).update({
      online: false
    })
  }, [])

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

  const usuariosFiltrados = usuarios.filter(u =>
    (u.nome || '').toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div style={{ position: 'relative' }}>

      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 999,
        width: 250
      }}>
        <input
          type="text"
          placeholder="Buscar usuário..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '10px',
            border: 'none'
          }}
        />
      </div>

      <MapContainer
        center={[-23.55, -46.63]}
        zoom={13}
        style={{ height: '100vh' }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {usuariosFiltrados.map((u) => (
          <Marker
            key={u.id}
            position={[u.latitude, u.longitude]}
            icon={criarIcon(u)}
          />
        ))}
      </MapContainer>
    </div>
  )
}
