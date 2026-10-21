/**
 * Built-in slash commands (docs/AGENT-HARNESS.md §3 table). Local: they never reach the model.
 * Routes belong to other screens; we only navigate to their hrefs.
 */
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

import { chatStore } from '@/core/agent/session/chat-store';
import { compactNow } from '@/core/agent/context/compaction';
import { regenerateLast } from '@/core/agent/run';
import { sessions } from '@/core/agent/session/sessions';
import { registry } from '@/core/runtime/registry';
import { toolTitle } from '@/core/runtime/localize';
import { getLocale, t } from '@/i18n';

import { formatTokens, lastReplyText, sessionMarkdown } from './format';
import type { Command, CommandResult } from './types';

const done = (notice?: string, tone?: 'info' | 'success' | 'warn' | 'error'): CommandResult => ({ kind: 'done', notice, tone });

const go = (href: string): Command['run'] => (_input, ctx) => {
  ctx.navigate(href);
  return done();
};

/** Messages of a session. The chat store holds the active session's view. */
function messagesOf(_sessionId: string) {
  return chatStore.get().messages;
}

/**
 * English aliases go first in English, so the menu chip and /help show them; both languages'
 * aliases always parse. Ascii aliases are the English ones.
 */
export const isAsciiAlias = (a: string) => /^[\x21-\x7e]+$/.test(a);
const aliases = (...list: string[]) => (getLocale() === 'en' ? [...list.filter(isAsciiAlias), ...list.filter((a) => !isAsciiAlias(a))] : list);

/**
 * Built-ins in menu order; `listCommands` appends plugin commands. `/help` reads the full list
 * lazily. Strings are read in the current language, so call this again after a language change.
 */
export function builtinCommands(all: () => Command[]): Command[] {
  return [
    // Chat
    {
      name: 'new',
      icon: 'plus',
      aliases: aliases('新对话'),
      description: t('chat.commands.new'),
      group: 'session',
      run: async () => {
        await sessions.create();
        return done();
      },
    },
    { name: 'sessions', icon: 'chat', aliases: aliases('会话', '历史', 'history', 'chats'), description: t('chat.commands.sessions'), group: 'session', run: go('/sessions') },
    {
      name: 'rename',
      icon: 'edit',
      aliases: aliases('重命名', 'title'),
      description: t('chat.commands.rename'),
      argHint: t('chat.commands.renameArg'),
      group: 'session',
      run: async (input, ctx) => {
        const title = input.split('\n')[0].trim().slice(0, 40);
        if (!title) {
          ctx.setDraft('/rename ');
          return done(t('chat.commands.renameHint'));
        }
        await sessions.rename(ctx.sessionId, title);
        return done(t('chat.commands.renamed', { title }), 'success');
      },
    },
    {
      name: 'retry',
      icon: 'refresh',
      aliases: aliases('重新生成', 'regenerate'),
      description: t('chat.commands.retry'),
      group: 'session',
      idleOnly: true,
      run: (_input, ctx) => {
        if (!messagesOf(ctx.sessionId).some((m) => m.role === 'user')) return done(t('chat.commands.nothingToRetry'));
        // Streams for a while; the reply itself is the feedback.
        void regenerateLast();
        return done();
      },
    },
    {
      name: 'copy',
      icon: 'copy',
      aliases: aliases('复制'),
      description: t('chat.commands.copy'),
      group: 'session',
      run: async (_input, ctx) => {
        const text = lastReplyText(messagesOf(ctx.sessionId));
        if (!text) return done(t('chat.commands.nothingToCopy'));
        await Clipboard.setStringAsync(text);
        return done(t('core.common.copied'), 'success');
      },
    },
    {
      name: 'export',
      icon: 'share',
      aliases: aliases('导出', 'share'),
      description: t('chat.commands.export'),
      group: 'session',
      run: async (_input, ctx) => {
        const messages = messagesOf(ctx.sessionId);
        if (!messages.some((m) => m.role !== 'event')) return done(t('chat.commands.exportEmpty'));
        const meta = sessions.get(ctx.sessionId);
        const title = meta?.title || meta?.preview || t('chat.commands.untitled');
        const titleOf = (id: string) => {
          const entry = registry.tool(id);
          return entry ? toolTitle(registry.get(entry.pluginId), entry.name, entry.def.title) : id;
        };
        const markdown = sessionMarkdown(title, messages, titleOf, {
          you: t('chat.commands.mdYou'),
          assistant: t('chat.commands.mdAssistant'),
          tool: (name, failed) => t(failed ? 'chat.commands.mdToolFailed' : 'chat.commands.mdTool', { title: name }),
          attachment: (name) => t('chat.commands.mdAttachment', { name }),
        });
        try {
          await Share.share({ title, message: markdown }, { dialogTitle: t('chat.commands.exportTitle'), subject: title });
          return done();
        } catch (e) {
          return done(t('chat.commands.exportFailed', { error: e instanceof Error ? e.message : String(e) }), 'error');
        }
      },
    },

    // Context
    {
      name: 'compact',
      icon: 'compress',
      aliases: aliases('压缩', 'compress'),
      description: t('chat.commands.compact'),
      group: 'context',
      idleOnly: true,
      run: async (_input, ctx) => {
        const r = await compactNow(ctx.sessionId);
        if (!r) return done(t('chat.context.nothingToCompact'));
        return done(t('chat.message.compacted', { count: r.compactedMessages, before: formatTokens(r.tokensBefore), after: formatTokens(r.tokensAfter) }), 'success');
      },
    },
    { name: 'context', icon: 'gauge', aliases: aliases('上下文'), description: t('chat.commands.context'), group: 'context', run: go('/context') },
    { name: 'model', icon: 'sparkles', aliases: aliases('模型'), description: t('chat.commands.model'), group: 'context', run: go('/model-picker') },
    { name: 'memory', icon: 'bolt', aliases: aliases('记忆'), description: t('chat.commands.memory'), group: 'context', run: go('/p/memory/memory') },

    // App
    { name: 'usage', icon: 'chart', aliases: aliases('用量', '统计', 'stats'), description: t('chat.commands.usage'), group: 'app', run: go('/usage') },
    { name: 'tasks', icon: 'alarm', aliases: aliases('任务', '提醒', 'reminders', 'schedule'), description: t('chat.commands.tasks'), group: 'app', run: go('/schedule') },
    { name: 'plugins', icon: 'puzzle', aliases: aliases('插件'), description: t('chat.commands.plugins'), group: 'app', run: go('/plugins') },
    {
      name: 'help',
      icon: 'help',
      aliases: aliases('帮助', 'commands'),
      description: t('chat.commands.help'),
      group: 'app',
      run: () => {
        const en = getLocale() === 'en';
        const alias = (c: Command) => (en ? c.aliases.find(isAsciiAlias) : c.aliases[0]);
        const line = (c: Command) => {
          const a = alias(c);
          return `/${c.name}${a ? (en ? ` (/${a})` : `（${a}）`) : ''} · ${c.description}`;
        };
        return done([t('chat.commands.helpTitle'), ...all().map(line)].join('\n'));
      },
    },
  ];
}
