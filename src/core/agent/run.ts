import { isStepCount, streamText, type LanguageModel, type ModelMessage, type StepResult, type ToolSet, type UserContent } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { AppState } from 'react-native';

import { notifyNow } from '@/core/notify';
import { registry } from '@/core/runtime/registry';
import { recordStep, type ToolCallUsage } from '@/core/usage';
import { t as tr } from '@/i18n';

import { installRunHooks, newId, sessionStore, type AttachmentPart, type ChatMessage, type ChatPart, type ChatState, type TurnMeta } from '@/core/agent/session/chat-store';
import { capToolResultOutput, compactForOverflow, isContextOverflowError, maybeCompact } from '@/core/agent/context/compaction';
import { gatherContext } from '@/core/agent/context/request-context';
import { aiConfig, getModel } from './provider';
import { attachmentsOf, cutBefore, nextQueued, textOf, userText } from '@/core/agent/session/session-utils';
import { sessions } from '@/core/agent/session/sessions';
import { buildSystemPrompt } from '@/core/agent/context/system-prompt';
import { autoTitle } from '@/core/agent/session/title';
import { buildToolSet, fromModelName } from './tools';

/** What the composer (and everything else) sends: plain text, or text plus attachments. */
export type SendInput = string | { text: string; attachments?: AttachmentPart[] };

const UI_TOOL = 'ui__render';
const STEP_LIMIT = 10;

/** One reply streams at a time per session; replies in different sessions may overlap. */
const controllers = new Map<string, AbortController>();
const turns = new Map<string, Promise<void>>();
/** Sessions whose auto title was already requested this run. */
const titled = new Set<string>();

function appendPart(sid: string, messageId: string, part: ChatPart) {
  sessionStore.updateMessage(sid, messageId, (m) => ({ ...m, parts: [...m.parts, part] }));
}

function appendText(sid: string, messageId: string, kind: 'text' | 'reasoning', delta: string) {
  sessionStore.updateMessage(sid, messageId, (m) => {
    const last = m.parts[m.parts.length - 1];
    if (last && last.type === kind) {
      return { ...m, parts: [...m.parts.slice(0, -1), { ...last, text: last.text + delta }] };
    }
    return { ...m, parts: [...m.parts, { type: kind, text: delta }] };
  });
}

function patchTool(sid: string, messageId: string, callId: string, patch: Partial<Extract<ChatPart, { type: 'tool' }>>) {
  sessionStore.updateMessage(sid, messageId, (m) => ({
    ...m,
    parts: m.parts.map((p) => (p.type === 'tool' && p.callId === callId ? { ...p, ...patch } : p)),
  }));
}

const normalize = (input: SendInput) =>
  typeof input === 'string' ? { text: input.trim(), attachments: [] as AttachmentPart[] } : { text: input.text.trim(), attachments: input.attachments ?? [] };

/** The session's model: its own provider/model, else the active provider's. */
async function modelFor(providerId: string, model: string | undefined): Promise<LanguageModel> {
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
 * read as base64 just before a request. Cached for the run of the app.
 */
const imageCache = new Map<string, string>();
async function resolveImages(history: ModelMessage[]): Promise<ModelMessage[]> {
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

/** A user turn as the model sees it: text (+ inline text attachments) and image parts. */
function userContent(text: string, attachments: AttachmentPart[]): UserContent {
  const images = attachments.filter((a) => a.kind === 'image' && a.uri);
  if (!images.length) return text;
  return [{ type: 'text', text }, ...images.map((a) => ({ type: 'image' as const, image: a.uri!, mediaType: a.mime || 'image/jpeg' }))];
}

/** Model-visible messages with tool results capped (§5.5); the UI tool parts keep everything. */
function capMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role !== 'tool') return m;
    return {
      ...m,
      content: m.content.map((p) => (p.type === 'tool-result' ? { ...p, output: capToolResultOutput(p.output) } : p)),
    };
  });
}

function toolUsage(step: StepResult<ToolSet>, toolMs: Map<string, number>): ToolCallUsage[] {
  const out: ToolCallUsage[] = [];
  for (const c of step.content) {
    if (c.type !== 'tool-result' && c.type !== 'tool-error') continue;
    const toolId = fromModelName(c.toolName);
    const output = c.type === 'tool-result' ? (c.output as { error?: unknown } | undefined) : undefined;
    const ok = c.type === 'tool-result' && !(output && typeof output === 'object' && 'error' in output);
    out.push({ toolId, pluginId: toolId.split('.')[0], ok, ms: toolMs.get(c.toolCallId) });
  }
  return out;
}

