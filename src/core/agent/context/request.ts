/**
 * The model request prefix (docs/AGENT-HARNESS.md §5.1). DeepSeek caches by prefix and renders
 * system prompt → tool block → messages, so a request hits only as far as it matches the last
 * one byte for byte. Every request about a session — the chat turn, its auto title, a compaction
 * summary — is built here from the same parts, so they all reuse the conversation's cache:
 *
 * - system: static between turns (no time, no per-turn facts; those ride in the user message).
 * - tools: every enabled plugin tool, sorted by id. Never narrowed or reordered mid-session:
 *   changing the tool block invalidates everything after the system prompt.
 * - messages: the session's stored history, append-only; images resolved the same way each time.
 */
import type { LanguageModel, ModelMessage, ToolSet } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import { aiConfig, getModel } from '@/core/agent/provider';
import { buildToolSet } from '@/core/agent/tools';
import { registry } from '@/core/runtime/registry';
import type { TurnInfo } from '@/core/runtime/types';

import { buildSystemPrompt } from './system-prompt';

/** A session's model: its own provider/model, else the provider's configured model. */
export async function modelFor(providerId: string, model: string | undefined): Promise<LanguageModel> {
  const base = await getModel(providerId);
  const s = aiConfig.settingsFor(providerId);
  if (!model || model === s.model) return base;
  const entry = registry.provider(providerId);
  if (!entry) return base;
  const credential = (await aiConfig.credential(providerId)) ?? undefined;
  return entry.def.createModel({ ...s, model, credential, fetch: expoFetch as unknown as typeof fetch }) as LanguageModel;
}

/**
 * Images live in the history as their file:// URI (keeps the persisted record small); they are
 * read as base64 just before a request, identically every time. Cached for the run of the app.
 */
const imageCache = new Map<string, string>();
export async function resolveImages(history: ModelMessage[]): Promise<ModelMessage[]> {
  if (!history.some((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((p) => p.type === 'image' && typeof p.image === 'string' && p.image.startsWith('file:')))) {
    return history;
  }
  return Promise.all(
    history.map(async (m): Promise<ModelMessage> => {
      if (m.role !== 'user' || !Array.isArray(m.content)) return m;
      const content = await Promise.all(
        m.content.map(async (p) => {
          if (p.type !== 'image' || typeof p.image !== 'string' || !p.image.startsWith('file:')) return p;
          const uri = p.image;
          try {
            let b64 = imageCache.get(uri);
            if (!b64) {
              b64 = await new File(uri).base64();
              imageCache.set(uri, b64);
            }
            return { ...p, image: b64 };
          } catch {
            return { type: 'text' as const, text: '（一张图片已无法读取）' };
          }
        }),
      );
      return { ...m, content };
    }),
  );
}

export type RequestPrefix = { system: string; tools: ToolSet; messages: ModelMessage[] };

/**
 * System prompt, tool block and resolved messages for a request on `history`.
 *
 * Side requests (title, summary) pass `{ sideRequest: true }` and append their instruction after
 * `messages`. They keep the same tool schemas but without `execute`, and must NOT set
 * `toolChoice: 'none'`: DeepSeek then renders the prompt without its tool section, so the
 * request diverges right after the system prompt and the cached conversation is missed
 * (measured: 5.5k of 6.6k cached instead of ~all). A stray tool call there runs nothing.
 */
export async function requestPrefix(
  history: ModelMessage[],
  opts: { signal?: AbortSignal; sideRequest?: boolean; turn?: TurnInfo; actor?: 'agent' | 'scheduler' } = {},
): Promise<RequestPrefix> {
  // The same tool block for every actor (the cached prefix); who may run what is decided in invokeTool.
  const tools = buildToolSet(opts.signal, opts.turn, opts.actor);
  if (opts.sideRequest) for (const name of Object.keys(tools)) tools[name] = { ...tools[name], execute: undefined };
  return { system: buildSystemPrompt(), tools, messages: await resolveImages(history) };
}
