import { z } from 'zod';

/** "HH:MM", 24-hour, local time. */
export const timeOfDay = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM (24h)')
  .describe('local time HH:MM, 24-hour');

/**
 * When a job fires (docs/ARCHITECTURE.md §8). All times are device-local.
 * - `at`: once.
 * - `every`: a series anchored at `startAt`, optionally bounded by `count` and/or `until`.
 */
export const triggerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('at'),
    at: z.number().describe('epoch ms'),
  }),
  z.object({
    type: z.literal('every'),
    unit: z.enum(['minute', 'hour', 'day', 'week']),
    interval: z.number().int().min(1).max(1000),
    /** day/week units: times of day; default = the time of `startAt`. */
    times: z.array(timeOfDay).min(1).max(24).optional(),
    /** week unit: 0 = Sunday … 6 = Saturday; default = weekday of `startAt`. */
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    startAt: z.number().describe('epoch ms; first possible occurrence'),
    /** Total occurrences in the series, then stop. */
    count: z.number().int().min(1).optional(),
    /** Last possible occurrence (inclusive), epoch ms. */
    until: z.number().optional(),
  }),
]);

export type Trigger = z.infer<typeof triggerSchema>;

export const conditionSchema = z.object({
  /** Dot path into the data source result, e.g. "balance". Empty = the whole result. */
  path: z.string().default(''),
  op: z.enum(['<', '<=', '>', '>=', '==', '!=', 'changed', 'always']),
  value: z.union([z.number(), z.string(), z.boolean()]).optional(),
});

export type Condition = z.infer<typeof conditionSchema>;

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('notify'),
    title: z.string().min(1),
    body: z.string().optional(),
    /** In-app route opened when the notification is tapped. */
    url: z.string().optional(),
  }),
  z.object({
    type: z.literal('check'),
    /** Tool to call, `<plugin>.<tool>`. */
    tool: z.string(),
    args: z.record(z.string(), z.unknown()).optional(),
    condition: conditionSchema,
    /** Notification when the condition holds. `{value}` is replaced by the checked value. */
    title: z.string().min(1),
    body: z.string().optional(),
    url: z.string().optional(),
  }),
]);

export type Action = z.infer<typeof actionSchema>;

export type JobSource = 'user' | 'agent' | 'plugin';

export type Job = {
  id: string;
  title: string;
  trigger: Trigger;
  action: Action;
  enabled: boolean;
  source: JobSource;
  /** Occurrences that have fired (or passed). */
  runs: number;
  lastRunAt: number | null;
  /** Next occurrence, null when the series is over. */
  nextRunAt: number | null;
  /** Last value seen by a `check` job (for `changed`). */
  lastValue?: unknown;
  /** Last failure of a `check` job, cleared on success. */
  lastError?: string;
  /** Free-form link back to the owner, e.g. { todoId }. */
  meta?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};
