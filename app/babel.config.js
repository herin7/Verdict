module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Worklets must be last. Reanimated 4 moved its Babel plugin here.
    plugins: ["react-native-worklets/plugin"],
  };
};
