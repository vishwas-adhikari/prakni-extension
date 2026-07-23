// One-shot icon resizer. Firefox/AMO requires a real asset at each declared pixel size
// (16/48/128), not a single 500px PNG mapped to all three. Regenerates the sized icons
// from the master logo into the same public/icons/ folder.
//
// Run manually when the master logo changes:  node scripts/resize-icons.js
'use strict';

const path = require('path');
const sharp = require('sharp');

const ICONS_DIR = path.resolve(__dirname, '..', 'packages', 'extension', 'public', 'icons');
const SOURCE = path.join(ICONS_DIR, 'prakni_logo_nobg.png');
const SIZES = [16, 48, 128];

async function main() {
  for (const size of SIZES) {
    const out = path.join(ICONS_DIR, `icon-${size}.png`);
    const info = await sharp(SOURCE)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    console.log(`✔ icon-${size}.png — ${info.width}x${info.height}, ${info.size} bytes`);
  }
  console.log(`\nDone. Wrote ${SIZES.length} icons to ${ICONS_DIR}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
