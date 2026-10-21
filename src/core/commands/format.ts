/**
 * Pure text helpers for built-in commands (notices, /export). See format.test.ts.
 */
import type { ChatMessage } from '@/core/agent/session/chat-store';

/** 980 → '980', 18_200 → '18.2k', 1_250_000 → '1.3M'. */
export function formatTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${trim1(n / 1000)}k`;
  return `${trim1(n / 1_000_000)}M`;
}

function trim1(x: number): string {
  return (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

/** Visible text of a message (text parts only), blank-line separated. */
export function messageText(m: ChatMessage): string {
  return m.parts
    .map((p) => (p.type === 'text' ? p.text.trim() : ''))
    .filter(Boolean)
    .join('\n\n');
}

/** Text of the latest assistant reply that has any, or null. */
export function lastReplyText(messages: readonly ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    const text = messageText(m);
    if (text) return text;
  }
  return null;
}

/**
 * The session as Markdown for /export: user and assistant text, tool calls as list items,
 * attachments by name. UI-only events (notices, compaction markers) are skipped.
 */
export function sessionMarkdown(title: string, messages: readonly ChatMessage[], toolTitle: (toolId: string) => string = (id) => id): string {
  const out: string[] = [`# ${title}`];
  for (const m of messages) {
    if (m.role === 'event') continue;
    const lines: string[] = [];
    for (const p of m.parts) {
      if (p.type === 'text' && p.text.trim()) lines.push(p.text.trim());
      else if (p.type === 'tool') lines.push(`- 调用 ${toolTitle(p.toolId)}${p.status === 'error' ? '（失败）' : ''}`);
      else if (p.type === 'attachment') lines.push(`- 附件：${p.name}`);
    }
    if (!lines.length) continue;
    // Keep consecutive tool list items together, separate prose blocks with a blank line.
    const body = lines.reduce((acc, line, i) => (i === 0 ? line : `${acc}${line.startsWith('- ') && lines[i - 1].startsWith('- ') ? '\n' : '\n\n'}${line}`), '');
    out.push(`## ${m.role === 'user' ? '我' : '助手'}\n\n${body}`);
  }
  return `${out.join('\n\n')}\n`;
}
