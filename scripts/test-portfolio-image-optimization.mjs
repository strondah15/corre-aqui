import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import {
  PORTFOLIO_IMAGE_LIMITS,
  getPortfolioTargetDimensions,
  optimizePortfolioPhoto,
  uploadProfilePhotoToImgBB,
} from '../src/lib/imgbbClient.js'
import {
  getPortfolioPhotoStatus,
  getPortfolioSaveBlocker,
  isLocalPortfolioPreview,
  PORTFOLIO_PHOTO_STATUS,
  withoutLocalPortfolioPreviews,
} from '../src/lib/portfolioDraftState.js'
import {
  applyPortfolioMutation,
  createPortfolioOperationQueue,
  getPortfolioReadErrorMessage,
  mergePortfolioSources,
  resolveUserPortfolioMap,
  sanitizePortfolioErrorCode,
  withoutPortfolioFields,
} from '../src/lib/portfolioPersistence.js'

const componentSource = await readFile(new URL('../src/components/PerfilDrawer.jsx', import.meta.url), 'utf8')
const chatSource = await readFile(new URL('../src/components/ChatMensagens.jsx', import.meta.url), 'utf8')
const uploadRouteSource = await readFile(new URL('../src/app/api/upload/profile-photo/route.js', import.meta.url), 'utf8')

function makeFile(bytes, name, type) {
  return new File([new Uint8Array(bytes)], name, { type, lastModified: 1 })
}

function installFakeBrowser({ width, height, hasTransparency = false, webpSupported = true, encodedBytes = 512, encodeFails = false, bitmapFails = false, imageElementFails = false } = {}) {
  const previous = {
    createImageBitmap: globalThis.createImageBitmap,
    document: globalThis.document,
    Image: globalThis.Image,
  }
  const state = {
    bitmapClosed: 0,
    canvasCleared: 0,
    decodeCalls: 0,
    encodeRequests: [],
    canvas: null,
    orientation: '',
    imageElementDecodeCalls: 0,
  }

  globalThis.createImageBitmap = async (_file, options = {}) => {
    state.decodeCalls += 1
    state.orientation = options.imageOrientation
    if (bitmapFails) throw new Error('bitmap_decode_failed')
    return {
      width,
      height,
      close: () => { state.bitmapClosed += 1 },
    }
  }
  globalThis.Image = class FakeImage {
    constructor() {
      this.naturalWidth = width
      this.naturalHeight = height
      this.width = width
      this.height = height
      this.onload = null
      this.onerror = null
    }

    set src(value) {
      if (!value) return
      state.imageElementDecodeCalls += 1
      queueMicrotask(() => {
        if (imageElementFails) this.onerror?.(new Error('image_element_decode_failed'))
        else this.onload?.()
      })
    }
  }
  globalThis.document = {
    createElement: (tagName) => {
      assert.equal(tagName, 'canvas')
      const context = {
        drawImage: () => {},
        getImageData: () => ({
          data: new Uint8ClampedArray([0, 0, 0, hasTransparency ? 80 : 255]),
        }),
        clearRect: () => { state.canvasCleared += 1 },
      }
      const canvas = {
        width: 1,
        height: 1,
        getContext: () => context,
        toBlob: (callback, requestedType, quality) => {
          state.encodeRequests.push({ requestedType, quality })
          if (encodeFails) {
            callback(null)
            return
          }
          const actualType = requestedType === 'image/webp' && !webpSupported ? 'image/png' : requestedType
          callback(new Blob([new Uint8Array(encodedBytes)], { type: actualType }))
        },
      }
      state.canvas = canvas
      return canvas
    },
  }

  return {
    state,
    restore() {
      if (previous.createImageBitmap === undefined) delete globalThis.createImageBitmap
      else globalThis.createImageBitmap = previous.createImageBitmap
      if (previous.document === undefined) delete globalThis.document
      else globalThis.document = previous.document
      if (previous.Image === undefined) delete globalThis.Image
      else globalThis.Image = previous.Image
    },
  }
}

async function withFakeBrowser(options, callback) {
  const fake = installFakeBrowser(options)
  try {
    return await callback(fake.state)
  } finally {
    fake.restore()
  }
}

