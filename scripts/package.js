// Build + ZIP both browser targets for store submission.
//
// Runs `npm run build:chrome` and `npm run build:firefox`, then zips each dist/<target>
// into the project root as prakni-<target>-v<version>.zip. Version is read from the master
// manifest (never hardcoded). .map source maps and .DS_Store are excluded from the ZIPs.
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const ROOT = path.resolve(__dirname, '..');
const EXT_DIR = path.join(ROOT, 'packages', 'extension');

const { version } = JSON.parse(
  fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'),
);

function build(target) {
  console.log(`\n▶ building ${target}…`);
  execSync(`npm run build:${target}`, { cwd: ROOT, stdio: 'inherit' });
}

function zipTarget(target) {
  const distDir = path.join(EXT_DIR, 'dist', target);
  if (!fs.existsSync(distDir)) {
    return Promise.reject(new Error(`dist not found: ${distDir} (build failed?)`));
  }
  const zipPath = path.join(ROOT, `prakni-${target}-v${version}.zip`);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const kb = (archive.pointer() / 1024).toFixed(1);
      console.log(`✔ ${path.basename(zipPath)} — ${kb} KB (${archive.pointer()} bytes)`);
      resolve();
    });
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') console.warn(err.message);
      else reject(err);
    });
    archive.on('error', reject);

    archive.pipe(output);
    archive.glob('**/*', {
      cwd: distDir,
      ignore: ['**/*.map', '**/.DS_Store'],
      dot: false,
    });
    archive.finalize();
  });
}

async function main() {
  build('chrome');
  build('firefox');

  console.log('\n▶ packaging…');
  await zipTarget('chrome');
  await zipTarget('firefox');

  console.log(`\nDone. ZIPs written to ${ROOT}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
