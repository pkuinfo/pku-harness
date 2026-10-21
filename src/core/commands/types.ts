/**
 * CONTRACT (owned by the commands agent; docs/AGENT-HARNESS.md §3).
 */
export type CommandContext = {
  sessionId: string;
  /** Navigate (expo-router href). */
  navigate: (href: string) => void;
  /** Put text back into the composer (e.g. /rename without a name). */
  setDraft: (text: string) => void;
};

export type CommandResult =
  /** Done; optional notice text shown in the chat. */
  | { kind: 'done'; notice?: string; tone?: 'info' | 'success' | 'warn' | 'error' }
  /** Send this as the user's message to the agent (prompt commands). */
  | { kind: 'prompt'; text: string };

export type Command = {
  /** Lowercase /^[a-z][a-z0-9-]*$/ (plugin collisions become 'plugin:name'). */
  name: string;
  /** Chinese/alternative names the menu matches and the parser accepts (/新对话). */
  aliases: string[];
  description: string;
  /** Present when the command takes input: placeholder ghost text after the chip. */
  argHint?: string;
  group: 'session' | 'context' | 'app' | 'plugin';
  /** Icon name (src/components/icon.tsx) for the menu; plugin commands use the plugin's icon. */
  icon?: string;
  /** Owning plugin for plugin commands. */
  pluginId?: string;
  /** Hidden from the menu while a reply streams (e.g. /compact) — still parsed, then refused with a notice. */
  idleOnly?: boolean;
  run: (input: string, ctx: CommandContext) => Promise<CommandResult> | CommandResult;
};