async function withFakeXhr(callback) {
  const previous = globalThis.XMLHttpRequest
  const instances = []

  class FakeXMLHttpRequest {
    constructor() {
      this.readyState = 1
      this.status = 0
      this.responseText = ''
      this.timeout = 0
      this.upload = {}
      this.abortCalls = 0
      instances.push(this)
    }

    open(method, url) {
      this.method = method
      this.url = url
    }

    setRequestHeader(name, value) {
      this.headers = { ...(this.headers || {}), [name]: value }
    }

    send(form) {
      this.form = form
    }

    abort() {
      this.abortCalls += 1
      this.readyState = 4
      this.onabort?.()
    }
  }

  globalThis.XMLHttpRequest = FakeXMLHttpRequest
  try {
    await callback(instances)
  } finally {
    if (previous === undefined) delete globalThis.XMLHttpRequest
    else globalThis.XMLHttpRequest = previous
  }
}

async function createFixture({ name, width, height, format, transparent = false, orientation = 1 }) {
  const background = transparent
    ? { r: 34, g: 128, b: 210, alpha: 0.42 }
    : { r: 34, g: 128, b: 210, alpha: 1 }
  let pipeline = sharp({ create: { width, height, channels: transparent ? 4 : 3, background } })
  if (orientation !== 1) pipeline = pipeline.withMetadata({ orientation })
  if (format === 'jpeg') pipeline = pipeline.jpeg({ quality: 95 })
  if (format === 'png') pipeline = pipeline.png({ compressionLevel: 6 })
  if (format === 'webp') pipeline = pipeline.webp({ quality: 92 })
  return { name, width, height, format, transparent, orientation, buffer: await pipeline.toBuffer() }
}

async function referenceOptimize(fixture) {
  const inputMetadata = await sharp(fixture.buffer).metadata()
  const { data, info } = await sharp(fixture.buffer)
    .rotate()
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true })
  const outputMetadata = await sharp(data).metadata()
  const sourceWidth = fixture.orientation >= 5 ? fixture.height : fixture.width
  const sourceHeight = fixture.orientation >= 5 ? fixture.width : fixture.height

  assert.ok(Math.max(info.width, info.height) <= PORTFOLIO_IMAGE_LIMITS.maxSide, `${fixture.name}: lado máximo`)
  assert.ok(info.width <= sourceWidth && info.height <= sourceHeight, `${fixture.name}: sem ampliação`)
  assert.ok(Math.abs(sourceWidth / sourceHeight - info.width / info.height) < 0.01, `${fixture.name}: proporção`)
  if (fixture.transparent) assert.equal(outputMetadata.hasAlpha, true, `${fixture.name}: transparência`)

  return {
    caso: fixture.name,
    original: `${inputMetadata.width}x${inputMetadata.height}`,
    bytesAntes: fixture.buffer.length,
    formatoAntes: inputMetadata.format,
    otimizada: `${info.width}x${info.height}`,
    bytesDepois: data.length,
    formatoDepois: outputMetadata.format,
    reducao: `${Math.round((1 - data.length / fixture.buffer.length) * 1000) / 10}%`,
  }
}

assert.deepEqual(getPortfolioTargetDimensions(4000, 3000), { width: 1280, height: 960, scale: 0.32 })
assert.deepEqual(getPortfolioTargetDimensions(3000, 4000), { width: 960, height: 1280, scale: 0.32 })
assert.deepEqual(getPortfolioTargetDimensions(640, 480), { width: 640, height: 480, scale: 1 })

assert.equal(isLocalPortfolioPreview('blob:https://preview/1'), true)
assert.equal(getPortfolioPhotoStatus('https://i.ibb.co/foto.webp'), PORTFOLIO_PHOTO_STATUS.UPLOADED, 'URL legada continua pronta sem metadado novo')
assert.equal(
  getPortfolioSaveBlocker({ name: 'Reparo', photos: ['blob:https://preview/1'] }),
  'portfolio_photo_uploading',
  'prévia local nunca pode ser persistida',
)
assert.equal(
  getPortfolioSaveBlocker({
    name: 'Reparo',
    photos: ['blob:https://preview/1'],
    photoStates: { 'blob:https://preview/1': { status: PORTFOLIO_PHOTO_STATUS.FAILED } },
  }),
  'portfolio_photo_failed',
  'falha de upload exige retry ou remoção',
)
assert.equal(
  getPortfolioSaveBlocker({ name: 'Reparo', photos: [], uploadInProgress: true }),
  'portfolio_photo_uploading',
  'upload lento bloqueia salvamento',
)
assert.equal(
  getPortfolioSaveBlocker({ name: '  ', photos: ['https://i.ibb.co/foto.webp'] }),
  'portfolio_name_required',
  'nome vazio falha fechado',
)
assert.equal(
  getPortfolioSaveBlocker({ name: 'Reparo', photos: ['https://i.ibb.co/foto.webp'] }),
  '',
  'URL existente e nome válido mantêm compatibilidade',
)
assert.deepEqual(
  withoutLocalPortfolioPreviews(['blob:https://preview/1', 'https://i.ibb.co/foto.webp', 'https://i.ibb.co/foto.webp']),
  ['https://i.ibb.co/foto.webp'],
  'serialização remove blob e preserva URLs existentes',
)

