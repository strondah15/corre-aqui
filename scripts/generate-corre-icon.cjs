const sharp = require("sharp");

const LOGO_OUT = "public/corre-logo-composite.png";
const MARK_OUT = "public/corre-logo-mark.png";
const SIMPLE_MARK_OUT = "public/corre-logo-simple.png";
const PIN_SRC = "public/pin_vazio.png";
const RUNNER_SRC = "public/boneco_correndo.png";

// AJUSTE MANUAL DA LOGO
// A imagem do pin/balão fica mantida como está em public/pin_vazio.png.
// Para ajustar manualmente, mexa SOMENTE no runner.
// left: move o boneco para direita/esquerda.
// top: move o boneco para baixo/cima.
// width: muda o tamanho do boneco.
const LOGO_CONFIG = {
  pin: {
    height: 900,
    left: 188,
    top: 30,
    circleCenterX: 0.55,
    circleCenterY: 0.31,
  },
  runner: {
    width: 205,
    alphaTrimThreshold: 24,
  },
};

function backgroundSvg(size = 1024) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="bg" x1="0" x2="${size}" y1="0" y2="${size}" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0b73ff"/>
          <stop offset="0.48" stop-color="#13bdd1"/>
          <stop offset="0.76" stop-color="#8bd56f"/>
          <stop offset="1" stop-color="#ffe21b"/>
        </linearGradient>
        <radialGradient id="shine" cx="48%" cy="38%" r="70%">
          <stop stop-color="#ffffff" stop-opacity="0.22"/>
          <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.04"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="160" fill="url(#bg)"/>
      <rect width="${size}" height="${size}" rx="160" fill="url(#shine)"/>
      <circle cx="512" cy="430" r="330" fill="#ffffff" opacity="0.08"/>
    </svg>
  `);
}

async function makeCompositeLogo() {
  const pinLayout = await getPinLayout();
  const runner = await prepareRunner();
  const runnerPosition = centerOverlay(runner.info, pinLayout.circleCenter);

  const pin = await sharp(PIN_SRC)
    .resize({ height: LOGO_CONFIG.pin.height })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: pin, left: LOGO_CONFIG.pin.left, top: LOGO_CONFIG.pin.top },
      { input: runner.buffer, left: runnerPosition.left, top: runnerPosition.top },
    ])
    .png()
    .toFile(MARK_OUT);

  await sharp(backgroundSvg())
    .composite([
      { input: pin, left: LOGO_CONFIG.pin.left, top: LOGO_CONFIG.pin.top },
      {
        input: runner.buffer,
        left: runnerPosition.left,
        top: runnerPosition.top,
      },
    ])
    .png()
    .toFile(LOGO_OUT);

  return {
    pinLayout,
    runner: {
      trimBounds: runner.trimBounds,
      output: {
        width: runner.info.width,
        height: runner.info.height,
      },
      position: runnerPosition,
    },
  };
}

async function getPinLayout() {
  const meta = await sharp(PIN_SRC).metadata();
  const width = Math.round((meta.width / meta.height) * LOGO_CONFIG.pin.height);
  const height = LOGO_CONFIG.pin.height;

  return {
    width,
    height,
    left: LOGO_CONFIG.pin.left,
    top: LOGO_CONFIG.pin.top,
    circleCenter: {
      x: Math.round(LOGO_CONFIG.pin.left + width * LOGO_CONFIG.pin.circleCenterX),
      y: Math.round(LOGO_CONFIG.pin.top + height * LOGO_CONFIG.pin.circleCenterY),
    },
  };
}

async function prepareRunner() {
  const { data, info } = await sharp(RUNNER_SRC)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const trimBounds = getAlphaTrimBounds(
    data,
    info,
    LOGO_CONFIG.runner.alphaTrimThreshold,
  );

  const { data: buffer, info: outputInfo } = await sharp(RUNNER_SRC)
    .extract(trimBounds)
    .resize({ width: LOGO_CONFIG.runner.width })
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    buffer,
    info: outputInfo,
    trimBounds,
  };
}

function getAlphaTrimBounds(data, info, alphaThreshold) {
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alphaIndex = (y * info.width + x) * info.channels + 3;
      if (data[alphaIndex] < alphaThreshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return { left: 0, top: 0, width: info.width, height: info.height };
  }

  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function centerOverlay(overlayInfo, targetCenter) {
  return {
    left: Math.round(targetCenter.x - overlayInfo.width / 2),
    top: Math.round(targetCenter.y - overlayInfo.height / 2),
  };
}

function simpleLogoSvg(size = 1024) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="pin" x1="92" x2="420" y1="42" y2="450" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0b73ff"/>
          <stop offset="0.52" stop-color="#18bfd2"/>
          <stop offset="1" stop-color="#0646a8"/>
        </linearGradient>
        <linearGradient id="runner" x1="120" x2="360" y1="90" y2="350" gradientUnits="userSpaceOnUse">
          <stop stop-color="#fff173"/>
          <stop offset="0.58" stop-color="#ffd91a"/>
          <stop offset="1" stop-color="#f59e0b"/>
        </linearGradient>
      </defs>
      <path d="M256 24C153.9 24 71 106.5 71 208.2c0 131.6 154.9 244.8 176.9 260.2a14.3 14.3 0 0 0 16.2 0C286.1 453 441 339.8 441 208.2 441 106.5 358.1 24 256 24Z" fill="url(#pin)"/>
      <path d="M256 52c86.4 0 156.5 69.8 156.5 155.9 0 105.2-112 200.4-156.5 234.7C211.5 408.3 99.5 313.1 99.5 207.9 99.5 121.8 169.6 52 256 52Z" fill="#ffffff" opacity="0.16"/>
      <circle cx="256" cy="205" r="121" fill="#ffffff" opacity="0.94"/>
      <circle cx="256" cy="205" r="96" fill="#eaf7ff"/>
      <image href="data:image/png;base64,${require("fs").readFileSync(RUNNER_SRC).toString("base64")}" x="176" y="92" width="176" height="206" preserveAspectRatio="xMidYMid meet"/>
    </svg>
  `);
}

async function makeSimpleLogo() {
  await sharp(simpleLogoSvg()).resize(1024, 1024).png().toFile(SIMPLE_MARK_OUT);
}

async function makeIcon(size, out) {
  await sharp(LOGO_OUT).resize(size, size).png().toFile(out);
}

async function main() {
  const composition = await makeCompositeLogo();
  await makeSimpleLogo();
  await Promise.all([
    makeIcon(192, "public/corre-aqui-icon-192.png"),
    makeIcon(512, "public/corre-aqui-icon-512.png"),
    makeIcon(180, "public/apple-touch-icon.png"),
  ]);
  return composition;
}

main()
  .then((composition) => {
    console.log("Corre Aqui composite logo and icons generated.");
    console.log("Ajuste atual:", LOGO_CONFIG);
    console.log("Composicao calculada:", composition);
    console.log("Arquivos gerados:");
    console.log("- public/corre-logo-simple.png");
    console.log("- public/corre-logo-mark.png");
    console.log("- public/corre-logo-composite.png");
    console.log("- public/corre-aqui-icon-512.png");
    console.log("- public/corre-aqui-icon-192.png");
    console.log("- public/apple-touch-icon.png");
    console.log("Preview sem cache: http://localhost:3000/logo-preview.html");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
