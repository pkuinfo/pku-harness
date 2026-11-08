import type { ToolAssessment, ToolEffect } from '@pku-harness/sdk';
import { z } from 'zod';

const effectSchema = z.enum(['read', 'write', 'public', 'money']);
const assessmentSchema = z.object({
  effect: effectSchema,
  target: z.object({ label: z.string().min(1).max(512), context: z.string().max(256).optional() }).strict().optional(),
}).strict();

/** Native or plugin classification must pass validation before it can select a permission mode. */
export function parseToolAssessment(value: unknown, fallback: ToolEffect): { effect: ToolEffect; assessment?: ToolAssessment } {
  if (value === undefined) return { effect: fallback };
  if (typeof value === 'string') return { effect: effectSchema.parse(value) };
  const assessment = assessmentSchema.parse(value);
  return { effect: assessment.effect, assessment };
}
