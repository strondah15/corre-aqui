import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const helperSource = await readFile(new URL('../src/lib/authStartup.js', import.meta.url), 'utf8')
const helper = await import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}`)
const loginGateSource = await readFile(new URL('../src/components/LoginGate.jsx', import.meta.url), 'utf8')

assert.equal(
  helper.shouldFinishAuthStartup({ authResolved: true, redirectResolved: true }),
  true,
  'auth e redirect resolvidos liberam a interface'
)
assert.equal(
  helper.shouldFinishAuthStartup({ authResolved: true, redirectResolved: false }),
  false,
  'redirect pendente mantém a restauração enquanto o watchdog não expira'
)
assert.equal(
  helper.shouldFinishAuthStartup({ authResolved: false, redirectResolved: false, timedOut: true }),
  true,
  'watchdog libera a interface mesmo quando o Firebase não conclui a inicialização'
)

assert.match(loginGateSource, /googleRedirectPromise = getGoogleRedirectUser\(\)/)
assert.match(loginGateSource, /window\.setTimeout\([\s\S]*AUTH_STARTUP_TIMEOUT_MS/)
assert.match(loginGateSource, /shouldFinishAuthStartup/)
assert.match(loginGateSource, /const currentUser = auth\.currentUser[\s\S]*void aplicarUsuario\(currentUser\)/)
assert.match(loginGateSource, /window\.clearTimeout\(startupTimer\)/)

console.log('Auth startup: promessa tardia preservada, watchdog global e liberação fail-safe OK')
