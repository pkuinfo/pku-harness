import { autoFixSpec, validateSpec, type Spec } from '@json-render/core';

import type { SpecCheck, UISpec } from '@/core/runtime/types';

/** Validate and auto-fix an agent-written spec; readable issues for the model on failure. */
export function checkSpec(spec: unknown): SpecCheck {
  const fixed = autoFixSpec(spec as Spec);
  const result = validateSpec(fixed.spec);
  if (!result.valid) return { ok: false, issues: result.issues.map((i) => i.message) };
  return { ok: true, spec: fixed.spec as unknown as UISpec };
}
