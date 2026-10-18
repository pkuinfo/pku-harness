import { resolveWidgetState } from '@/core/dashboard/resolve';
import { widgetStore } from '@/core/dashboard/store';
import { services } from '@/core/runtime/invoke';
import { pluginSettings } from '@/core/runtime/plugin-settings';
import { effectOf, remotePlugins } from '@/core/runtime/remote';
import { registry } from '@/core/runtime/registry';
import type { HostServices, PluginInfo } from '@/core/runtime/types';
import { createJob, deleteJob, runCheck, updateJob } from '@/core/scheduler/engine';
import { jobStore } from '@/core/scheduler/store';
import { timetable } from '@/core/timetable/store';
import { addTodo, deleteTodo, setTodoDone, todoStore, updateTodo } from '@/core/todo';
import { describeCatalog } from '@/genui/catalog';
import { checkSpec } from '@/genui/check';

/**
 * The harness side of the plugin contract: every service a plugin may use, implemented on the
 * app's stores. Plugins (pkuinfo/pku-harness-plugins) see only this object via `ctx.services`.
 */
const host: HostServices = {
  registry: {
    plugins: (): PluginInfo[] =>
      registry.list().map((p) => {
        const s = pluginSettings.get(p.id);
        return {
          id: p.id,
          name: p.name,
          kind: p.core ? 'system' : p.remote ? 'remote' : 'builtin',
          enabled: s.enabled && !registry.unavailable(p.id),
          modes: s.modes,
          tools: Object.entries(p.tools).map(([name, t]) => ({ id: `${p.id}.${name}`, title: t.title, effect: t.effect })),
        };
      }),
    tool: (id) => {
      const e = registry.tool(id);
      return e ? { id: e.id, pluginId: e.pluginId, title: e.def.title, effect: e.def.effect } : undefined;
    },
  },
  remote: {
    install: async (input) => {
      const m = await remotePlugins.install(input);
      return { id: m.id, name: m.name, tools: m.tools.map((t) => ({ name: t.name, effect: effectOf(t) })) };
    },
    uninstall: (id) => remotePlugins.uninstall(id),
    has: (id) => !!remotePlugins.get(id),
  },
  genui: { describeCatalog, checkSpec },
  scheduler: {
    create: createJob,
    update: updateJob,
    remove: deleteJob,
    get: (id) => jobStore.get(id),
    list: () => jobStore.list(),
    runCheck: async (id) => {
      const job = jobStore.get(id);
      if (!job) throw new Error(`没有这个任务：${id}`);
      return runCheck(job);
    },
  },
  widgets: {
    list: () => widgetStore.list(),
    get: (id) => widgetStore.get(id),
    newId: () => widgetStore.newId(),
    put: (w) => widgetStore.put(w),
    remove: (id) => widgetStore.remove(id),
    reorder: (ids) => widgetStore.reorder(ids),
    preview: (w) => resolveWidgetState(w, true),
  },
  todos: {
    list: () => todoStore.list(),
    get: (id) => todoStore.get(id),
    add: (input, source) => addTodo({ ...input, source }),
    update: updateTodo,
    setDone: setTodoDone,
    remove: deleteTodo,
  },
  timetable: {
    get: () => timetable.get(),
    newId: () => timetable.newId(),
    upsert: (c) => timetable.upsert(c),
    remove: (id) => timetable.remove(id),
    setReminderMinutes: (m) => timetable.setReminderMinutes(m),
    reloadSemester: () => timetable.reloadSemester(),
  },
};

/** Install host services before any tool runs. */
export function installServices() {
  Object.assign(services, host);
}
