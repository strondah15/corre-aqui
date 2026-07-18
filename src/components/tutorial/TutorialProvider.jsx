"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { get, ref, update } from "firebase/database"
import { onAuthStateChanged } from "firebase/auth"
import { auth, database } from "@/lib/firebase"
import { ASSISTANT_TOPICS, TUTORIAL_ACTIONS, TUTORIAL_EVENTS, TUTORIAL_FLOWS, TUTORIAL_KEYS, findStepIndex, getFlowForMode } from "@/lib/tutorial/tutorialConfig"
import { CONTEXTUAL_TIP_LIST, getContextualTipConfig, resolveContextualTip } from "@/lib/tutorial/contextualTipsConfig"

const TutorialContext = createContext(null)
const TARGET_TIMEOUT_MS = 2800
const TARGET_RETRY_MS = 80

function isBrowser() {
  return typeof window !== "undefined"
}

function readLocalFlag(key) {
  if (!isBrowser()) return false
  try {
    return window.localStorage.getItem(key) === "true"
  } catch {
    return false
  }
}

function writeLocalFlag(key, value = true) {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(key, value ? "true" : "false")
  } catch {}
}

function removeLocalFlag(key) {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

function writeLocalValue(key, value) {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(key, String(value))
  } catch {}
}

function readLocalMode() {
  if (!isBrowser()) return "cliente"
  try {
    const saved = String(window.localStorage.getItem("modoApp") || "").toLowerCase()
    return saved === "corre" ? "corre" : "cliente"
  } catch {
    return "cliente"
  }
}

function hasSelectedMode() {
  if (!isBrowser()) return false
  try {
    const saved = String(window.localStorage.getItem("modoApp") || "").toLowerCase()
    return saved === "cliente" || saved === "corre"
  } catch {
    return false
  }
}

function shouldOfferClientTutorial() {
  return !readLocalFlag(TUTORIAL_KEYS.cliente) && !readLocalFlag(TUTORIAL_KEYS.clientePulado)
}

function shouldOfferWorkerTutorial() {
  return !readLocalFlag(TUTORIAL_KEYS.trabalhar) && !readLocalFlag(TUTORIAL_KEYS.trabalharPulado)
}

function safeRoute(route) {
  if (!route || typeof route !== "string") return ""
  if (!route.startsWith("/")) return ""
  if (route.startsWith("//")) return ""
  return route
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = window.setTimeout(resolve, ms)
    signal?.addEventListener?.("abort", () => {
      window.clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

function targetSelectors(target) {
  const raw = String(target || "").trim()
  if (!raw) return []
  if (raw.startsWith("[") || raw.startsWith(".") || raw.startsWith("#")) return [raw]
  const escaped = raw.replace(/["\\]/g, "\\$&")
  return [`[data-tutorial="${escaped}"]`, `[data-tutorial-alt~="${escaped}"]`]
}

function isElementVisible(element) {
  if (!element || !isBrowser() || !element.isConnected) return false
  const rect = element.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false

  let current = element
  while (current && current.nodeType === 1) {
    const style = window.getComputedStyle(current)
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false
    current = current.parentElement
  }

  return true
}

function getTargetElement(target, options = {}) {
  if (!isBrowser() || !target) return null
  const selectors = targetSelectors(target)
  const candidates = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))
  if (options.requireVisible === false) return candidates[0] || null
  return candidates.find((element) => isElementVisible(element)) || null
}

function getTargetFailureReason(target) {
  const element = getTargetElement(target, { requireVisible: false })
  if (!element) return "missing"
  if (!isElementVisible(element)) return "hidden"
  return "unknown"
}

function waitForTarget(target, options = {}) {
  const timeoutMs = Number(options.timeoutMs || TARGET_TIMEOUT_MS)
  const signal = options.signal
  return new Promise((resolve) => {
    if (!target || !isBrowser() || signal?.aborted) {
      resolve({ element: null, reason: "cancelled" })
      return
    }

    const startedAt = Date.now()
    let observer = null
    let interval = null
    let timeout = null
    let done = false

    const cleanup = () => {
      observer?.disconnect()
      if (interval) window.clearInterval(interval)
      if (timeout) window.clearTimeout(timeout)
    }

    const finish = (result) => {
      if (done) return
      done = true
      cleanup()
      resolve(result)
    }

    const tick = () => {
      if (signal?.aborted) {
        finish({ element: null, reason: "cancelled" })
        return
      }
      const element = getTargetElement(target)
      if (element) {
        finish({ element, reason: "ready" })
        return
      }
      if (Date.now() - startedAt >= timeoutMs) {
        finish({ element: null, reason: getTargetFailureReason(target) })
      }
    }

    if (!document.body) {
      finish({ element: null, reason: "missing" })
      return
    }

    observer = new MutationObserver(tick)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "data-tutorial", "data-tutorial-alt"] })
    interval = window.setInterval(tick, TARGET_RETRY_MS)
    timeout = window.setTimeout(() => finish({ element: null, reason: getTargetFailureReason(target) }), timeoutMs)
    signal?.addEventListener?.("abort", () => finish({ element: null, reason: "cancelled" }), { once: true })
    tick()
  })
}

function calculateRect(element) {
  if (!element || !isBrowser()) return null
  const rect = element.getBoundingClientRect()
  const pad = window.innerWidth < 640 ? 8 : 12
  const edge = window.innerWidth < 640 ? 12 : 16
  const topSafe = edge
  const bottomSafe = edge
  const left = Math.max(edge, rect.left - pad)
  const top = Math.max(topSafe, rect.top - pad)
  const right = Math.min(window.innerWidth - edge, rect.right + pad)
  const bottom = Math.min(window.innerHeight - bottomSafe, rect.bottom + pad)

  return {
    left,
    top,
    width: Math.max(44, right - left),
    height: Math.max(44, bottom - top),
    right,
    bottom,
  }
}

