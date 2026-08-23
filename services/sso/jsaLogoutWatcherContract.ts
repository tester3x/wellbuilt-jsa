export interface LogoutWatcherBinding { uid: string; driverId: string; companyId: string; }

export function watcherBindingMatches(
  bound: LogoutWatcherBinding,
  current: LogoutWatcherBinding | null,
): boolean {
  return !!current && bound.uid === current.uid && bound.driverId === current.driverId
    && bound.companyId === current.companyId;
}

export function logoutSignalAdvanced(baseline: number | null, signal: unknown): boolean {
  return baseline !== null && typeof signal === 'number' && Number.isFinite(signal) && signal > baseline;
}

export function boundLogoutSignalAdvanced(
  bound: LogoutWatcherBinding,
  current: LogoutWatcherBinding | null,
  baseline: number | null,
  signal: unknown,
): boolean {
  return watcherBindingMatches(bound, current) && logoutSignalAdvanced(baseline, signal);
}

export async function safeLogoutSignalRead(read: () => Promise<boolean>): Promise<boolean> {
  try { return await read(); } catch { return false; }
}
