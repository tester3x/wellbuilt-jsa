/**
 * Request-bound Job Details fields from a matching protected get.
 * Import-free. Launch hints, autofill, leftover acks, and passcode
 * sessions are never inputs.
 */

export interface GovernedJobContext {
  requestId: string;
  state: string;
  intent: string;
  wellName?: string;
  jobType?: string;
  jobRef?: string;
  groupRef?: string | null;
}

export type GovernedJobPopulate =
  | {
      kind: 'populate';
      wellName: string;
      jobType?: string;
      requestId: string;
      jobRef?: string;
      intent: string;
    }
  | { kind: 'fail_closed'; reason: 'missing_well' | 'terminal' | 'mismatch' | 'no_context' }
  | { kind: 'none'; reason: string };

export function decideGovernedJobPopulate(input: {
  launchRequestId: string | null | undefined;
  context: GovernedJobContext | null | undefined;
  explicitFailure: boolean;
}): GovernedJobPopulate {
  if (input.explicitFailure) return { kind: 'fail_closed', reason: 'terminal' };
  if (!input.launchRequestId) return { kind: 'none', reason: 'no_launch' };
  if (!input.context) return { kind: 'fail_closed', reason: 'no_context' };
  if (input.context.requestId !== input.launchRequestId) {
    return { kind: 'fail_closed', reason: 'mismatch' };
  }
  if (input.context.state === 'completed') return { kind: 'none', reason: 'completed' };
  if (input.context.intent === 'acknowledge') return { kind: 'none', reason: 'acknowledge_only' };
  if (input.context.state !== 'pending') return { kind: 'none', reason: 'not_pending' };
  if (input.context.intent !== 'read' && input.context.intent !== 'read_and_acknowledge') {
    return { kind: 'none', reason: 'not_read_stage' };
  }
  const wellName = typeof input.context.wellName === 'string' ? input.context.wellName.trim() : '';
  if (!wellName) return { kind: 'fail_closed', reason: 'missing_well' };
  const jobType = typeof input.context.jobType === 'string' ? input.context.jobType.trim() : '';
  const jobRef = typeof input.context.jobRef === 'string' && input.context.jobRef.trim()
    ? input.context.jobRef.trim()
    : undefined;
  return {
    kind: 'populate',
    wellName,
    ...(jobType ? { jobType } : {}),
    requestId: input.context.requestId,
    ...(jobRef ? { jobRef } : {}),
    intent: input.context.intent,
  };
}

/** Legacy resume/autofill/day-status/tab wells only when no governed launch. */
export function shouldApplyLegacyJobHydration(hasGovernedLaunch: boolean): boolean {
  return hasGovernedLaunch !== true;
}

/**
 * Frozen job identity for steps/PPE/signoff/local save. Built only from a
 * successful populate. Never includes driver, company, shift, or URL hints.
 */
export interface GovernedJobSnapshot {
  wellName: string;
  jobType?: string;
  wellsJson: string;
  requestId: string;
  jobRef?: string;
  intent: string;
}

export function snapshotFromPopulate(pop: GovernedJobPopulate): GovernedJobSnapshot | null {
  if (pop.kind !== 'populate') return null;
  const well = {
    name: pop.wellName,
    operator: '',
    county: '',
    ...(pop.jobType ? { jobType: pop.jobType } : {}),
  };
  return {
    wellName: pop.wellName,
    ...(pop.jobType ? { jobType: pop.jobType } : {}),
    wellsJson: JSON.stringify([well]),
    requestId: pop.requestId,
    ...(pop.jobRef ? { jobRef: pop.jobRef } : {}),
    intent: pop.intent,
  };
}

export type JobHandoffSource = 'governed_snapshot' | 'nav_params' | 'blocked';

export interface GovernedJobHandoff {
  wells: string;
  wellName: string;
  jobActivityName: string;
  source: JobHandoffSource;
  requestId?: string;
  jobRef?: string;
  intent?: string;
}

/**
 * Authoritative handoff. Matching get snapshot replaces nav-param
 * wells/job identity. Fail-closed never falls back to resume/autofill
 * params. Standalone / no-launch keeps the params.
 */
export function applyGovernedJobHandoff(input: {
  populate: GovernedJobPopulate;
  wellsParam: string;
  wellNameParam: string;
  jobActivityParam: string;
}): GovernedJobHandoff {
  if (input.populate.kind === 'fail_closed') {
    return { wells: '[]', wellName: '', jobActivityName: '', source: 'blocked' };
  }
  const snap = snapshotFromPopulate(input.populate);
  if (!snap) {
    return {
      wells: input.wellsParam || '[]',
      wellName: input.wellNameParam || '',
      jobActivityName: input.jobActivityParam || '',
      source: 'nav_params',
    };
  }
  return {
    wells: snap.wellsJson,
    wellName: snap.wellName,
    jobActivityName: snap.jobType || '',
    source: 'governed_snapshot',
    requestId: snap.requestId,
    ...(snap.jobRef ? { jobRef: snap.jobRef } : {}),
    intent: snap.intent,
  };
}

export function freezeGovernedJobForSave(input: {
  populate: GovernedJobPopulate;
  wells: unknown[];
  wellName: string;
  jobActivityName: string;
}): {
  wells: unknown[];
  wellName: string;
  jobActivityName: string;
  source: JobHandoffSource;
} {
  const handoff = applyGovernedJobHandoff({
    populate: input.populate,
    wellsParam: JSON.stringify(Array.isArray(input.wells) ? input.wells : []),
    wellNameParam: input.wellName,
    jobActivityParam: input.jobActivityName,
  });
  let wells: unknown[] = input.wells;
  if (handoff.source !== 'nav_params') {
    try {
      const parsed = JSON.parse(handoff.wells);
      wells = Array.isArray(parsed) ? parsed : [];
    } catch {
      wells = [];
    }
  }
  return {
    wells,
    wellName: handoff.wellName,
    jobActivityName: handoff.jobActivityName,
    source: handoff.source,
  };
}
