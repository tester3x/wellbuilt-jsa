# JSA company join-code registration handoff — 2026-09-17

## Source checkpoint

- Repository: `C:\dev\JSA`
- Branch: `feat/jsa-register-join-code-20260917`
- Exact base: `98793adcca673eb2e9413d24edcb037e4bf72a72`
- Source commit: `4837568f50953f3c4a0c7f9b9374bd9f2d698629`
- Scope: source and tests only

## Result

- Register Here collects display name, optional legal name, company join code, and passcode.
- Join codes uppercase while typed and keep separators such as `ABCD-2345` for server normalization.
- `requestDriverRegistration` receives exactly `displayName`, optional `legalName`, `companyCode`, `passcode`, and `source: "wbjsa"`.
- Only an explicit `{ status: "pending", pendingId }` response is accepted. Registration never creates an authenticated session.
- The device retains only the opaque pending ID, display name, and request timestamp. Registration secrets are cleared from component state after acceptance.
- Approval clears local pending state and returns to canonical Sign In. Expired or missing requests also return to Sign In.
- Android Back dismisses an open registration keyboard first, then returns to Sign In. Pending Back is labeled and behaves as Return to Sign In.
- Status polling is serialized, retries after cleanup failure, and ignores stale responses after Back, cancellation, identity refresh, or Suite SSO.
- Canonical manual authentication remains `manualGovernedLogin` through `authenticateDriver`, Firebase Auth, and exact governed session binding.
- No direct `drivers/approved/{hash}` credential login, client `drivers/pending` write, standalone auto-approval, or approval-to-app path is active.
- Signature, canonical profile/identity, completed JSA record, and JSA document sources are freeze-hash verified unchanged.

## Changed files in source commit

- `app/contexts/AuthContext.tsx`
- `app/contexts/LanguageContext.tsx`
- `components/LoginScreen.tsx`
- `components/registrationBack.ts`
- `services/driverAuth.ts`
- `services/jsaRegistrationContract.ts`
- `services/registrationPollGuard.ts`
- `tools/test-i18n.cjs`
- `tools/test-jsaAuthPresentationRefresh.mjs`
- `tools/test-jsaCompanyRegistration.mjs`
- `tools/test-jsaDiagnosticAuth.mjs`
- `tools/test-jsaManualLoginBlockers.mjs`
- `tools/test-jsaRegistrationContract.mjs`

## Verification

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with 0 errors and 72 existing repository warnings.
- Registration contract: 22/22.
- Company registration inventory/freeze checks: 46/46.
- Auth presentation and SSO race checks: 9/9.
- Diagnostic auth: 18/18.
- Manual login blockers: 46/46.
- Manual governed login: 22/22.
- Governed auth: 97/97.
- Credential logging: 3/3.
- Total targeted assertions: 263/263.
- Spanish UI coverage: passed with 619 translated entries.
- `git diff --check`: passed.

An older unrelated `tools/test-logoutClearing.mjs` inventory was also run during the work. It reports 2 passes and 10 failures because it still searches for the retired `clearDriverSession` implementation. Logout source was not changed in this checkpoint.

## Release state and external dependency

- No APK was built.
- No app was installed or launched.
- No device or ADB access occurred.
- No Functions, rules, Storage, database, Auth, or production data was deployed or mutated.
- The corrected onboarding backend at desktop release commit `dec92e0059b74b3f637f25ed990c3136c348ff6b` is source-only and was reported as not deployed. Client release testing must wait for the separately reviewed targeted backend deployment plan.
