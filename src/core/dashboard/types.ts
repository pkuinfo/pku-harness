import { z } from 'zod';

/**
 * A dashboard widget (docs/ARCHITECTURE.md §7): a generative-UI spec plus bindings that feed
 * live plugin data into the spec's state. The agent and the user edit the same object.
 */

export const bindingSchema = z.object({
  tool: z.string().describe('read-only tool id, e.g. "calendar.today"'),
  args: z.record(z.string(), z.unknown()).optional(),
  /** Dot path into the tool result; empty = the whole result. */
  path: z.string().optional(),
  /** Cache lifetime in minutes (default 5). */
  ttlMinutes: z.number().min(0).max(24 * 60).optional(),
});

export type Binding = z.infer<typeof bindingSchema>;

export const widgetSizeSchema = z.enum(['sm', 'md', 'lg']).describe('sm = half width tile, md = full width, lg = full width hero');
export type WidgetSize = z.infer<typeof widgetSizeSchema>;

export type Widget = {
  id: string;
  title: string;
  size: WidgetSize;
  /** json-render spec ({ root, elements, state? }). */
  spec: Record<string, unknown>;
  /** State path (JSON pointer, e.g. "/card") → data source. */
  bindings: Record<string, Binding>;
  position: number;
  createdAt: number;
  updatedAt: number;
};
