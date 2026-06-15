'use client'

import { useEffect, useMemo, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { database } from '@/lib/firebase'
import { DEBUG_PRESENCE_ENABLED, splitUsuariosOnline } from '@/lib/presence'

function debugPresence(message, data = {}) {
  if (!DEBUG_PRESENCE_ENABLED) return
  console.log(`[PRESENCE] ${message}`, data)
}

export default function UsuariosOnline() {
  const [usersObj, setUsersObj] = useState({})

  useEffect(() => {
    const usersRef = ref(database, 'presence')
    debugPresence('lendo presence', { path: 'presence', origem: 'UsuariosOnline' })
    const off = onValue(
      usersRef,
      (snap) => {
        const raw = snap.val() || {}
        debugPresence('total bruto de children em /presence', {
          total: Object.keys(raw).length,
          origem: 'UsuariosOnline',
        })
        setUsersObj(raw)
      },
      (error) => {
        console.warn('[PRESENCE] erro lendo presence', error)
      }
    )

    return () => off()
  }, [])

  const { usuariosOnlineLista, usuariosOnlineMapa } = useMemo(() => {
    return splitUsuariosOnline(usersObj)
  }, [usersObj])

  return (
    <span className="sr-only" aria-hidden="true">
      Presenca online ativa: {usuariosOnlineLista.length}; no mapa: {usuariosOnlineMapa.length}
    </span>
  )
}
