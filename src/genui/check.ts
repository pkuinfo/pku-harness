import { autoFixSpec, validateSpec, type Spec } from '@json-render/core';

import type { SpecCheck, UISpec } from '@/core/runtime/types';

/** Validate and auto-fix an agent-written spec; readable issues for the model on failure. */
export function checkSpec(spec: unknown): SpecCheck {
  // Model output: may be missing or the wrong shape (e.g. a partial tool call).
  if (!spec || typeof spec !== 'object' || typeof (spec as { elements?: unknown }).elements !== 'object' || !(spec as { elements?: unknown }).elements) {
    return { ok: false, issues: ['spec 必须是 { root, elements } 对象'] };
  }
  const fixed = autoFixSpec(spec as Spec);
  const result = validateSpec(fixed.spec);
  if (!result.valid) return { ok: false, issues: result.issues.map((i) => i.message) };
  return { ok: true, spec: fixed.spec as unknown as UISpec };
}
