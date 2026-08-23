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
