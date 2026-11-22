import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const modeGate = await readFile(new URL('../src/components/ModoGate.jsx', import.meta.url), 'utf8')

assert.match(modeGate, /src="\/corre-logo-mark\.png"/, 'a tela preserva a marca original com o corredor dentro do pin')
assert.match(modeGate, /Como voc&ecirc; quer usar o Corre Aqui\?/, 'o titulo aprovado esta presente')
assert.match(modeGate, /Escolha como deseja continuar/, 'o subtitulo aprovado esta presente')

const brandClass = modeGate.match(/data-mode-selection-brand className="([^"]+)"/)?.[1] || ''
assert.match(brandClass, /gap-0\.5/, 'o pin fica visualmente proximo ao nome Corre Aqui em celulares pequenos')
assert.match(brandClass, /min-\[390px\]:gap-1/, 'a proximidade da marca permanece equilibrada em celulares maiores')

const logoClass = modeGate.match(/data-mode-selection-logo className="([^"]+)"/)?.[1] || ''
assert.match(logoClass, /h-\[54px\]/, 'a marca preserva proporcao compacta em 320 e 360 px')
assert.match(logoClass, /min-\[390px\]:h-\[62px\]/, 'a marca cresce de forma controlada em 390 e 430 px')
assert.match(modeGate, /translate-y-\[6%\] scale-\[1\.66\]/, 'o alinhamento visual compensa apenas o espaco transparente do asset original')

const titleClass = modeGate.match(/data-mode-selection-title className="([^"]+)"/)?.[1] || ''
assert.match(titleClass, /text-balance/, 'o titulo usa quebra equilibrada')
assert.match(titleClass, /text-\[clamp\(1\.3rem,5\.7vw,1\.75rem\)\]/, 'o titulo usa escala fluida apropriada para Android')
assert.match(titleClass, /font-extrabold/, 'o peso do titulo permanece forte sem excesso visual')
assert.match(titleClass, /leading-\[1\.14\]/, 'o titulo preserva espacamento legivel entre linhas')
assert.match(titleClass, /tracking-\[-0\.025em\]/, 'o titulo usa espacamento refinado entre letras')

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

const selectionMarkup = modeGate.slice(modeGate.indexOf('<main data-mode-selection-screen'))
assert.doesNotMatch(
  selectionMarkup,
  /<button[^>]+className="[^"]*(?:fixed|absolute)[^"]*(?:right-|left-)[^"]*rounded-full/i,
  'a tela nao cria botao circular flutuante sobre os cartoes'
)

assert.match(modeGate, /dark:bg-slate-950/, 'a composicao possui fundo para tema escuro')
assert.match(modeGate, /dark:text-white/, 'textos principais permanecem legiveis no tema escuro')
assert.match(modeGate, /isClient \? 'bg-violet-50 text-violet-700' : 'bg-orange-50 text-orange-700'/, 'as identidades Cliente e Corre Pro permanecem roxa e laranja')
assert.match(modeGate, /onClick=\{\(\) => onSelect\(id\)\}/, 'a selecao de modo continua usando o fluxo existente')

console.log('Selecao de modo responsiva: marca, textos, safe areas, rolagem, temas e acoes preservados')
