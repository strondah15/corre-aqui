const sharp = require('sharp')

function iconSvg(size) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="bg" x1="0" x2="512" y1="0" y2="512" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0b73ff"/>
          <stop offset="0.55" stop-color="#19b7c8"/>
          <stop offset="1" stop-color="#ffe36b"/>
        </linearGradient>
        <linearGradient id="pin" x1="96" x2="418" y1="48" y2="438" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0b73ff"/>
          <stop offset="0.54" stop-color="#18bfd2"/>
          <stop offset="1" stop-color="#0646a8"/>
        </linearGradient>
        <linearGradient id="runner" x1="150" x2="360" y1="120" y2="340" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fff173"/>
          <stop offset="0.55" stop-color="#ffd91a"/>
          <stop offset="1" stop-color="#f59e0b"/>
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx="96" fill="url(#bg)"/>
      <circle cx="256" cy="246" r="190" fill="#ffffff" opacity="0.16"/>
      <path d="M256 24C153.9 24 71 106.5 71 208.2c0 131.6 154.9 244.8 176.9 260.2a14.3 14.3 0 0 0 16.2 0C286.1 453 441 339.8 441 208.2 441 106.5 358.1 24 256 24Z" fill="url(#pin)"/>
      <path d="M256 52c86.4 0 156.5 69.8 156.5 155.9 0 105.2-112 200.4-156.5 234.7C211.5 408.3 99.5 313.1 99.5 207.9 99.5 121.8 169.6 52 256 52Z" fill="#ffffff" opacity="0.14"/>
      <circle cx="256" cy="205" r="121" fill="#ffffff" opacity="0.94"/>
      <circle cx="256" cy="205" r="96" fill="#eaf7ff"/>
      <g fill="none" stroke="url(#runner)" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="291" cy="137" r="24" fill="url(#runner)" stroke="none"/>
        <path d="M270 174 238 231" stroke-width="38"/>
        <path d="M262 186 205 180" stroke-width="28"/>
        <path d="M267 186 318 207 350 181" stroke-width="28"/>
        <path d="M238 231 191 294 158 334" stroke-width="32"/>
        <path d="M239 232 304 265 281 333" stroke-width="32"/>
      </g>
    </svg>
  `)
}

async function makeIcon(size, out) {
  await sharp(iconSvg(size)).png().toFile(out)
}

async function main() {
  await Promise.all([
    makeIcon(192, 'public/corre-aqui-icon-192.png'),
    makeIcon(512, 'public/corre-aqui-icon-512.png'),
    makeIcon(180, 'public/apple-touch-icon.png'),
  ])
}

main()
  .then(() => console.log('Corre Aqui icons generated with blue/yellow brand.'))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
