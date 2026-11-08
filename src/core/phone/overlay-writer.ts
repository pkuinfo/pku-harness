/** Serialize native writes across hook mounts. A former owner can never clear its replacement. */
export class OverlayWriter {
  private owner: symbol | null = null;
  private writes = Promise.resolve();

  attach(clear: () => Promise<unknown>) {
    const owner = Symbol('overlay owner');
    this.owner = owner;
    let disposed = false;
    let revision = 0;
    let pending = false;
    const update = (write: (current: () => boolean) => Promise<void>) => {
      if (disposed || this.owner !== owner) return this.writes;
      const version = ++revision;
      pending = true;
      const current = () => !disposed && this.owner === owner && revision === version;
      this.writes = this.writes.catch(() => {}).then(async () => {
        if (current()) await write(current);
      }).catch(() => {
        // A later retry must remain possible after a temporary native disconnect.
      }).finally(() => { if (revision === version) pending = false; });
      return this.writes;
    };
    return {
      update,
      retry: (write: (current: () => boolean) => Promise<void>) => pending ? this.writes : update(write),
      dispose: () => {
        disposed = true;
        revision++;
        this.writes = this.writes.catch(() => {}).then(async () => {
          if (this.owner === owner) {
            await clear();
            if (this.owner === owner) this.owner = null;
          }
        }).catch(() => {});
        return this.writes;
      },
    };
  }
}
