export interface RegistrationPollGuard {
  begin: () => number;
  invalidate: () => void;
  tryStart: (generation: number) => boolean;
  finish: (generation: number) => void;
  isCurrent: (generation: number) => boolean;
}

/**
 * Serializes registration-status checks and makes late responses harmless after
 * the driver leaves the pending screen.
 */
export function createRegistrationPollGuard(): RegistrationPollGuard {
  let generation = 0;
  let inFlight = false;

  return {
    begin() {
      generation += 1;
      inFlight = false;
      return generation;
    },
    invalidate() {
      generation += 1;
      inFlight = false;
    },
    tryStart(candidate) {
      if (candidate !== generation || inFlight) return false;
      inFlight = true;
      return true;
    },
    finish(candidate) {
      if (candidate === generation) inFlight = false;
    },
    isCurrent(candidate) {
      return candidate === generation;
    },
  };
}
