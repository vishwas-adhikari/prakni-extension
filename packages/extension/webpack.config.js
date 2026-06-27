// [P1] Cred Mail browser extension build — Chromium target, Gmail provider.
// One bundle per webpack entry; isolated content scripts + one shared background.
// See docs/build-and-targets.md. Firefox/Safari variants are P3.
const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',

  // MV3 bans eval(); the default devtool uses it and the extension would crash
  // with a CSP error. cheap-module-source-map produces a separate .map, no eval.
  // (Hard rule — CLAUDE.md "MV3". Do not change to an eval-based devtool.)
  devtool: 'cheap-module-source-map',

  entry: {
    background: path.resolve(__dirname, 'src/background/index.ts'),
    content_gmail: path.resolve(__dirname, 'src/adapters/gmail/index.ts'),
    settings: path.resolve(__dirname, 'src/settings/settings.ts'),
    popup: path.resolve(__dirname, 'src/popup/popup.ts'),
    dashboard: path.resolve(__dirname, 'src/dashboard/dashboard.ts'),
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
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
    new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve(__dirname, 'manifest.json'), to: 'manifest.json' },
        { from: path.resolve(__dirname, 'public'), to: '.' },
      ],
    }),
  ],
};
