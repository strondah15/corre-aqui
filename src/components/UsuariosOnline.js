'use client'

import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, update, onDisconnect } from 'firebase/database'
import { database } from '@/lib/firebase'

// ✅ cria um id persistente no navegador (não muda a cada refresh)
function getOrCreateUserId() {
  if (typeof window === 'undefined') return null
  const key = 'correaqui_uid'
  let id = localStorage.getItem(key)
  if (!id) {
    id = (crypto?.randomUUID?.() || `u_${Math.random().toString(16).slice(2)}_${Date.now()}`)
    localStorage.setItem(key, id)
  }
  return id
}

const ONLINE_TTL_MS = 45_000

export default function UsuariosOnline() {
  const [meuId, setMeuId] = useState('')
  const [meuNome, setMeuNome] = useState('')
  const [usersObj, setUsersObj] = useState(null)

  // 1) id + nome
  useEffect(() => {
    const id = getOrCreateUserId()
    if (!id) return
    setMeuId(id)

    let nome = ''
    if (typeof window !== 'undefined') {
      nome = localStorage.getItem('correaqui_nome') || ''
      if (!nome) {
        nome = prompt('Digite seu nome para aparecer online:') || 'Anônimo'
        localStorage.setItem('correaqui_nome', nome)
      }
    }
    setMeuNome(nome)
  }, [])

  // 2) presença real (connected + onDisconnect) + heartbeat
  useEffect(() => {
    if (!meuId) return
    const userRef = ref(database, `users/${meuId}`)
    const connectedRef = ref(database, '.info/connected')

    const unsub = onValue(connectedRef, (snap) => {
      const connected = snap.val() === true
      if (!connected) return

      // se cair conexão, marca offline automaticamente
      onDisconnect(userRef).update({
        online: false,
        lastSeen: Date.now(),
      })

      // marca online ao conectar
      update(userRef, {
        nome: meuNome || 'Anônimo',
        online: true,
        lastSeen: Date.now(),
      })
    })

    // heartbeat (mantém lastSeen vivo)
    const t = setInterval(() => {
      update(userRef, {
        nome: meuNome || 'Anônimo',
        online: true,
        lastSeen: Date.now(),
      })
    }, 12_000)

    return () => {
      clearInterval(t)
      unsub()
      // não precisa remover do banco; presença vai expirar pelo TTL
    }
  }, [meuId, meuNome])

  // 3) local (GPS) atualiza junto (sem travar)
  useEffect(() => {
    if (!meuId) return
    if (!navigator?.geolocation) return

    const userRef = ref(database, `users/${meuId}`)

    const atualizar = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          update(userRef, {
            local: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            lastSeen: Date.now(),
          })
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }

    atualizar()
    const t = setInterval(atualizar, 15_000)
    return () => clearInterval(t)
  }, [meuId])

  // 4) ler /users pra contar e (se quiser) listar
  useEffect(() => {
    const usersRef = ref(database, 'users')
    const unsub = onValue(usersRef, (snap) => {
      setUsersObj(snap.val() || {})
    })
    return () => unsub()
  }, [])

  const onlineUsers = useMemo(() => {
    const now = Date.now()
    return Object.entries(usersObj || {})
      .map(([id, u]) => ({ id, ...u }))
      .filter((u) => u?.online === true && (now - Number(u?.lastSeen || 0)) <= ONLINE_TTL_MS)
      .sort((a, b) => Number(b?.lastSeen || 0) - Number(a?.lastSeen || 0))
  }, [usersObj])

  return (
    <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-xl p-4 border border-blue-500 text-sm z-[7000]">
      <p>✅ Online como: <strong>{meuNome || '...'}</strong></p>
      <p>👥 Usuários online: <strong>{onlineUsers.length}</strong></p>

      {/* opcional: mini lista */}
      {onlineUsers.length > 0 && (
        <div className="mt-2 max-h-40 overflow-auto pr-1">
          {onlineUsers.slice(0, 12).map((u) => (
            <div key={u.id} className="text-xs text-gray-700">
              • {u.nome || 'Anônimo'}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