const clip = (t: string, n: number) => ([...t].length > n ? [...t].slice(0, n).join('') + '…' : t);

/**
 * Send a user message into a session (default: the active one) and stream the agent's
 * multi-step answer into that session, wherever the user goes meanwhile. While the session is
 * already replying, the message is queued (§4.4). If the session is editing a message (编辑),
 * this sends the edit: the session is truncated from that message first.
 */
export async function sendMessage(input: SendInput, opts: { sessionId?: string } = {}) {
  const sid = opts.sessionId ?? sessionStore.activeId();
  const { text, attachments } = normalize(input);
  if (!text && !attachments.length) return;
  const s = await sessionStore.ensure(sid);
  if (s.editing) return editAndResend(s.editing, { text, attachments }, { sessionId: sid });
  if (s.status === 'streaming' || controllers.has(sid)) {
    sessions.enqueue({ text, attachments }, sid);
    return;
  }
  sessions.setDraft(undefined, sid);
  await startTurn(sid, text, attachments);
}

function startTurn(sid: string, text: string, attachments: AttachmentPart[]) {
  const p = runTurn(sid, text, attachments).finally(() => {
    if (turns.get(sid) === p) turns.delete(sid);
  });
  turns.set(sid, p);
  return p;
}

async function runTurn(sid: string, text: string, attachments: AttachmentPart[]) {
  const controller = new AbortController();
  controllers.set(sid, controller);
  const signal = controller.signal;

  const sessionMeta = sessionStore.meta(sid);
  const providerId = sessionMeta?.providerId ?? aiConfig.get().providerId;
  const modelName = sessionMeta?.model ?? aiConfig.settingsFor(providerId).model;
  if (sessionMeta?.providerId !== providerId || sessionMeta?.model !== modelName) sessionStore.setMeta(sid, { providerId, model: modelName });

  const userMsg: ChatMessage = {
    id: newId(),
    role: 'user',
    parts: [...attachments, ...(text ? [{ type: 'text' as const, text }] : [])],
    createdAt: Date.now(),
  };
  const assistant: ChatMessage = { id: newId(), role: 'assistant', parts: [], createdAt: Date.now() };
  const cur = sessionStore.get(sid)!;
  sessionStore.patch(sid, { messages: [...cur.messages, userMsg, assistant], status: 'streaming', error: undefined, running: assistant.id });
  sessionStore.touch(sid);

  const started = Date.now();
  const turn: TurnMeta = { providerId, model: modelName, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, steps: 0 };
  let ended: TurnMeta['ended'];
  let error: string | undefined;
  // Model-visible output of finished steps, and the text of a step cut short by a stop.
  let produced: ModelMessage[] = [];
  let partial = '';
  let model: LanguageModel | undefined;

  const streamOnce = async (history: ModelMessage[]) => {
    produced = [];
    partial = '';
    let startedSteps = 0;
    let finishedSteps = 0;
    const toolStart = new Map<string, number>();
    const toolMs = new Map<string, number>();
    const result = streamText({
      model: model!,
      system: buildSystemPrompt(),
      messages: await resolveImages(history),
      tools: buildToolSet(signal),
      stopWhen: isStepCount(STEP_LIMIT),
      abortSignal: signal,
      onStepEnd: (step) => {
        finishedSteps++;
        produced.push(...capMessages(step.response.messages));
        const u = step.usage;
        const input = u.inputTokens ?? 0;
        const cached = u.inputTokenDetails?.cacheReadTokens ?? 0;
        const output = u.outputTokens ?? 0;
        const reasoning = u.outputTokenDetails?.reasoningTokens ?? 0;
        turn.inputTokens! += input;
        turn.cachedInputTokens! += cached;
        turn.outputTokens! += output;
        turn.reasoningTokens! += reasoning;
        turn.steps! += 1;
        recordStep({
          at: Date.now(),
          sessionId: sid,
          providerId,
          model: modelName,
          inputTokens: input,
          cachedInputTokens: cached,
          outputTokens: output,
          reasoningTokens: reasoning,
          durationMs: step.performance?.stepTimeMs ?? 0,
          tools: toolUsage(step as StepResult<ToolSet>, toolMs),
          purpose: 'chat',
          turnId: assistant.id,
        });
      },
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'start-step':
          startedSteps++;
          partial = '';
          break;
        case 'text-delta':
          partial += part.text;
          appendText(sid, assistant.id, 'text', part.text);
          break;
        case 'reasoning-delta':
          appendText(sid, assistant.id, 'reasoning', part.text);
          break;
        case 'tool-call':
          toolStart.set(part.toolCallId, Date.now());
          if (part.toolName === UI_TOOL) {
            appendPart(sid, assistant.id, { type: 'ui', callId: part.toolCallId, spec: (part.input as { spec?: unknown })?.spec });
          } else {
            appendPart(sid, assistant.id, { type: 'tool', callId: part.toolCallId, toolId: fromModelName(part.toolName), status: 'running', input: part.input });
          }
          break;
        case 'tool-result': {
          toolMs.set(part.toolCallId, Date.now() - (toolStart.get(part.toolCallId) ?? Date.now()));
          const out = part.output as { error?: string } | undefined;
          patchTool(
            sid,
            assistant.id,
            part.toolCallId,
            out && typeof out === 'object' && 'error' in out ? { status: 'error', error: String(out.error) } : { status: 'done', output: part.output },
          );
          break;
        }
        case 'tool-error':
          toolMs.set(part.toolCallId, Date.now() - (toolStart.get(part.toolCallId) ?? Date.now()));
          patchTool(sid, assistant.id, part.toolCallId, { status: 'error', error: String(part.error) });
          break;
        case 'error':
          throw part.error;
      }
    }
    // A step cut short keeps its text for the model only if it never finished.
    if (startedSteps <= finishedSteps) partial = '';
    if (!signal.aborted && finishedSteps >= STEP_LIMIT) {
      const last = produced.at(-1);
      if (last?.role === 'tool') sessions.notice(tr('chat.agent.stepLimit'), 'warn', { sessionId: sid });
    }
  };

  try {
    // Plugin request context (memory, …) travels with the user message in the model-visible,
    // logged history; the chat UI shows only what the user typed.
    const context = await gatherContext(text);
    const body = userText(text, attachments);
    const typed = context ? `<context>\n${context}\n</context>\n\n${body}` : body;
    const latest = sessionStore.get(sid);
    if (!latest) return;
    sessionStore.patch(sid, { history: [...latest.history, { role: 'user', content: userContent(typed, attachments) }] });
    model = await modelFor(providerId, modelName);
    await maybeCompact(sid);
    if (signal.aborted) throw signal.reason;
    try {
      await streamOnce(sessionStore.get(sid)?.history ?? []);
    } catch (e) {
      if (signal.aborted || !isContextOverflowError(e) || !(await compactForOverflow(sid))) throw e;
      // Overflow (§5.4 step 4): drop what streamed, compact, retry once on the rebuilt history.
      sessionStore.updateMessage(sid, assistant.id, (m) => ({ ...m, parts: [] }));
      await streamOnce(sessionStore.get(sid)?.history ?? []);
    }
  } catch (e) {
    if (signal.aborted) ended = 'stopped';
    else {
      ended = 'error';
      error = e instanceof Error ? e.message : String(e);
    }
  } finally {
    if (signal.aborted) ended = 'stopped';
    if (controllers.get(sid) === controller) controllers.delete(sid);
    finishTurn(sid, assistant.id, { turn, started, ended, error, produced, partial, model, providerId, modelName });
  }
}

