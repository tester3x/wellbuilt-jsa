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
}

export type GovernedJobPopulate =
  | { kind: 'populate'; wellName: string; jobType?: string }
  | { kind: 'fail_closed'; reason: 'missing_well' | 'terminal' }
  | { kind: 'none'; reason: string };

export function decideGovernedJobPopulate(input: {
  launchRequestId: string | null | undefined;
  context: GovernedJobContext | null | undefined;
  explicitFailure: boolean;
}): GovernedJobPopulate {
  if (input.explicitFailure) return { kind: 'fail_closed', reason: 'terminal' };
  if (!input.launchRequestId) return { kind: 'none', reason: 'no_launch' };
  if (!input.context) return { kind: 'none', reason: 'no_context' };
  if (input.context.requestId !== input.launchRequestId) {
    return { kind: 'none', reason: 'mismatch' };
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
  return jobType
    ? { kind: 'populate', wellName, jobType }
    : { kind: 'populate', wellName };
}
