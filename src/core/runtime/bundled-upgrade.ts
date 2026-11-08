/**
 * Whether the copy of a bundled plugin document shipped in this build should replace the copy
 * already stored on the device (pure: unit-tested). Without this, a device keeps the version it
 * first stored until a link update gets through, which GitHub on campus networks often doesn't.
 */

/** Numeric x.y.z compare; a pre-release (`1.2.0-beta`) sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split(/[-+]/, 2);
    return { nums: core.split('.').map((n) => Number(n) || 0), pre: v.includes('-') ? (pre ?? '') : null };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}

type Stored = { link: string | null; source: 'link' | 'bundled' | 'local'; version: string; pinned?: boolean };

/**
 * 'apply' when the bundled copy is a newer version of the same official document the device
 * stores; 'keep' otherwise (same or older version, a pinned rollback, or a local draft or other
 * link that only shares the id). Wider access still waits for the user: the caller decides.
 */
export function bundledUpgrade(stored: Stored, bundled: { link: string; version: string }): 'apply' | 'keep' {
  if (stored.source === 'local' || stored.pinned || stored.link !== bundled.link) return 'keep';
  return compareVersions(bundled.version, stored.version) > 0 ? 'apply' : 'keep';
}
