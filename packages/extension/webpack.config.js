// [P1] Cred Mail browser extension build — one bundle per webpack entry;
// isolated content scripts + one shared background. See docs/build-and-targets.md.
//
// Dual-target: `--env target=chrome` (default) or `--env target=firefox`. Same source,
// separate dist/<target>/. The per-target manifest.json is produced by the merge script
// (master manifest + manifests/<target>.overrides.json) in an afterEmit hook, so the npm
// scripts stay a plain `webpack --env target=…` with no chained node call.
const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { mergeManifest } = require('../../scripts/merge-manifest');

// Writes dist/<target>/manifest.json after webpack has emitted (past clean + emit, so it
// survives `output.clean`).
class MergeManifestPlugin {
  constructor(target) {
    this.target = target;
  }
  apply(compiler) {
    compiler.hooks.afterEmit.tap('MergeManifestPlugin', () => {
      const out = path.resolve(__dirname, 'dist', this.target, 'manifest.json');
      mergeManifest(this.target, out);
    });
  }
}

module.exports = (env = {}) => {
  const target = env.target || 'chrome';

  return {
    mode: 'production',

    // MV3 bans eval(); the default devtool uses it and the extension would crash
    // with a CSP error. cheap-module-source-map produces a separate .map, no eval.
    // (Hard rule — CLAUDE.md "MV3". Do not change to an eval-based devtool.)
    devtool: 'cheap-module-source-map',

    entry: {
      background: path.resolve(__dirname, 'src/background/index.ts'),
      content_gmail: path.resolve(__dirname, 'src/adapters/gmail/index.ts'),
      popup: path.resolve(__dirname, 'src/popup/popup.ts'),
      dashboard: path.resolve(__dirname, 'src/dashboard/dashboard.ts'),
      warning: path.resolve(__dirname, 'src/warning/warning.ts'),
    },

    output: {
      path: path.resolve(__dirname, 'dist', target),
      filename: '[name].js',
      clean: true,
    },

    module: {
      rules: [
        {
          test: /\.ts$/,
          loader: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },

    resolve: {
      extensions: ['.ts', '.js', '.json'],
      alias: {
        // Resolve the workspace source directly. The node_modules symlink would be
        // skipped by ts-loader's node_modules exclude, so point at the real source.
        '@credmail/core': path.resolve(__dirname, '../core/src/index.ts'),
      },
    },

    plugins: [
      // Assets only — the manifest is written by MergeManifestPlugin below.
      new CopyWebpackPlugin({
        patterns: [{ from: path.resolve(__dirname, 'public'), to: '.' }],
      }),
      new MergeManifestPlugin(target),
    ],
  };
};
