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

/** Built-ins in menu order; `listCommands` appends plugin commands. `/help` reads the full list lazily. */
export function builtinCommands(all: () => Command[]): Command[] {
  return [
    // 会话
    {
      name: 'new',
      icon: 'plus',
      aliases: ['新对话'],
      description: '开始新对话',
      group: 'session',
      run: async () => {
        await sessions.create();
        return done();
      },
    },
    { name: 'sessions', icon: 'chat', aliases: ['会话', '历史'], description: '查看全部对话', group: 'session', run: go('/sessions') },
    {
      name: 'rename',
      icon: 'edit',
      aliases: ['重命名'],
      description: '重命名当前对话',
      argHint: '新标题',
      group: 'session',
      run: async (input, ctx) => {
        const title = input.split('\n')[0].trim().slice(0, 40);
        if (!title) {
          ctx.setDraft('/rename ');
          return done('在 /rename 后输入新标题，或点顶部标题重命名');
        }
        await sessions.rename(ctx.sessionId, title);
        return done(`已重命名为「${title}」`, 'success');
      },
    },
    {
      name: 'retry',
      icon: 'refresh',
      aliases: ['重新生成'],
      description: '重新生成上一条回复',
      group: 'session',
      idleOnly: true,
      run: (_input, ctx) => {
        if (!messagesOf(ctx.sessionId).some((m) => m.role === 'user')) return done('还没有可以重新生成的回复');
        // Streams for a while; the reply itself is the feedback.
        void regenerateLast();
        return done();
      },
    },
    {
      name: 'copy',
      icon: 'copy',
      aliases: ['复制'],
      description: '复制上一条回复',
      group: 'session',
      run: async (_input, ctx) => {
        const text = lastReplyText(messagesOf(ctx.sessionId));
        if (!text) return done('还没有可以复制的回复');
        await Clipboard.setStringAsync(text);
        return done('已复制', 'success');
      },
    },
    {
      name: 'export',
      icon: 'share',
      aliases: ['导出'],
      description: '把对话导出为 Markdown 分享',
      group: 'session',
      run: async (_input, ctx) => {
        const messages = messagesOf(ctx.sessionId);
        if (!messages.some((m) => m.role !== 'event')) return done('这个对话还是空的');
        const meta = sessions.get(ctx.sessionId);
        const title = meta?.title || meta?.preview || '对话';
        const toolTitle = (id: string) => registry.tool(id)?.def.title ?? id;
        const markdown = sessionMarkdown(title, messages, toolTitle);
        try {
          await Share.share({ title, message: markdown }, { dialogTitle: '导出对话', subject: title });
          return done();
        } catch (e) {
          return done(`导出失败：${e instanceof Error ? e.message : String(e)}`, 'error');
        }
      },
    },

    // 上下文
    {
      name: 'compact',
      icon: 'compress',
      aliases: ['压缩'],
      description: '压缩较早的对话，腾出上下文',
      group: 'context',
      idleOnly: true,
      run: async (_input, ctx) => {
        const r = await compactNow(ctx.sessionId);
        if (!r) return done('还没有可以压缩的内容');
        return done(`已压缩 ${r.compactedMessages} 条消息 · ${formatTokens(r.tokensBefore)} → ${formatTokens(r.tokensAfter)} tokens`, 'success');
      },
    },
    { name: 'context', icon: 'gauge', aliases: ['上下文'], description: '查看上下文占用', group: 'context', run: go('/context') },
    { name: 'model', icon: 'sparkles', aliases: ['模型'], description: '切换模型', group: 'context', run: go('/model-picker') },
    { name: 'memory', icon: 'bolt', aliases: ['记忆'], description: '查看 AI 记住了什么', group: 'context', run: go('/p/memory/memory') },

    // 应用
    { name: 'usage', icon: 'chart', aliases: ['用量', '统计'], description: '查看 token 用量', group: 'app', run: go('/usage') },
    { name: 'tasks', icon: 'alarm', aliases: ['任务', '提醒'], description: '查看定时任务和提醒', group: 'app', run: go('/schedule') },
    { name: 'plugins', icon: 'puzzle', aliases: ['插件'], description: '管理插件', group: 'app', run: go('/plugins') },
    {
      name: 'help',
      icon: 'help',
      aliases: ['帮助'],
      description: '列出所有命令',
      group: 'app',
      run: () => done(['可用命令：', ...all().map((c) => `/${c.name}${c.aliases[0] ? `（${c.aliases[0]}）` : ''} · ${c.description}`)].join('\n')),
    },
  ];
}
