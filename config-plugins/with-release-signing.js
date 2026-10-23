/**
 * Release signing for the official APK (.github/workflows/release.yml, docs/RELEASE.md).
 *
 * Adds a `release` signing config to android/app/build.gradle whose key is read from the
 * environment *at Gradle build time* (PKU_HARNESS_KEYSTORE, PKU_HARNESS_KEYSTORE_PASSWORD,
 * PKU_HARNESS_KEY_ALIAS, PKU_HARNESS_KEY_PASSWORD), so the key never touches the repo. The text
 * this plugin writes is fixed: it does not depend on those values, so the expo-updates runtime
 * fingerprint is the same for every build of a commit (OTA updates must match the APK).
 * Without PKU_HARNESS_KEYSTORE (local `expo run:android --variant release`) release builds keep
 * the debug key, as before; the release workflow refuses to publish such an APK.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARK = '// PKU Harness release signing (config-plugins/with-release-signing.js)';

const SIGNING = `
        release {
            ${MARK}
            def pkuKeystore = System.getenv('PKU_HARNESS_KEYSTORE')
            if (pkuKeystore) {
                storeFile file(pkuKeystore)
                storePassword System.getenv('PKU_HARNESS_KEYSTORE_PASSWORD')
                keyAlias System.getenv('PKU_HARNESS_KEY_ALIAS')
                keyPassword System.getenv('PKU_HARNESS_KEY_PASSWORD')
            }
        }`;

function apply(gradle) {
  if (gradle.includes(MARK)) return gradle;
  // 1. A release entry in signingConfigs, after the template's debug one.
  const signing = /signingConfigs\s*\{\s*debug\s*\{[^}]*\}/;
  if (!signing.test(gradle)) throw new Error('with-release-signing: signingConfigs { debug { … } } not found in app/build.gradle');
  gradle = gradle.replace(signing, (m) => m + SIGNING);
  // 2. The release build type uses it when the key is present.
  const release = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!release.test(gradle)) throw new Error('with-release-signing: release { signingConfig signingConfigs.debug } not found');
  return gradle.replace(release, "$1signingConfig System.getenv('PKU_HARNESS_KEYSTORE') ? signingConfigs.release : signingConfigs.debug");
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('with-release-signing: expected a Groovy app/build.gradle');
    cfg.modResults.contents = apply(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.apply = apply;
