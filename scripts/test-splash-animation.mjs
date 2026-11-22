import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const loginGateSource = await readFile(new URL('../src/components/LoginGate.jsx', import.meta.url), 'utf8')
const splashSource = await readFile(new URL('../src/components/SplashScreen.jsx', import.meta.url), 'utf8')
const loginPageSource = await readFile(new URL('../src/app/login/page.js', import.meta.url), 'utf8')

assert.match(loginGateSource, /const SPLASH_MIN_DURATION_MS = 2400/)
assert.match(loginGateSource, /const SPLASH_REDUCED_MOTION_DURATION_MS = 1450/)
assert.match(loginGateSource, /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\?\.matches/)
assert.match(
  loginGateSource,
  /window\.setTimeout\(\(\) => \{\s*setSplashMinDone\(true\)\s*\}, reduceMotion \? SPLASH_REDUCED_MOTION_DURATION_MS : SPLASH_MIN_DURATION_MS\)/s
)
assert.doesNotMatch(loginGateSource, /requestAnimationFrame\(\(\) => \{\s*setSplashMinDone\(true\)/s)
assert.match(loginGateSource, /if \(!splashDone\) \{[\s\S]*<SplashScreen/)
assert.match(loginGateSource, /const pularVinheta = String\(pathname \|\| ''\)\.startsWith\('\/chat\/'\)/)

assert.match(splashSource, /@keyframes corre-runner-enter/)
assert.match(splashSource, /translate3d\(-155%, 34%, 0\)/)
assert.match(splashSource, /translate3d\(0, 0, 0\)/)
assert.match(splashSource, /\.corre-splash-runner \{ animation: corre-runner-enter 1\.45s linear \.12s both; \}/)
assert.match(splashSource, /src="\/boneco_correndo\.png"/)
assert.match(splashSource, /src="\/pin_vazio\.png"/)

assert.match(loginPageSource, /relative z-\[1\] isolate/)
assert.match(loginPageSource, /onClick=\{entrarGoogle\}/)

console.log('Splash: duração original restaurada, runner/pin intactos e login seguro preservado')
