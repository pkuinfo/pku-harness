/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';

import { McpClient, parseSse } from './client';

describe('parseSse', () => {
  test('extracts JSON-RPC messages from events', () => {
    const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n: keep-alive\n\ndata: {"jsonrpc":"2.0",\ndata: "id":2,"result":{}}\n\n';
    expect(parseSse(body)).toEqual([
      { jsonrpc: '2.0', id: 1, result: { ok: true } },
      { jsonrpc: '2.0', id: 2, result: {} },
    ]);
  });
});

// Integration: MCP_TEST_URL=http://localhost:8787/mcp MCP_TEST_TOKEN=demo-token bun test
const url = process.env.MCP_TEST_URL;
describe.skipIf(!url)('McpClient against a real server', () => {
  const client = () => new McpClient(url!, { Authorization: `Bearer ${process.env.MCP_TEST_TOKEN ?? ''}` });

  test('initialize + tools/list', async () => {
    const c = client();
    const tools = await c.listTools();
    expect(c.server?.name).toBeTruthy();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0].inputSchema).toHaveProperty('type', 'object');
  });

  test('tools/call returns content', async () => {
    const c = client();
    const [first] = await c.listTools();
    const props = Object.keys((first.inputSchema.properties as object) ?? {});
    const args = Object.fromEntries(props.map((p) => [p, '学一']));
    const r = await c.callTool(first.name, args);
    expect(r.content?.length).toBeGreaterThan(0);
  });

  test('rejects without auth', async () => {
    await expect(new McpClient(url!).listTools()).rejects.toThrow(/401/);
  });
});
