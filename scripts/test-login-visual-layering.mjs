import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const loginSource = await readFile(new URL('../src/app/login/page.js', import.meta.url), 'utf8')
const globalStylesSource = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')
const tutorialSource = await readFile(
  new URL('../src/components/tutorial/TutorialProvider.jsx', import.meta.url),
  'utf8'
)

const loginClassName = loginSource.match(
  /const LOGIN_PAGE_CLASS_NAME\s*=\s*['"]([^'"]+)['"]/
)?.[1]

assert.ok(loginClassName, 'a pagina de login deve compartilhar uma classe de camada entre seus estados')

const loginClasses = new Set(loginClassName.split(/\s+/))
for (const requiredClass of ['relative', 'z-[1]', 'isolate']) {
  assert.ok(
    loginClasses.has(requiredClass),
    `a camada do login deve conter ${requiredClass} para ficar acima da decoracao global`
  )
}

assert.equal(
  [...loginSource.matchAll(/<main className=\{LOGIN_PAGE_CLASS_NAME\}>/g)].length,
  2,
  'restauracao de sessao e formulario devem usar a mesma camada protegida'
)
assert.doesNotMatch(loginClassName, /(?:^|\s)(?:opacity|brightness|filter)-/)
assert.doesNotMatch(loginSource, /className=["'][^"']*\bfixed\b/)

const bodyBeforeRule = globalStylesSource.match(/body::before\s*\{([^}]*)\}/s)?.[1] ?? ''
const bodyAfterRule = globalStylesSource.match(/body::after\s*\{([^}]*)\}/s)?.[1] ?? ''

for (const [selector, rule] of [
  ['body::before', bodyBeforeRule],
  ['body::after', bodyAfterRule],
]) {
  assert.match(rule, /position:\s*fixed/)
  assert.match(rule, /pointer-events:\s*none/)
  assert.match(rule, /z-index:\s*0/)
  assert.ok(rule.length > 0, `${selector} deve continuar como decoracao global nao interativa`)
}

assert.match(tutorialSource, /\["\/login",\s*"\/cadastro"\]/)
assert.match(loginSource, /onClick=\{entrarGoogle\}/)
assert.match(loginSource, /await signInWithGoogle\(\)/)

console.log('Login visual: conteudo acima da decoracao global, sem backdrop permanente; Google Auth preservado')
