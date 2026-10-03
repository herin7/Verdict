// EAS injects google-services.json as a secret file env var; local builds use the untracked file.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
