const fs = require('fs');
const jsQR = require('D:/CodexData/temp/qr-check/node_modules/jsqr');
const { PNG } = require('D:/CodexData/temp/qr-check/node_modules/pngjs');

const files = ['assets/qr-meal.png', 'assets/qr-opinion.png'];
const values = files.map(file => {
  const image = PNG.sync.read(fs.readFileSync(file));
  const code = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
  if (!code) throw new Error(`Could not scan ${file}`);
  return code.data;
});
const expected = [
  'https://dohoon819.github.io/school-meal-vote/?tab=meal#ideas',
  'https://dohoon819.github.io/school-meal-vote/?tab=opinion#topOpinions'
];
if (JSON.stringify(values) !== JSON.stringify(expected)) throw new Error(`QR mismatch: ${JSON.stringify(values)}`);
console.log(`QR scan test passed: ${values.join(' | ')}`);
