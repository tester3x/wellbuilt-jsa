import { createContext, useContext } from 'react';
import { preparedShiftJsa } from './preparedShiftJsa';
import { applyGovernedJobHandoff, type GovernedJobPopulate } from './sso/jsaGovernedJobFields';

export async function resolvePreparedRead(id: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(id)) throw Error('Invalid JSA request. Return to Tickets.');
  const request = await preparedShiftJsa.readRequest(id);
  if (!request) throw Error('This JSA request does not match the current prepared shift.');
  const exact = request.grant.assessments.filter((a: any) => a.packageId === request.job.packageId);
  const candidates = exact.length ? exact : request.grant.assessments.filter((a: any) => a.packageId === null);
  const task = String(request.job.jobType || '').trim().toLowerCase();
  const matches = candidates.filter((a: any) => a.tasks.some((s: string) => s.trim().toLowerCase() === task));
  const applicable = matches.length ? matches : candidates.filter((a: any) => !a.tasks.length);
  if (applicable.length !== 1) throw Error('The required assessment is not prepared unambiguously. Connect to refresh it.');
  const populate: GovernedJobPopulate = { kind: 'populate', requestId: id, wellName: request.job.wellName,
    jobType: request.job.jobType, jobRef: request.job.jobRef, intent: 'read_and_acknowledge' };
  return { request, assessment: applicable[0], populate,
    handoff: applyGovernedJobHandoff({ populate, wellsParam: '[]', wellNameParam: '', jobActivityParam: '' }), hasLaunch: true };
}
export async function recordPreparedRead(id: string, grantId: string, assessmentHash: string, snapshot: Record<string, unknown>) {
  const current = await resolvePreparedRead(id);
  if (current.request.grant.id !== grantId || current.assessment.contentHash !== assessmentHash)
    throw Error('The prepared JSA changed. Reopen this job from Tickets.');
  await preparedShiftJsa.record(current.request.job.jobRef, current.request.job.operator, 'read', {
    assessmentHash, snapshot,
  }, current.request.grant.id);
  void preparedShiftJsa.drain().catch(() => {});
  return 'wellbuilt-tickets://jsa-return?v=1&requestId=' + encodeURIComponent(id) + '&status=completed';
}
export type PreparedReadFlow = {
  params: Record<string, string>; assessment: any; savedDraft?: any;
  resolve(input?: unknown): ReturnType<typeof resolvePreparedRead>;
  navigate(href: { pathname: string; params?: Record<string, any> }): void;
  back(): void;
  submit(snapshot: Record<string, unknown>): Promise<string>;
};
export const PreparedReadContext = createContext<PreparedReadFlow | null>(null);
export const usePreparedRead = () => useContext(PreparedReadContext);
