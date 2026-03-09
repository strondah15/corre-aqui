import { useEffect, useRef, useState } from 'react'
export default function useFps(intervalMs = 500) {
  const [fps, setFps] = useState(60)
  const frames = useRef(0), last = useRef(performance.now())
  const rafId = useRef(null), timer = useRef(null)
  useEffect(() => {
    const loop = () => { frames.current += 1; rafId.current = requestAnimationFrame(loop) }
    rafId.current = requestAnimationFrame(loop)
    timer.current = setInterval(() => {
      const now = performance.now(), delta = (now - last.current) / 1000
      setFps(Math.round(frames.current / (delta || 1)))
      frames.current = 0; last.current = now
    }, intervalMs)
    return () => { if (rafId.current) cancelAnimationFrame(rafId.current); if (timer.current) clearInterval(timer.current) }
  }, [intervalMs])
  return { fps }
}
