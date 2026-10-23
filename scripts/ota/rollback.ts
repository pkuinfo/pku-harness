/**
 * Publish a signed `rollBackToEmbedded` directive: phones on this runtime return to the update
 * embedded in their APK on next launch. Re-publishing a normal update later replaces it.
 *
 *   OTA_SIGNING_KEY="$(cat private-key.pem)" bun scripts/ota/rollback.ts \
 *     --channel production --platform android --runtime-version <v> [--out .ota]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { CHANNELS, type Channel, manifestPath, PLATFORMS, type Platform, RUNTIME_VERSION, rollbackResponse } from './lib';

const { values } = parseArgs({
  options: {
    channel: { type: 'string', default: 'production' },
    platform: { type: 'string', default: 'android' },
    'runtime-version': { type: 'string' },
    out: { type: 'string', default: '.ota' },
  },
});

const channel = values.channel as Channel;
const platform = values.platform as Platform;
const runtimeVersion = values['runtime-version'] ?? '';
if (!CHANNELS.includes(channel)) throw new Error(`--channel must be one of ${CHANNELS.join(', ')}`);
if (!PLATFORMS.includes(platform)) throw new Error(`--platform must be one of ${PLATFORMS.join(', ')}`);
if (!RUNTIME_VERSION.test(runtimeVersion)) throw new Error('--runtime-version is required');
const key = process.env.OTA_SIGNING_KEY;
if (!key?.includes('PRIVATE KEY')) throw new Error('OTA_SIGNING_KEY must hold the PEM private key');

const file = join(values.out, manifestPath(channel, platform, runtimeVersion));
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, rollbackResponse(new Date().toISOString(), key));
console.log(`✓ rollback directive for ${channel}/${platform} runtime ${runtimeVersion} → ${file}`);
