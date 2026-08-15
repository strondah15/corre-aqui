const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const ICONS_DIR = path.join(PUBLIC_DIR, "icons");
const MARK_SOURCE = path.join(PUBLIC_DIR, "corre-logo-mark.png");
const FAVICON_OUT = path.join(ROOT, "src", "app", "favicon.ico");
const ICON_SIZES = [48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];
const REGULAR_SYMBOL_SCALE = 0.8;
const MASKABLE_SYMBOL_SCALE = 0.74;
const APPLE_TOUCH_SYMBOL_SCALE = 0.8;

function brandBackground(size) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="brand" x1="0" x2="${size}" y1="0" y2="${size}" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0b73ff"/>
          <stop offset="0.48" stop-color="#13bdd1"/>
          <stop offset="0.78" stop-color="#8bd56f"/>
          <stop offset="1" stop-color="#ffe21b"/>
        </linearGradient>
        <radialGradient id="light" cx="45%" cy="34%" r="72%">
          <stop stop-color="#ffffff" stop-opacity="0.2"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#brand)"/>
      <rect width="${size}" height="${size}" fill="url(#light)"/>
    </svg>
  `);
}

function notificationBadgeSvg(size = 96) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 96 96">
      <path fill="#ffffff" fill-rule="evenodd" d="M48 6C27.6 6 11 22.5 11 42.9c0 26.3 31 49 35.4 52.1a2.9 2.9 0 0 0 3.2 0C54 91.9 85 69.2 85 42.9 85 22.5 68.4 6 48 6Zm0 19a18 18 0 1 0 0 36 18 18 0 0 0 0-36Z"/>
    </svg>
  `);
}

async function trimmedMark() {
  return sharp(MARK_SOURCE)
    .ensureAlpha()
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 24 })
    .png()
    .toBuffer();
}

async function fullBleedIcon(size, symbolScale, mark) {
  const symbolTarget = Math.round(size * symbolScale);
  const symbol = await sharp(mark)
    .resize({
      width: symbolTarget,
      height: symbolTarget,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  return sharp(brandBackground(size))
    .composite([
      {
        input: symbol.data,
        left: Math.round((size - symbol.info.width) / 2),
        top: Math.round((size - symbol.info.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

async function regularIcon(size, mark) {
  return fullBleedIcon(size, REGULAR_SYMBOL_SCALE, mark);
}

function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = Buffer.alloc(count * 16);
  let offset = 6 + entries.length;

  images.forEach(({ size, buffer }, index) => {
    const entryOffset = index * 16;
    entries.writeUInt8(size === 256 ? 0 : size, entryOffset);
    entries.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    entries.writeUInt8(0, entryOffset + 2);
    entries.writeUInt8(0, entryOffset + 3);
    entries.writeUInt16LE(1, entryOffset + 4);
    entries.writeUInt16LE(32, entryOffset + 6);
    entries.writeUInt32LE(buffer.length, entryOffset + 8);
    entries.writeUInt32LE(offset, entryOffset + 12);
    offset += buffer.length;
  });

  return Buffer.concat([header, entries, ...images.map(({ buffer }) => buffer)]);
}

async function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  const mark = await trimmedMark();

  await Promise.all(
    ICON_SIZES.map(async (size) => {
      const buffer = await regularIcon(size, mark);
      await fs.promises.writeFile(path.join(ICONS_DIR, `corre-aqui-${size}.png`), buffer);
    }),
  );

  const [maskable192, maskable512, appleTouch, faviconPng] = await Promise.all([
    fullBleedIcon(192, MASKABLE_SYMBOL_SCALE, mark),
    fullBleedIcon(512, MASKABLE_SYMBOL_SCALE, mark),
    fullBleedIcon(180, APPLE_TOUCH_SYMBOL_SCALE, mark),
    fullBleedIcon(48, 0.78, mark),
  ]);

  await Promise.all([
    fs.promises.writeFile(path.join(ICONS_DIR, "corre-aqui-maskable-192.png"), maskable192),
    fs.promises.writeFile(path.join(ICONS_DIR, "corre-aqui-maskable-512.png"), maskable512),
    fs.promises.writeFile(path.join(PUBLIC_DIR, "apple-touch-icon.png"), appleTouch),
    fs.promises.writeFile(path.join(PUBLIC_DIR, "favicon.png"), faviconPng),
    sharp(notificationBadgeSvg()).png().toFile(path.join(ICONS_DIR, "corre-aqui-notification-96.png")),
  ]);

  const legacy192 = await regularIcon(192, mark);
  const legacy512 = await regularIcon(512, mark);
  await Promise.all([
    fs.promises.writeFile(path.join(PUBLIC_DIR, "corre-aqui-icon-192.png"), legacy192),
    fs.promises.writeFile(path.join(PUBLIC_DIR, "corre-aqui-icon-512.png"), legacy512),
  ]);

  const icoImages = [];
  for (const size of [16, 32, 48, 256]) {
    icoImages.push({ size, buffer: await fullBleedIcon(size, 0.78, mark) });
  }
  await fs.promises.writeFile(FAVICON_OUT, buildIco(icoImages));

  console.log(`Generated ${ICON_SIZES.length} regular icons (${REGULAR_SYMBOL_SCALE * 100}% symbol), 2 maskable icons (${MASKABLE_SYMBOL_SCALE * 100}% safe-zone symbol), Apple touch icon (${APPLE_TOUCH_SYMBOL_SCALE * 100}% symbol), favicon and notification badge.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
