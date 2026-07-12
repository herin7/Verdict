const { withAndroidManifest, withStringsXml } = require("@expo/config-plugins");

function withVerdictAccessibility(config) {
  config = withStringsXml(config, (config) => {
    const strings = config.modResults.resources.string ?? [];
    const exists = strings.some((s) => s.$.name === "verdict_a11y_description");
    if (!exists) {
      strings.push({
        $: { name: "verdict_a11y_description" },
        _: "Optional. Reads on-screen text from shopping apps to detect products. Off by default. Does not tap, type, or control other apps.",
      });
      config.modResults.resources.string = strings;
    }
    return config;
  });
  return config;
}

module.exports = withVerdictAccessibility;
