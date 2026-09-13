import type { GovernedStartupState } from './jsaIdentityStartupContract';

export type SuiteCardEntryDecision = 'authorize' | 'fail_closed';

export function decideSuiteCardEntry(state: GovernedStartupState): SuiteCardEntryDecision {
  // A valid JSA session identifies its previous owner, not necessarily the
  // person currently signed into Suite on a shared phone. Suite must vouch
  // for every Suite-card entry; URL name/hash hints are never proof.
  if (state === 'usable' || state === 'standalone') return 'authorize';
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
