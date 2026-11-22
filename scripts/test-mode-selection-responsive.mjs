import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const modeGate = await readFile(new URL('../src/components/ModoGate.jsx', import.meta.url), 'utf8')

assert.match(modeGate, /src="\/corre-logo-mark\.png"/, 'a tela preserva a marca original com o corredor dentro do pin')
assert.match(modeGate, /Como voc&ecirc; quer usar o Corre Aqui\?/, 'o titulo aprovado esta presente')
assert.match(modeGate, /Escolha como deseja continuar/, 'o subtitulo aprovado esta presente')

const screenClass = modeGate.match(/<main data-mode-selection-screen className="([^"]+)"/)?.[1] || ''
assert.match(screenClass, /min-h-\[100dvh\]/, 'a tela cobre o viewport sem travar sua altura')
assert.match(screenClass, /overflow-x-hidden/, 'a tela impede overflow horizontal')
assert.match(screenClass, /overflow-y-auto/, 'a tela permite rolagem vertical natural em celulares baixos')
assert.match(screenClass, /safe-area-inset-top/, 'a tela respeita a safe area superior')
assert.match(screenClass, /safe-area-inset-bottom/, 'a tela respeita a safe area inferior')
assert.doesNotMatch(screenClass, /max-h-\[100dvh\]/, 'a tela nao volta a cortar o conteudo na altura do viewport')

const settingsClass = modeGate.match(/data-mode-selection-settings\s+className="([^"]+)"/)?.[1] || ''
assert.match(settingsClass, /rounded-full/, 'Configuracoes usa o formato arredondado aprovado')
assert.match(settingsClass, /min-h-11/, 'Configuracoes preserva uma area de toque acessivel')
assert.doesNotMatch(settingsClass, /(?:^|\s)(?:fixed|absolute)(?:\s|$)/, 'Configuracoes permanece no fluxo e nao cobre os cartoes')

assert.match(modeGate, /dark:bg-slate-950/, 'a composicao possui fundo para tema escuro')
assert.match(modeGate, /dark:text-white/, 'textos principais permanecem legiveis no tema escuro')
assert.match(modeGate, /isClient \? 'bg-violet-50 text-violet-700' : 'bg-orange-50 text-orange-700'/, 'as identidades Cliente e Corre Pro permanecem roxa e laranja')
assert.match(modeGate, /onClick=\{\(\) => onSelect\(id\)\}/, 'a selecao de modo continua usando o fluxo existente')

console.log('Selecao de modo responsiva: marca, textos, safe areas, rolagem, temas e acoes preservados')
