const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Ensures SYSTEM_ALERT_WINDOW + foreground service permissions exist.
 * Service declaration lives in the module's AndroidManifest and is merged by Gradle.
 */
function withVerdictOverlay(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
    const perms = [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
      "android.permission.POST_NOTIFICATIONS",
    ];
    for (const name of perms) {
      const exists = manifest["uses-permission"].some((p) => p.$?.["android:name"] === name);
      if (!exists) {
        manifest["uses-permission"].push({ $: { "android:name": name } });
      }
    }
    return config;
  });
}

module.exports = withVerdictOverlay;
