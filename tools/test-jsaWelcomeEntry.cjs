const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const compile = source => ts.transpileModule(source, {compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
}}).outputText;
const fields = {};
new Function('exports', compile(fs.readFileSync('services/sso/jsaGovernedJobFields.ts', 'utf8')))(fields);
const root = fs.readFileSync('app/_layout.tsx', 'utf8');
const start = root.indexOf('  const maybeShowWelcome = async');
const end = root.indexOf('  const resolveUnauthSurface', start);
assert(start >= 0 && end > start);
const welcomeJs = compile(root.slice(start, end) + '\nexports.run = maybeShowWelcome;');
const owner = {uid: 'owner', generation: 'generation', companyId: 'company', legalName: 'Test Driver'};
const read = {requestId: 'read-1', state: 'pending', intent: 'read', wellName: 'Test Well', jobType: 'Service Work'};
async function welcome(options = {}) {
  const result = {}, exports = {};
  let ownerReads = 0;
  const runtime = {
    loadLaunchContext: async () => options.launch ?? null,
    loadRequestContext: async () => options.context ?? null,
    loadGovernedTerminalFailure: async () => options.failure ?? null,
  };
  const deps = {
    exports,
    require: path => path.endsWith('jsaGovernedAuthLive') ? {
      loadUsableGovernedSession: async () => ++ownerReads > 1 && options.ownerChanged ? {...owner, generation: 'other'} : owner,
    } : path.endsWith('jsaRuntime') ? runtime : path.endsWith('jsaGovernedJobFields') ? fields : {
      standaloneAccess: async () => options.allowed !== false,
    },
    session: owner, pathname: options.pathname || '/',
    terminalFailureMatches: (marker, id) => !!marker && marker.requestId === id,
    welcomeInspectionRef: {current: options.staleInspection ? 2 : 1},
    welcomeKeyRef: {current: options.seen || ''},
    setWelcomeOwner: v => result.owner = v,
    setWelcomeRequestId: v => result.request = v,
    setWelcomeName: v => result.name = v,
    setShowWelcome: v => result.visible = v,
  };
  new Function(...Object.keys(deps), welcomeJs)(...Object.values(deps));
  await exports.run(1);
  return result;
}
const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
// Working trees may use CRLF.
const normalized = home.replace(/\r\n/g, '\n');
const routeStart = normalized.indexOf('  useEffect(() => {\n    if (!welcomeReadRequestId');
const routeEnd = normalized.indexOf('\n  const autoRoutedRef', routeStart);
assert(routeStart >= 0 && routeEnd > routeStart);
const routeJs = compile(normalized.slice(routeStart, routeEnd));
function route(options = {}) {
  const actions = [];
  const deps = {
    useEffect: fn => fn(), welcomeReadRequestId: options.request || 'read-1',
    welcomeReadConsumed: {current: options.consumed || ''},
    hydrationDone: options.hydrated !== false,
    workflowIsolation: {mountForm: options.allowed !== false},
    governedJobPopulate: fields.decideGovernedJobPopulate({launchRequestId: 'read-1', context: options.context || read, explicitFailure: false}),
    applyGovernedJobHandoff: fields.applyGovernedJobHandoff,
    router: {setParams: p => actions.push(['params', p]), push: p => actions.push(['push', p])},
    driverName: 'Test Driver', truckNumber: 'test', date: '2026-01-01',
  };
  new Function(...Object.keys(deps), routeJs)(...Object.values(deps));
  return actions;
}
(async () => {
  assert.deepEqual(await welcome(), {owner: 'owner:generation', request: null, name: 'Test', visible: true});
  const required = {launch: {requestId: 'read-1'}, context: read};
  assert.equal((await welcome(required)).request, 'read-1');
  for (const options of [
    {allowed: false}, {pathname: '/steps'}, {ownerChanged: true}, {staleInspection: true},
    {seen: 'owner:company:standalone'},
    {...required, context: {...read, requestId: 'different'}},
    {...required, failure: {requestId: 'read-1'}},
    {...required, context: {...read, intent: 'acknowledge'}},
    {...required, context: {...read, state: 'completed'}},
    {...required, context: null},
  ]) assert.deepEqual(await welcome(options), {});
  const actions = route();
  assert.equal(actions.length, 2);
  assert.equal(actions[1][1].pathname, '/steps');
  assert.equal(actions[1][1].params.wellName, 'Test Well');
  assert.equal(actions[1][1].params.jobActivityName, 'Service Work');
  for (const options of [{request: 'different'}, {hydrated: false}, {allowed: false},
    {consumed: 'read-1'}, {context: {...read, intent: 'acknowledge'}},
    {context: {...read, state: 'completed'}}]) assert.deepEqual(route(options), []);
  console.log('PASS: actual Welcome callback (12 cases) and request-bound Continue routing (7 cases)');
})().catch(error => {console.error(error); process.exitCode = 1;});

