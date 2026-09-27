// NativeWind v4 Metro integration. `input` points to the Tailwind entry CSS.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Web static rendering runs the app in Node, where tslib's `import` + `node` export
// condition resolves to tslib/modules/index.js: an ESM wrapper that default-imports the
// CJS tslib.js. That file marks itself `__esModule`, so Metro's interop reads a missing
// `.default` and the render crashes ("Cannot destructure property '__extends'") as soon
// as moti's framer-motion loads. Hand it tslib's plain-ESM build instead: the same file
// the web client and native bundles already resolve to, so their output is unchanged.
const TSLIB_NODE_WRAPPER = path.join('node_modules', 'tslib', 'modules', 'index.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolution = context.resolveRequest(context, moduleName, platform);
  if (resolution.type === 'sourceFile' && resolution.filePath.endsWith(TSLIB_NODE_WRAPPER)) {
    return {
      type: 'sourceFile',
      filePath: path.join(path.dirname(resolution.filePath), '..', 'tslib.es6.mjs'),
    };
  }
  return resolution;
};

module.exports = withNativeWind(config, { input: './src/global.css' });
