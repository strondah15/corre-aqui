'use client'

import { useEffect, useMemo, useState } from 'react'
import { onValue, ref } from 'firebase/database'
import { database } from '@/lib/firebase'
import { splitUsuariosOnline } from '@/lib/presence'

export default function UsuariosOnline() {
  const [usersObj, setUsersObj] = useState({})

  useEffect(() => {
    const usersRef = ref(database, 'presence')
    console.log('[PRESENCE] lendo presence', { path: 'presence', origem: 'UsuariosOnline' })
    const off = onValue(
      usersRef,
      (snap) => {
        const raw = snap.val() || {}
        console.log('[PRESENCE] total bruto de children em /presence', {
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
