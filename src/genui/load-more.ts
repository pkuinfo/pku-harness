/** The state the loadMore action reads and writes (json-render's store). */
export type PageStore = { get: (path: string) => unknown; set: (path: string, value: unknown) => void };
export type PageStatus = { page?: number; loading?: boolean; done?: boolean; error?: string | null };

/** Item `key` of a list entry, for skipping what a list already has. */
const keyOf = (item: unknown, key: string) => (item && typeof item === 'object' ? String((item as Record<string, unknown>)[key]) : JSON.stringify(item));
const pathOf = (params: Record<string, unknown>, key: string) => (typeof params[key] === 'string' && String(params[key]).startsWith('/') ? String(params[key]) : null);

/**
 * The catalog's loadMore: the next page of an endless list. Runs the tool with input + { page }
 * (page 2 first: the bound data is page 1), appends result[itemsKey] to listPath, skipping items
 * already shown there or under basePath (new posts at the top shift the pages), and keeps
 * { page, loading, done, error } at statusPath. One page at a time; nothing after done.
 * Returns the list path it grew, or null.
 */
export async function loadMore(store: PageStore, params: Record<string, unknown>, invoke: (tool: string, input: Record<string, unknown>) => Promise<unknown>): Promise<string | null> {
  const listPath = pathOf(params, 'listPath');
  const statusPath = pathOf(params, 'statusPath');
  if (!listPath || !statusPath) return null;
  const first = typeof params.firstPage === 'number' ? params.firstPage : 2;
  const status = (store.get(statusPath) as PageStatus | undefined) ?? {};
  if (status.loading || status.done) return listPath;
  const page = (status.page ?? first - 1) + 1;
  store.set(statusPath, { ...status, loading: true, error: null });
  try {
    const input = { ...((params.input as Record<string, unknown> | null) ?? {}), [String(params.pageKey ?? 'page')]: page };
    const result = (await invoke(String(params.tool), input)) as Record<string, unknown> | null;
    const items = Array.isArray(result?.[String(params.itemsKey)]) ? (result![String(params.itemsKey)] as unknown[]) : [];
    const list = (store.get(listPath) as unknown[] | undefined) ?? [];
    const key = typeof params.key === 'string' ? params.key : null;
    const base = pathOf(params, 'basePath');
    const seen = key ? new Set([...list, ...(((base && store.get(base)) as unknown[] | undefined) ?? [])].map((i) => keyOf(i, key))) : null;
    store.set(listPath, [...list, ...(seen ? items.filter((i) => !seen.has(keyOf(i, key!))) : items)]);
    store.set(statusPath, { page, loading: false, done: items.length === 0, error: null });
  } catch (e) {
    store.set(statusPath, { ...status, loading: false, error: e instanceof Error ? e.message : String(e) });
  }
  return listPath;
}
