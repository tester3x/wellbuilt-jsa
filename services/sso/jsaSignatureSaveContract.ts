export interface GovernedSignatureSaveOps {
  persist(signature: string): Promise<void>;
  commit(signature: string): void;
  reportFailure(): void;
}

export async function saveGovernedSignatureAfterConfirmation(
  signature: string,
  ops: GovernedSignatureSaveOps,
): Promise<boolean> {
  try {
    await ops.persist(signature);
    ops.commit(signature);
    return true;
  } catch {
    ops.reportFailure();
    return false;
  }
}

export function runSignatureSaveSingleFlight(
  holder: { current: Promise<boolean> | null },
  run: () => Promise<boolean>,
  settled?: () => void,
): Promise<boolean> {
  if (holder.current) return holder.current;
  const operation = run();
  const shared = operation.finally(() => {
    if (holder.current === shared) holder.current = null;
    settled?.();
  });
  holder.current = shared;
  return shared;
}
