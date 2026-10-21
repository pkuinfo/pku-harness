import { generateText, type LanguageModel } from 'ai';

import { recordStep } from '@/core/usage';
import { t } from '@/i18n';

import { requestPrefix } from '@/core/agent/context/request';

import { sessionStore } from './chat-store';
import { cleanTitle, textOf } from './session-utils';


/**
 * Auto title (§2): after the first assistant reply, one request on the session's own model. It
 * sends the conversation's own prefix (system → tools → history, `requestPrefix`) plus one
 * instruction, so all but the instruction is a cache hit (§5.1). A user
 * rename is never overwritten; failures keep the fallback.
 */
export async function autoTitle(sessionId: string, model: LanguageModel, ids: { providerId: string; model: string }) {
  const meta = sessionStore.meta(sessionId);
  const s = sessionStore.get(sessionId);
  if (!meta || !s || meta.titleSource !== 'fallback') return;
  const user = s.messages.find((m) => m.role === 'user');
  const reply = s.messages.find((m) => m.role === 'assistant' && textOf(m).trim());
  if (!user || !reply || !s.history.length) return;
  const started = Date.now();
  try {
    const prefix = await requestPrefix(s.history, { sideRequest: true });
    const result = await generateText({
      model,
      ...prefix,
      // In the app language, so the title matches the UI around it.
      messages: [...prefix.messages, { role: 'user', content: t('chat.agent.titlePrompt') }],
      // Reasoning models (deepseek-flash) think before answering: a small cap could be spent on
      // reasoning alone and leave an empty title. The title itself stays ≤ 12 characters.
      maxOutputTokens: 512,
    });
    const u = result.usage;
    recordStep({
      at: started,
      sessionId,
      providerId: ids.providerId,
      model: ids.model,
      inputTokens: u.inputTokens ?? 0,
      cachedInputTokens: u.inputTokenDetails?.cacheReadTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      reasoningTokens: u.outputTokenDetails?.reasoningTokens ?? 0,
      durationMs: Date.now() - started,
      tools: [],
      purpose: 'title',
    });
    const title = cleanTitle(result.text);
    if (!title) console.warn('auto title: empty response', result.finishReason);
    // The user may have renamed it while the request ran.
    if (title && sessionStore.meta(sessionId)?.titleSource === 'fallback') sessionStore.setMeta(sessionId, { title, titleSource: 'auto' });
  } catch (e) {
    console.warn('auto title failed', e);
  }
}
