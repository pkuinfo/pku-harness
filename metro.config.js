// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// The plugins submodule may have its own node_modules (for developing it standalone). Plugin
// code must use the app's single copy of react, zod, etc., so ignore that folder entirely.
const pluginModules = path.resolve(__dirname, 'plugins', 'node_modules');
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${pluginModules.replace(/[/\\]/g, '[/\\\\]')}[/\\\\].*`),
];

// Uniwind must be the outermost wrapper (docs.uniwind.dev/quickstart).
module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