function finishTurn(
  sid: string,
  assistantId: string,
  t: { turn: TurnMeta; started: number; ended: TurnMeta['ended']; error?: string; produced: ModelMessage[]; partial: string; model?: LanguageModel; providerId: string; modelName: string },
) {
  const s = sessionStore.get(sid);
  if (!s) return; // deleted meanwhile
  const tail: ModelMessage[] = t.partial.trim() ? [{ role: 'assistant', content: t.partial }] : [];
  sessionStore.updateMessage(sid, assistantId, (m) => ({ ...m, meta: { ...t.turn, durationMs: Date.now() - t.started, ...(t.ended ? { ended: t.ended } : null) } }));
  const after = sessionStore.get(sid)!;
  sessionStore.patch(sid, {
    status: 'idle',
    running: undefined,
    history: [...after.history, ...t.produced, ...tail],
    error: t.error,
    // A stop or an error pauses the queue (§4.4).
    queuePaused: t.ended && after.queue?.length ? true : after.queuePaused,
  });
  sessionStore.touch(sid);

  if (t.ended === 'stopped') return;
  const meta = sessionStore.meta(sid);
  if (sid !== sessionStore.activeId()) sessionStore.setMeta(sid, { unread: true });
  if (AppState.currentState !== 'active') {
    const reply = textOf(sessionStore.get(sid)?.messages.find((m) => m.id === assistantId));
    notifyNow({
      title: tr(t.ended === 'error' ? 'chat.agent.notifyError' : 'chat.agent.notifyDone', { title: meta?.title ?? tr('chat.agent.untitled') }),
      body: t.error ?? (clip(reply.replace(/\s+/g, ' ').trim(), 80) || undefined),
      url: `/?session=${encodeURIComponent(sid)}`,
      channel: 'alerts',
    }).catch(() => {});
  }
  if (t.ended) return;
  if (t.model && meta?.titleSource === 'fallback' && !titled.has(sid)) {
    titled.add(sid);
    void autoTitle(sid, t.model, { providerId: t.providerId, model: t.modelName });
  }
  kick(sid);
}

