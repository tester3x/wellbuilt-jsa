const fs = require('fs'), vm = require('vm'), ts = require('typescript'), assert = require('node:assert/strict');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/jsaHistorySummary.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsObject });
const summary = exportsObject.jsaHistorySummary;
const report = { workflow: 'prepared', state: 'saved', date: '2026-11-16', timestamp: '2026-11-16T18:20:00Z', shiftId: null,
  locations: [{ name: 'Hydro Clear', jobType: 'pw' }], wells: [{ name: 'Burger 1', jobType: 'sw' }],
  coveredJobs: [{ wellName: 'Gabriel 1', jobType: 'pw' }, { wellName: 'Burger 1', jobType: 'fw' }],
  additions: [{ location: 'WO Watford', activity: 'Service Work' }], notes: 'Stopped at a second location' };
const before = JSON.stringify(report), s = summary(report);
assert.equal(s.locations.length, 4);
assert.equal(s.activities.length, 3);
assert.ok(s.activities.includes('Production Water') && s.activities.includes('Service Work') && s.activities.includes('Fresh Water'));
assert.ok(s.date.includes('2026') && s.date.includes('16'));
assert.equal(s.shift, 'Off shift'); assert.equal(s.status, 'Signed report');
assert.ok(s.search.includes('wo watford') && s.search.includes('2026-11-16'));
assert.equal(JSON.stringify(report), before, 'history display never changes signed reports');
const legacy = summary({ wellName: '-', jobActivityName: '-', task: '', date: '2026-11-14', locations: ['Hydro Clear', 'hydro clear'] });
assert.equal(legacy.locations.length, 1); assert.equal(legacy.activities.length, 0);
assert.equal(legacy.shift, 'Shift not recorded'); assert.notEqual(legacy.date, '-');
const closed = summary({ ...report, workflow: 'standalone', state: 'closed', closedAt: '2026-11-18T03:14:04Z', shiftId: '2026-11-16_122000' });
assert.equal(closed.status, 'Ended'); assert.equal(closed.shift, 'On shift'); assert.ok(closed.endedAt);
assert.equal(summary({ ...report, workflow: 'standalone', state: 'open' }).status, 'Ongoing');
const sparse = summary({}); assert.equal(sparse.date, ''); assert.equal(sparse.locations.length, 0);
console.log('PASS saved JSA cards: every known location/activity, additions, covered jobs, local search, date-first sparse legacy reports, honest shift/status labels, cross-day end time and immutable signed input.');
