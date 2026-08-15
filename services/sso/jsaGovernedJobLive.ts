/**
 * Live resolve of the governed job snapshot. Screens only.
 * Isolation / Auth stay on existing helpers. No remint, complete, persist.
 */
import {
  applyGovernedJobHandoff,
  decideGovernedJobPopulate,
  type GovernedJobHandoff,
  type GovernedJobPopulate,
} from './jsaGovernedJobFields';

export async function resolveGovernedJobHandoff(input?: {
  wellsParam?: string;
  wellNameParam?: string;
  jobActivityParam?: string;
}): Promise<{
  populate: GovernedJobPopulate;
  handoff: GovernedJobHandoff;
  hasLaunch: boolean;
}> {
  const { loadLaunchContext, loadRequestContext, loadGovernedTerminalFailure } =
    await import('./jsaRuntime');
  const { terminalFailureMatches } = await import('./jsaGovernedAuth');
  const launch = await loadLaunchContext();
  const ctx = await loadRequestContext();
  const marker = await loadGovernedTerminalFailure();
  const failed = terminalFailureMatches(marker, launch?.requestId ?? null);
  const populate = decideGovernedJobPopulate({
    launchRequestId: launch?.requestId,
    context: ctx,
    explicitFailure: failed,
  });
  const handoff = applyGovernedJobHandoff({
    populate,
    wellsParam: input?.wellsParam || '[]',
    wellNameParam: input?.wellNameParam || '',
    jobActivityParam: input?.jobActivityParam || '',
  });
  return { populate, handoff, hasLaunch: !!launch };
}
