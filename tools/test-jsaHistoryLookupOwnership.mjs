import { createHistoryLookupOwnership, publishCurrentHistoryResult } from '../services/sso/jsaHistoryLookupOwnership.ts';

let passed = 0; let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); ok ? passed++ : failed++; };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const binding = (suffix, shiftId = '2026-08-23_010203') => ({
  sessionGeneration: `g${suffix}`, uid: `u${suffix}`, driverId: `d${suffix}`,
  companyId: `c${suffix}`, shiftId,
});
async function publishAfter(ownership, owner, pending, state) {
  await publishCurrentHistoryResult(ownership, owner, pending, (result) => {
    state.status = result.kind; state.record = result.record ?? null; state.count++;
  });
}

{
  const ownership = createHistoryLookupOwnership(); const state = { status: 'checking', record: null, count: 0 };
  const heldA = deferred(); const seqA = ownership.reserve(); const ownerA = ownership.bind(seqA, binding('A'));
  const flightA = publishAfter(ownership, ownerA, heldA.promise, state);
  const seqB = ownership.reserve(); const ownerB = ownership.bind(seqB, binding('B'));
  ownership.publish(ownerB, () => { state.status = 'found'; state.record = 'B'; state.count++; });
  heldA.resolve({ kind: 'found', record: 'A' }); await flightA;
  check('held Driver A result cannot publish after Driver B owns history', state.record === 'B' && state.count === 1);
}

{
  const ownership = createHistoryLookupOwnership(); const state = { status: 'checking', record: null, count: 0 };
  const held = deferred(); const standalone = ownership.bind(ownership.reserve(), binding('S', null));
  const stale = publishAfter(ownership, standalone, held.promise, state);
  ownership.bind(ownership.reserve(), binding('G'));
  held.resolve({ kind: 'authoritative_none' }); await stale;
  check('held standalone result cannot publish after governed SSO activation', state.status === 'checking' && state.count === 0);
}

{
  const ownership = createHistoryLookupOwnership(); const state = { status: 'checking', record: null, count: 0 };
  const older = deferred(); const newer = deferred();
  const oldOwner = ownership.bind(ownership.reserve(), binding('A'));
  const oldFlight = publishAfter(ownership, oldOwner, older.promise, state);
  const newOwner = ownership.bind(ownership.reserve(), binding('A'));
  const newFlight = publishAfter(ownership, newOwner, newer.promise, state);
  newer.resolve({ kind: 'found', record: 'newer' }); await newFlight;
  older.resolve({ kind: 'found', record: 'older' }); await oldFlight;
  check('older same-owner completion cannot replace newer lookup', state.record === 'newer' && state.count === 1);
}

{
  const ownership = createHistoryLookupOwnership(); const state = { status: 'checking', record: null, count: 0 };
  const retries = Array.from({ length: 4 }, () => deferred());
  const flights = retries.map((held) => {
    const owner = ownership.bind(ownership.reserve(), binding('A'));
    return publishAfter(ownership, owner, held.promise, state);
  });
  retries.forEach((held, index) => held.resolve({ kind: 'found', record: `retry-${index}` }));
  await Promise.all(flights);
  check('overlapping Retry taps permit only newest publication', state.record === 'retry-3' && state.count === 1);
}

{
  const ownership = createHistoryLookupOwnership(); const state = { status: 'checking', record: null, count: 0 };
  const held = deferred(); const owner = ownership.bind(ownership.reserve(), binding('A'));
  const flight = publishAfter(ownership, owner, held.promise, state);
  ownership.invalidate(); held.resolve({ kind: 'found', record: 'late' }); await flight;
  check('unmount invalidation prevents later state mutation', state.record === null && state.count === 0);
}

console.log(`\nRESULT passed=${passed} failed=${failed} total=${passed + failed}`);
process.exit(failed ? 1 : 0);
