/** Pure governed manual-login contract. No platform APIs or credential logging. */

export const JSA_MANUAL_LOGIN_AUDIENCE = 'wellbuilt-jsa' as const;

export interface ManualLoginPayload {
  protocolVersion: 1;
  customToken: string;
  uid: string;
  driverId: string;
  companyId: string;
  displayName?: string;
  legalName?: string;
  jsaBinding: {
    shiftState: 'open' | 'none'; periodId?: string; originLocalDate?: string;
    requiresActiveShift: boolean; jsaEnabled: boolean;
  };
}

export type ManualLoginFailureCode =
  | 'invalid_credentials'
  | 'deactivated'
  | 'missing_secure_conversion'
  | 'offline_timeout'
  | 'server_failure'
  | 'binding_mismatch'
  | 'superseded';

export type ManualLoginResult =
  | { ok: true; payload: ManualLoginPayload }
  | { ok: false; code: ManualLoginFailureCode; message: string };

export interface ManualInstallationOwner {
  generation: string;
  uid: string;
  driverId: string;
  companyId: string;
}

const MESSAGES: Record<ManualLoginFailureCode, string> = {
  invalid_credentials: 'Invalid name or passcode.',
  deactivated: 'This account has been deactivated.',
  missing_secure_conversion: 'Secure sign-in is not available for this account. Contact support.',
  offline_timeout: 'Unable to reach WellBuilt. Check your connection and try again.',
  server_failure: 'WellBuilt sign-in is temporarily unavailable. Try again.',
  binding_mismatch: 'Secure sign-in could not verify this JSA session.',
  superseded: 'A newer sign-in attempt replaced this one.',
};

export function manualLoginFailure(code: ManualLoginFailureCode): ManualLoginResult {
  return { ok: false, code, message: MESSAGES[code] };
}

export function parseManualLoginPayload(raw: unknown): ManualLoginResult {
  const o = raw as Record<string, unknown> | null;
  const binding = o?.jsaBinding as Record<string, unknown> | null;
  const common = !!o && typeof o === 'object' && !Array.isArray(o)
    && o.protocolVersion === 1
    && typeof o.customToken === 'string' && !!o.customToken
    && typeof o.uid === 'string' && !!o.uid
    && typeof o.driverId === 'string' && !!o.driverId
    && typeof o.companyId === 'string' && !!o.companyId
    && !!binding && typeof binding === 'object' && !Array.isArray(binding)
    && typeof binding.requiresActiveShift === 'boolean'
    && typeof binding.jsaEnabled === 'boolean';
  if (!common) return manualLoginFailure('binding_mismatch');
  const keys = Object.keys(binding!);
  const validBinding = binding!.shiftState === 'none'
    ? keys.length === 3
    : binding!.shiftState === 'open' && keys.length === 5
      && typeof binding!.periodId === 'string' && /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(binding!.periodId)
      && typeof binding!.originLocalDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(binding!.originLocalDate)
      && binding!.periodId.slice(0, 10) === binding!.originLocalDate;
  if (!validBinding) return manualLoginFailure('binding_mismatch');
  if (o!.displayName !== undefined && typeof o!.displayName !== 'string') return manualLoginFailure('binding_mismatch');
  if (o!.legalName !== undefined && typeof o!.legalName !== 'string') return manualLoginFailure('binding_mismatch');
  return { ok: true, payload: o as unknown as ManualLoginPayload };
}

export function manualInspectionMatches(
  payload: ManualLoginPayload,
  inspection: {
    state: string;
    binding: { uid: string; driverId: string; companyId: string } | null;
    sessionBinding?: ManualLoginPayload['jsaBinding'] | null;
  },
): boolean {
  if (inspection.state !== 'usable' || !inspection.binding || !inspection.sessionBinding) return false;
  const exactIdentity = inspection.binding.uid === payload.uid
    && inspection.binding.driverId === payload.driverId
    && inspection.binding.companyId === payload.companyId;
  const expected = payload.jsaBinding;
  const actual = inspection.sessionBinding;
  return exactIdentity
    && actual.shiftState === expected.shiftState
    && actual.periodId === expected.periodId
    && actual.originLocalDate === expected.originLocalDate
    && actual.requiresActiveShift === expected.requiresActiveShift
    && actual.jsaEnabled === expected.jsaEnabled;
}

function callableCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code.toLowerCase() : '';
}

function callableMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message.toLowerCase() : '';
}

/** Bounded public errors. Unknown-name and bad-passcode are intentionally identical. */
export function classifyManualLoginError(error: unknown): ManualLoginResult {
  const code = callableCode(error);
  const message = callableMessage(error);
  if (message.includes('deactivated')) return manualLoginFailure('deactivated');
  if (message.includes('secure conversion') || message.includes('credential conversion')) {
    return manualLoginFailure('missing_secure_conversion');
  }
  if (code === 'functions/permission-denied' || code === 'permission-denied') {
    return manualLoginFailure('invalid_credentials');
  }
  if (code === 'functions/deadline-exceeded' || code === 'deadline-exceeded'
    || code === 'functions/unavailable' || code === 'unavailable'
    || code === 'functions/cancelled' || code === 'cancelled'
    || message.includes('network') || message.includes('timeout')) {
    return manualLoginFailure('offline_timeout');
  }
  if (code === 'functions/failed-precondition' || code === 'failed-precondition') {
    return manualLoginFailure('missing_secure_conversion');
  }
  return manualLoginFailure('server_failure');
}

export interface AttemptTokenOps {
  randomBytes(count: number): Promise<Uint8Array>;
  sha256(input: string): Promise<string>;
}

function frame(value: string): string { return `${value.length}:${value}`; }

/** Credential equality token: process-keyed, memory-only, never logged or transmitted. */
export function createManualAttemptTokenizer(ops: AttemptTokenOps) {
  let processKey: Promise<string> | null = null;
  const key = () => processKey ??= ops.randomBytes(32).then((bytes) =>
    Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
  return async (displayName: string, passcode: string): Promise<string> => ops.sha256(
    frame(await key()) + frame(displayName.trim().toLowerCase()) + frame(passcode),
  );
}

/**
 * Identical active submissions share one promise. A different submission
 * immediately supersedes the older epoch but is serialized behind its cleanup.
 */
export function createManualLoginCoordinator<T>() {
  let epoch = 0;
  let tail: Promise<void> = Promise.resolve();
  let current: { token: string; promise: Promise<T> } | null = null;
  return {
    run(token: string, task: (stillCurrent: () => boolean) => Promise<T>): Promise<T> {
      if (current?.token === token) return current.promise;
      const mine = ++epoch;
      const execute = tail.then(() => task(() => mine === epoch));
      tail = execute.then(() => undefined, () => undefined);
      const promise = execute.finally(() => {
        if (current?.promise === promise) current = null;
      });
      current = { token, promise };
      return promise;
    },
    isCurrent(candidate: number): boolean { return candidate === epoch; },
  };
}

export async function executeManualLoginAttempt(input: {
  displayName: string;
  passcode: string;
  stillCurrent(): boolean;
}, deps: {
  call(request: { displayName: string; passcode: string; audience: typeof JSA_MANUAL_LOGIN_AUDIENCE }): Promise<unknown>;
  install(payload: ManualLoginPayload, stillCurrent: () => boolean): Promise<ManualInstallationOwner>;
  inspect(payload: ManualLoginPayload, owner: ManualInstallationOwner): Promise<boolean>;
  cleanup(owner: ManualInstallationOwner): Promise<void>;
}): Promise<ManualLoginResult> {
  if (!input.stillCurrent()) return manualLoginFailure('superseded');
  let owner: ManualInstallationOwner | null = null;
  try {
    const raw = await deps.call({
      displayName: input.displayName.trim(),
      passcode: input.passcode,
      audience: JSA_MANUAL_LOGIN_AUDIENCE,
    });
    if (!input.stillCurrent()) return manualLoginFailure('superseded');
    const parsed = parseManualLoginPayload(raw);
    if (!parsed.ok) return parsed;
    owner = await deps.install(parsed.payload, input.stillCurrent);
    if (!input.stillCurrent()) {
      await deps.cleanup(owner);
      return manualLoginFailure('superseded');
    }
    if (!(await deps.inspect(parsed.payload, owner))) {
      await deps.cleanup(owner);
      return manualLoginFailure('binding_mismatch');
    }
    return parsed;
  } catch (error) {
    // A rejected callable created no identity and owns nothing to clean up.
    if (owner) await deps.cleanup(owner);
    return input.stillCurrent()
      ? classifyManualLoginError(error)
      : manualLoginFailure('superseded');
  }
}
