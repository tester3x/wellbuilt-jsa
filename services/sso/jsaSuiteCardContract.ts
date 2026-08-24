import type { GovernedStartupState } from './jsaIdentityStartupContract';

export type SuiteCardEntryDecision = 'use_session' | 'authorize' | 'fail_closed';

export function decideSuiteCardEntry(state: GovernedStartupState): SuiteCardEntryDecision {
  if (state === 'usable') return 'use_session';
  if (state === 'standalone') return 'authorize';
  return 'fail_closed';
}

export function createSuiteCardSingleFlight<T>() {
  let active: Promise<T> | null = null;
  return {
    run(operation: () => Promise<T>): Promise<T> {
      if (active) return active;
      const flight = operation().finally(() => { if (active === flight) active = null; });
      active = flight;
      return flight;
    },
  };
}
