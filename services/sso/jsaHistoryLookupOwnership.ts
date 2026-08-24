export interface GovernedHistoryLookupOwner {
  sessionGeneration: string | null;
  uid: string | null;
  driverId: string | null;
  companyId: string | null;
  shiftId: string | null;
  requestSequence: number;
}

export interface HistoryLookupOwnership {
  reserve(): number;
  bind(sequence: number, binding: Omit<GovernedHistoryLookupOwner, 'requestSequence'>): GovernedHistoryLookupOwner | null;
  isSequenceCurrent(sequence: number): boolean;
  isCurrent(owner: GovernedHistoryLookupOwner): boolean;
  publish(owner: GovernedHistoryLookupOwner, mutation: () => void): boolean;
  invalidate(): void;
}

function sameOwner(a: GovernedHistoryLookupOwner, b: GovernedHistoryLookupOwner): boolean {
  return a.requestSequence === b.requestSequence
    && a.sessionGeneration === b.sessionGeneration
    && a.uid === b.uid
    && a.driverId === b.driverId
    && a.companyId === b.companyId
    && a.shiftId === b.shiftId;
}

/** Latest-exact-owner publication gate shared by the live screen and deferred race tests. */
export function createHistoryLookupOwnership(): HistoryLookupOwnership {
  let sequence = 0;
  let active: GovernedHistoryLookupOwner | null = null;
  return {
    reserve() {
      active = null;
      return ++sequence;
    },
    bind(candidate, binding) {
      if (candidate !== sequence) return null;
      active = { ...binding, requestSequence: candidate };
      return active;
    },
    isSequenceCurrent(candidate) {
      return candidate === sequence;
    },
    isCurrent(owner) {
      return !!active && owner.requestSequence === sequence && sameOwner(active, owner);
    },
    publish(owner, mutation) {
      if (!this.isCurrent(owner)) return false;
      mutation();
      return true;
    },
    invalidate() {
      active = null;
      sequence++;
    },
  };
}

export async function awaitLatestHistoryStep<T>(
  ownership: HistoryLookupOwnership,
  sequence: number,
  pending: Promise<T>,
): Promise<{ current: true; value: T } | { current: false }> {
  const value = await pending;
  return ownership.isSequenceCurrent(sequence) ? { current: true, value } : { current: false };
}

export async function awaitCurrentHistoryOwner<T>(
  ownership: HistoryLookupOwnership,
  owner: GovernedHistoryLookupOwner,
  pending: Promise<T>,
): Promise<{ current: true; value: T } | { current: false }> {
  const value = await pending;
  return ownership.isCurrent(owner) ? { current: true, value } : { current: false };
}

export async function publishCurrentHistoryResult<T>(
  ownership: HistoryLookupOwnership,
  owner: GovernedHistoryLookupOwner,
  pending: Promise<T>,
  publication: (value: T) => void,
): Promise<boolean> {
  const settled = await awaitCurrentHistoryOwner(ownership, owner, pending);
  return settled.current && ownership.publish(owner, () => publication(settled.value));
}
