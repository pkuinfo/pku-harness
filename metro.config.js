// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// The plugins submodule may have its own node_modules (for developing it standalone). Plugin
// code must use the app's single copy of react, zod, etc., so ignore that folder entirely.
const pluginModules = path.resolve(__dirname, 'plugins', 'node_modules');
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${pluginModules.replace(/[/\\]/g, '[/\\\\]')}[/\\\\].*`),
];

module.exports = config;
