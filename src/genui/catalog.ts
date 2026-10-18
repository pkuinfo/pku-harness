import { defineCatalog } from '@json-render/core';
import { schema } from '@json-render/react-native/schema';
import { z } from 'zod';

const tone = z.enum(['default', 'muted', 'accent', 'up', 'down', 'warn', 'info']).nullable();
const icon = z
  .enum(['card', 'wifi', 'book', 'bell', 'clock', 'location', 'sparkles', 'schedule', 'todo', 'qr', 'warning', 'check'])
  .nullable();

/**
 * Components the agent may render. Props are semantic (tone, size), never raw colours,
 * so anything the agent builds looks native to the app (docs/DESIGN.md §6).
 */
export const catalog = defineCatalog(schema, {
  components: {
    Column: {
      props: z.object({ gap: z.enum(['sm', 'md', 'lg']).nullable() }),
      slots: ['default'],
      description: 'Vertical stack of children.',
    },
    Row: {
      props: z.object({
        gap: z.enum(['sm', 'md', 'lg']).nullable(),
        align: z.enum(['start', 'center', 'end', 'between']).nullable(),
        wrap: z.boolean().nullable(),
      }),
      slots: ['default'],
      description: 'Horizontal row of children.',
    },
    Card: {
      props: z.object({ title: z.string().nullable(), subtitle: z.string().nullable() }),
      slots: ['default'],
      description: 'Grouped panel with optional title. Do not nest cards.',
    },
    Heading: {
      props: z.object({ text: z.string(), size: z.enum(['lg', 'md', 'sm']).nullable() }),
      slots: [],
      description: 'Section heading.',
    },
    Text: {
      props: z.object({ text: z.string(), tone, size: z.enum(['body', 'small']).nullable() }),
      slots: [],
      description: 'Paragraph or label text.',
    },
    Stat: {
      props: z.object({
        label: z.string(),
        value: z.number(),
        prefix: z.string().nullable(),
        suffix: z.string().nullable(),
        decimals: z.number().nullable(),
        delta: z.string().nullable(),
        deltaTone: z.enum(['up', 'down', 'neutral']).nullable(),
        caption: z.string().nullable(),
        icon,
        size: z.enum(['xl', 'lg', 'md']).nullable(),
      }),
      slots: [],
      description: 'A key number with label, e.g. a balance (prefix "¥"). Animated when it changes.',
    },
    Badge: {
      props: z.object({ label: z.string(), tone: z.enum(['neutral', 'accent', 'up', 'down', 'warn', 'info']).nullable() }),
      slots: [],
      description: 'Small status label.',
    },
    ListItem: {
      props: z.object({ title: z.string(), subtitle: z.string().nullable(), value: z.string().nullable(), icon }),
      slots: [],
      description: 'One row in a list (title, optional subtitle and trailing value).',
      events: ['press'],
    },
    Divider: { props: z.object({}), slots: [], description: 'Hairline separator.' },
    Progress: {
      props: z.object({ label: z.string().nullable(), value: z.number(), tone }),
      slots: [],
      description: 'Progress bar, value from 0 to 1.',
    },
    TextField: {
      props: z.object({
        label: z.string().nullable(),
        placeholder: z.string().nullable(),
        value: z.string().nullable(),
        keyboard: z.enum(['default', 'number', 'email']).nullable(),
      }),
      slots: [],
      description: 'Text input. Bind with value: { "$bindState": "/form/<field>" }.',
    },
    Toggle: {
      props: z.object({ label: z.string(), value: z.boolean().nullable() }),
      slots: [],
      description: 'On/off switch. Bind with value: { "$bindState": "/form/<field>" }.',
    },
    Choice: {
      props: z.object({
        label: z.string().nullable(),
        options: z.array(z.object({ label: z.string(), value: z.string(), hint: z.string().nullable() })),
        value: z.string().nullable(),
      }),
      slots: [],
      description: 'Pick one option from a short list (≤ 8). Bind with value: { "$bindState": "/form/<field>" }.',
    },
    Button: {
      props: z.object({
        label: z.string(),
        variant: z.enum(['primary', 'secondary', 'ghost', 'danger']).nullable(),
      }),
      slots: [],
      description: 'Button. Use on.press to run an action (usually "submit").',
      events: ['press'],
    },
  },
  actions: {
    submit: {
      params: z.object({ label: z.string().nullable() }),
      description: 'Send the current form state (everything under /form) back to you as the user\'s answer.',
    },
    callTool: {
      params: z.object({ tool: z.string(), input: z.record(z.string(), z.unknown()).nullable() }),
      description: 'Run a plugin tool directly (tool id like "campus-card.getBalance").',
    },
  },
});

/** Compact catalog description for the ui.render tool. */
export function describeCatalog(): string {
  const lines: string[] = [];
  const defs = (catalog as unknown as { data: { components: Record<string, { props: z.ZodType; description: string; slots: string[]; events?: string[] }> } }).data.components;
  for (const [name, def] of Object.entries(defs)) {
    const shape = def.props instanceof z.ZodObject ? Object.keys(def.props.shape).join(', ') : '';
    const extra = [def.slots.length ? 'has children' : '', def.events?.length ? `events: ${def.events.join('/')}` : '']
      .filter(Boolean)
      .join('; ');
    lines.push(`- ${name}(${shape})${extra ? ` [${extra}]` : ''}: ${def.description}`);
  }
  return lines.join('\n');
}