await withFakeXhr(async (instances) => {
  const pending = uploadProfilePhotoToImgBB(makeFile(128, 'lenta.jpg', 'image/jpeg'), {
    uid: 'uid-test',
    idToken: 'token-test',
    skipCompression: true,
  })
  let settled = false
  pending.then(() => { settled = true }, () => { settled = true })
  await Promise.resolve()
  assert.equal(settled, false, 'upload lento permanece pendente até resposta real')
  assert.equal(instances[0].timeout, 28_000, 'XHR encerra antes do timeout externo antigo')
  instances[0].status = 200
  instances[0].responseText = JSON.stringify({ ok: true, url: 'https://i.ibb.co/foto.webp' })
  instances[0].readyState = 4
  instances[0].onload()
  assert.equal((await pending).url, 'https://i.ibb.co/foto.webp')
})

await withFakeXhr(async (instances) => {
  const pending = uploadProfilePhotoToImgBB(makeFile(128, 'timeout.jpg', 'image/jpeg'), {
    uid: 'uid-test',
    idToken: 'token-test',
    skipCompression: true,
  })
  instances[0].ontimeout()
  await assert.rejects(pending, /imgbb_request_timeout/, 'timeout encerra a requisição pendente')
})

await withFakeXhr(async (instances) => {
  const controller = new AbortController()
  const pending = uploadProfilePhotoToImgBB(makeFile(128, 'cancelada.jpg', 'image/jpeg'), {
    uid: 'uid-test',
    idToken: 'token-test',
    skipCompression: true,
    signal: controller.signal,
  })
  controller.abort()
  await assert.rejects(pending, /imgbb_request_aborted/, 'AbortSignal cancela o XHR real')
  assert.equal(instances[0].abortCalls, 1)
})

await withFakeBrowser({ width: 4000, height: 3000, encodedBytes: 700 }, async (state) => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'horizontal.jpg', 'image/jpeg'))
  assert.equal(result.file.type, 'image/webp')
  assert.match(result.file.name, /\.webp$/)
  assert.equal(state.canvas.width, 1, 'canvas é reduzido depois do uso')
  assert.equal(state.canvas.height, 1, 'canvas é reduzido depois do uso')
  assert.equal(result.metrics.optimized.width, 1280)
  assert.equal(result.metrics.optimized.height, 960)
  assert.equal(result.metrics.metadataRemoved, true)
  assert.equal(state.orientation, 'from-image')
  assert.equal(state.encodeRequests[0].quality, PORTFOLIO_IMAGE_LIMITS.quality)
  assert.equal(state.bitmapClosed, 1)
  assert.equal(state.canvasCleared, 1)
})

await withFakeBrowser({ width: 3000, height: 4000, encodedBytes: 700 }, async (state) => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'vertical.jpg', 'image/jpeg'))
  assert.equal(result.metrics.optimized.width, 960)
  assert.equal(result.metrics.optimized.height, 1280)
  assert.equal(state.orientation, 'from-image', 'orientação EXIF é solicitada no decode')
})

await withFakeBrowser({ width: 640, height: 480, encodedBytes: 900 }, async () => {
  const result = await optimizePortfolioPhoto(makeFile(800, 'pequena.jpg', 'image/jpeg'))
  assert.equal(result.file.type, 'image/jpeg', 'original menor é mantido')
  assert.equal(result.metrics.usedOriginal, true)
  assert.equal(result.metrics.reason, 'original_smaller')
})

await withFakeBrowser({ width: 1600, height: 1000, hasTransparency: true, encodedBytes: 700 }, async () => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'alpha.png', 'image/png'))
  assert.equal(result.file.type, 'image/webp', 'WebP mantém alpha quando suportado')
})

await withFakeBrowser({ width: 1600, height: 1000, hasTransparency: true, webpSupported: false, encodedBytes: 700 }, async (state) => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'alpha.png', 'image/png'))
  assert.equal(result.file.type, 'image/png', 'PNG transparente nunca cai para JPEG')
  assert.match(result.file.name, /\.png$/)
  assert.deepEqual(state.encodeRequests.map(({ requestedType }) => requestedType), ['image/webp', 'image/png'])
})

