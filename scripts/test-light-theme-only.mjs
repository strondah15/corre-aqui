import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (path) => readFile(join(root, path), 'utf8')

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectSourceFiles(path))
    else if (['.js', '.jsx', '.mjs', '.ts', '.tsx'].includes(extname(entry.name))) files.push(path)
  }

  return files
}

const [globals, layout, profile, manifest, modeGate, communication, portfolio, notFound, login] = await Promise.all([
  read('src/app/globals.css'),
  read('src/app/layout.js'),
  read('src/components/PerfilDrawer.jsx'),
  read('public/manifest.webmanifest'),
  read('src/components/ModoGate.jsx'),
  read('src/components/CorreCommunicationCenter.jsx'),
  read('src/components/ProfessionalPortfolioSection.jsx'),
  read('src/app/not-found.js'),
  read('src/app/login/page.js'),
])

assert.ok(
  globals.includes('@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));'),
  'variantes dark legadas dependem de um atributo explícito, não da preferência do sistema',
)
assert.match(globals, /:root\s*\{[\s\S]*?color-scheme:\s*only light;/, 'o esquema nativo é somente claro')
assert.match(globals, /--background:\s*#eaf7ff;/, 'o shell usa fundo claro')
assert.match(globals, /--foreground:\s*#102451;/, 'o shell usa texto escuro legível')
assert.match(globals, /input, textarea, select\s*\{\s*color-scheme:\s*light;/, 'controles nativos permanecem claros')
assert.doesNotMatch(globals, /prefers-color-scheme/, 'o tema visual não depende da preferência de cores do aparelho')

assert.match(layout, /colorScheme:\s*"light"/, 'o viewport anuncia somente o esquema claro')
assert.match(layout, /<html lang="pt-BR" className="light" data-theme="light"/, 'o documento nasce no tema claro antes da hidratação')
assert.match(layout, /style=\{\{ colorScheme: "light" \}\}/, 'o esquema claro também é fixado no elemento raiz')
assert.doesNotMatch(layout, /data-theme="dark"/, 'o layout nunca ativa o seletor de tema escuro')
assert.equal(JSON.parse(manifest).theme_color, '#eaf7ff', 'a PWA preserva a cor clara no sistema')

assert.doesNotMatch(profile, /Apar&ecirc;ncia|Escolha o tema|\["escuro",\s*"Escuro"\]/i, 'Configurações não oferece alternância de tema')
assert.doesNotMatch(profile, /aparencia\s*:/i, 'a preferência de aparência não integra mais estado nem payloads')
assert.match(profile, /delete dataWithoutPortfolio\.aparencia;/, 'preferência legada é descartada ao carregar o perfil')
assert.match(profile, /delete profilePublic\.aparencia;/, 'preferência legada não volta a ser gravada pelo salvamento geral')

assert.match(modeGate, /bg-\[#f7fbff\]/, 'a escolha de modo mantém sua composição clara')
assert.match(communication, /from-white/, 'a Central de Comunicação mantém superfícies claras')
assert.match(portfolio, /bg-slate-50/, 'o Portfólio 2.0 mantém sua superfície clara')
assert.match(notFound, /bg-\[linear-gradient\(180deg,#e7f6ff/, 'a rota 404 também possui superfície clara própria')
assert.doesNotMatch(notFound, /dark:/, 'a rota 404 não herda o modo escuro padrão do framework')
assert.match(login, /border-amber-200 bg-amber-50[^"]*text-amber-800/, 'erros do login têm contraste no cartão claro')
assert.match(login, /border-slate-200 bg-slate-50[^"]*text-slate-600/, 'o botão Voltar permanece visível no cartão claro')

const sourceFiles = await collectSourceFiles(join(root, 'src'))
const source = (await Promise.all(sourceFiles.map((path) => readFile(path, 'utf8')))).join('\n')
assert.doesNotMatch(
  source,
  /localStorage\.(?:getItem|setItem)\(\s*['"](?:theme|tema|appearance|aparencia)['"]/i,
  'preferências antigas de tema no navegador não são consultadas nem gravadas',
)
assert.doesNotMatch(source, /classList\.(?:add|toggle)\(\s*['"]dark['"]/i, 'nenhum cliente reativa a classe dark')

console.log('PASS: Corre Aqui usa somente o tema claro, independentemente do sistema ou de preferência antiga.')
