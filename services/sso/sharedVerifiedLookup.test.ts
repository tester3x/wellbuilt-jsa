import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSharedVerifiedLookup } from './sharedVerifiedLookup';

test('parallel callers and immediate later callers share one lookup, expiry rechecks', async () => {
  let calls = 0, now = 0;
  const read = createSharedVerifiedLookup({ generation: () => 'a', now: () => now, maxAgeMs: 30,
    load: async () => ++calls });
  assert.deepEqual(await Promise.all([read(), read(), read()]), [1, 1, 1]);
  assert.equal(await read(), 1);
  now = 30;
  assert.equal(await read(), 2);
});
test('same-UID auth generation changes reject pending results and never reuse old values', async () => {
  let generation = 'uid/1';
  let resolve!: (v: number) => void;
  let calls = 0;
  const read = createSharedVerifiedLookup({ generation: () => generation, maxAgeMs: 30_000,
    load: () => ++calls === 1 ? new Promise<number>(r => { resolve = r; }) : Promise.resolve(calls) });
  const old = read();
  await Promise.resolve();
  generation = 'uid/2';
  assert.equal(await read(), 2);
  resolve(1);
  await assert.rejects(old, /account changed/);
  assert.equal(await read(), 2);
});
test('failed requests are retryable and logout invalidates completed results', async () => {
  let generation = 'signed-in', calls = 0;
  const read = createSharedVerifiedLookup({ generation: () => generation, maxAgeMs: 30_000,
    load: async () => { if (++calls === 1) throw Error('offline'); return calls; } });
  await assert.rejects(read(), /offline/);
  assert.equal(await read(), 2);
  generation = 'signed-out';
  assert.equal(await read(), 3);
});