await withFakeBrowser({ width: 2000, height: 1400, encodedBytes: 700 }, async () => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'entrada.webp', 'image/webp'))
  assert.equal(result.file.type, 'image/webp')
})

await withFakeBrowser({ width: 6000, height: 5000, encodedBytes: 700 }, async (state) => {
  await assert.rejects(
    () => optimizePortfolioPhoto(makeFile(5000, 'pixels-demais.jpg', 'image/jpeg')),
    /portfolio_dimensions_too_large/,
  )
  assert.equal(state.bitmapClosed, 1, 'bitmap extremo é fechado mesmo no erro')
  assert.equal(state.canvas, null, 'dimensões são validadas antes de alocar canvas')
})

await withFakeBrowser({ width: 2000, height: 1400, encodedBytes: 700 }, async (state) => {
  const gif = makeFile(5000, 'animado.gif', 'image/gif')
  const result = await optimizePortfolioPhoto(gif)
  assert.equal(result.file, gif, 'GIF não é achatado pelo canvas')
  assert.equal(result.metrics.reason, 'animated_original')
  assert.equal(state.decodeCalls, 0)
})

await withFakeBrowser({ width: 2000, height: 1400, encodedBytes: 700 }, async (state) => {
  const gif = makeFile(PORTFOLIO_IMAGE_LIMITS.maxUploadBytes + 1, 'animado-grande.gif', 'image/gif')
  await assert.rejects(() => optimizePortfolioPhoto(gif), /portfolio_original_too_large/)
  assert.equal(state.decodeCalls, 0, 'GIF acima do limite de upload não é decodificado')
})

await withFakeBrowser({ width: 2000, height: 1400, encodedBytes: 700 }, async (state) => {
  const heic = makeFile(5000, 'camera.heic', '')
  const result = await optimizePortfolioPhoto(heic)
  assert.equal(result.file.type, 'image/webp', 'HEIC decodificável é convertido antes do upload')
  assert.match(result.file.name, /camera\.webp$/)
  assert.equal(state.decodeCalls, 1)
  assert.equal(result.metrics.metadataRemoved, true)
})

await withFakeBrowser({ width: 2000, height: 1400, encodedBytes: 700, bitmapFails: true }, async (state) => {
  const result = await optimizePortfolioPhoto(makeFile(5000, 'fallback-decoder.jpg', 'image/jpeg'))
  assert.equal(result.file.type, 'image/webp')
  assert.equal(state.decodeCalls, 1, 'createImageBitmap foi tentado uma vez')
  assert.equal(state.imageElementDecodeCalls, 1, 'elemento img assume quando createImageBitmap falha')
})

await withFakeBrowser({ width: 2000, height: 1400, bitmapFails: true, imageElementFails: true }, async () => {
  const smallHeic = makeFile(5000, 'camera-original.heic', 'image/heic')
  const result = await optimizePortfolioPhoto(smallHeic)
  assert.equal(result.file, smallHeic, 'HEIC pequeno mantém compatibilidade quando o navegador não decodifica')
  assert.equal(result.metrics.reason, 'optimization_failed')
})

await withFakeBrowser({ width: 2000, height: 1400, bitmapFails: true, imageElementFails: true }, async () => {
  const largeHeic = makeFile(PORTFOLIO_IMAGE_LIMITS.maxUploadBytes + 1, 'camera-grande.heic', 'image/heic')
  await assert.rejects(
    () => optimizePortfolioPhoto(largeHeic),
    /portfolio_format_not_supported/,
    'HEIC grande não é enviado cru quando o navegador não consegue convertê-lo',
  )
})

await withFakeBrowser({ width: 4000, height: 3000, encodedBytes: 700 }, async (state) => {
  const oversized = makeFile(PORTFOLIO_IMAGE_LIMITS.maxSourceBytes + 1, 'bytes-demais.jpg', 'image/jpeg')
  await assert.rejects(() => optimizePortfolioPhoto(oversized), /portfolio_source_too_large/)
  assert.equal(state.decodeCalls, 0, 'limite bruto é aplicado antes do decode')
})

await withFakeBrowser({ width: 1600, height: 1000, encodeFails: true }, async () => {
  const small = makeFile(1000, 'fallback.jpg', 'image/jpeg')
  const result = await optimizePortfolioPhoto(small)
  assert.equal(result.file, small, 'falha de compressão usa original permitido')
  assert.equal(result.metrics.reason, 'optimization_failed')
})

