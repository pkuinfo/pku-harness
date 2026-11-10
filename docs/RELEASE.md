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

1. In **one commit** on `main`, bump `expo.version` (e.g. `1.0.0` → `1.1.0`) **and**
   `expo.android.versionCode` (an integer, +1 per release: Android only upgrades to a larger
   versionCode) in `app.json`, and add `docs/releases/<version>.md` with a few short bullets under
   `## 更新内容` and `## What's new` (the in-app update sheet shows them; see `releaseNotes` in
   `src/core/update/version.ts`); let CI pass. Versions come only from committed files, so the OTA
   runtime fingerprint can be resolved from the same commit. The workflow refuses a tag that
   doesn't match `expo.version` or a versionCode not greater than the latest release's.
2. Tag that commit and push the tag:
   ```bash
   git tag v1.1.0 && git push origin v1.1.0
   ```
3. Approve the `release` environment when GitHub asks. The workflow runs `bun run verify`,
   generates `android/` (`expo prebuild`), builds `assembleRelease` once per ABI
   (`arm64-v8a`, `armeabi-v7a`, `x86_64`; one APK each), refuses a debug-signed APK or one whose
   native libraries are for another ABI, and creates the release with the APKs (arm64 first: the
   website offers the first as the main download) and notes: versionCode, each APK's SHA-256, the
   signing certificate's SHA-256, the runtime fingerprint (to match OTA updates) and the commit.
   The `release` environment accepts only `v*` tags, so the signing key is never reachable from
   a branch run; a release can't be amended later, only superseded by a new version.

To try the pipeline without publishing anything, run the workflow manually (Actions → Release
APK → Run workflow): it builds the same APK signed with a throwaway key and uploads it as a
workflow artifact for three days.

## How installed apps learn about it

- **JS-only changes ship by OTA** (docs/OTA.md): installed apps with the same native runtime
  download the signed update in the background and apply it on the next launch. Prefer this for
  small fixes; no new APK, no reinstall.
- **A release with native changes needs the APK.** The app checks
  `api.github.com/repos/pkuinfo/pku-harness/releases/latest` at most every 12 hours after launch
  (`src/core/update/app-update.ts`). When the tag is newer than the installed version it asks
  once and keeps an "update available" row at the top of Settings. "Update" downloads the APK
  built for the phone's CPU into the cache with a progress dialog, then opens Android's package
  installer (`src/core/update/install.ts`, `REQUEST_INSTALL_PACKAGES`), which installs it over
  the app and keeps its data; the first time, Android asks to allow installs from PKU Harness.
  "Later" quiets that version for 3 days. Settings → About → Check for updates runs the check
  on demand. Builds before 1.0.6 don't check; 1.0.6 opens the APK link in the browser instead.

## Notes

- The release config plugin (`config-plugins/with-release-signing.js`) reads the key from the
  environment at Gradle build time; local release builds without it stay debug-signed.
- Users who installed a debug build (from source) must uninstall it once before installing the
  official APK: the signatures differ.
- iOS releases are not set up yet (docs/IOS.md).
