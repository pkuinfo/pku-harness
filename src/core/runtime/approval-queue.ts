/** Allow (true), the prompt's remember option ('always'), or Deny (false). */
type Answer = boolean | 'always';

/** UI approval requests stay cancellable while queued and while saving a user's preference. */
export class ApprovalQueue<T extends object> {
  private queue: (T & { id: number })[] = [];
  private pending = new Map<number, { value: T & { id: number }; resolve: (ok: Answer) => void; detach: () => void; answering: boolean }>();
  private listeners = new Set<() => void>();
  private nextId = 1;

  current = () => this.queue[0] ?? null;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  get(id: number) { return this.pending.get(id)?.value; }

  enqueue(value: T, signal?: AbortSignal): Promise<Answer> {
    if (signal?.aborted) return Promise.resolve(false);
    return new Promise((resolve) => {
      const id = this.nextId++;
      const abort = () => this.settle(id, false);
      const entry = { ...value, id };
      this.pending.set(id, { value: entry, resolve, detach: () => signal?.removeEventListener('abort', abort), answering: false });
      signal?.addEventListener('abort', abort, { once: true });
      this.queue = [...this.queue, entry];
      this.emit();
    });
  }

  async answer(id: number, ok: Answer, beforeAccept?: () => Promise<void>): Promise<void> {
    const request = this.pending.get(id);
    if (!request || request.answering) return;
    request.answering = true;
    this.hide(id);
    try {
      if (ok) await beforeAccept?.();
      this.settle(id, ok);
    } catch {
      // A failed preference write must neither grant consent nor strand the waiting run.
      this.settle(id, false);
    }
  }

  private settle(id: number, ok: Answer) {
    const request = this.pending.get(id);
    if (!request) return;
    this.pending.delete(id);
    request.detach();
    this.hide(id);
    request.resolve(ok);
  }
  private hide(id: number) {
    const visible = this.queue.filter((request) => request.id !== id);
    if (visible.length === this.queue.length) return;
    this.queue = visible;
    this.emit();
  }
  private emit() { this.listeners.forEach((listener) => listener()); }
}
