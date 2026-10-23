#!/usr/bin/env bash
# One-time server setup for the static OTA update server (run as root on the host, e.g. rainyun).
# Creates the upload account `ota` locked to /srv/pkuharness-updates by rrsync, and installs the
# Caddy snippet. Usage: setup.sh "<CI public SSH key>"
set -euo pipefail
pubkey="${1:?usage: setup.sh \"ssh-ed25519 AAAA... ota-ci\"}"
root=/srv/pkuharness-updates

id ota >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/ota --shell /bin/sh ota
mkdir -p "$root"/{assets,manifests,history} /var/lib/ota/.ssh
chown -R ota:ota "$root"
chmod 755 "$root"
# Upload only: rrsync confines rsync to $root; no shell, no forwarding.
echo "command=\"/usr/bin/rrsync $root\",restrict $pubkey" > /var/lib/ota/.ssh/authorized_keys
chown -R ota:ota /var/lib/ota/.ssh
chmod 700 /var/lib/ota/.ssh
chmod 600 /var/lib/ota/.ssh/authorized_keys

install -m 644 "$(dirname "$0")/Caddyfile" /etc/caddy/pkuharness-updates.caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
echo "OTA ready: $root (upload as ota@$(hostname -I | awk '{print $1}'))"
