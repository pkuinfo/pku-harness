# Releasing the Android APK

The official APK is built and signed by GitHub Actions (`.github/workflows/release.yml`) from a
tagged commit and published as a GitHub release. The website's download page
(<https://harness.novadiffusion.com/download>) lists GitHub releases automatically, with size,
SHA-256 and a QR code, so publishing a release is all it takes.

JS and plugin changes reach installed apps **over the air** (docs/OTA.md); a new APK is only
needed for native changes (new modules, permissions, `app.json` native config, Expo SDK upgrades).

## One-time: the release signing key (maintainers)

Android only accepts an update signed with the same key as the installed app, and OTA trust is
anchored in the same install, so this key must **never change and never leak**. Create it once,
keep the keystore file and passwords in the maintainers' password manager (and an offline backup),
and give it to GitHub only as `release` environment secrets.

```bash
keytool -genkeypair -v -keystore pku-harness-release.keystore -alias pku-harness \
  -keyalg RSA -keysize 4096 -validity 36500 -dname "CN=PKU Harness, O=pkuinfo"
```

Then, in the `pkuinfo/pku-harness` repository settings → Environments → `release` (create it;
add required reviewers so a release needs a maintainer's approval), add these secrets:

| Secret | Value |
|---|---|
| `PKU_HARNESS_KEYSTORE_BASE64` | `base64 -w0 pku-harness-release.keystore` |
| `PKU_HARNESS_KEYSTORE_PASSWORD` | the keystore password |
| `PKU_HARNESS_KEY_ALIAS` | `pku-harness` |
| `PKU_HARNESS_KEY_PASSWORD` | the key password (same as the keystore's if you pressed Enter) |

or with the GitHub CLI (it reads each value from stdin, never from the command line):

```bash
base64 -w0 pku-harness-release.keystore | gh secret set PKU_HARNESS_KEYSTORE_BASE64 --env release -R pkuinfo/pku-harness
gh secret set PKU_HARNESS_KEYSTORE_PASSWORD --env release -R pkuinfo/pku-harness
gh secret set PKU_HARNESS_KEY_ALIAS --env release -R pkuinfo/pku-harness
gh secret set PKU_HARNESS_KEY_PASSWORD --env release -R pkuinfo/pku-harness
```

## Cutting a release

1. Bump `expo.version` in `app.json` (e.g. `1.0.0` → `1.1.0`) in a commit on `master`; let CI
   pass. Versions come only from committed files, so the OTA runtime fingerprint can be resolved
   from the same commit.
2. Tag that commit and push the tag:
   ```bash
   git tag v1.1.0 && git push origin v1.1.0
   ```
3. Approve the `release` environment when GitHub asks. The workflow runs `bun run verify`,
   generates `android/` (`expo prebuild`), builds `assembleRelease` for arm64, refuses a
   debug-signed APK, and creates the release with the APK and notes: SHA-256, the signing
   certificate's SHA-256, the runtime fingerprint (to match OTA updates) and the commit.

To try the pipeline without publishing anything, run the workflow manually (Actions → Release
APK → Run workflow): it builds the same APK signed with a throwaway key and uploads it as a
workflow artifact for three days.

## Notes

- The release config plugin (`config-plugins/with-release-signing.js`) reads the key from the
  environment at Gradle build time; local release builds without it stay debug-signed.
- Users who installed a debug build (from source) must uninstall it once before installing the
  official APK: the signatures differ.
- iOS releases are not set up yet (docs/IOS.md).
