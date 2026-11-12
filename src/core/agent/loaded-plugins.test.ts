import { describe, expect, test } from 'bun:test';
import type { ModelMessage } from 'ai';

import { activeToolNames, loadedPlugins } from './loaded-plugins';

const call = (toolName: string): ModelMessage => ({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c', toolName, input: {} }] });
const used = (loaded: unknown[]): ModelMessage => ({
  role: 'tool',
  content: [{ type: 'tool-result', toolCallId: 'u', toolName: 'plugins__use', output: { type: 'json', value: { loaded } } as never }],
});

describe('loaded plugins', () => {
  test('a fresh chat has only what is always loaded', () => {
    expect([...loadedPlugins([{ role: 'user', content: 'hi' }])]).toEqual([]);
    expect(activeToolNames(['settings__list', 'wallet__cardBalance'], new Set(['settings']), [])).toEqual(['settings__list']);
  });

  test('plugins__use loads the plugins it returned without an error', () => {
    const msgs = [used([{ id: 'wallet', tools: [] }, { id: 'treehole', error: 'Switched off' }])];
    expect([...loadedPlugins(msgs)]).toEqual(['wallet']);
    expect(activeToolNames(['wallet__cardBalance', 'treehole__search', 'plugins__use'], new Set(['plugins']), msgs)).toEqual(['wallet__cardBalance', 'plugins__use']);
  });

  test('calling a tool keeps its plugin loaded (older chats, compaction summaries aside)', () => {
    expect([...loadedPlugins([call('copilot__observe'), call('plugins__use')])]).toEqual(['copilot']);
  });

  test('an on-demand tool of a core plugin waits for plugins__use of its plugin', () => {
    const tools = ['plugins__search', 'plugins__validate'];
    const always = new Set(['plugins']);
    const onDemand = new Set(['plugins__validate']);
    expect(activeToolNames(tools, always, [], onDemand)).toEqual(['plugins__search']);
    // Calling another tool of the plugin is not loading it.
    expect(activeToolNames(tools, always, [call('plugins__search')], onDemand)).toEqual(['plugins__search']);
    expect(activeToolNames(tools, always, [used([{ id: 'plugins', tools: [] }])], onDemand)).toEqual(tools);
    // Once called, it stays offered (the history shows the call).
    expect(activeToolNames(tools, always, [call('plugins__validate')], onDemand)).toEqual(tools);
  });
});
