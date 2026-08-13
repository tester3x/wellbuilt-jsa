/**
 * Direct-icon and cold-start bootstrap. Governed failure never becomes
 * legacy login. Icon launch starts Suite authorize automatically.
 */
export type BootstrapDecision =
  | { action: 'resume_session' }
  | { action: 'open_suite_authorize' }
  | { action: 'handle_callback' }
  | { action: 'handle_launch'; refuseLegacy: boolean }
  | { action: 'fail_closed' };

export function decideBootstrap(input: {
  hasPersistedSession: boolean;
  incomingUrl: string | null;
  isCallback: boolean;
  isLaunch: boolean;
  isLegacyLaunch: boolean;
  isDirectIcon: boolean;
}): BootstrapDecision {
  if (input.isLegacyLaunch) return { action: 'handle_launch', refuseLegacy: true };
  if (input.isCallback) return { action: 'handle_callback' };
  if (input.isLaunch) return { action: 'handle_launch', refuseLegacy: false };
  if (input.hasPersistedSession) return { action: 'resume_session' };
  if (input.isDirectIcon || !input.incomingUrl) return { action: 'open_suite_authorize' };
  return { action: 'fail_closed' };
}

export function mayShowLegacyLogin(input: {
  governed: boolean;
  bootstrap: BootstrapDecision;
}): boolean {
  if (input.governed) return false;
  if (input.bootstrap.action !== 'fail_closed' && input.bootstrap.action !== 'resume_session') {
    return false;
  }
  return false;
}
