// Manifest merge: master manifest.json + per-target override → dist/<target>/manifest.json.
//
// One master (packages/extension/manifest.json, Chrome-compatible, still directly loadable)
// is the source of truth. Each browser target contributes only the keys that differ, in
// manifests/<target>.overrides.json. Plain Node, zero deps — see docs/build-and-targets.md.
//
// Merge rules (deepMerge):
//   - both sides plain objects → recurse
//   - override value === null   → DELETE the key (how Firefox drops service_worker)
//   - arrays / primitives       → override replaces
//
// Usage (CLI):  node scripts/merge-manifest.js <chrome|firefox> <outPath>
// Usage (lib):  require('./merge-manifest').mergeManifest('firefox', absOutPath)
'use strict';

const fs = require('fs');
const path = require('path');

const EXT_DIR = path.resolve(__dirname, '..', 'packages', 'extension');
const MASTER = path.join(EXT_DIR, 'manifest.json');
const TARGETS = ['chrome', 'firefox'];

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Returns a new object; never mutates `base`. `null` in `override` deletes the key.
function deepMerge(base, override) {
  const out = { ...base };
  for (const key of Object.keys(override)) {
    const ov = override[key];
    if (ov === null) {
      delete out[key];
    } else if (isPlainObject(ov) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], ov);
    } else {
      out[key] = ov;
    }
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function mergeManifest(target, outPath) {
  if (!TARGETS.includes(target)) {
    throw new Error(`Unknown target "${target}". Expected one of: ${TARGETS.join(', ')}`);
  }
  const overrideFile = path.join(EXT_DIR, 'manifests', `${target}.overrides.json`);
  if (!fs.existsSync(overrideFile)) {
    throw new Error(`Override file not found: ${overrideFile}`);
  }

  const merged = deepMerge(readJson(MASTER), readJson(overrideFile));

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

module.exports = { mergeManifest, deepMerge };

// CLI entry
if (require.main === module) {
  const [target, outArg] = process.argv.slice(2);
  if (!target || !outArg) {
    console.error('Usage: node scripts/merge-manifest.js <chrome|firefox> <outPath>');
    process.exit(1);
  }
  try {
    const out = path.resolve(process.cwd(), outArg);
    mergeManifest(target, out);
    console.log(`merged manifest (${target}) → ${out}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