function isIntroAllowed(pathname) {
  const path = String(pathname || "/")
  return !["/login", "/cadastro"].some((blocked) => path.startsWith(blocked))
}

function allowsInformativeFallback(step) {
  return step?.allowInformativeFallback === true || step?.informativeWhenMissing === true
}

function warnUnavailableTarget({ flowId, step, reason, pathname }) {
  if (process.env.NODE_ENV === "production") return
  console.warn("[Tutorial] Alvo indisponivel", {
    flowId,
    stepId: step?.id,
    route: step?.route || pathname,
    target: step?.target,
    reason,
    prepare: step?.prepare || [],
  })
}

async function runStepPreparation({ flowId, step, signal }) {
  if (!isBrowser() || !step?.prepare?.length) return
  for (const action of step.prepare) {
    if (signal?.aborted) return
    window.dispatchEvent(new CustomEvent(TUTORIAL_EVENTS.action, {
      detail: {
        action,
        flowId,
        stepId: step.id,
        target: step.target,
      },
    }))
    await sleep(90, signal)
  }
}

function dispatchTutorialCleanup(flowId) {
  if (!isBrowser() || !flowId) return
  window.dispatchEvent(new CustomEvent(TUTORIAL_EVENTS.action, {
    detail: {
      action: TUTORIAL_ACTIONS.cleanupTutorialViews,
      flowId,
    },
  }))
}

function IntroCard({ title, text, startLabel = "Comecar", laterLabel = "Agora nao", onStart, onLater, reducedMotion = false }) {
  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[110020] mx-auto max-w-[420px] overflow-hidden rounded-[28px] border border-white/20 bg-slate-950/94 p-5 text-white shadow-[0_28px_90px_rgba(2,6,23,0.55)] backdrop-blur-xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
      role="dialog"
      aria-modal="true"
      aria-label="Assistente Corre Aqui"
    >
      <div className="flex items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#0b73ff,#10b981,#ffd91a)] text-2xl shadow-[0_14px_34px_rgba(16,185,129,0.24)]">
          ?
        </div>
        <div className="min-w-0">
          <div className="text-sm font-black uppercase tracking-[0.16em] text-emerald-300">Assistente Corre Aqui</div>
          <h2 className="mt-1 text-2xl font-black leading-tight">{title}</h2>
          <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-300">{text}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
        <button
          type="button"
          onClick={onStart}
          className="h-12 rounded-2xl bg-emerald-500 px-5 text-sm font-black text-white shadow-[0_14px_34px_rgba(16,185,129,0.26)] transition active:scale-[0.98]"
        >
          {startLabel}
        </button>
        <button
          type="button"
          onClick={onLater}
          className="h-12 rounded-2xl border border-white/10 bg-white/[0.06] px-5 text-sm font-black text-slate-200 transition hover:bg-white/[0.1] active:scale-[0.98]"
        >
          {laterLabel}
        </button>
      </div>
    </motion.div>
  )
}

function SpotlightOverlay({ rect }) {
  if (!rect) {
    return <div className="fixed inset-0 z-[110000] bg-slate-950/76 backdrop-blur-[2px]" aria-hidden="true" />
  }

  const style = {
    "--spot-left": `${rect.left}px`,
    "--spot-top": `${rect.top}px`,
    "--spot-width": `${rect.width}px`,
    "--spot-height": `${rect.height}px`,
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[110000]" style={style} aria-hidden="true">
      <div className="absolute left-0 top-0 w-full bg-slate-950/78 backdrop-blur-[2px]" style={{ height: rect.top }} />
      <div className="absolute left-0 bg-slate-950/78 backdrop-blur-[2px]" style={{ top: rect.top, width: rect.left, height: rect.height }} />
      <div className="absolute bg-slate-950/78 backdrop-blur-[2px]" style={{ left: rect.right, top: rect.top, right: 0, height: rect.height }} />
      <div className="absolute bottom-0 left-0 w-full bg-slate-950/78 backdrop-blur-[2px]" style={{ top: rect.bottom }} />
      <div
        className="absolute rounded-[22px] border-2 border-emerald-300 bg-white/[0.02] shadow-[0_0_0_1px_rgba(255,255,255,0.38),0_0_0_9999px_rgba(2,6,23,0.02),0_0_42px_rgba(16,185,129,0.58),0_0_80px_rgba(37,99,235,0.18)]"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      />
    </div>
  )
}

