import { autoFixSpec, validateSpec, type Spec } from '@json-render/core';
import { z } from 'zod';

import { definePlugin, defineTool } from '@/core/runtime/types';
import { describeCatalog } from '@/genui/catalog';

export const specSchema = z.object({
  root: z.string().describe('id of the root element'),
  elements: z.record(
    z.string(),
    z.object({
      type: z.string(),
      props: z.record(z.string(), z.unknown()),
      children: z.array(z.string()).optional(),
      on: z.record(z.string(), z.unknown()).optional(),
      visible: z.unknown().optional(),
    }),
  ),
  state: z.record(z.string(), z.unknown()).optional().describe('initial state, e.g. { "form": { "amount": "50" } }'),
});

/** Validate and auto-fix a spec; returns the fixed spec or readable issues for the model. */
export function checkSpec(spec: unknown): { ok: true; spec: Spec } | { ok: false; issues: string[] } {
  const fixed = autoFixSpec(spec as Spec);
  const result = validateSpec(fixed.spec);
  if (!result.valid) return { ok: false, issues: result.issues.map((i) => i.message) };
  return { ok: true, spec: fixed.spec };
}

export const uiPlugin = definePlugin({
  id: 'ui',
  name: '界面生成',
  description: '让 AI 在对话里生成原生界面：表单、选择器、数据卡片。',
  version: '0.1.0',
  icon: 'sparkles',
  core: true,
  scopes: [],
  tools: {
    render: defineTool({
      title: '在对话中显示界面',
      description: `Show a native UI in the chat, e.g. a form to collect input, a choice list, or a card summarising data.
Spec format: { root, elements: { [id]: { type, props, children?: [ids], on?: { press: { action, params } } } }, state? }.
Every prop listed for a component must be present; use null when unused.
Bind inputs with { "$bindState": "/form/<field>" }. A Button with on.press { "action": "submit", "params": { "label": null } } sends /form back to you as the user's next message.
Components:
${describeCatalog()}`,
      input: z.object({ spec: specSchema }),
      effect: 'read',
      execute: async ({ spec }) => {
        const r = checkSpec(spec);
        return r.ok ? { shown: true } : { shown: false, issues: r.issues };
      },
    }),
  },
});
