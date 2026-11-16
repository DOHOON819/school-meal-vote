const fs = require('fs');
const jsQR = require('D:/CodexData/temp/qr-check/node_modules/jsqr');
const { PNG } = require('D:/CodexData/temp/qr-check/node_modules/pngjs');

const source = PNG.sync.read(fs.readFileSync('assets/seoun-pick-a4-campaign-poster-preview.png'));
const pageWidthPoints = 595.275590551;
const pageHeightPoints = 841.88976378;
const scaleX = source.width / pageWidthPoints;
const scaleY = source.height / pageHeightPoints;

const boxes = [
  { x: 93.568897638, y: 168, size: 138, expected: 'https://dohoon819.github.io/school-meal-vote/?tab=meal#ideas' },
  { x: 363.706692913, y: 168, size: 138, expected: 'https://dohoon819.github.io/school-meal-vote/?tab=opinion#topOpinions' },
];

for (const box of boxes) {
  const left = Math.round(box.x * scaleX);
  const top = Math.round((pageHeightPoints - box.y - box.size) * scaleY);
  const width = Math.round(box.size * scaleX);
  const height = Math.round(box.size * scaleY);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = ((top + y) * source.width + left + x) * 4;
      const targetIndex = (y * width + x) * 4;
      pixels[targetIndex] = source.data[sourceIndex];
      pixels[targetIndex + 1] = source.data[sourceIndex + 1];
      pixels[targetIndex + 2] = source.data[sourceIndex + 2];
      pixels[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }
  const result = jsQR(pixels, width, height);
  if (!result || result.data !== box.expected) throw new Error(`Poster QR mismatch: ${result?.data || 'not detected'}`);
}

console.log('A4 poster QR scan test passed');
