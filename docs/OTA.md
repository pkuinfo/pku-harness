# Over-the-air updates

> Decided 2026-10-23 (ARCHITECTURE.md §14). Owner: the deploy pipeline. App-side config
> (`expo-updates`, `app.json`) is owned by the app.

JS-only changes reach phones without a new APK via [expo-updates](https://docs.expo.dev/versions/v58.0.0/sdk/updates/)
against **our own, static, code-signed** update server. Plugin documents don't use OTA; they
update from their own links (PLUGIN-LANGUAGE.md §10).

## Trust model

An update is code that runs inside the app holding the student's IAAA password, so:

- **Signed in CI, verified on the phone.** Every manifest and directive is signed (RSA-SHA256,
  `keyid="main"`, `alg="rsa-v1_5-sha256"`) by the `OTA update` workflow with a key only
  maintainers hold. The app embeds the certificate (`certs/ota/certificate.pem`) and refuses
  anything unsigned or signed by another key. Asset hashes are inside the signed manifest.
- **The server holds no key and runs no code.** It's a folder served by Caddy. A compromised
  server can withhold updates but can't forge one.
- **Built from public commits.** The workflow runs only on `master`, runs `bun run check` and
  `bun test` first, and records the commit in `history/`. The `ota` environment requires a
  maintainer's approval for each run.
- **Runtime-safe.** `runtimeVersion` uses the `fingerprint` policy: any native change produces a
  new runtime, and the server only routes an update to binaries with the same runtime.

## Server

Static files on the host (`ssh rainyun`), served by Caddy under
`https://harness.novadiffusion.com/updates/` (the website's site block imports
`server/updates/Caddyfile`). No container or process: the host is small.

```
/srv/pkuharness-updates/
  manifests/<channel>/<platform>/<runtimeVersion>.multipart   # current signed response
  assets/<sha256-base64url>.<ext>                             # immutable, content-addressed
  history/<channel>/<platform>/<runtimeVersion>/<time>.json   # every publish: commit + manifest
```

| Request | Response |
|---|---|
| `GET /updates/manifest` + `expo-platform`, `expo-runtime-version`, optional `expo-channel-name` (`production` default, `preview`) | `200 multipart/mixed` (signed `manifest` + `extensions`, or a signed `directive`), or `204` when nothing is published for that runtime/channel |
| missing/invalid headers | `400` (unknown channels fall back to `production`) |
| `GET /updates/assets/<file>` | the asset, `cache-control: public, max-age=31536000, immutable` |
| anything else (incl. `history/`) | `404` |

Uploads use the `ota` account, locked by `rrsync` to that folder (no shell). Setup, once, as
root: `server/updates/setup.sh "<CI public SSH key>"`.

## Publishing

GitHub → Actions → **OTA update** → Run workflow (on `master`):

- **publish**: `expo export` → manifest → sign → upload assets, then history, then the manifest
  (a phone never sees a manifest before its assets) → prune assets not used by the newest 5
  updates of each channel/platform/runtime.
- **rollback**: signs `rollBackToEmbedded` for one runtime version; phones return to the update
  embedded in their APK on next launch. Publishing again replaces it.

Locally (needs the private key and SSH access):

```bash
OTA_SIGNING_KEY="$(cat ~/.config/pku-harness/ota/private-key.pem)" \
  bun scripts/ota/publish.ts --channel preview --platform android
OTA_SSH=ota@154.36.164.211 OTA_SSH_KEY_FILE=~/.ssh/pkuharness-ota bun scripts/ota/sync.ts
```

`scripts/ota/lib.ts` is pure and unit-tested (`bun test scripts/ota`).

## App configuration (app owner)

```jsonc
// app.json → expo
"runtimeVersion": { "policy": "fingerprint" },
"updates": {
  "url": "https://harness.novadiffusion.com/updates/manifest",
  "checkAutomatically": "ON_LOAD",
  "codeSigningCertificate": "./certs/ota/certificate.pem",
  "codeSigningMetadata": { "keyid": "main", "alg": "rsa-v1_5-sha256" },
  "requestHeaders": { "expo-channel-name": "production" }
}
```

Preview builds set `expo-channel-name: preview`.

## Secrets and keys

| Where | Name | What |
|---|---|---|
| GitHub environment `ota` | `OTA_SIGNING_KEY` | PEM private key (RSA 2048) |
| | `OTA_SSH_KEY` | private SSH key of the `ota` upload account |
| | `OTA_SSH_KNOWN_HOSTS` | the server's host key line(s) |
| | variable `OTA_SSH` | `ota@154.36.164.211` |
| Maintainer, offline | `private-key.pem` | backup of the signing key; never in a repo |

**Rotating the signing key** needs a new APK with the new certificate (the old binaries keep
trusting only the old key). Keep the offline backup safe: losing it means no more OTA updates
for existing installs.
