import { streamText, type LanguageModel, type ModelMessage, type StepResult, type ToolSet, type UserContent } from 'ai';
import { AppState } from 'react-native';

import { notifyNow } from '@/core/notify';
import { registerRunCancellation, releaseRunResources } from '@/core/runtime/run-resources';
import { recordStep, type ToolCallUsage } from '@/core/usage';
import { t as tr } from '@/i18n';

import { installRunHooks, newId, sessionStore, type AttachmentPart, type ChatMessage, type ChatPart, type ChatState, type TurnMeta } from '@/core/agent/session/chat-store';
import { capToolResultOutput, compactForOverflow, compactInTurn, contextBudget, isContextOverflowError, maybeCompact } from '@/core/agent/context/compaction';
import { gatherContext } from '@/core/agent/context/request-context';
import { aiConfig } from './provider';
import { attachmentsOf, cutBefore, nextQueued, plainText, settleRunningTools, textOf, userText } from '@/core/agent/session/session-utils';
import { sessions } from '@/core/agent/session/sessions';
import { autoTitle } from '@/core/agent/session/title';
import { asksToRemember } from '@/core/agent/context/assembly';
import { modelFor, requestPrefix } from '@/core/agent/context/request';
import { agentToolStepLimits, fromModelName } from './tools';
import { ToolImages } from './tool-images';
import { acceptsImages } from './attachments/attachments';
import { DEFAULT_STEP_LIMIT, stepBudget } from './step-budget';

/** What the composer (and everything else) sends: plain text, or text plus attachments. */
export type SendInput = string | { text: string; attachments?: AttachmentPart[] };

const UI_TOOL = 'ui__render';
/** After a mid-turn compaction found too little to summarise, the context grows at least this much before the next try. */
const RETRY_GROWTH = 8_000;

/** One reply streams at a time per session; replies in different sessions may overlap. */
const controllers = new Map<string, AbortController>();
const turns = new Map<string, Promise<void>>();
/** Sessions whose auto title was already requested this run. */
const titled = new Set<string>();

function appendPart(sid: string, messageId: string, part: ChatPart) {
  sessionStore.updateMessage(sid, messageId, (m) => ({ ...m, parts: [...m.parts, part] }));
}

