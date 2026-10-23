/**
 * Upload a staged update (.ota/) to the static update server, then prune old assets.
 *
 *   OTA_SSH=ota@<host> [OTA_SSH_KEY_FILE=~/.ssh/ota] bun scripts/ota/sync.ts [--out .ota] [--keep 5]
 *
 * The server account is locked to the updates folder by rrsync (server/updates/setup.sh), so
 * remote paths are relative to it. Order matters: assets, then history, then manifests — a phone
 * must never see a manifest whose assets aren't there yet. Pruning keeps every asset referenced
 * by the newest --keep updates of each channel/platform/runtime (history is tiny and kept).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { assetsToKeep, type Manifest } from './lib';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: '.ota' },
    keep: { type: 'string', default: '5' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const target = process.env.OTA_SSH;
if (!target) throw new Error('OTA_SSH must be set, e.g. ota@154.36.164.211');
const keep = Number(values.keep);
if (!Number.isInteger(keep) || keep < 1) throw new Error('--keep must be a positive integer');

const ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new'];
if (process.env.OTA_SSH_KEY_FILE) ssh.push('-i', process.env.OTA_SSH_KEY_FILE);
const rsync = (...args: string[]) => {
  const cmd = ['rsync', '-rt', '--chmod=D755,F644', '-e', ssh.join(' '), ...(values['dry-run'] ? ['-n'] : []), ...args];
  console.log(`$ rsync ${args.join(' ')}`);
  const p = Bun.spawnSync(cmd, { stdout: 'inherit', stderr: 'inherit' });
  if (p.exitCode !== 0) throw new Error(`rsync failed (${p.exitCode})`);
};

const out = values.out;
for (const dir of ['assets', 'history', 'manifests'])
  if (readdirSync(out).includes(dir)) rsync(`${join(out, dir)}/`, `${target}:${dir}/`);

// Prune: read every history entry on the server, keep the newest N per target.
const mirror = join(out, '.remote-history');
rmSync(mirror, { recursive: true, force: true });
mkdirSync(mirror, { recursive: true });
rsync(`${target}:history/`, `${mirror}/`);
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.json') ? [join(dir, e.name)] : [],
  );
const history = walk(mirror).map((file) => {
  const { manifest } = JSON.parse(readFileSync(file, 'utf8')) as { manifest: Manifest };
  const target = relative(mirror, file).split('/').slice(0, 3).join('/');
  const assets = [manifest.launchAsset, ...manifest.assets].map((a) => a.url.slice(a.url.indexOf('/assets/') + 8));
  return { target, createdAt: manifest.createdAt, assets };
});
const kept = assetsToKeep(history, keep);
if (kept.size === 0) {
  console.log('No history on the server; nothing to prune.');
  process.exit(0);
}
// rsync --delete with --existing --ignore-existing transfers nothing and deletes every remote
// file that has no same-named (empty) placeholder here.
const placeholders = join(out, '.keep-assets');
rmSync(placeholders, { recursive: true, force: true });
mkdirSync(placeholders, { recursive: true });
for (const name of kept) writeFileSync(join(placeholders, name), '');
rsync('--delete', '--existing', '--ignore-existing', `${placeholders}/`, `${target}:assets/`);
console.log(`✓ synced; keeping ${kept.size} assets referenced by the newest ${keep} update(s) per target`);
