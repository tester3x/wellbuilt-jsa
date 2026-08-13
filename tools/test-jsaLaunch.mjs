/**
 * Governed launch parser + ownership. Legacy hash/name URLs are refused.
 * Run: node --experimental-strip-types tools/test-jsaLaunch.mjs
 */
import {
  buildJsaLaunchUrl, parseJsaLaunchUrl, isLegacyJsaLaunchUrl,
  validateJsaLaunchRequest, buildJsaReturnUrl, parseJsaReturnUrl,
} from '../services/sso/jsaLaunch.ts';
import { takeLaunchOwnership } from '../services/sso/jsaRouteOwnership.ts';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok || !d ? '' : ` — ${d}`}`); };

const RID = 'R'.repeat(43);
const req = {
  v: 1, source: 'wbt', requestId: RID, returnTo: 'wbt',
  jobRef: 'jobDoc1', wellName: 'Well A', jobType: 'Water',
};

const parsed = parseJsaLaunchUrl(buildJsaLaunchUrl(req));
check('round-trip launch', parsed.ok && parsed.value.requestId === RID && parsed.value.jobRef === 'jobDoc1');

check('legacy hash URL refused',
  isLegacyJsaLaunchUrl('jsaapp://start?hash=abc&name=Mike') === true);
check('legacy parse fails closed',
  parseJsaLaunchUrl('jsaapp://start?hash=abc&name=Mike&v=1&source=wbt&requestId=' + RID + '&returnTo=wbt').ok === false);

check('shiftId in launch is forbidden',
  validateJsaLaunchRequest({ ...req, shiftId: '2026-06-24_124631' }).ok === false);

const ret = parseJsaReturnUrl(buildJsaReturnUrl({ v: 1, requestId: RID, status: 'read' }));
check('return is status only', ret.ok && ret.value.status === 'read' && !('receipt' in ret.value));

const first = takeLaunchOwnership(null, req, 1);
const dup = takeLaunchOwnership(first.ownership, req, 2);
const next = takeLaunchOwnership(first.ownership, { ...req, requestId: 'N'.repeat(43) }, 3);
check('first launch owns', first.action === 'own');
check('same requestId is duplicate', dup.action === 'duplicate');
check('new requestId replaces', next.action === 'replace');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
