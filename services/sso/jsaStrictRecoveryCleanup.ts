export async function runStrictRecoverySessionCleanup(deps: {
  stillCurrent(): boolean;
  generation: string;
  strictClear(generation: string): Promise<boolean>;
  exhaustOwnedLatch(): Promise<void>;
}): Promise<void> {
  if (!deps.stillCurrent()) throw new Error('superseded');
  try {
    if (!(await deps.strictClear(deps.generation))) throw new Error('strict_session_clear_refused');
  } catch (error) {
    if (deps.stillCurrent()) await deps.exhaustOwnedLatch();
    throw error;
  }
  if (!deps.stillCurrent()) throw new Error('superseded');
}
