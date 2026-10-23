# Inspecting network traffic (ProxyPin + MCP)

To debug campus protocols, capture the emulator's HTTP(S) traffic with
[ProxyPin](https://github.com/wanghongenpin/proxypin) (v1.3.3+). Its Android app has a built-in
MCP server, so an AI coding agent can read the captured flows directly.

## Setup (Android emulator)

1. Install `proxypin-android-<version>.apk` from the GitHub release: `adb install -r proxypin-android-1.3.3.apk`.
2. ProxyPin → Settings → **MCP Server** → enable. It listens on `0.0.0.0:9127/mcp` and shows a
   Bearer token. The emulator's own IP isn't reachable from the host, so forward the port:
   `adb forward tcp:9127 tcp:9127`.
3. Register it with the agent (Claude Code shown):
   `claude mcp add proxypin_mobile -s user --transport http http://127.0.0.1:9127/mcp --header "Authorization: Bearer <token>"`
4. Requests tab → ▶ starts capture (Android asks to allow a VPN, which you approve yourself).
5. HTTPS: ProxyPin → Settings → HTTPS Proxy → install the certificate as a **user CA**
   (Android Settings → Security → Install from storage → CA certificate), then enable HTTPS proxy.

## Which apps decrypt

| App | Trusts a user CA? | What you need |
|---|---|---|
| PKU Harness **debug** build | Yes: `config-plugins/with-debug-user-ca.js` adds a debug-only network security config | Nothing more |
| PKU Harness release build | No (system CAs only) | Not supported on purpose |
| Other apps (e.g. official PKU apps), Android 7+ | No | A **system** CA, which needs a rooted/writable emulator (a Google APIs image with `adb root`, or Magisk + a trust-user-certs module). Apps that pin certificates also need an unpinning hook (LSPosed + e.g. TrustMeAlready). |

The Google Play emulator images are `user` builds (`adb root` is refused), so they can only
decrypt apps that opt into user CAs.

Captured traffic contains session cookies and personal data: never commit exports, and use
fixtures with anonymised values (see `CONTRIBUTING.md`).
