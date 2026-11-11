/**
 * Expo reports a native exception as "Call to function 'Module.fn' has been rejected.
 * → Caused by: <reason>": the user and the agent only need the reason.
 */
export function nativeReason(message: string): string {
  const cause = /→ Caused by: ([\s\S]+)$/.exec(message)?.[1]?.trim();
  if (cause) return cause;
  return message.replace(/^Call to function '[^']+' has been rejected\.?\s*/, '').trim() || message;
}
