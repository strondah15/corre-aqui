const sharp = require('sharp')

const sourceLogo = 'public/logo-corre-aqui.png.png'

function backgroundSvg(size) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <radialGradient id="g" cx="50%" cy="38%" r="68%">
          <stop offset="0" stop-color="#0b2330"/>
          <stop offset="0.55" stop-color="#03111f"/>
          <stop offset="1" stop-color="#020617"/>
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#g)"/>
      <circle cx="${size / 2}" cy="${size * 0.48}" r="${size * 0.36}" fill="#22d3ee" opacity="0.08"/>
    </svg>
  `)
}

async function makeIcon(size, out) {
  const logo = await sharp(sourceLogo)
    .trim({ threshold: 12 })
    .resize({
      width: Math.round(size * 0.74),
      height: Math.round(size * 0.86),
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()

  await sharp(backgroundSvg(size))
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(out)
}

async function main() {
  await Promise.all([
    makeIcon(192, 'public/corre-aqui-icon-192.png'),
    makeIcon(512, 'public/corre-aqui-icon-512.png'),
    makeIcon(180, 'public/apple-touch-icon.png'),
  ])
}

main()
  .then(() => console.log('Corre Aqui icons generated from logo.'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