await withFakeBrowser({ width: 1600, height: 1000, encodeFails: true }, async () => {
  const large = makeFile(PORTFOLIO_IMAGE_LIMITS.maxUploadBytes + 1, 'fallback-grande.jpg', 'image/jpeg')
  await assert.rejects(() => optimizePortfolioPhoto(large), /portfolio_original_too_large/)
})

const legacyPortfolio = [
  { id: 'legacy-1', nome: 'Serviço legado', ativo: true },
]
const canonicalPortfolio = {
  'canonical-1': { id: 'canonical-1', nome: 'Serviço canônico', ativo: true },
}
assert.deepEqual(
  Object.keys(resolveUserPortfolioMap({ profPortfolio: legacyPortfolio })).sort(),
  ['legacy-1'],
  'dados legados continuam legíveis antes da primeira escrita canônica',
)
assert.deepEqual(
  Object.keys(resolveUserPortfolioMap({
    profPortfolio: legacyPortfolio,
    portfolio: canonicalPortfolio,
    portfolioCanonicalVersion: 1,
  })).sort(),
  ['canonical-1'],
  'mapa canônico confirmado não é sobrescrito por cópia legada antiga',
)
assert.deepEqual(
  resolveUserPortfolioMap({ profPortfolio: legacyPortfolio, portfolioCanonicalVersion: 1 }),
  {},
  'marcador canônico distingue portfólio vazio de leitura legada ausente',
)

const preservedMutation = applyPortfolioMutation(canonicalPortfolio, {
  type: 'upsert',
  id: 'new-1',
  item: { id: 'new-1', nome: 'Novo serviço', ativo: true },
})
assert.deepEqual(
  Object.keys(preservedMutation).sort(),
  ['canonical-1', 'new-1'],
  'upsert preserva serviços remotos existentes',
)
assert.deepEqual(
  Object.keys(applyPortfolioMutation(preservedMutation, { type: 'remove', id: 'canonical-1' })),
  ['new-1'],
  'remoção dedicada altera somente o serviço solicitado',
)

const strippedProfile = withoutPortfolioFields({
  nome: 'Profissional',
  profPortfolio: legacyPortfolio,
  portfolio: canonicalPortfolio,
  profissional: {
    titulo: 'Reparos',
    profPortfolio: legacyPortfolio,
    portfolio: canonicalPortfolio,
  },
})
assert.equal(strippedProfile.nome, 'Profissional')
assert.equal(strippedProfile.profissional.titulo, 'Reparos')
assert.equal('profPortfolio' in strippedProfile, false, 'salvamento geral não recebe profPortfolio')
assert.equal('portfolio' in strippedProfile, false, 'salvamento geral não recebe portfolio')
assert.equal('profPortfolio' in strippedProfile.profissional, false, 'perfil profissional geral não recebe profPortfolio')
assert.equal('portfolio' in strippedProfile.profissional, false, 'perfil profissional geral não recebe portfolio')

const queue = createPortfolioOperationQueue()
let releaseFirst
let markFirstStarted
const firstGate = new Promise((resolve) => { releaseFirst = resolve })
const firstStarted = new Promise((resolve) => { markFirstStarted = resolve })
let simulatedRemote = mergePortfolioSources(canonicalPortfolio)
const executionOrder = []
const firstMutation = queue.run(async () => {
  executionOrder.push('first:start')
  markFirstStarted()
  await firstGate
  simulatedRemote = applyPortfolioMutation(simulatedRemote, {
    type: 'upsert',
    id: 'slow-1',
    item: { id: 'slow-1', nome: 'Lento', ativo: true },
  })
  executionOrder.push('first:end')
})
const secondMutation = queue.run(async () => {
  executionOrder.push('second:start')
  simulatedRemote = applyPortfolioMutation(simulatedRemote, {
    type: 'upsert',
    id: 'fast-1',
    item: { id: 'fast-1', nome: 'Rápido', ativo: true },
  })
  executionOrder.push('second:end')
})
await firstStarted
assert.deepEqual(executionOrder, ['first:start'], 'operações simultâneas ficam serializadas independentemente do botão')
releaseFirst()
await Promise.all([firstMutation, secondMutation])
assert.deepEqual(executionOrder, ['first:start', 'first:end', 'second:start', 'second:end'])
assert.deepEqual(
  Object.keys(simulatedRemote).sort(),
  ['canonical-1', 'fast-1', 'slow-1'],
  'fila aplica a segunda operação sobre o estado confirmado pela primeira',
)
assert.deepEqual(
  Object.keys(resolveUserPortfolioMap({
    profPortfolio: legacyPortfolio,
    portfolio: simulatedRemote,
    portfolioCanonicalVersion: 1,
  })).sort(),
  ['canonical-1', 'fast-1', 'slow-1'],
  'recarregar usa o estado canônico confirmado e ignora a cópia legada antiga',
)

