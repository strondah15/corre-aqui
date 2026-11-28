'use client'

import { useEffect, useState } from 'react'
import {
  getProfessionalServicesErrorMessage,
  listPublicProfessionalServices,
} from '@/lib/professionalServicesClient'

const idleState = Object.freeze({
  status: 'idle',
  services: [],
  source: 'none',
  portfolioSchemaVersion: 0,
  error: null,
})

export default function usePublicProfessionalServices({ user, targetUid, enabled = true } = {}) {
  const viewerUid = String(user?.uid || '')
  const professionalId = String(targetUid || '')
  const [state, setState] = useState(idleState)

  useEffect(() => {
    const controller = new AbortController()
    if (!enabled || !viewerUid || !professionalId || typeof user?.getIdToken !== 'function') {
      const error = new Error('professional_service_auth_required')
      error.code = 'professional_service_auth_required'
      setState({ ...idleState, status: 'auth_error', error })
      return () => controller.abort()
    }

    setState((current) => ({ ...current, status: 'loading', error: null }))
    listPublicProfessionalServices({
      user,
      expectedUid: viewerUid,
      targetUid: professionalId,
      signal: controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return
      setState({
        status: 'loaded',
        services: Array.isArray(result?.services) ? result.services : [],
        source: String(result?.source || 'none'),
        portfolioSchemaVersion: Number(result?.portfolioSchemaVersion || 0),
        error: null,
      })
    }).catch((error) => {
      if (controller.signal.aborted) return
      setState({ ...idleState, status: error?.status === 401 ? 'auth_error' : 'error', error })
    })

    return () => controller.abort()
  }, [enabled, professionalId, user, viewerUid])

  return {
    ...state,
    errorMessage: state.error ? getProfessionalServicesErrorMessage(state.error) : '',
  }
}
