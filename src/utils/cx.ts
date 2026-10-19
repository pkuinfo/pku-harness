/** Join className parts, skipping falsy ones: `cx('p-4', active && 'bg-brand')`. */
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}
