import { z } from 'zod';

import { resolveWidgetState } from '@/core/dashboard/resolve';
import { widgetStore } from '@/core/dashboard/store';
import { bindingSchema, widgetSizeSchema, type Widget } from '@/core/dashboard/types';
import { registry } from '@/core/runtime/registry';
import { definePlugin, defineTool } from '@/core/runtime/types';
import { checkSpec, specSchema } from '@/plugins/ui';

const view = (w: Widget) => ({ id: w.id, title: w.title, size: w.size, position: w.position, bindings: w.bindings, spec: w.spec });

function checkBindings(bindings: Record<string, z.infer<typeof bindingSchema>>) {
  for (const [pointer, b] of Object.entries(bindings)) {
    if (!pointer.startsWith('/')) throw new Error(`绑定路径必须以 / 开头：${pointer}`);
    const entry = registry.tool(b.tool);
    if (!entry) throw new Error(`没有这个工具：${b.tool}`);
    if (entry.def.effect !== 'read') throw new Error(`看板只能绑定只读工具：${b.tool}`);
  }
}

/** Build and edit the Dashboard tab (docs/ARCHITECTURE.md §7). */
export const dashboardPlugin = definePlugin({
  id: 'dashboard',
  name: '看板',
  description: '由 AI 搭建、可随时修改的数据看板。',
  version: '0.1.0',
  icon: 'dashboard',
  core: true,
  scopes: [],
  instructions: `用户想在看板上看到某些数字时，用 dashboard__upsertWidget 创建组件；修改时传入已有 id。
- spec 与 ui__render 相同（同一套组件），但看板组件不要放按钮表单，重点是数字：通常一个 Card 或 Column 里放 Stat / ListItem / Progress。
- 实时数据用 bindings：{ "/card": { tool: "campus-card.getBalance", path: "balance", ttlMinutes: 5 } }，然后在 props 里写 { "$state": "/card" }；文本可用 { "$template": "第 \${/today/semester/week} 周" }。
- size：sm 半宽小卡片（单个数字），md 全宽，lg 全宽重点卡片。
- 可绑定的数据源用 dashboard__sources 查看；只读工具都可以绑定。创建后看返回的 preview 确认数据正确。`,
  tools: {
    list: defineTool({
      title: '查看看板',
      description: 'List dashboard widgets in display order, with their specs and bindings.',
      input: z.object({}),
      effect: 'read',
      execute: async () => widgetStore.list().map(view),
    }),
    sources: defineTool({
      title: '可用数据源',
      description: 'Data sources that widgets can bind to: plugin data sources and every read-only tool.',
      input: z.object({}),
      effect: 'read',
      execute: async () =>
        registry.tools()
          .filter((t) => t.def.effect === 'read' && !['ui', 'dashboard'].includes(t.pluginId))
          .map((t) => ({ tool: t.id, title: t.def.title, description: t.def.description })),
    }),
    upsertWidget: defineTool({
      title: '添加或修改看板组件',
      description: 'Create a widget, or replace an existing one when id is given. Returns the resolved data as preview.',
      input: z.object({
        id: z.string().optional().describe('existing widget id to replace'),
        title: z.string().min(1),
        size: widgetSizeSchema,
        spec: specSchema,
        bindings: z.record(z.string(), bindingSchema).optional(),
        position: z.number().int().min(0).optional().describe('0 = top; default end (or unchanged)'),
      }),
      effect: 'write',
      execute: async ({ id, title, size, spec, bindings = {}, position }) => {
        const checked = checkSpec(spec);
        if (!checked.ok) return { saved: false, issues: checked.issues };
        checkBindings(bindings);
        const cur = id ? widgetStore.get(id) : undefined;
        if (id && !cur) throw new Error(`没有这个组件：${id}`);
        const now = Date.now();
        const w: Widget = {
          id: cur?.id ?? widgetStore.newId(),
          title,
          size,
          spec: checked.spec as unknown as Record<string, unknown>,
          bindings,
          position: cur?.position ?? widgetStore.list().length,
          createdAt: cur?.createdAt ?? now,
          updatedAt: now,
        };
        await widgetStore.put(w);
        if (position != null) {
          const ids = widgetStore.list().map((x) => x.id).filter((x) => x !== w.id);
          ids.splice(position, 0, w.id);
          await widgetStore.reorder(ids);
        }
        let preview: unknown;
        try {
          preview = await resolveWidgetState(w, true);
        } catch (e) {
          preview = { error: e instanceof Error ? e.message : String(e) };
        }
        return { saved: true, id: w.id, preview };
      },
    }),
    removeWidget: defineTool({
      title: '移除看板组件',
      description: 'Remove a widget from the dashboard.',
      input: z.object({ id: z.string() }),
      effect: 'write',
      execute: async ({ id }) => {
        const w = widgetStore.get(id);
        if (!w) throw new Error(`没有这个组件：${id}`);
        await widgetStore.remove(id);
        return { removed: w.title };
      },
    }),
    reorder: defineTool({
      title: '调整看板顺序',
      description: 'Set the widget order by listing ids from top to bottom.',
      input: z.object({ ids: z.array(z.string()) }),
      effect: 'write',
      execute: async ({ ids }) => {
        await widgetStore.reorder(ids);
        return widgetStore.list().map((w) => ({ id: w.id, title: w.title }));
      },
    }),
  },
});
