/** Usage record types (docs/AGENT-HARNESS.md §6.1). Re-exported by `./index`. */
export type ToolCallUsage = { toolId: string; pluginId: string; ok: boolean; ms?: number };

export type UsagePurpose = 'chat' | 'compaction' | 'title' | 'scheduler';

/** One model request (a step of a turn). */
export type UsageStep = {
  at: number;
  sessionId: string;
  providerId: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  durationMs: number;
  tools: ToolCallUsage[];
  /** 'chat' | 'compaction' | 'title' | 'scheduler' — what the request was for. */
  purpose: UsagePurpose;
  /**
   * Optional (addition): id shared by the steps of one user turn (e.g. the assistant message id).
   * Turn counts use it; without it, the last step of a turn (a step with no tool calls) counts.
   */
  turnId?: string;
};
