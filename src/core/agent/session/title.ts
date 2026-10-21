import { generateText, type LanguageModel } from 'ai';

import { recordStep } from '@/core/usage';

import { sessionStore } from './chat-store';
import { cleanTitle, textOf } from './session-utils';

const PROMPT = '用不超过 12 个汉字概括这段对话的主题，只输出标题，不要标点和引号';

/**
 * Auto title (§2): after the first assistant reply, one cheap request on the session's own model
 * (no tools, ≤ 64 output tokens). A user rename is never overwritten; failures keep the fallback.
 */
export async function autoTitle(sessionId: string, model: LanguageModel, ids: { providerId: string; model: string }) {
  const meta = sessionStore.meta(sessionId);
  const s = sessionStore.get(sessionId);
  if (!meta || !s || meta.titleSource !== 'fallback') return;
  const user = s.messages.find((m) => m.role === 'user');
  const reply = s.messages.find((m) => m.role === 'assistant' && textOf(m).trim());
  if (!user || !reply) return;
  const clip = (t: string, n: number) => ([...t].length > n ? [...t].slice(0, n).join('') + '…' : t);
  const started = Date.now();
  try {
    const result = await generateText({
      model,
      maxOutputTokens: 64,
      messages: [
        { role: 'user', content: clip(textOf(user), 600) },
        { role: 'assistant', content: clip(textOf(reply), 600) },
        { role: 'user', content: PROMPT },
      ],
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
    // The user may have renamed it while the request ran.
    if (title && sessionStore.meta(sessionId)?.titleSource === 'fallback') sessionStore.setMeta(sessionId, { title, titleSource: 'auto' });
  } catch (e) {
    console.warn('auto title failed', e);
  }
}
