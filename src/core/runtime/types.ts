import type { z } from 'zod';

import type { KV } from '@/core/store/kv';

/** What a tool changes. Used for per-plugin settings and UI hints. */
export type ToolEffect = 'read' | 'write' | 'money' | 'public';

/** Who invoked a tool. */
export type Actor = 'user' | 'agent' | 'scheduler';

/** Services the host provides to tools; core modules extend this by declaration merging. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HostServices {}

export interface ToolContext {
  pluginId: string;
  actor: Actor;
  kv: KV;
  services: HostServices;
  signal?: AbortSignal;
}

export interface ToolDef<I extends z.ZodType = z.ZodType, O = unknown> {
  title: string;
  /** Written for the model: when and how to use this tool. */
  description: string;
  input: I;
  effect: ToolEffect;
  execute: (input: z.infer<I>, ctx: ToolContext) => Promise<O>;
}

export interface DataSourceDef {
  title: string;
  tool: string;
  args?: Record<string, unknown>;
  ttlMs: number;
}

export interface PluginDef {
  id: string;
  name: string;
  description: string;
  version: string;
  /** Icon name from src/components/icon.tsx (kept as a string so core doesn't import UI). */
  icon?: string;
  /** Part of the app itself: always on, can't be disabled in Settings. */
  core?: boolean;
  /** Default per-effect modes; the user can change them in Settings → 插件. */
  defaultModes?: Partial<Record<ToolEffect, 'auto' | 'ask' | 'off'>>;
  /** Campus services or hosts this plugin talks to, shown in Settings. */
  scopes: string[];
  tools: Record<string, ToolDef>;
  dataSources?: Record<string, DataSourceDef>;
  /** Extra guidance appended to the agent's system prompt. */
  instructions?: string;
}

export function definePlugin(def: PluginDef): PluginDef {
  return def;
}

export function defineTool<I extends z.ZodType, O>(def: ToolDef<I, O>): ToolDef {
  return def as unknown as ToolDef;
}
