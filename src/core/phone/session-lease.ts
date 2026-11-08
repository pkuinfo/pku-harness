import { registerRunResource } from '../runtime/run-resources';

/** A user-opened phone session can be claimed by only one agent run. */
export class PhoneSessionLease {
  private owners = new Map<string, { signal: AbortSignal; unregister: () => void }>();

  constructor(
    private readonly close: (id: string) => Promise<void>,
    private readonly finish?: (id: string, signal: AbortSignal) => Promise<void>,
  ) {}

  claim(id: string, signal?: AbortSignal) {
    if (!signal) return; // Direct user operations remain available during a run.
    signal.throwIfAborted();
    this.assertOwner(id, signal);
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

  async end(id: string, signal?: AbortSignal) {
    this.assertOwner(id, signal);
    const owner = this.owners.get(id);
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
