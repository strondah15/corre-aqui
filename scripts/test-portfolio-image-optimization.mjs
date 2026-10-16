import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import {
  PORTFOLIO_IMAGE_LIMITS,
  getPortfolioTargetDimensions,
  optimizePortfolioPhoto,
} from '../src/lib/imgbbClient.js'

const componentSource = await readFile(new URL('../src/components/PerfilDrawer.jsx', import.meta.url), 'utf8')
const chatSource = await readFile(new URL('../src/components/ChatMensagens.jsx', import.meta.url), 'utf8')
const uploadRouteSource = await readFile(new URL('../src/app/api/upload/profile-photo/route.js', import.meta.url), 'utf8')

function makeFile(bytes, name, type) {
  return new File([new Uint8Array(bytes)], name, { type, lastModified: 1 })
}

function installFakeBrowser({ width, height, hasTransparency = false, webpSupported = true, encodedBytes = 512, encodeFails = false } = {}) {
  const previous = {
    createImageBitmap: globalThis.createImageBitmap,
    document: globalThis.document,
  }
  const state = {
    bitmapClosed: 0,
    canvasCleared: 0,
    decodeCalls: 0,
    encodeRequests: [],
    canvas: null,
    orientation: '',
  }

  globalThis.createImageBitmap = async (_file, options = {}) => {
    state.decodeCalls += 1
    state.orientation = options.imageOrientation
    return {
      width,
      height,
      close: () => { state.bitmapClosed += 1 },
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
  assert.equal(result.file.name, 'camera.heic')
  assert.equal(result.file.type, 'image/heic')
  assert.equal(result.file.size, heic.size)
  assert.equal(state.decodeCalls, 0)
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

assert.match(componentSource, /portfolioPhotoUploadLockRef\.current/, 'duplo envio bloqueado por ref síncrona')
assert.match(componentSource, /Otimizando imagem\.\.\./, 'feedback de otimização visível')
assert.match(componentSource, /URL\.createObjectURL\(prepared\.file\)/, 'preview usa exatamente o arquivo preparado')
assert.match(componentSource, /uploadPortfolioPhotoToImgBB\(prepared\.file/, 'upload recebe exatamente o arquivo preparado')
assert.match(componentSource, /portfolioPreviewOwnerRef/, 'preview pertence ao UID que iniciou o fluxo')
assert.match(componentSource, /auth\.currentUser\?\.uid !== currentUid/, 'upload de A não entra no estado de B')
assert.match(componentSource, /localUrls\.forEach\(\(url\) => URL\.revokeObjectURL\(url\)\)/, 'fechamento e troca A→B revogam previews')
assert.match(componentSource, /revokePortfolioPreviewUrl\(fotoURL\)/, 'remoção revoga preview local')
assert.match(componentSource, /portfolioPreviewUrlsRef\.current\.forEach\(\(url\) => URL\.revokeObjectURL\(url\)\)/, 'unmount revoga previews restantes')
assert.match(componentSource, /disabled=\{portfolioPhotoUploading\}/, 'remoção fica bloqueada durante processamento/upload')
assert.match(componentSource, /uploadProfilePhotoToImgBB\(file, \{/, 'foto de perfil continua no pipeline anterior')

const editBody = componentSource.slice(componentSource.indexOf('const editarPortfolioItem'), componentSource.indexOf('const removerPortfolioItem'))
const removeBody = componentSource.slice(componentSource.indexOf('const removerPortfolioItem'), componentSource.indexOf('const updateAddressDraft'))
assert.doesNotMatch(editBody, /optimizePortfolioPhoto|uploadPortfolioPhotoToImgBB/, 'editar sem nova foto não reprocessa URLs')
assert.doesNotMatch(removeBody, /optimizePortfolioPhoto|uploadPortfolioPhotoToImgBB/, 'remover item não reprocessa imagens')
assert.doesNotMatch(chatSource, /optimizePortfolioPhoto|uploadPortfolioPhotoToImgBB/, 'Chat permanece fora do pipeline')
assert.match(uploadRouteSource, /verifyIdToken\(idToken\)/, 'endpoint continua autenticado')
assert.match(uploadRouteSource, /decoded\.uid[^\n]+!== uid/, 'endpoint mantém ownership do UID')
assert.match(uploadRouteSource, /api\.imgbb\.com\/1\/upload/, 'provider permanece ImgBB')
assert.doesNotMatch(uploadRouteSource, /firebase\/storage|uploadBytes|getDownloadURL/, 'path não migrou para Firebase Storage')

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
