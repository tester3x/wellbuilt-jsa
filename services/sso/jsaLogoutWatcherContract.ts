export interface LogoutWatcherBinding { uid: string; driverId: string; companyId: string; }
export interface BoundLogoutBaseline extends LogoutWatcherBinding { value: number | null; generation?: string; }

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

export function parseBoundLogoutBaseline(raw: string | null, bound: LogoutWatcherBinding): BoundLogoutBaseline | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<BoundLogoutBaseline>;
    if (!watcherBindingMatches(bound, value as LogoutWatcherBinding)) return null;
    if (value.value !== null && (typeof value.value !== 'number' || !Number.isFinite(value.value))) return null;
    return { ...bound, value: value.value ?? null,
      ...(typeof value.generation === 'string' && value.generation ? { generation: value.generation } : {}) };
  } catch { return null; }
}

export function serializeBoundLogoutBaseline(baseline: BoundLogoutBaseline): string {
  return JSON.stringify(baseline);
}

export function decideLogoutSignal(baseline: number | null, signal: unknown):
  | { kind: 'none' }
  | { kind: 'initialize'; value: number }
  | { kind: 'logout_required' } {
  if (typeof signal !== 'number' || !Number.isFinite(signal)) return { kind: 'none' };
  if (baseline === null) return { kind: 'initialize', value: signal };
  if (signal > baseline) return { kind: 'logout_required' };
  return { kind: 'none' };
}

export function createLatestValueDrain<T>(process: (value: T) => Promise<void>) {
  let stopped = false;
  let running = false;
  let pending = false;
  let latest!: T;
  const drain = async () => {
    if (running || stopped) return;
    running = true;
    try {
      while (!stopped && pending) {
        const value = latest;
        pending = false;
        await process(value);
      }
    } finally { running = false; }
  };
  return {
    push(value: T) { if (stopped) return; latest = value; pending = true; void drain(); },
    stop() { stopped = true; pending = false; },
  };
}

export function createWatcherMountCoordinator<TBinding>() {
  let generation = 0;
  let activeStop: (() => void) | null = null;
  let activeBinding: TBinding | null = null;
  return {
    async activate(binding: TBinding, start: (binding: TBinding) => Promise<() => void>): Promise<boolean> {
      const mine = ++generation;
      activeStop?.(); activeStop = null; activeBinding = null;
      const stop = await start(binding);
      if (mine !== generation) { stop(); return false; }
      activeStop = stop; activeBinding = binding;
      return true;
    },
    dispose() { generation++; activeStop?.(); activeStop = null; activeBinding = null; },
    binding() { return activeBinding; },
  };
}
