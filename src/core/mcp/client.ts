/**
 * Minimal MCP client over Streamable HTTP (spec 2025-06-18): JSON-RPC 2.0 POSTs, responses as
 * `application/json` or a `text/event-stream`, session via `Mcp-Session-Id`. Only what remote
 * plugins need: initialize, tools/list, tools/call. No third-party JavaScript runs on device;
 * remote plugins are data + an endpoint (docs/ARCHITECTURE.md §4).
 */

export const MCP_PROTOCOL_VERSION = '2025-06-18';

export type McpTool = {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean };
};

export type McpServerInfo = { name: string; version?: string; title?: string };

export type McpCallResult = {
  content?: { type: string; text?: string; [k: string]: unknown }[];
  structuredContent?: unknown;
  isError?: boolean;
};

type JsonRpcResponse = { jsonrpc: '2.0'; id?: number | string; result?: unknown; error?: { code: number; message: string } };

/** Pull JSON-RPC messages out of an SSE body ("data: {...}" events). */
export function parseSse(body: string): JsonRpcResponse[] {
  const out: JsonRpcResponse[] = [];
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    try {
      out.push(JSON.parse(data));
    } catch {
      // ignore keep-alives and partial events
    }
  }
  return out;
}

export class McpClient {
  private sessionId: string | null = null;
  private nextId = 1;
  private initialized = false;
  server: McpServerInfo | null = null;
  instructions: string | null = null;

  constructor(
    readonly url: string,
    private readonly headers: Record<string, string> = {},
    /** The app passes `expo/fetch` (streaming); tests use the global fetch. */
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  private async post(body: unknown, signal?: AbortSignal): Promise<{ status: number; messages: JsonRpcResponse[] }> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
        ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : null),
        ...this.headers,
      },
      body: JSON.stringify(body),
      signal,
    });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (res.status === 202) return { status: 202, messages: [] };
    const text = await res.text();
    if (!res.ok) throw new Error(`MCP ${res.status}: ${text.slice(0, 200)}`);
    const type = res.headers.get('content-type') ?? '';
    const messages = type.includes('text/event-stream') ? parseSse(text) : [JSON.parse(text) as JsonRpcResponse];
    return { status: res.status, messages };
  }

  private async request<T>(method: string, params: unknown, signal?: AbortSignal): Promise<T> {
    const id = this.nextId++;
    const { messages } = await this.post({ jsonrpc: '2.0', id, method, params }, signal);
    const msg = messages.find((m) => m.id === id);
    if (!msg) throw new Error(`MCP: no response to ${method}`);
    if (msg.error) throw new Error(`MCP ${method}: ${msg.error.message}`);
    return msg.result as T;
  }

  async connect(signal?: AbortSignal) {
    if (this.initialized) return;
    const result = await this.request<{ serverInfo: McpServerInfo; instructions?: string; protocolVersion: string }>(
      'initialize',
      { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'pku-harness', version: '0.1.0' } },
      signal,
    );
    this.server = result.serverInfo;
    this.instructions = result.instructions ?? null;
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, signal);
    this.initialized = true;
  }

  async listTools(signal?: AbortSignal): Promise<McpTool[]> {
    await this.connect(signal);
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.request<{ tools: McpTool[]; nextCursor?: string }>('tools/list', cursor ? { cursor } : {}, signal);
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    return tools;
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallResult> {
    await this.connect(signal);
    try {
      return await this.request<McpCallResult>('tools/call', { name, arguments: args }, signal);
    } catch (e) {
      // Sessions expire server-side; reconnect once.
      if (String(e).includes('404') && this.sessionId) {
        this.sessionId = null;
        this.initialized = false;
        await this.connect(signal);
        return this.request<McpCallResult>('tools/call', { name, arguments: args }, signal);
      }
      throw e;
    }
  }
}
