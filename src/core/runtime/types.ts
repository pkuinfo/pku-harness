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

/** How a provider authenticates. `account` = sign-in / subscription flow owned by the plugin. */
export type ProviderAuth = 'apiKey' | 'account' | 'none';

export interface ProviderModel {
  id: string;
  name?: string;
  description?: string;
}

export interface ProviderConfig {
  baseURL: string;
  model: string;
  /** API key or account token from SecureStore; undefined when auth is 'none'. */
  credential?: string;
}

/**
 * A model provider contributed by a plugin (docs/ARCHITECTURE.md §5). The returned model is an
 * AI SDK `LanguageModel`; typed loosely here so core types don't depend on the AI SDK.
 */
export interface ProviderDef {
  name: string;
  description: string;
  auth: ProviderAuth;
  defaultBaseURL: string;
  /** Whether the user may edit the base URL (generic OpenAI-compatible endpoints). */
  editableBaseURL?: boolean;
  models: ProviderModel[];
  defaultModel: string;
  /** Where to get a key / how to sign in, shown under the field. */
  credentialHint?: string;
  /** Optional live model listing. */
  listModels?: (config: ProviderConfig) => Promise<ProviderModel[]>;
  /** For auth 'account': run the sign-in flow and return a credential to store. */
  signIn?: () => Promise<string>;
  createModel: (config: ProviderConfig) => unknown;
}

export interface PluginDef {
  id: string;
  name: string;
  description: string;
  version: string;
  /** Icon name from src/components/icon.tsx (kept as a string so core doesn't import UI). */
  icon?: string;
  /** Remote (MCP) plugin: where its tools run. Absent for built-ins. */
  remote?: { url: string; server: string };
  /** Part of the app itself: always on, can't be disabled in Settings. */
  core?: boolean;
  /** Default per-effect modes; the user can change them in Settings → 插件. */
  defaultModes?: Partial<Record<ToolEffect, 'auto' | 'ask' | 'off'>>;
  /** Campus services or hosts this plugin talks to, shown in Settings. */
  scopes: string[];
  tools: Record<string, ToolDef>;
  dataSources?: Record<string, DataSourceDef>;
  /** Model providers this plugin contributes (AI access is a plugin too). */
  providers?: Record<string, ProviderDef>;
  /** Extra guidance appended to the agent's system prompt. */
  instructions?: string;
}

export function definePlugin(def: PluginDef): PluginDef {
  return def;
}

export function defineTool<I extends z.ZodType, O>(def: ToolDef<I, O>): ToolDef {
  return def as unknown as ToolDef;
}