function getBubblePosition(rect, preferredPlacement = "") {
  if (!isBrowser()) {
    return {
      style: {
        left: "16px",
        top: "20vh",
        width: "calc(100vw - 32px)",
      },
      placement: "center",
    }
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const margin = 14
  const edge = 16
  const isCompact = viewportWidth < 768
  const width = Math.min(420, Math.max(280, viewportWidth - edge * 2))
  const estimatedHeight = isCompact ? 238 : 260
  const clampLeft = (value) => Math.min(Math.max(edge, value), Math.max(edge, viewportWidth - width - edge))
  const clampTop = (value) => Math.min(Math.max(edge, value), Math.max(edge, viewportHeight - estimatedHeight - edge))

  if (!rect) {
    return {
      style: {
        left: clampLeft((viewportWidth - width) / 2),
        top: clampTop((viewportHeight - estimatedHeight) / 2),
        width,
      },
      placement: "center",
    }
  }

  const spaceBelow = viewportHeight - rect.bottom
  const spaceAbove = rect.top
  const spaceRight = viewportWidth - rect.right
  const spaceLeft = rect.left

  const centeredLeft = clampLeft(rect.left + rect.width / 2 - width / 2)

  const placeBelow = () => ({ style: { left: centeredLeft, top: clampTop(rect.bottom + margin), width }, placement: "top" })
  const placeAbove = () => ({ style: { left: centeredLeft, top: clampTop(rect.top - estimatedHeight - margin), width }, placement: "bottom" })
  const placeRight = () => ({ style: { left: clampLeft(rect.right + margin), top: clampTop(rect.top + rect.height / 2 - estimatedHeight / 2), width }, placement: "left" })
  const placeLeft = () => ({ style: { left: clampLeft(rect.left - width - margin), top: clampTop(rect.top + rect.height / 2 - estimatedHeight / 2), width }, placement: "right" })

  if (isCompact) {
    if (preferredPlacement === "top" && spaceAbove >= estimatedHeight + margin) return placeAbove()
    if (preferredPlacement === "bottom" && spaceBelow >= estimatedHeight + margin) return placeBelow()
    if (spaceBelow >= estimatedHeight + margin || spaceBelow >= spaceAbove) return placeBelow()
    return placeAbove()
  }

  if (preferredPlacement === "top" && spaceAbove >= estimatedHeight + margin) return placeAbove()
  if (preferredPlacement === "bottom" && spaceBelow >= estimatedHeight + margin) return placeBelow()
  if (preferredPlacement === "left" && spaceLeft >= width + margin) return placeLeft()
  if (preferredPlacement === "right" && spaceRight >= width + margin) return placeRight()

  if (spaceRight >= width + margin) {
    return placeRight()
  }

  if (spaceLeft >= width + margin) {
    return placeLeft()
  }

  if (spaceBelow >= estimatedHeight + margin || spaceBelow >= spaceAbove) {
    return placeBelow()
  }

  return placeAbove()
}

function TutorialBubble({ flow, step, stepIndex, total, rect, onBack, onNext, onSkip, onClose, nextDisabled = false, reducedMotion = false }) {
  const { style, placement } = getBubblePosition(rect, step.placement)
  const isLast = stepIndex >= total - 1
  const needsClick = step.interaction === "click-target"
  const bubbleRef = useRef(null)

  useEffect(() => {
    const focusable = bubbleRef.current?.querySelectorAll("button:not([disabled])")
    focusable?.[0]?.focus?.({ preventScroll: true })
  }, [step.id])

  const trapFocus = (event) => {
    if (event.key !== "Tab") return
    const nodes = Array.from(bubbleRef.current?.querySelectorAll("button:not([disabled])") || [])
    if (!nodes.length) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <motion.div
      key={`${flow.id}-${step.id}`}
      ref={bubbleRef}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: reducedMotion ? 0.01 : 0.18 }}
      className="fixed z-[110010] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[24px] border border-white/15 bg-slate-950/96 p-4 text-white shadow-[0_26px_80px_rgba(2,6,23,0.58)] backdrop-blur-xl"
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
      aria-live="polite"
      onKeyDown={trapFocus}
    >
      {placement !== "center" ? (
        <span
          aria-hidden="true"
          className={[
            "absolute h-4 w-4 rotate-45 border-white/15 bg-slate-950/96",
            placement === "top" ? "-top-2 left-1/2 -translate-x-1/2 border-l border-t" : "",
            placement === "bottom" ? "-bottom-2 left-1/2 -translate-x-1/2 border-b border-r" : "",
            placement === "left" ? "-left-2 top-1/2 -translate-y-1/2 border-b border-l" : "",
            placement === "right" ? "-right-2 top-1/2 -translate-y-1/2 border-r border-t" : "",
          ].join(" ")}
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="sr-only">
            {flow.title} • {stepIndex + 1}/{total}
          </div>
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-300">
            {flow.title} - Passo {stepIndex + 1} de {total}
          </div>
          <h2 className="mt-1 text-xl font-black leading-tight">{step.title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-lg font-black text-slate-200 transition active:scale-[0.96]"
          aria-label="Fechar tutorial"
        >
          x
        </button>
      </div>

      <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-300">{step.text}</p>
      {needsClick ? (
        <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-200">
          Toque no alvo destacado para continuar.
        </div>
      ) : null}

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#0b73ff,#10b981,#ffd91a)] transition-[width] duration-300"
          style={{ width: `${((stepIndex + 1) / total) * 100}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={stepIndex === 0}
          className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-slate-200 transition active:scale-[0.98] disabled:opacity-35"
        >
          Voltar
        </button>
        <button type="button" onClick={onSkip} className="h-11 text-sm font-black text-slate-400 transition hover:text-white" aria-label="Pular tutorial">
          Pular
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="h-11 rounded-2xl bg-emerald-500 px-5 text-sm font-black text-white shadow-[0_12px_30px_rgba(16,185,129,0.24)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isLast ? "Concluir tutorial" : "Proximo"}
        </button>
      </div>
    </motion.div>
  )
}

function CompletionCard({ flow, onClose, onRestart, reducedMotion = false }) {
  const isClient = flow?.id === "cliente"
  const isWorker = flow?.id === "trabalhar"
  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
      className="fixed inset-x-4 top-1/2 z-[110030] mx-auto max-w-[390px] -translate-y-1/2 rounded-[28px] border border-emerald-300/30 bg-slate-950/96 p-5 text-center text-white shadow-[0_28px_90px_rgba(2,6,23,0.58)] backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial concluido"
    >
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-3xl shadow-[0_18px_42px_rgba(16,185,129,0.26)]">✓</div>
      <h2 className="mt-4 text-2xl font-black">{isClient || isWorker ? "Pronto!" : "Tutorial concluido"}</h2>
      <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-300">
        {isClient
          ? "Agora voce ja sabe como usar o Corre Aqui como Cliente."
          : isWorker
            ? "Agora voce ja sabe como trabalhar pelo Corre Aqui."
            : `${flow?.title || "Tutorial"} finalizado. Voce pode refazer pelo Perfil ou Configuracoes quando quiser.`}
      </p>
      <div className="mt-5 grid gap-2">
        <button type="button" onClick={onClose} className="h-12 rounded-2xl bg-emerald-500 text-sm font-black text-white">
          {isWorker ? "Comecar a trabalhar" : "Entrar no app"}
        </button>
        <button type="button" onClick={onRestart} className="h-12 rounded-2xl border border-white/10 bg-white/[0.06] text-sm font-black text-slate-200">
          Ver novamente
        </button>
      </div>
    </motion.div>
  )
}

function AssistantHelpCenter({ onClose, onStart, onTopic }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110040] bg-slate-950/72 p-3 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Assistente Corre Aqui"
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        className="mx-auto mt-[max(1rem,env(safe-area-inset-top))] max-h-[calc(100dvh-2rem)] w-full max-w-[560px] overflow-y-auto rounded-[30px] border border-white/15 bg-[#07111f] p-4 shadow-[0_30px_100px_rgba(2,6,23,0.65)] sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300">Assistente</div>
            <h2 className="mt-1 text-2xl font-black">Assistente Corre Aqui</h2>
            <p className="mt-1 text-sm font-semibold text-slate-400">Escolha uma ajuda rapida ou refaca o tutorial completo.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-lg font-black"
            aria-label="Fechar assistente"
          >
            x
          </button>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => onStart("cliente")} className="min-h-16 rounded-2xl bg-blue-600 px-4 text-left text-sm font-black text-white shadow-[0_14px_34px_rgba(37,99,235,0.24)]">
            Refazer tutorial do Cliente
          </button>
          <button type="button" onClick={() => onStart("trabalhar")} className="min-h-16 rounded-2xl bg-emerald-500 px-4 text-left text-sm font-black text-white shadow-[0_14px_34px_rgba(16,185,129,0.24)]">
            Refazer tutorial de Trabalhar
          </button>
        </div>

        <div className="mt-5 space-y-2">
          {ASSISTANT_TOPICS.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => onTopic(topic)}
              className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-left text-sm font-black text-slate-100 transition hover:bg-white/[0.09] active:scale-[0.99]"
            >
              <span>{topic.label}</span>
              <span className="text-emerald-300">→</span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

function ContextualTip({ tip, rect, onClose, onShown, reducedMotion = false }) {
  const closeRef = useRef(null)
  useEffect(() => {
    closeRef.current?.focus?.()
    onShown?.(tip)
  }, [onShown, tip])

  if (!tip) return null
  const position = getBubblePosition(rect, tip.placement)
  const toneClass = tip.tone === "amber"
    ? "bg-amber-400 text-slate-950 shadow-[0_14px_34px_rgba(251,191,36,0.24)]"
    : tip.tone === "blue"
      ? "bg-blue-500 text-white shadow-[0_14px_34px_rgba(59,130,246,0.24)]"
      : "bg-emerald-500 text-white shadow-[0_14px_34px_rgba(16,185,129,0.24)]"

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
      className="fixed z-[110050] rounded-[24px] border border-emerald-300/25 bg-slate-950/94 p-4 text-white shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur-xl"
      style={position.style}
      role="dialog"
      aria-modal="false"
      aria-live="polite"
      aria-label={tip.title || "Dica Corre Aqui"}
    >
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl font-black ${toneClass}`}>{tip.icon || "!"}</span>
        <div className="min-w-0 flex-1">
          <div className="text-base font-black">{tip.title || "Dica rápida"}</div>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-300">{tip.text}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 h-10 rounded-2xl bg-emerald-500 px-5 text-sm font-black text-white shadow-[0_12px_26px_rgba(16,185,129,0.22)] transition active:scale-[0.98]"
          >
            Entendi
          </button>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-sm font-black transition hover:bg-white/[0.14]"
          aria-label="Fechar dica"
        >
          x
        </button>
      </div>
    </motion.div>
  )
}

export function TutorialProvider({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const reducedMotion = useReducedMotion()
  const [uid, setUid] = useState("")
  const [authReady, setAuthReady] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)
  const [introConfig, setIntroConfig] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [activeFlowId, setActiveFlowId] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const [informativeStep, setInformativeStep] = useState(false)
  const [stepReady, setStepReady] = useState(false)
  const [targetInteractionDone, setTargetInteractionDone] = useState(false)
  const [completedFlow, setCompletedFlow] = useState(null)
  const [contextualTip, setContextualTip] = useState(null)
  const [contextualTipRect, setContextualTipRect] = useState(null)
  const [contextualQueueTick, setContextualQueueTick] = useState(0)
  const activeElementRef = useRef(null)
  const contextualQueueRef = useRef([])
  const contextualProcessingRef = useRef(false)
  const contextualAbortRef = useRef(null)
  const syncBlockedRef = useRef(false)
  const introShownRef = useRef(false)

  const activeFlow = activeFlowId ? TUTORIAL_FLOWS[activeFlowId] : null
  const activeStep = activeFlow?.steps?.[activeIndex] || null

  const syncTutorial = useCallback(async (patch) => {
    if (!uid || syncBlockedRef.current) return
    try {
      await update(ref(database, `users/${uid}/tutorial`), {
        ...patch,
        updatedAt: Date.now(),
      })
    } catch (error) {
      syncBlockedRef.current = true
      if (process.env.NODE_ENV !== "production") {
        console.warn("[Tutorial] sync ignorado:", error?.code || error?.message || error)
      }
    }
  }, [uid])

  const closeAll = useCallback(() => {
    dispatchTutorialCleanup(activeFlowId)
    setIntroOpen(false)
    setIntroConfig(null)
    setHelpOpen(false)
    setActiveFlowId("")
    setActiveIndex(0)
    setTargetRect(null)
    setInformativeStep(false)
    setStepReady(false)
    setTargetInteractionDone(false)
    activeElementRef.current = null
  }, [activeFlowId])

  const finishFlow = useCallback(() => {
    if (!activeFlow) return
    dispatchTutorialCleanup(activeFlow.id)
    const finishedAt = Date.now()
    writeLocalFlag(TUTORIAL_KEYS.principal, true)
    writeLocalFlag(activeFlow.completionKey, true)

    if (activeFlow.id === "cliente") {
      writeLocalFlag(TUTORIAL_KEYS.clientePulado, false)
      writeLocalValue(TUTORIAL_KEYS.clienteConcluidoEm, finishedAt)
      syncTutorial({
        clienteConcluido: true,
        clienteConcluidoEm: finishedAt,
        clientePulado: false,
        [TUTORIAL_KEYS.cliente]: true,
        [TUTORIAL_KEYS.clienteConcluidoEm]: finishedAt,
      })
    } else if (activeFlow.id === "trabalhar") {
      writeLocalFlag(TUTORIAL_KEYS.trabalharPulado, false)
      writeLocalValue(TUTORIAL_KEYS.trabalharConcluidoEm, finishedAt)
      syncTutorial({
        trabalharConcluido: true,
        trabalharConcluidoEm: finishedAt,
        trabalharPulado: false,
        [TUTORIAL_KEYS.trabalhar]: true,
        [TUTORIAL_KEYS.trabalharConcluidoEm]: finishedAt,
      })
    } else {
      syncTutorial({ [activeFlow.completionKey]: true })
    }

    setCompletedFlow(activeFlow)
    setActiveFlowId("")
    setTargetRect(null)
    setInformativeStep(false)
    setStepReady(false)
    setTargetInteractionDone(false)
    activeElementRef.current = null
  }, [activeFlow, syncTutorial])

  const startTutorial = useCallback((flowId, options = {}) => {
    const safeFlowId = TUTORIAL_FLOWS[flowId] ? flowId : getFlowForMode(readLocalMode())
    const targetIndex = options.target ? findStepIndex(safeFlowId, options.target) : Number(options.index || 0)
    setIntroOpen(false)
    setIntroConfig(null)
    setHelpOpen(false)
    setCompletedFlow(null)
    setTargetRect(null)
    setInformativeStep(false)
    setStepReady(false)
    setTargetInteractionDone(false)
    setActiveFlowId(safeFlowId)
    setActiveIndex(Math.max(0, targetIndex))
  }, [])

  const startClientTutorial = useCallback((options = {}) => {
    startTutorial("cliente", { ...options, index: options.index ?? 0 })
  }, [startTutorial])

  const startWorkerTutorial = useCallback((options = {}) => {
    startTutorial("trabalhar", { ...options, index: options.index ?? 0 })
  }, [startTutorial])

  const markSkipped = useCallback((flowId) => {
    const skippedAt = Date.now()
    if (flowId === "cliente") {
      writeLocalFlag(TUTORIAL_KEYS.clientePulado, true)
      syncTutorial({
        clientePulado: true,
        clientePuladoEm: skippedAt,
        [TUTORIAL_KEYS.clientePulado]: true,
      })
    } else if (flowId === "trabalhar") {
      writeLocalFlag(TUTORIAL_KEYS.trabalharPulado, true)
      syncTutorial({
        trabalharPulado: true,
        trabalharPuladoEm: skippedAt,
        [TUTORIAL_KEYS.trabalharPulado]: true,
      })
    }
  }, [syncTutorial])

  const skipTutorial = useCallback(() => {
    const flowId = activeFlowId || introConfig?.flow || getFlowForMode(readLocalMode())
    const onLater = introConfig?.onLater
    markSkipped(flowId)
    closeAll()
    onLater?.()
  }, [activeFlowId, closeAll, introConfig, markSkipped])

  const isContextualTipSeen = useCallback((tip) => {
    return !!tip?.localKey && readLocalFlag(tip.localKey)
  }, [])

  const markContextualTipSeen = useCallback((tip) => {
    if (!tip?.localKey) return
    writeLocalFlag(tip.localKey, true)
    if (tip.remoteKey) syncTutorial({ [tip.remoteKey]: true })
  }, [syncTutorial])

  const closeContextualTip = useCallback(() => {
    setContextualTip(null)
    setContextualTipRect(null)
    window.setTimeout(() => setContextualQueueTick((tick) => tick + 1), 80)
  }, [])

  useEffect(() => {
    if (!contextualTip || (!introOpen && !helpOpen && !activeFlow && !completedFlow)) return
    closeContextualTip()
  }, [activeFlow, closeContextualTip, completedFlow, contextualTip, helpOpen, introOpen])

  const showContextualTip = useCallback((id, options = {}) => {
    const tip = resolveContextualTip(id, options)
    if (!tip || isContextualTipSeen(tip)) return false

    if (contextualTip?.id === tip.id) return false
    if (contextualQueueRef.current.some((item) => item.id === tip.id)) return false

    contextualQueueRef.current.push({
      id: tip.id,
      options,
      queuedAt: Date.now(),
    })
    setContextualQueueTick((tick) => tick + 1)
    return true
  }, [contextualTip, isContextualTipSeen])

  const showTipOnce = useCallback((detail = {}) => {
    const id = detail.id || detail.tipId || detail.tipo || getContextualTipConfig(detail.key)?.id || detail.key
    const config = getContextualTipConfig(id)
    if (config) return showContextualTip(config.id, detail)

    const key = detail.key
    if (!key || readLocalFlag(key)) return false
    return showContextualTip(detail.id || detail.key, detail)
  }, [showContextualTip])

  useEffect(() => {
    if (contextualProcessingRef.current || contextualTip || introOpen || helpOpen || activeFlow || completedFlow) return undefined

    const queued = contextualQueueRef.current.shift()
    if (!queued) return undefined

    const tip = resolveContextualTip(queued.id, queued.options)
    if (!tip || isContextualTipSeen(tip)) {
      window.setTimeout(() => setContextualQueueTick((tick) => tick + 1), 0)
      return undefined
    }

    contextualProcessingRef.current = true
    const controller = new AbortController()
    contextualAbortRef.current = controller
    let displayed = false
    let requeued = false

    const requeueIfNeeded = () => {
      if (displayed || requeued) return
      const currentTip = resolveContextualTip(queued.id, queued.options)
      if (!currentTip || isContextualTipSeen(currentTip)) return
      if (contextualQueueRef.current.some((item) => item.id === queued.id)) return
      contextualQueueRef.current.unshift(queued)
      requeued = true
      window.setTimeout(() => setContextualQueueTick((tick) => tick + 1), 0)
    }

    async function showQueuedTip() {
      let rect = null
      try {
        if (tip.target) {
          const { element } = await waitForTarget(tip.target, {
            timeoutMs: 1600,
            signal: controller.signal,
          })

          if (element && !controller.signal.aborted) {
            try {
              element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" })
            } catch {
              element.scrollIntoView()
            }
            await sleep(180, controller.signal)
            rect = controller.signal.aborted ? null : calculateRect(element)
          }
        }

        if (controller.signal.aborted) {
          requeueIfNeeded()
          return
        }
        displayed = true
        setContextualTip(tip)
        setContextualTipRect(rect)
      } finally {
        contextualProcessingRef.current = false
        contextualAbortRef.current = null
      }
    }

    showQueuedTip()

    return () => {
      controller.abort()
      requeueIfNeeded()
      contextualProcessingRef.current = false
      if (contextualAbortRef.current === controller) contextualAbortRef.current = null
    }
  }, [
    activeFlow,
    completedFlow,
    contextualQueueTick,
    contextualTip,
    helpOpen,
    introOpen,
    isContextualTipSeen,
    markContextualTipSeen,
  ])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUid(user?.uid || "")
      setAuthReady(true)

      if (!user?.uid) return
      try {
        const snapshot = await get(ref(database, `users/${user.uid}/tutorial`))
        const remote = snapshot.val()
        if (remote && typeof remote === "object") {
          Object.values(TUTORIAL_KEYS).forEach((key) => {
            if (remote[key] === true) writeLocalFlag(key, true)
          })
          const localContextualPatch = {}
          CONTEXTUAL_TIP_LIST.forEach((tip) => {
            if (!tip?.localKey) return
            if (remote[tip.remoteKey] === true || remote[tip.localKey] === true) {
              writeLocalFlag(tip.localKey, true)
              return
            }
            if (readLocalFlag(tip.localKey) && tip.remoteKey) {
              localContextualPatch[tip.remoteKey] = true
            }
          })
          if (remote.clienteConcluido === true) writeLocalFlag(TUTORIAL_KEYS.cliente, true)
          if (remote.clientePulado === true) writeLocalFlag(TUTORIAL_KEYS.clientePulado, true)
          if (remote.clienteConcluidoEm) writeLocalValue(TUTORIAL_KEYS.clienteConcluidoEm, remote.clienteConcluidoEm)
          if (remote.trabalharConcluido === true) writeLocalFlag(TUTORIAL_KEYS.trabalhar, true)
          if (remote.trabalharPulado === true) writeLocalFlag(TUTORIAL_KEYS.trabalharPulado, true)
          if (remote.trabalharConcluidoEm) writeLocalValue(TUTORIAL_KEYS.trabalharConcluidoEm, remote.trabalharConcluidoEm)
          if (Object.keys(localContextualPatch).length) {
            update(ref(database, `users/${user.uid}/tutorial`), {
              ...localContextualPatch,
              updatedAt: Date.now(),
            }).catch((error) => {
              if (process.env.NODE_ENV !== "production") {
                console.warn("[Tutorial] migracao contextual ignorada:", error?.code || error?.message || error)
              }
            })
          }
        } else {
          const localContextualPatch = {}
          CONTEXTUAL_TIP_LIST.forEach((tip) => {
            if (tip?.remoteKey && tip?.localKey && readLocalFlag(tip.localKey)) {
              localContextualPatch[tip.remoteKey] = true
            }
          })
          if (Object.keys(localContextualPatch).length) {
            update(ref(database, `users/${user.uid}/tutorial`), {
              ...localContextualPatch,
              updatedAt: Date.now(),
            }).catch((error) => {
              if (process.env.NODE_ENV !== "production") {
                console.warn("[Tutorial] migracao contextual ignorada:", error?.code || error?.message || error)
              }
            })
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[Tutorial] leitura remota ignorada:", error?.code || error?.message || error)
        }
      }
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!authReady || introShownRef.current || !isIntroAllowed(pathname)) return
    if (!hasSelectedMode() || readLocalMode() !== "cliente" || !shouldOfferClientTutorial()) return
    if (!String(pathname || "").startsWith("/cliente")) return

    introShownRef.current = true
    const timer = window.setTimeout(() => {
      setIntroConfig({
        flow: "cliente",
        title: "Otimo! Vou mostrar como pedir ajuda e acompanhar um atendimento.",
        text: "O tour destaca os pontos principais do modo Cliente e voce pode pular quando quiser.",
        startLabel: "Comecar",
        laterLabel: "Agora nao",
      })
      setIntroOpen(true)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [authReady, pathname])

  useEffect(() => {
    if (!authReady || introShownRef.current || !isIntroAllowed(pathname)) return
    if (!hasSelectedMode() || readLocalMode() !== "corre" || !shouldOfferWorkerTutorial()) return
    if (!String(pathname || "").startsWith("/corre")) return

    introShownRef.current = true
    const timer = window.setTimeout(() => {
      setIntroConfig({
        flow: "trabalhar",
        title: "Otimo! Vou mostrar como encontrar pedidos, atender clientes e evoluir no Corre Aqui.",
        text: "O tour destaca perfil, categorias, portfolio, pedidos, chat, progresso e patentes.",
        startLabel: "Comecar",
        laterLabel: "Agora nao",
      })
      setIntroOpen(true)
    }, 650)
    return () => window.clearTimeout(timer)
  }, [authReady, pathname])

  useEffect(() => {
    const openHelp = () => setHelpOpen(true)
    const start = (event) => {
      const detail = event?.detail || {}
      startTutorial(detail.flow || getFlowForMode(readLocalMode()), detail)
    }
    const openClientIntro = (event) => {
      const detail = event?.detail || {}
      if (readLocalMode() !== "cliente" || !shouldOfferClientTutorial()) {
        detail.onLater?.()
        return
      }

      introShownRef.current = true
      setIntroConfig({
        flow: "cliente",
        title: "Otimo! Vou mostrar como pedir ajuda e acompanhar um atendimento.",
        text: "O tour destaca os pontos principais do modo Cliente e voce pode pular quando quiser.",
        startLabel: "Comecar",
        laterLabel: "Agora nao",
        onStart: detail.onStart,
        onLater: detail.onLater,
      })
      setIntroOpen(true)
    }
    const openWorkerIntro = (event) => {
      const detail = event?.detail || {}
      if (readLocalMode() !== "corre" || !shouldOfferWorkerTutorial()) {
        detail.onLater?.()
        return
      }

      introShownRef.current = true
      setIntroConfig({
        flow: "trabalhar",
        title: "Otimo! Vou mostrar como encontrar pedidos, atender clientes e evoluir no Corre Aqui.",
        text: "O tour destaca perfil, categorias, portfolio, pedidos, chat, progresso e patentes.",
        startLabel: "Comecar",
        laterLabel: "Agora nao",
        onStart: detail.onStart,
        onLater: detail.onLater,
      })
      setIntroOpen(true)
    }
    const tip = (event) => showTipOnce(event?.detail || {})

    window.addEventListener("corre-aqui:assistant-help", openHelp)
    window.addEventListener("corre-aqui:start-tutorial", start)
    window.addEventListener("corre-aqui:client-tutorial-intro", openClientIntro)
    window.addEventListener("corre-aqui:worker-tutorial-intro", openWorkerIntro)
    window.addEventListener("corre-aqui:contextual-tip", tip)
    return () => {
      window.removeEventListener("corre-aqui:assistant-help", openHelp)
      window.removeEventListener("corre-aqui:start-tutorial", start)
      window.removeEventListener("corre-aqui:client-tutorial-intro", openClientIntro)
      window.removeEventListener("corre-aqui:worker-tutorial-intro", openWorkerIntro)
      window.removeEventListener("corre-aqui:contextual-tip", tip)
    }
  }, [showTipOnce, startTutorial])

  useEffect(() => {
    if (!activeStep) return undefined

    const controller = new AbortController()
    setInformativeStep(false)
    setStepReady(false)
    setTargetInteractionDone(activeStep.interaction !== "click-target")
    setTargetRect(null)
    activeElementRef.current = null
    const route = safeRoute(activeStep.route)
    if (route && pathname !== route) {
      router.replace(route, { scroll: false })
      return () => controller.abort()
    }

    async function prepareTarget() {
      await runStepPreparation({ flowId: activeFlow?.id, step: activeStep, signal: controller.signal })
      if (controller.signal.aborted) return

      const { element, reason } = await waitForTarget(activeStep.target, {
        timeoutMs: activeStep.timeout || TARGET_TIMEOUT_MS,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return

      if (!element) {
        warnUnavailableTarget({ flowId: activeFlow?.id, step: activeStep, reason, pathname })
        if (allowsInformativeFallback(activeStep)) {
          activeElementRef.current = null
          setInformativeStep(true)
          setTargetRect(null)
          setStepReady(true)
          return
        }

        setActiveIndex((current) => {
          const total = activeFlow?.steps?.length || 0
          if (current + 1 < total) return current + 1
          window.setTimeout(() => finishFlow(), 0)
          return current
        })
        return
      }

      activeElementRef.current = element
      try {
        element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" })
      } catch {
        element.scrollIntoView()
      }

      await sleep(260, controller.signal)
      if (controller.signal.aborted) return

      const rect = calculateRect(element)
      setInformativeStep(false)
      setTargetRect(rect)
      setStepReady(true)
    }

    prepareTarget()
    return () => {
      controller.abort()
    }
  }, [activeStep, activeFlow, activeIndex, finishFlow, pathname, router])

  useEffect(() => {
    if (!activeStep || informativeStep) return undefined

    let frame = 0
    const update = () => {
      if (!activeElementRef.current) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        setTargetRect(calculateRect(activeElementRef.current))
      })
    }

    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [activeStep, informativeStep])

  useEffect(() => {
    if (!activeStep || activeStep.interaction !== "click-target" || informativeStep || !stepReady) return undefined
    const element = activeElementRef.current
    if (!element) return undefined

    const onTargetClick = () => {
      setTargetInteractionDone(true)
    }

    element.addEventListener("click", onTargetClick, true)
    return () => element.removeEventListener("click", onTargetClick, true)
  }, [activeStep, informativeStep, stepReady])

  const canAdvanceTutorial = activeStep?.interaction !== "click-target" || targetInteractionDone || informativeStep

  useEffect(() => {
    const onKey = (event) => {
      if (contextualTip && event.key === "Escape") {
        event.preventDefault()
        closeContextualTip()
        return
      }
      if (!introOpen && !helpOpen && !activeFlow) return
      if (event.key === "Escape") {
        event.preventDefault()
        closeAll()
      }
      if (activeFlow && event.key === "ArrowRight") {
        event.preventDefault()
        if (!canAdvanceTutorial) return
        setActiveIndex((current) => {
          if (current >= activeFlow.steps.length - 1) {
            finishFlow()
            return current
          }
          return current + 1
        })
      }
      if (activeFlow && event.key === "ArrowLeft") {
        event.preventDefault()
        setActiveIndex((current) => Math.max(0, current - 1))
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [activeFlow, canAdvanceTutorial, closeAll, closeContextualTip, contextualTip, finishFlow, helpOpen, introOpen])

  const value = useMemo(() => ({
    startTutorial,
    startClientTutorial,
    startWorkerTutorial,
    openHelpCenter: () => setHelpOpen(true),
    showTipOnce,
  }), [showTipOnce, startClientTutorial, startTutorial, startWorkerTutorial])

  return (
    <TutorialContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {introOpen ? (
          <>
            <div className="fixed inset-0 z-[110000] bg-slate-950/62 backdrop-blur-sm" />
            <IntroCard
              title={introConfig?.title || "Ola! Eu sou a Assistente Corre Aqui."}
              text={introConfig?.text || "Vou mostrar rapidamente como usar o aplicativo. Leva menos de 1 minuto."}
              startLabel={introConfig?.startLabel || "Comecar tutorial"}
              laterLabel={introConfig?.laterLabel || "Agora nao"}
              reducedMotion={reducedMotion}
              onStart={() => {
                const flow = introConfig?.flow || getFlowForMode(readLocalMode())
                const onStart = introConfig?.onStart
                setIntroOpen(false)
                setIntroConfig(null)
                onStart?.()
                if (flow === "cliente") startClientTutorial()
                else if (flow === "trabalhar") startWorkerTutorial()
                else startTutorial(flow)
              }}
              onLater={skipTutorial}
            />
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {activeFlow && activeStep ? (
          <>
            <SpotlightOverlay rect={stepReady ? targetRect : null} />
            {stepReady ? (
              <TutorialBubble
                flow={activeFlow}
                step={activeStep}
                stepIndex={activeIndex}
                total={activeFlow.steps.length}
                rect={targetRect}
                onBack={() => setActiveIndex((current) => Math.max(0, current - 1))}
                onNext={() => {
                  if (!canAdvanceTutorial) return
                  if (activeIndex >= activeFlow.steps.length - 1) finishFlow()
                  else setActiveIndex((current) => current + 1)
                }}
                onSkip={skipTutorial}
                onClose={closeAll}
                nextDisabled={!canAdvanceTutorial}
                reducedMotion={reducedMotion}
              />
            ) : null}
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {completedFlow ? (
          <CompletionCard
            flow={completedFlow}
            onClose={() => setCompletedFlow(null)}
            onRestart={() => {
              const flow = completedFlow.id || "cliente"
              setCompletedFlow(null)
              if (flow === "cliente") startClientTutorial()
              else if (flow === "trabalhar") startWorkerTutorial()
              else startTutorial(flow)
            }}
            reducedMotion={reducedMotion}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {helpOpen ? (
          <AssistantHelpCenter
            onClose={() => setHelpOpen(false)}
            onStart={(flow) => {
              if (flow === "cliente") startClientTutorial()
              else if (flow === "trabalhar") startWorkerTutorial()
              else startTutorial(flow)
            }}
            onTopic={(topic) => startTutorial(topic.flow, { target: topic.target })}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {contextualTip ? (
          <>
            {contextualTipRect ? <SpotlightOverlay rect={contextualTipRect} /> : null}
            <ContextualTip
              tip={contextualTip}
              rect={contextualTipRect}
              onClose={closeContextualTip}
              onShown={markContextualTipSeen}
              reducedMotion={reducedMotion}
            />
          </>
        ) : null}
      </AnimatePresence>
    </TutorialContext.Provider>
  )
}

export function useTutorial() {
  return useContext(TutorialContext)
}

export function openAssistantHelpCenter() {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent("corre-aqui:assistant-help"))
}

export function startCorreAquiTutorial(flow, detail = {}) {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent("corre-aqui:start-tutorial", { detail: { ...detail, flow } }))
}

export function startClientTutorial(detail = {}) {
  startCorreAquiTutorial("cliente", detail)
}

export function startWorkerTutorial(detail = {}) {
  startCorreAquiTutorial("trabalhar", detail)
}

export function promptClientTutorialIntro(detail = {}) {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent("corre-aqui:client-tutorial-intro", { detail }))
}

export function promptWorkerTutorialIntro(detail = {}) {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent("corre-aqui:worker-tutorial-intro", { detail }))
}

export function showCorreAquiTipOnce(key, detail = {}) {
  if (!isBrowser()) return
  window.dispatchEvent(new CustomEvent("corre-aqui:contextual-tip", { detail: { ...detail, key } }))
}
