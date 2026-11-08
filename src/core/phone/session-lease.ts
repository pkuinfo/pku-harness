import { cancelResourceRun, registerRunResource } from '../runtime/run-resources';

/** A user-opened phone session can be claimed by only one agent run. */
export class PhoneSessionLease {
  private usedSessions = new WeakMap<AbortSignal, string>();
  private owners = new Map<string, { signal: AbortSignal; unregister: () => void }>();

  constructor(
    private readonly close: (id: string) => Promise<void>,
    private readonly finish?: (id: string, signal: AbortSignal) => Promise<void>,
  ) {}

  /** A new user turn can start again; a stopped run cannot silently replace its session. */
  async begin<T extends { sessionId: string }>(open: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    if (signal && this.usedSessions.has(signal)) throw new Error('This phone task has ended. Wait for a new user message before starting another session.');
    const opened = await open();
    try {
      this.claim(opened.sessionId, signal);
      signal?.throwIfAborted();
      return opened;
    } catch (error) {
      await this.close(opened.sessionId);
      throw error;
    }
  }

  claim(id: string, signal?: AbortSignal) {
    if (!signal) return; // Direct user operations remain available during a run.
    signal.throwIfAborted();
    this.assertOwner(id, signal);
    const used = this.usedSessions.get(signal);
    if (used && used !== id) throw new Error('This run cannot replace its earlier phone session. Wait for a new user message.');
    this.usedSessions.set(signal, id);
    if (this.owners.has(id)) return;
    const unregister = registerRunResource(signal, async () => {
      this.assertOwner(id, signal);
      if (this.finish) await this.finish(id, signal);
      else await this.close(id);
      this.releaseOwner(id, signal);
    });
    this.owners.set(id, { signal, unregister });
  }

  private assertOwner(id: string, signal?: AbortSignal) {
    const owner = this.owners.get(id);
    if (signal && owner && owner.signal !== signal) throw new Error('This phone session belongs to another running chat.');
  }

  /** Native Stop is not just a closed display: cancel model work and approval waits too. */
  stopRun(id: string) {
    const owner = this.owners.get(id);
    if (owner) cancelResourceRun(owner.signal);
  }

  async end(id: string, signal?: AbortSignal) {
    this.assertOwner(id, signal);
    const owner = this.owners.get(id);
    if (!signal) this.stopRun(id);
    await this.close(id);
    if (this.owners.get(id) === owner) {
      owner?.unregister();
      this.owners.delete(id);
    }
  }

  private releaseOwner(id: string, signal: AbortSignal) {
    const owner = this.owners.get(id);
    if (owner?.signal === signal) {
      owner.unregister();
      this.owners.delete(id);
    }
  }
}
