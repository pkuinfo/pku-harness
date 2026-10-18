import type { Condition } from './types';

/** Read a dot path ("data.balance", "items.0.amount") from a tool result. */
export function getPath(value: unknown, path: string): unknown {
  if (!path) return value;
  let cur: unknown = value;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/** Does the checked value satisfy the condition? `previous` is the value from the last run. */
export function evaluate(cond: Condition, value: unknown, previous?: unknown): boolean {
  switch (cond.op) {
    case 'always':
      return true;
    case 'changed':
      return previous !== undefined && JSON.stringify(previous) !== JSON.stringify(value);
    case '==':
      return value === cond.value || (typeof cond.value === 'number' && num(value) === cond.value);
    case '!=':
      return !(value === cond.value || (typeof cond.value === 'number' && num(value) === cond.value));
    default: {
      const a = num(value);
      const b = num(cond.value);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      if (cond.op === '<') return a < b;
      if (cond.op === '<=') return a <= b;
      if (cond.op === '>') return a > b;
      return a >= b;
    }
  }
}

/** Replace `{value}` in notification text with the checked value. */
export function fillTemplate(template: string, value: unknown): string {
  const text = typeof value === 'number' ? String(Math.round(value * 100) / 100) : typeof value === 'string' ? value : JSON.stringify(value);
  return template.replaceAll('{value}', text ?? '');
}
