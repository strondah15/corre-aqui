'use client'

import { useEffect, useMemo, useState } from 'react'
import { limitToLast, onValue, query, ref } from '@/lib/firebaseDebug'
import { database } from '@/lib/firebase'
import { DEBUG_PRESENCE_ENABLED, splitUsuariosOnline } from '@/lib/presence'
import { canAppearInPublicDirectory, mergePublicProfileWithPresence } from '@/lib/publicWorkProfile'

function debugPresence(message, data = {}) {
  if (!DEBUG_PRESENCE_ENABLED) return
  console.log(`[PRESENCE] ${message}`, data)
}

export default function UsuariosOnline() {
  const [usersObj, setUsersObj] = useState({})
  const [publicProfilesObj, setPublicProfilesObj] = useState({})

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

  useEffect(() => {
    const profilesRef = query(ref(database, 'publicProfiles'), limitToLast(300))
    debugPresence('lendo publicProfiles para presença pública', { path: 'publicProfiles', origem: 'UsuariosOnline' })
    const off = onValue(
      profilesRef,
      (snap) => {
        setPublicProfilesObj(snap.val() || {})
      },
      (error) => {
        console.warn('[PRESENCE] erro lendo publicProfiles', error)
        setPublicProfilesObj({})
      }
    )

    return () => off()
  }, [])

  const { usuariosOnlineLista, usuariosOnlineMapa } = useMemo(() => {
    const now = Date.now()
    const publicProfilesByUid = new Map(
      Object.entries(publicProfilesObj || {})
        .map(([uid, profile]) => [{ uid, id: uid, ...(profile || {}) }])
        .filter((profile) => canAppearInPublicDirectory(profile))
        .map((profile) => [String(profile.uid || profile.id), profile])
    )
    const publicPresence = Object.fromEntries(
      Object.entries(usersObj || {})
        .map(([uid, presence]) => {
          const publicProfile = publicProfilesByUid.get(String(uid))
          const merged = publicProfile
            ? mergePublicProfileWithPresence(publicProfile, { uid, id: uid, ...(presence || {}) }, now)
            : null
          return merged ? [uid, merged] : null
        })
        .filter(Boolean)
    )
    return splitUsuariosOnline(publicPresence, now)
  }, [usersObj, publicProfilesObj])

  return (
    <span className="sr-only" aria-hidden="true">
      Presenca online ativa: {usuariosOnlineLista.length}; no mapa: {usuariosOnlineMapa.length}
    </span>
  )
}