function appendText(sid: string, messageId: string, kind: 'text' | 'reasoning', delta: string) {
  const now = Date.now();
  sessionStore.updateMessage(sid, messageId, (m) => {
    const last = m.parts[m.parts.length - 1];
    if (last && last.type === kind) {
      // Thinking is timed from its first delta to its latest one (the UI's "思考了 Ns").
      const next = last.type === 'reasoning' ? { ...last, text: last.text + delta, ms: now - (last.startedAt ?? now) } : { ...last, text: last.text + delta };
      return { ...m, parts: [...m.parts.slice(0, -1), next] };
    }
    const part: ChatPart = kind === 'reasoning' ? { type: 'reasoning', text: delta, startedAt: now, ms: 0 } : { type: 'text', text: delta };
    return { ...m, parts: [...m.parts, part] };
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
  registerRunCancellation(signal, () => controller.abort());

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
  // Taint gate (§5.7): set once the agent reads third-party content in this turn; memory saved
  // after that waits for the user's approval.
  // acceptsImages: a tool may show this model an image (Copilot's opt-in screenshots, tool-images.ts).
  const taint = { sessionId: sid, tainted: false, userAsked: asksToRemember(text), acceptsImages: acceptsImages(providerId, modelName) };

  // Finished steps of the whole turn and their tools, counted as each step ends, so the step
  // budget spans every segment (a mid-turn compaction or an overflow retry starts a new one).
  const turnTools: string[] = [];
  let turnSteps = 0;
  // Over the context budget after a step that called tools: stop, compact, continue (§5.3).
  let overBudget = false;
  let lastSize = 0;
  // A mid-turn compaction that achieved nothing is retried only once the context grew further.
  let retryAbove = 0;

  const streamOnce = async (history: ModelMessage[]) => {
    produced = [];
    partial = '';
    overBudget = false;
    const budget = contextBudget(sid);
    // What earlier segments of this turn already used.
    const earlierSteps = turnSteps;
    const earlierTools = [...turnTools];
    let startedSteps = 0;
    let finishedSteps = 0;
    const toolStart = new Map<string, number>();
    const toolMs = new Map<string, number>();
    // The conversation's prefix (system → tools → history), shared with title and summary requests.
    // Images tools hand the model live only in this request, never in `produced` (tool-images.ts).
    const images = new ToolImages();
    const prefix = await requestPrefix(history, { signal, turn: taint, images });
    const toolLimits = agentToolStepLimits(Object.keys(prefix.tools ?? {}));
    let stepLimit = DEFAULT_STEP_LIMIT;
    const result = streamText({
      model: model!,
      ...prefix,
      stopWhen: ({ steps }) => {
        const tools = steps.flatMap((step) => step.toolCalls.map((call) => call.toolName));
        stepLimit = stepBudget([...earlierTools, ...tools], toolLimits);
        if (earlierSteps + steps.length >= stepLimit) return true;
        // The next request resends this prompt plus the step's output: past the budget, compact first.
        const last = steps.at(-1);
        const size = (last?.usage.inputTokens ?? 0) + (last?.usage.outputTokens ?? 0);
        if (last?.toolCalls.length && size > Math.max(budget, retryAbove)) {
          lastSize = size;
          overBudget = true;
          return true;
        }
        return false;
      },
      abortSignal: signal,
      prepareStep: ({ messages }) => {
        const next = images.prepare(messages);
        return next ? { messages: next } : undefined;
      },
      onStepEnd: (step) => {
        finishedSteps++;
        turnSteps++;
        turnTools.push(...step.toolCalls.map((call) => call.toolName));
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
    if (!signal.aborted && !overBudget && earlierSteps + finishedSteps >= stepLimit) {
      const last = produced.at(-1);
      if (last?.role === 'tool') sessions.notice(tr('chat.agent.stepLimit'), 'warn', { sessionId: sid });
    }
  };

  // Finished steps become session history now (instead of at the end of the turn), so a
  // compaction can include them.
  const commitProduced = (id: string) => {
    const cur = sessionStore.get(id);
    if (cur && produced.length) sessionStore.patch(id, { history: [...cur.history, ...produced] });
    produced = [];
    partial = '';
  };

  try {
    // Plugin request context (memory, …) travels with the user message in the model-visible,
    // logged history; the chat UI shows only what the user typed.
    const latest = sessionStore.get(sid);
    if (!latest) return;
    // Knows what the model already saw, so it appends only new facts (assembly.ts).
    const context = await gatherContext(text, latest.history);
    const body = userText(text, attachments);
    const typed = context ? `<context>\n${context}\n</context>\n\n${body}` : body;
    sessionStore.patch(sid, { history: [...latest.history, { role: 'user', content: userContent(typed, attachments) }] });
    model = await modelFor(providerId, modelName);
    await maybeCompact(sid);
    if (signal.aborted) throw signal.reason;
    let overflowRetried = false;
    for (;;) {
      try {
        await streamOnce(sessionStore.get(sid)?.history ?? []);
      } catch (e) {
        if (signal.aborted || overflowRetried || !isContextOverflowError(e)) throw e;
        overflowRetried = true;
        // Overflow (§5.4 step 4): keep the finished steps, compact (inside this turn if it is the
        // big part), and continue once from there.
        commitProduced(sid);
        if (!(await compactInTurn(sid, { overflowed: true })) && !(await compactForOverflow(sid))) throw e;
        continue;
      }
      if (!overBudget || signal.aborted) break;
      // Long turn (a Copilot task, say): fold its older steps into a summary, then go on.
      commitProduced(sid);
      // The provider measured it over the budget: no second guess from the estimate.
      if (!(await compactInTurn(sid, { force: true }))) retryAbove = lastSize + Math.max(RETRY_GROWTH, Math.floor(contextBudget(sid) * 0.1));
      if (signal.aborted) throw signal.reason;
    }
  } catch (e) {
    if (signal.aborted) ended = 'stopped';
    else {
      ended = 'error';
      error = e instanceof Error ? e.message : String(e);
    }
  } finally {
    if (signal.aborted) ended = 'stopped';
    await releaseRunResources(signal);
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
  const terminalToolLabel = t.ended === 'stopped' ? tr('chat.reply.stopped')
    : t.error ?? tr(t.ended === 'interrupted' ? 'chat.reply.interrupted' : 'chat.reply.error');
  sessionStore.updateMessage(sid, assistantId, (m) => ({
    ...m,
    parts: t.ended ? settleRunningTools(m.parts, terminalToolLabel) : m.parts,
    meta: { ...t.turn, durationMs: Date.now() - t.started, ...(t.ended ? { ended: t.ended } : null) },
  }));
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
  // A turn that ended over the budget (a long task stopped at its step limit, say) is compacted
  // now, not when the next message is sent.
  void compactIfIdle(sid);

  if (t.ended === 'stopped') return;
  const meta = sessionStore.meta(sid);
  if (sid !== sessionStore.activeId()) sessionStore.setMeta(sid, { unread: true });
  if (AppState.currentState !== 'active') {
    const reply = textOf(sessionStore.get(sid)?.messages.find((m) => m.id === assistantId));
    notifyNow({
      title: tr(t.ended === 'error' ? 'chat.agent.notifyError' : 'chat.agent.notifyDone', { title: meta?.title ?? tr('chat.agent.untitled') }),
      body: t.error ?? (clip(plainText(reply), 80) || undefined),
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

/**
 * Compact an idle session that is over its context budget, in the background: on opening an
 * older chat and at the end of a turn, so the meter never sits over the budget. Under the budget
 * it costs nothing (the threshold check runs first); a reply starting meanwhile shares the job.
 */
export async function compactIfIdle(sid: string) {
  await sessionStore.ensure(sid);
  const s = sessionStore.get(sid);
  if (!s || s.status === 'streaming' || controllers.has(sid)) return;
  // `turn` mode may cut inside the last turn: the chat's bulk is often one long finished task.
  await compactInTurn(sid);
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
