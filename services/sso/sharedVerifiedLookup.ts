/** Short-lived, process-only reuse. Identity generations fence both pending
 * lookups and completed values; failures are never retained. */
export function createSharedVerifiedLookup<T>(deps: {
  generation: () => string;
  load: () => Promise<T>;
  now?: () => number;
  maxAgeMs: number;
}) {
  let pending: { generation: string; promise: Promise<T> } | undefined;
  let saved: { generation: string; value: T; until: number } | undefined;
  const now = deps.now ?? Date.now;
  return async function lookup(): Promise<T> {
    const generation = deps.generation();
    if (saved?.generation === generation && now() < saved.until) return saved.value;
    if (pending?.generation === generation) return pending.promise;
    saved = undefined;
    const entry = { generation, promise: Promise.resolve().then(deps.load).then(value => {
      if (deps.generation() !== generation) throw new Error('JSA account changed during verification.');
      saved = { generation, value, until: now() + deps.maxAgeMs };
      return value;
    }).finally(() => { if (pending === entry) pending = undefined; }) };
    pending = entry;
    return entry.promise;
  };
}
