/**
 * Pure parts of the new-APK check (app-update.ts), unit-tested: version comparison and picking
 * the release asset built for this phone's CPU.
 */

/** `v1.2.3` / `1.2.3` → [1, 2, 3]; anything else → null. */
export function parseVersion(s: string | null | undefined): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec((s ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** `latest` is a higher version than `current` (unparseable versions never count as newer). */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

export type ReleaseAsset = { name: string; url: string; size: number };

/** Release APKs are `pku-harness-<version>-<abi>.apk` (docs/RELEASE.md). */
const ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64'] as const;

/**
 * The APK for the first ABI this phone supports (in the order Android lists them, best first),
 * else the arm64 one most phones run, else any APK.
 */
export function pickApk(assets: ReleaseAsset[], deviceAbis: readonly string[] | null): ReleaseAsset | null {
  const apks = assets.filter((a) => a.name.endsWith('.apk'));
  const forAbi = (abi: string) => apks.find((a) => a.name.endsWith(`-${abi}.apk`));
  for (const abi of deviceAbis ?? []) {
    if ((ABIS as readonly string[]).includes(abi)) {
      const hit = forAbi(abi);
      if (hit) return hit;
    }
  }
  return forAbi('arm64-v8a') ?? apks[0] ?? null;
}

export type ReleaseNotes = { en: string[]; 'zh-Hans': string[] };

const NOTES_HEADING = { en: /^#{2,3}\s+What['’]s new\s*$/i, 'zh-Hans': /^#{2,3}\s+更新内容\s*$/ } as const;
const MAX_NOTES = 6;

/**
 * The short "what's new" list from a release body: the `- ` bullets under `## What's new` and
 * `## 更新内容` (docs/releases/<version>.md, copied into the notes by the release workflow).
 * Markdown emphasis and code marks are dropped; empty when the release has no such section.
 */
export function releaseNotes(body: string | null | undefined): ReleaseNotes {
  const lines = (body ?? '').split(/\r?\n/);
  const section = (heading: RegExp) => {
    const start = lines.findIndex((l) => heading.test(l.trim()));
    if (start < 0) return [];
    const out: string[] = [];
    for (const raw of lines.slice(start + 1)) {
      const l = raw.trim();
      if (/^#{1,6}\s/.test(l)) break;
      const m = /^[-*]\s+(.+)$/.exec(l);
      if (m) out.push(m[1]!.replace(/\*\*|__|`/g, '').trim());
    }
    return out.slice(0, MAX_NOTES);
  };
  return { en: section(NOTES_HEADING.en), 'zh-Hans': section(NOTES_HEADING['zh-Hans']) };
}
