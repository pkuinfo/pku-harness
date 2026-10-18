/** Minimal JSON-pointer write ("/a/b") used to place binding results into widget state. */
export function setPointer(target: Record<string, unknown>, pointer: string, value: unknown): Record<string, unknown> {
  const keys = pointer.split('/').slice(1).map((k) => k.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (!keys.length) return target;
  const root: Record<string, unknown> = { ...target };
  let cur = root;
  keys.forEach((key, i) => {
    if (i === keys.length - 1) {
      cur[key] = value;
      return;
    }
    const next = cur[key];
    const copy = next && typeof next === 'object' && !Array.isArray(next) ? { ...(next as Record<string, unknown>) } : {};
    cur[key] = copy;
    cur = copy;
  });
  return root;
}
