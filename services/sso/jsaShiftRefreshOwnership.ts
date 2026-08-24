export interface ShiftRefreshOwner {
  identityEpoch: number;
  sessionGeneration: string | null;
  uid: string | null;
  driverId: string | null;
  companyId: string | null;
  expectedShiftId: string | null;
}

export type ShiftRefreshResult<T> =
  | { kind: 'applied'; value: T; owner: ShiftRefreshOwner }
  | { kind: 'superseded'; owner: ShiftRefreshOwner };

function ownerKey(owner: ShiftRefreshOwner): string {
  return JSON.stringify([
    owner.identityEpoch, owner.sessionGeneration, owner.uid, owner.driverId,
    owner.companyId, owner.expectedShiftId,
  ]);
}

/** Exact-owner coalescing plus one durable commit lane for all identity owners. */
export function createShiftRefreshCoordinator() {
  const flights = new Map<string, Promise<ShiftRefreshResult<unknown>>>();
  let commitTail: Promise<void> = Promise.resolve();
  let invalidation = 0;
  let latestOwnerKey: string | null = null;
  const enqueueCommit = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = commitTail.then(operation, operation);
    commitTail = result.then(() => undefined, () => undefined);
    return result;
  };
  return {
    run<T>(
      owner: ShiftRefreshOwner,
      stillCurrent: () => boolean,
      operation: (commit: <V>(mutation: () => Promise<V>) => Promise<V | undefined>) => Promise<T>,
    ): Promise<ShiftRefreshResult<T>> {
      const key = ownerKey(owner);
      const existing = flights.get(key);
      if (existing) return existing as Promise<ShiftRefreshResult<T>>;
      latestOwnerKey = key;
      const ownerInvalidation = invalidation;
      const ownsCoordinator = () => latestOwnerKey === key && invalidation === ownerInvalidation;
      const commit = <V>(mutation: () => Promise<V>) => enqueueCommit(async () => {
        if (!ownsCoordinator() || !stillCurrent()) return undefined;
        const value = await mutation();
        return !ownsCoordinator() || !stillCurrent() ? undefined : value;
      });
      const flight = (async (): Promise<ShiftRefreshResult<T>> => {
        if (!ownsCoordinator() || !stillCurrent()) return { kind: 'superseded', owner };
        const value = await operation(commit);
        return !ownsCoordinator() || !stillCurrent() || value === undefined
          ? { kind: 'superseded', owner }
          : { kind: 'applied', value, owner };
      })().finally(() => {
        if (flights.get(key) === flight) flights.delete(key);
      });
      flights.set(key, flight as Promise<ShiftRefreshResult<unknown>>);
      return flight;
    },
    invalidate() { invalidation++; latestOwnerKey = null; flights.clear(); },
  };
}

export function consumerOwnsShiftResult(
  result: ShiftRefreshResult<unknown>,
  current: { identityEpoch: number; sessionGeneration: string | null },
): boolean {
  return result.kind === 'applied'
    && result.owner.identityEpoch === current.identityEpoch
    && result.owner.sessionGeneration === current.sessionGeneration;
}
