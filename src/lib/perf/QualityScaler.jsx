'use client'
import React, { createContext, useContext, useMemo } from 'react'
import useFps from '../../hooks/useFps'

const QualityCtx = createContext({ level: 'high', fps: 60 })

export function QualityProvider({ children }) {
  const { fps } = useFps(700)
  const level = useMemo(() => {
    const mem = navigator.deviceMemory || 4
    const cores = navigator.hardwareConcurrency || 4
    let base = fps >= 50 ? 'high' : fps >= 35 ? 'medium' : 'low'
    if (fps >= 58 && mem >= 8 && cores >= 8) base = 'ultra'
    if (fps <= 25) base = 'low'
    return base
  }, [fps])

  const value = useMemo(() => ({ level, fps }), [level, fps])
  return <QualityCtx.Provider value={value}>{children}</QualityCtx.Provider>
}

export function useQuality() { return useContext(QualityCtx) }