/** Send the next queued message of an idle session, unless its queue is paused. */
function kick(sid: string) {
  const s = sessionStore.get(sid);
  if (!s || s.status === 'streaming' || controllers.has(sid)) return;
  const next = nextQueued(s.queue ?? [], !!s.queuePaused);
  if (!next) return;
  sessionStore.patch(sid, { queue: (s.queue ?? []).filter((q) => q.id !== next.id) });
  void startTurn(sid, next.text.trim(), next.attachments);
}

installRunHooks({ stop: (id) => controllers.get(id)?.abort(), kick });

/** Stop a session's reply (default: active). Keeps the partial reply, marked 已停止. */
export function stopGeneration(sessionId?: string) {
  controllers.get(sessionId ?? sessionStore.activeId())?.abort();
}

/** Stop a session's reply and wait until it has wound down. */
async function settle(sid: string) {
  const running = turns.get(sid);
  if (!running) return;
  controllers.get(sid)?.abort();
  await running.catch(() => {});
}

/**
 * The last turn was cut off (app killed, lost network) before it finished: returns the user
 * message to retry, or null. Notices don't count.
 */
export function interruptedTurn(state: ChatState = sessionStore.get(sessionStore.activeId()) ?? { messages: [], history: [], status: 'idle' }): string | null {
  if (state.status === 'streaming') return null;
  const msgs = state.messages.filter((m) => m.role !== 'event');
  const last = msgs.at(-1);
  if (last?.role === 'user') return last.id;
  if (last?.role !== 'assistant') return null;
  const user = msgs.at(-2);
  if (user?.role !== 'user') return null;
  if (last.parts.length === 0 || last.meta?.ended === 'interrupted') return user.id;
  return null;
}

/** Drop the cut-off turn (UI and model history) and send the same message again. */
export async function retryLast(sessionId?: string) {
  const sid = sessionId ?? sessionStore.activeId();
  const s = sessionStore.get(sid);
  const id = s && interruptedTurn(s);
  if (id) await resendFrom(sid, id);
}

/** Regenerate the latest reply: drop the last exchange (UI and model history) and ask again. */
export async function regenerateLast(sessionId?: string) {
  const sid = sessionId ?? sessionStore.activeId();
  const s = sessionStore.get(sid);
  if (!s || s.status === 'streaming') return;
  const user = s.messages.findLast((m) => m.role === 'user');
  if (user) await resendFrom(sid, user.id);
}

async function resendFrom(sid: string, messageId: string) {
  const m = sessionStore.get(sid)?.messages.find((x) => x.id === messageId);
  if (!m) return;
  await editAndResend(messageId, { text: textOf(m), attachments: attachmentsOf(m) }, { sessionId: sid });
}

/**
 * Edit & resend (§2): truncate the session from a user message (UI and model history; notices
 * after it go too) and send `input` in its place. A running reply is stopped first.
 */
export async function editAndResend(messageId: string, input: SendInput, opts: { sessionId?: string } = {}) {
  const sid = opts.sessionId ?? sessionStore.activeId();
  const { text, attachments } = normalize(input);
  await settle(sid);
  const s = sessionStore.get(sid);
  if (!s) return;
  const cut = cutBefore(s.messages, s.history, messageId);
  sessionStore.patch(sid, { editing: undefined, draft: undefined, error: undefined, ...(cut ? { messages: cut.messages, history: cut.history } : null) });
  if (!text && !attachments.length) return;
  await startTurn(sid, text, attachments);
}
