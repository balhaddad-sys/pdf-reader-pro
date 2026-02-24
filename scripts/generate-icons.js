const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sizes = [48, 72, 96, 144, 192, 512];
const inputSvg = path.join(__dirname, '..', 'public', 'icon.svg');
const outputDir = path.join(__dirname, '..', 'public', 'icons');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function generate() {
  for (const size of sizes) {
    await sharp(inputSvg)
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, `icon-${size}.png`));
    console.log(`Generated icon-${size}.png`);
  }

  // Maskable icon (512 with 20% padding)
  const padding = Math.round(512 * 0.1);
  const innerSize = 512 - padding * 2;
  const iconBuffer = await sharp(inputSvg)
    .resize(innerSize, innerSize)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 45, g: 91, b: 227, alpha: 1 }
    }
  })
    .composite([{ input: iconBuffer, left: padding, top: padding }])
    .png()
    .toFile(path.join(outputDir, 'icon-512-maskable.png'));
  console.log('Generated icon-512-maskable.png');
}

generate().catch(console.error);
