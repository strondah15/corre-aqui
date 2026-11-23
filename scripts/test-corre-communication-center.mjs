import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const [
  centerSource,
  conversationsSource,
  noticesSource,
  mapSource,
  panelSource,
] = await Promise.all([
  read('../src/components/CorreCommunicationCenter.jsx'),
  read('../src/components/ListaConversas.jsx'),
  read('../src/components/CentralNotificacoes.jsx'),
  read('../src/components/Mapadinamico.jsx'),
  read('../src/components/CorrePainelPage.jsx'),
])

assert.match(centerSource, /initialTab = 'conversations'/, 'a central abre inicialmente em Conversas')
assert.match(centerSource, /role="tablist"/, 'abas possuem tablist acessível')
assert.match(centerSource, /role="tab"/, 'controles usam semântica de tab')
assert.match(centerSource, /role="tabpanel"/, 'conteúdo usa semântica de tabpanel')
assert.match(centerSource, /hidden=\{selectedTab !== 'conversations'\}/, 'Conversas permanece montada ao alternar abas')
assert.match(centerSource, /hidden=\{selectedTab !== 'notices'\}/, 'Avisos permanece montada para manter contadores em tempo real')
assert.match(centerSource, /label: 'Conversas'/, 'aba Conversas está disponível')
assert.match(centerSource, /label: 'Avisos'/, 'aba Avisos está disponível')
assert.match(centerSource, /compact: true/, 'a central ativa apenas a apresentação compacta')
assert.match(centerSource, /onUnreadCountChange: updateConversationCount/, 'contador de conversas não lidas alimenta a aba')
assert.match(centerSource, /onUnreadCountChange: updateNoticeCount/, 'contador de avisos não lidos alimenta a aba')
assert.match(centerSource, /from-white/, 'a central preserva a superfície clara aprovada')
assert.doesNotMatch(centerSource, /@\/lib\/firebase|firebaseDebug|onValue|update\(ref/, 'a central não altera a camada de dados')

assert.match(conversationsSource, /compact = false/, 'lista de conversas mantém o visual anterior por padrão')
assert.match(conversationsSource, /if \(compact\)/, 'lista possui apresentação compacta isolada')
assert.match(conversationsSource, /outroFotoURL/, 'linha compacta preserva foto ou avatar do participante')
assert.match(conversationsSource, /timeShort\(c\._timestampMs\)/, 'linha compacta apresenta o horário da interação')
assert.match(conversationsSource, /c\.unread/, 'linha compacta preserva o indicador de não lidas')
assert.match(conversationsSource, /onUnreadCountChange\?\.\(totalNaoLidas\)/, 'total não lido é reportado à central')
assert.match(conversationsSource, /onClick=\{\(\) => abrirConversa\(c\.pedidoId\)\}/, 'linha compacta preserva a abertura da conversa')
assert.match(conversationsSource, /set\(ref\(database, `conversas\/\$\{expectedUid\}\/\$\{pedidoId\}\/unread`\), false\)/, 'marcação de leitura existente foi preservada')
assert.match(conversationsSource, /Nenhuma conversa aqui/, 'estado vazio de Conversas é explícito')
assert.match(conversationsSource, /bg-white text-slate-950/, 'linhas de Conversas usam fundo claro e texto legível')

assert.match(noticesSource, /compact = false/, 'avisos mantêm o visual anterior por padrão')
assert.match(noticesSource, /if \(compact\)/, 'avisos possuem apresentação compacta isolada')
assert.match(noticesSource, /onUnreadCountChange\?\.\(naoLidas\)/, 'total de avisos não lidos é reportado à central')
assert.match(noticesSource, /onClick=\{\(\) => abrir\(n\)\}/, 'linha compacta preserva acesso ao conteúdo completo')
assert.match(noticesSource, /onClick=\{\(\) => marcarLida\(n\)\}/, 'marcação individual de aviso foi preservada')
assert.match(noticesSource, /const offLegacy = onValue/, 'listener legado de avisos foi preservado')
assert.match(noticesSource, /const offModern = onValue/, 'listener moderno de avisos foi preservado')
assert.match(noticesSource, /Tudo em dia/, 'estado vazio de Avisos é explícito')
assert.match(noticesSource, /bg-white text-slate-950/, 'linhas de Avisos usam fundo claro e texto legível')

const bottomTabHandler = mapSource.slice(
  mapSource.indexOf('const onBottomTab = (id) =>'),
  mapSource.indexOf('const profileFabCount'),
)
assert.match(
  bottomTabHandler,
  /if \(id === 'inbox'\) \{\s*setCorreCommunicationTab\('conversations'\)\s*setTab\('inbox'\)/,
  'Chat na barra inferior abre inicialmente a aba Conversas',
)
assert.match(mapSource, /activeTab=\{correCommunicationTab\}/, 'central integrada ao inbox principal do modo Corre')
assert.match(mapSource, /setCorreCommunicationTab\('notices'\)[\s\S]{0,100}setTab\('inbox'\)/, 'atalhos de notificações abrem a aba Avisos')
assert.match(mapSource, /modoApp === 'corre' && tab !== 'inbox' && !openIA/, 'controle flutuante não cobre a central de comunicação')
assert.match(mapSource, /pb-\[var\(--bottom-bar-safe-space\)\]/, 'inbox reserva a área segura da barra inferior')

assert.match(panelSource, /<CorreCommunicationCenter/, 'rota dedicada do inbox também usa a central')
assert.ok(
  panelSource.indexOf('conversations={(') < panelSource.indexOf('notices={('),
  'rota dedicada mantém Conversas como primeira aba',
)

console.log('PASS: central de comunicação do modo Corre preserva navegação, não lidas e listeners existentes.')
