/** Pure process-wide identity mutation coordinator; platform-free for race tests. */
export function createGovernedIdentityMutationCoordinator() {
  let tail: Promise<void> = Promise.resolve();
  let epoch = 0;
  return {
    reserve(): number { return ++epoch; },
    isCurrent(candidate: number): boolean { return candidate === epoch; },
    run<T>(operation: () => Promise<T>): Promise<T> {
      const result = tail.then(operation, operation);
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}
