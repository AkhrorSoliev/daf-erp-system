// NativeWind v4 + Expo: babel-preset-expo (jsxImportSource nativewind) + nativewind/babel.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
