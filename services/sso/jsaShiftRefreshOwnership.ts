export interface ShiftRefreshOwner {
  sessionGeneration: string | null;
  uid: string | null;
  driverId: string | null;
  companyId: string | null;
  expectedShiftId: string | null;
  historyRequestSequence: number | null;
  requestSequence: number;
}

export function createShiftRefreshOwnership() {
  let sequence = 0;
  let active: ShiftRefreshOwner | null = null;
  return {
    reserve() { active = null; return ++sequence; },
    isSequenceCurrent(candidate: number) { return candidate === sequence; },
    bind(candidate: number, binding: Omit<ShiftRefreshOwner, 'requestSequence'>) {
      if (candidate !== sequence) return null;
      active = { ...binding, requestSequence: candidate };
      return active;
    },
    isCurrent(owner: ShiftRefreshOwner) {
      return !!active && active === owner && owner.requestSequence === sequence;
    },
    invalidate() { active = null; sequence++; },
  };
}

export async function commitOwnedShiftRefresh(
  stillCurrent: () => boolean,
  mutations: Array<() => void | Promise<void>>,
): Promise<boolean> {
  for (const mutation of mutations) {
    if (!stillCurrent()) return false;
    await mutation();
  }
  return stillCurrent();
}
