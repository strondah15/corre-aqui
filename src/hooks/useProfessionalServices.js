'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createOwnProfessionalService,
  deleteOwnProfessionalService,
  editOwnProfessionalService,
  getProfessionalServicesErrorMessage,
  listOwnProfessionalServices,
} from '@/lib/professionalServicesClient'

const emptyState = Object.freeze({
  status: 'idle',
  services: [],
  featureEnabled: false,
  error: null,
  loadedUid: '',
})

export default function useProfessionalServices({ user, expectedUid, enabled = true } = {}) {
  const uid = String(expectedUid || user?.uid || '')
  const userRef = useRef(user)
  const generationRef = useRef(0)
  const readControllerRef = useRef(null)
  const mutationControllerRef = useRef(null)
  const mutationLockRef = useRef(false)
  const [state, setState] = useState(emptyState)
  const [mutation, setMutation] = useState({ pending: false, error: null })

  userRef.current = user

  const abortPending = useCallback(() => {
    readControllerRef.current?.abort()
    mutationControllerRef.current?.abort()
    readControllerRef.current = null
    mutationControllerRef.current = null
    mutationLockRef.current = false
  }, [])

  const reload = useCallback(async ({ quiet = false } = {}) => {
    const activeUser = userRef.current
    const activeUid = String(expectedUid || activeUser?.uid || '')
    const generation = generationRef.current

    readControllerRef.current?.abort()
    if (!enabled || !activeUid || String(activeUser?.uid || '') !== activeUid) {
      const error = new Error('professional_service_auth_required')
      error.code = 'professional_service_auth_required'
      setState({ status: 'auth_error', services: [], featureEnabled: false, error, loadedUid: activeUid })
      throw error
    }

    const controller = new AbortController()
    readControllerRef.current = controller
    if (!quiet) {
      setState((current) => ({
        ...current,
        status: current.loadedUid === activeUid ? 'refreshing' : 'loading',
        error: null,
      }))
    }

    try {
      const result = await listOwnProfessionalServices({
        user: activeUser,
        expectedUid: activeUid,
        signal: controller.signal,
      })
      if (generationRef.current !== generation || controller.signal.aborted) return null
      const services = Array.isArray(result?.services) ? result.services : []
      setState({
        status: 'loaded',
        services,
        featureEnabled: result?.featureEnabled === true,
        error: null,
        loadedUid: activeUid,
      })
      return services
    } catch (error) {
      if (generationRef.current !== generation || controller.signal.aborted) return null
      setState((current) => ({
        status: error?.status === 401 ? 'auth_error' : 'error',
        services: current.loadedUid === activeUid ? current.services : [],
        featureEnabled: false,
        error,
        loadedUid: activeUid,
      }))
      throw error
    } finally {
      if (readControllerRef.current === controller) readControllerRef.current = null
    }
  }, [enabled, expectedUid])

  useEffect(() => {
    generationRef.current += 1
    abortPending()
    setMutation({ pending: false, error: null })
    setState(emptyState)

    if (!enabled) return undefined
    if (!uid || String(user?.uid || '') !== uid) {
      const error = new Error('professional_service_auth_required')
      error.code = 'professional_service_auth_required'
      setState({ status: 'auth_error', services: [], featureEnabled: false, error, loadedUid: uid })
      return undefined
    }

    reload().catch(() => {})
    return () => {
      generationRef.current += 1
      abortPending()
    }
  }, [abortPending, enabled, reload, uid, user?.uid])

  const runMutation = useCallback(async (request) => {
    if (mutationLockRef.current) {
      const error = new Error('professional_service_mutation_in_progress')
      error.code = 'professional_service_mutation_in_progress'
      throw error
    }

    const activeUser = userRef.current
    const activeUid = String(expectedUid || activeUser?.uid || '')
    if (!enabled || !activeUid || String(activeUser?.uid || '') !== activeUid) {
      const error = new Error('professional_service_auth_required')
      error.code = 'professional_service_auth_required'
      throw error
    }

    mutationLockRef.current = true
    const generation = generationRef.current
    const controller = new AbortController()
    mutationControllerRef.current = controller
    setMutation({ pending: true, error: null })

    try {
      const result = await request({
        user: activeUser,
        expectedUid: activeUid,
        signal: controller.signal,
      })
      if (generationRef.current !== generation || controller.signal.aborted) {
        const error = new Error('professional_service_request_aborted')
        error.code = 'professional_service_request_aborted'
        throw error
      }
      await reload({ quiet: true }).catch(() => null)
      setMutation({ pending: false, error: null })
      return result
    } catch (error) {
      if (generationRef.current === generation && !controller.signal.aborted) {
        setMutation({ pending: false, error })
      }
      throw error
    } finally {
      if (mutationControllerRef.current === controller) mutationControllerRef.current = null
      mutationLockRef.current = false
    }
  }, [enabled, expectedUid, reload])

  const createService = useCallback((payload) => runMutation((options) => (
    createOwnProfessionalService({ ...payload, ...options })
  )), [runMutation])

  const editService = useCallback((payload) => runMutation((options) => (
    editOwnProfessionalService({ ...payload, ...options })
  )), [runMutation])

  const deleteService = useCallback((payload) => runMutation((options) => (
    deleteOwnProfessionalService({ ...payload, ...options })
  )), [runMutation])

  return {
    ...state,
    errorMessage: state.error ? getProfessionalServicesErrorMessage(state.error) : '',
    mutationPending: mutation.pending,
    mutationError: mutation.error,
    mutationErrorMessage: mutation.error ? getProfessionalServicesErrorMessage(mutation.error) : '',
    reload,
    createService,
    editService,
    deleteService,
    abortPending,
  }
}
