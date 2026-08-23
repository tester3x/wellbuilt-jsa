export function createRevisionSignal() {
  let revision = 0;
  const listeners = new Set<(revision: number) => void>();
  return {
    publish() { revision++; for (const listener of listeners) listener(revision); return revision; },
    current() { return revision; },
    subscribe(listener: (revision: number) => void) {
      listeners.add(listener);
      listener(revision);
      return () => listeners.delete(listener);
    },
  };
}