const recoveringQueue = createPortfolioOperationQueue()
await assert.rejects(
  () => recoveringQueue.run(async () => { throw Object.assign(new Error('write_failed'), { code: 'permission_denied' }) }),
  /write_failed/,
  'falha de escrita é propagada',
)
const recoveredResult = await recoveringQueue.run(async () => 'recovered')
assert.equal(recoveredResult, 'recovered', 'fila continua utilizável após falha de escrita')
assert.match(getPortfolioReadErrorMessage({ code: 'PERMISSION_DENIED' }), /sessão precisa ser renovada/)
assert.equal(sanitizePortfolioErrorCode({ message: 'erro com dado privado' }), 'erro_com_dado_privado')

assert.match(componentSource, /portfolioPhotoUploadLockRef\.current/, 'duplo envio bloqueado por ref síncrona')
assert.match(componentSource, /Enviando foto\.\.\./, 'feedback único permanece visível durante preparação e upload')
assert.match(componentSource, /URL\.createObjectURL\(prepared\.file\)/, 'preview usa exatamente o arquivo preparado')
assert.match(componentSource, /uploadPortfolioPhotoToImgBB\(prepared\.file/, 'upload recebe exatamente o arquivo preparado')
assert.match(componentSource, /portfolioPreviewOwnerRef/, 'preview pertence ao UID que iniciou o fluxo')
assert.match(componentSource, /auth\.currentUser\?\.uid !== currentUid/, 'upload de A não entra no estado de B')
assert.match(componentSource, /localUrls\.forEach\(\(url\) => URL\.revokeObjectURL\(url\)\)/, 'fechamento e troca A→B revogam previews')
assert.match(componentSource, /revokePortfolioPreviewUrl\(fotoURL\)/, 'remoção revoga preview local')
assert.match(componentSource, /portfolioPreviewUrlsRef\.current\.forEach\(\(url\) => URL\.revokeObjectURL\(url\)\)/, 'unmount revoga previews restantes')
assert.match(componentSource, /disabled=\{portfolioPhotoUploading\}/, 'remoção fica bloqueada durante processamento/upload')
assert.match(componentSource, /uploadProfilePhotoToImgBB\(file, \{/, 'foto de perfil continua no pipeline anterior')
assert.match(componentSource, /accept="image\/\*,\.heic,\.heif"/, 'seletor móvel permite abrir a galeria sem forçar câmera')
assert.match(componentSource, /ref=\{portfolioPhotoInputRef\}/, 'seletor móvel possui referência estável')
assert.match(componentSource, /portfolioPhotoInputRef\.current\?\.click\(\)/, 'botão abre a galeria diretamente no gesto do usuário')
const portfolioUploadBody = componentSource.slice(componentSource.indexOf('async function handlePortfolioPhotoUpload'), componentSource.indexOf('async function alterarFotoPortfolio'))
assert.match(portfolioUploadBody, /currentUser\.getIdToken\(\)/, 'upload usa renovação normal do SDK sem forçar refresh em toda foto')
assert.doesNotMatch(portfolioUploadBody, /currentUser\.getIdToken\(true\)/, 'upload móvel não força refresh de token desnecessário')
assert.match(componentSource, /code === "imgbb_config_missing"[\s\S]*envio de fotos ainda não está configurado/, 'configuração ausente recebe erro claro e seguro')
assert.match(componentSource, /aria-live="polite"/, 'resultado do upload é anunciado de forma acessível')
assert.match(componentSource, /Aguarde o envio da foto\.\.\./, 'botão explica por que salvar está bloqueado')
assert.match(componentSource, /tentarNovamenteFotoPortfolio/, 'falha de upload oferece retry explícito')
assert.match(componentSource, /PORTFOLIO_PHOTO_STATUS\.PREVIEW/, 'foto entra no estado preview')
assert.match(componentSource, /PORTFOLIO_PHOTO_STATUS\.UPLOADING/, 'foto entra no estado uploading')
assert.match(componentSource, /PORTFOLIO_PHOTO_STATUS\.UPLOADED/, 'foto entra no estado uploaded')
assert.match(componentSource, /PORTFOLIO_PHOTO_STATUS\.FAILED/, 'foto entra no estado failed')

const addBody = componentSource.slice(componentSource.indexOf('const adicionarPortfolioItem'), componentSource.indexOf('const editarPortfolioItem'))
assert.match(addBody, /const nextProfile = \{[\s\S]*profPortfolio:/, 'item usa o portfólio completo que será persistido')
assert.match(addBody, /await salvarPortfolio\(\{ type: "upsert", id, item \}, nextProfile\)/, 'Adicionar usa mutação dedicada do portfólio')
assert.doesNotMatch(addBody, /await salvar\(nextProfile\)/, 'Adicionar não dispara escritas acessórias de todo o perfil')
assert.match(addBody, /setPortfolioDraft\(\(prev\) => \(\{ \.\.\.prev, id, createdAt: item\.createdAt \}\)\)/, 'retentativa reutiliza o mesmo item após falha parcial')
assert.match(addBody, /Seus dados continuam na tela para tentar novamente/, 'falha de persistência preserva o rascunho')
assert.match(addBody, /portfolio_name_required[\s\S]*Preencha o nome do serviço/, 'nome vazio recebe erro explícito')
assert.match(addBody, /withoutLocalPortfolioPreviews\(draftFotos\)/, 'blob local não entra no item persistido')
const persistenceCallIndex = addBody.indexOf('await salvarPortfolio({ type: "upsert", id, item }, nextProfile)')
const confirmedProfileIndex = addBody.indexOf('setProfile(')
assert.ok(persistenceCallIndex >= 0 && confirmedProfileIndex > persistenceCallIndex, 'estado local só confirma depois da escrita privada')
assert.match(addBody, /result\.publicSynced === false[\s\S]*vitrine pública não foi atualizada/, 'falha parcial é distinguida de falha privada')
assert.match(addBody, /setPortfolioPhotoSuccess\("Serviço e fotos salvos no portfólio\."\)/, 'sucesso integral depende do retorno da persistência')

const portfolioSaveBody = componentSource.slice(componentSource.indexOf('async function salvarPortfolio'), componentSource.indexOf('const salvar = async'))
assert.match(portfolioSaveBody, /runTransaction\(canonicalRef[\s\S]*applyPortfolioMutation\(currentPortfolio, mutation\)/, 'mapa canônico usa transação contra estado remoto atual')
assert.match(portfolioSaveBody, /resolveUserPortfolioMap\(userSnap\.val\(\)\)/, 'primeira mutação preserva dados legados')
assert.match(portfolioSaveBody, /portfolioCanonicalVersion: 1/, 'marcador distingue vazio canônico de ausência legada')
assert.match(portfolioSaveBody, /"profile\/profPortfolio"[\s\S]*"profile\/portfolio"/, 'cópias legadas são derivadas do resultado confirmado')
assert.match(portfolioSaveBody, /validatePortfolioIdentity\(expectedUid\)[\s\S]*stage = "private_write"/, 'persistência confirma identidade antes da escrita')
assert.match(portfolioSaveBody, /stage = "legacy_sync"[\s\S]*validatePortfolioIdentity\(expectedUid\)[\s\S]*update\(ref\(database, userBasePath\)/, 'identidade é conferida novamente antes das cópias privadas')
assert.doesNotMatch(portfolioSaveBody, /settings\/mapa|settings\/ui|usuariosOnline|subscriptions|assinatura/, 'persistência do portfólio não toca em configurações ou comércio')

const generalSaveStart = componentSource.indexOf('const salvar = async')
const generalSaveBody = componentSource.slice(generalSaveStart, componentSource.indexOf('const configSnapshot =', generalSaveStart))
assert.match(generalSaveBody, /withoutPortfolioFields\(profileToSave\)/, 'salvamento geral remove campos de portfólio do payload espalhado')
assert.doesNotMatch(generalSaveBody, /"profile\/profPortfolio"|"profile\/portfolio"/, 'salvamento geral não grava mirrors privados do portfólio')
assert.doesNotMatch(generalSaveBody, /profPortfolio,|portfolio: portfolioMap/, 'salvamento geral não regrava listas capturadas no React')
assert.doesNotMatch(generalSaveBody, /publicPortfolio\//, 'salvamento geral não projeta lista pública a partir de estado antigo')
assert.doesNotMatch(generalSaveBody, /syncPortfolioProjection/, 'salvamento geral não chama um segundo escritor de portfólio')
assert.match(generalSaveBody, /delete publicProfilePayload\.portfolio/, 'perfil público geral preserva o portfólio já confirmado')
assert.match(componentSource, /currentProfSection !== "perfilProfissional" && currentProfSection !== "portfolio"/, 'botão global Salvar não aparece na seção de portfólio')
assert.match(componentSource, /createPortfolioOperationQueue\(\)/, 'fila síncrona protege operações mesmo antes do rerender do botão')
assert.match(componentSource, /stage: "private_read"[\s\S]*getPortfolioReadErrorMessage/, 'falha de leitura privada recebe estado e mensagem próprios')
assert.match(componentSource, /currentPortfolioReadStatus\.error[\s\S]*Carregando seus serviços/, 'erro ou carregamento não são apresentados como zero serviços')
assert.match(componentSource, /profPortfolio: portfolioSalvo,/, 'lista canônica realmente vazia substitui estado visual antigo')
assert.match(
  componentSource,
  /const dataWithoutPortfolio = withoutPortfolioFields\(data\);[\s\S]*?\.\.\.dataWithoutPortfolio/,
  'listener legado não reintroduz portfólio antigo no estado React',
)

const editBody = componentSource.slice(componentSource.indexOf('const editarPortfolioItem'), componentSource.indexOf('const removerPortfolioItem'))
const removeBody = componentSource.slice(componentSource.indexOf('const removerPortfolioItem'), componentSource.indexOf('const updateAddressDraft'))
assert.doesNotMatch(editBody, /optimizePortfolioPhoto|uploadPortfolioPhotoToImgBB/, 'editar sem nova foto não reprocessa URLs')
assert.doesNotMatch(removeBody, /optimizePortfolioPhoto|uploadPortfolioPhotoToImgBB/, 'remover item não reprocessa imagens')
assert.match(removeBody, /await salvarPortfolio\(\{ type: "remove", id \}, profile\)/, 'remoção também usa o único escritor dedicado')
assert.doesNotMatch(chatSource, /optimizePortfolioPhoto|uploadPortfolioPhotoToImgBB/, 'Chat permanece fora do pipeline')
assert.match(uploadRouteSource, /verifyIdToken\(idToken\)/, 'endpoint continua autenticado')
assert.match(uploadRouteSource, /decoded\.uid[^\n]+!== uid/, 'endpoint mantém ownership do UID')
assert.match(uploadRouteSource, /api\.imgbb\.com\/1\/upload/, 'provider permanece ImgBB')
assert.match(uploadRouteSource, /AbortController/, 'endpoint limita espera do provider')
assert.match(uploadRouteSource, /imgbb_unavailable/, 'falha de rede do provider recebe erro sanitizado')
assert.doesNotMatch(uploadRouteSource, /data\?\.error\?\.message\s*\|\|/, 'mensagem bruta do provider não é devolvida ao navegador')
assert.doesNotMatch(uploadRouteSource, /firebase\/storage|uploadBytes|getDownloadURL/, 'path não migrou para Firebase Storage')
assert.match(componentSource, /portfolioPhotoAbortControllerRef\.current\?\.abort\(\)/, 'fechamento do perfil cancela upload pendente')
assert.match(componentSource, /withoutLocalPortfolioPreviews\(normalizePortfolioFotos\(item\)\)/, 'defesa adicional remove blob antes do Firebase')
assert.match(componentSource, /code === "imgbb_request_timeout"[\s\S]*foto demorou para enviar/, 'timeout novo mantém mensagem clara na foto de perfil')

const fixtureSpecs = [
  { name: 'jpeg-horizontal-4000x3000', width: 4000, height: 3000, format: 'jpeg' },
  { name: 'jpeg-vertical-3000x4000', width: 3000, height: 4000, format: 'jpeg' },
  { name: 'imagem-pequena', width: 640, height: 480, format: 'jpeg' },
  { name: 'png-opaco', width: 1600, height: 1000, format: 'png' },
  { name: 'png-transparente', width: 1600, height: 1000, format: 'png', transparent: true },
  { name: 'webp-grande', width: 2000, height: 1400, format: 'webp' },
  { name: 'jpeg-orientacao-exif-6', width: 1200, height: 2000, format: 'jpeg', orientation: 6 },
]
const metrics = []
for (const spec of fixtureSpecs) {
  const fixture = await createFixture(spec)
  metrics.push(await referenceOptimize(fixture))
}

console.log('Otimização de portfólio: dimensões, MIME, alpha, EXIF, GIF/HEIC, fallback, memória, locks e provider OK')
console.table(metrics)
