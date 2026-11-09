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
