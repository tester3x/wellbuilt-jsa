import type { UnauthRecoveryOutcome } from './jsaGovernedAuth';

export interface IdentityMutationLane {
  reserve(): number;
  isCurrent(epoch: number): boolean;
  run<T>(operation: () => Promise<T>): Promise<T>;
}

/** The complete recovery lifecycle runs as one epoch-owned lane operation. */
export function runSerializedUnauthenticatedRecovery(
  lane: IdentityMutationLane,
  operation: (stillCurrent: () => boolean) => Promise<UnauthRecoveryOutcome>,
): Promise<UnauthRecoveryOutcome> {
  const epoch = lane.reserve();
  return lane.run(async () => {
    const current = () => lane.isCurrent(epoch);
    if (!current()) return 'fail_closed';
    const outcome = await operation(current);
    return current() ? outcome : 'fail_closed';
  });
}
