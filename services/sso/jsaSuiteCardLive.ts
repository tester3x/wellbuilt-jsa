/**
 * Compatibility owner for Suite application-grid launches.
 *
 * Released Suite builds still open `jsaapp://login?...`. Identity-bearing
 * query fields are deliberately ignored: the URI is only a signal to start
 * the governed PKCE authorization flow for the JSA audience.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import { buildAuthorizeUrl } from './jsaPkce';
import { inspectGovernedIdentityStartupDetailed } from './jsaIdentityStartupLive';
import {
  governedIdentityEpochIsCurrent,
  reserveGovernedIdentityEpoch,
  runGovernedIdentityMutation,
} from './jsaGovernedAuthLive';
import { mintAttempt } from './jsaRuntime';
import { createSuiteCardSingleFlight, decideSuiteCardEntry } from './jsaSuiteCardContract';

export type SuiteCardAuthorizationResult = 'usable' | 'opened_suite' | 'fail_closed';

let suiteCardFlights = createSuiteCardSingleFlight<SuiteCardAuthorizationResult>();

export function isLegacySuiteCardUrl(url: unknown): boolean {
  return typeof url === 'string' && /^jsaapp:\/\/login(?:[/?#]|$)/i.test(url);
}

export function resetSuiteCardAuthorizationForTests(): void {
  suiteCardFlights = createSuiteCardSingleFlight<SuiteCardAuthorizationResult>();
}

export function beginSuiteCardAuthorization(): Promise<SuiteCardAuthorizationResult> {
  return suiteCardFlights.run(async () => {
    const inspected = await inspectGovernedIdentityStartupDetailed();
    const decision = decideSuiteCardEntry(inspected.state);
    if (decision === 'use_session') return 'usable';
    if (decision === 'fail_closed') return 'fail_closed';

    const epoch = reserveGovernedIdentityEpoch();
    const current = () => governedIdentityEpochIsCurrent(epoch);
    const attempt = await runGovernedIdentityMutation(async () => {
      if (!current()) throw new Error('superseded');
      return mintAttempt({
        randomBytes: (count) => Crypto.getRandomBytesAsync(count),
        sha256Hex: (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
        nowMs: () => Date.now(),
        stillCurrent: current,
      });
    });
    if (!current()) return 'fail_closed';
    await AsyncStorage.setItem('jsa_returnTo', 'wellbuilt-suite');
    if (!current()) return 'fail_closed';
    await Linking.openURL(buildAuthorizeUrl(attempt));
    return current() ? 'opened_suite' : 'fail_closed';
  }).catch(() => 'fail_closed' as const);
}
