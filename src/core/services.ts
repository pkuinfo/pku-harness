import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { z } from 'zod';

import '@/core/campus/adapters';
import { campusAccount, pluginCampusRequest } from '@/core/campus/account';
import { bindFinish, bindStart, currentCodeAsync, otpStatus, unbindLocal } from '@/core/campus/otp';
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
  browser: {
    // Custom Tabs / SFSafariViewController: the page runs in the system browser, isolated from the
    // app, and the browser itself hands weixin:// / alipays:// links to those apps.
    open: async (url) => {
      if (!/^https:\/\//i.test(url)) throw new Error('只能打开 https 网页');
      // createTask: false keeps the tab in the app's task, so Back returns to the conversation.
      await WebBrowser.openBrowserAsync(url, { showTitle: true, enableBarCollapsing: true, createTask: false });
      return { opened: true };
    },
  },
  crypto: {
    sha256: (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, { encoding: Crypto.CryptoEncoding.HEX }),
  },
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
    resolve: (w, force) => resolveWidgetState(w, force ?? false),
    catalog: () =>
      registry.list().flatMap((p) => {
        if (!pluginSettings.get(p.id).enabled || registry.unavailable(p.id)) return [];
        return Object.entries(p.contributes?.widgets ?? {}).map(([widget, c]) => {
          const sizes = c.sizes?.length ? c.sizes : (['sm', 'md', 'lg'] as const).slice();
          return {
            plugin: p.id,
            pluginName: p.name,
            widget,
            title: c.title,
            description: c.description,
            sizes,
            defaultSize: c.defaultSize ?? sizes[0],
            config: c.configSchema ? (z.toJSONSchema(c.configSchema) as Record<string, unknown>) : undefined,
          };
        });
      }),
  },
  todos: {
    list: () => todoStore.list(),
    get: (id) => todoStore.get(id),
    add: (input, source) => addTodo({ ...input, source }),
    update: updateTodo,
    setDone: setTodoDone,
    remove: deleteTodo,
  },
  campus: {
    status: () => {
      const s = campusAccount.get();
      return { signedIn: s.signedIn, username: s.username, name: s.name ?? null };
    },
    request: async (service, req) => {
      if (!campusAccount.get().signedIn) throw new Error('还没有登录校园账号（设置 → 校园账号）');
      const res = await pluginCampusRequest(service, req);
      return { status: res.status, url: res.url, headers: res.headers, body: res.body };
    },
    // 手机令牌 (src/core/campus/otp.ts). `services` is one shared object without caller identity,
    // so these can't check which plugin calls; the boundary is that only plugins compiled into the
    // app (reviewed in the plugins repo) ever receive `services` — remote MCP plugins run elsewhere
    // and only see tool calls. None of these return the secret.
    otp: async () => {
      const { signedIn, username } = campusAccount.get();
      if (!signedIn || !username) return null;
      return currentCodeAsync(username);
    },
    otpStatus,
    otpBindStart: async () => {
      if (!campusAccount.get().signedIn) throw new Error('还没有登录校园账号（设置 → 校园账号）');
      return bindStart();
    },
    otpBindFinish: (smsCode) => bindFinish(smsCode),
    otpUnbindLocal: unbindLocal,
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
