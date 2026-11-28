export const AUTH_STARTUP_TIMEOUT_MS = 12000

export function shouldFinishAuthStartup({
  authResolved = false,
  redirectResolved = false,
  timedOut = false,
} = {}) {
  return Boolean(timedOut || (authResolved && redirectResolved))
}
