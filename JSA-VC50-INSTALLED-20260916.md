# WellBuilt JSA VC50 installed — 2026-09-16

Mobile source commit: `23314c1a9e2da29d52984e60266f6a0be1e0ee77`

EAS build:

- Build ID: `f31d3cb3-391b-4140-8fd3-583babeea98c`
- Profile: `preview`
- Package: `com.syconik801.jsaapp`
- Version: `1.0.0 (50)`
- APK: `C:\dev\output\jsa-vc50\jsa-preview-vc50-23314c1.apk`
- APK SHA-256: `7d87b38e1cae67b3c31f807f462dcb7f928c26e186072d3dfcbf8d9a4e24e9cc`
- Signer SHA-256: `fc833ec7502cead7c5f7b0e5e394a2f7958ded629e92edb5ec7ff9522722d459`
- The signer matches VC49.

Installed with `adb install -r` so application data was preserved:

- S24 `R5CX15HEGQB` / `SM_S928U`: install succeeded; `dumpsys package` reports version code 50.
- ZFold `RFGL23VJCED` / `SM_F966U1`: install succeeded; `dumpsys package` reports version code 50.

VC50 renders appended work through template-aware repeatable blocks. It lists the original and added locations once, includes their signed or acknowledged times, marks locations with differences, and prints only actual location-specific differences instead of repeating the full JSA assessment for every stop. Missing or conflicting layout metadata uses the universal addendum after the original signature.

Related release state:

- Backend implementation: `4416b7ac357606ea39b6bbc3c45af178b1fca853`
- Backend deployment record: `8fabb1de`
- `dashboard:jsaManageTemplate` and `dashboard:jsaStandalone` are ACTIVE with deployment hash `f03f18273393ad11b8f6a21affb49048c877e94a`.
- Dashboard editor implementation: `219ece4fa64d9001603ffdc5fe749b69e5f319f6`
- Dashboard documentation checkpoint: `32e7ac81`
- Dashboard Hosting was not deployed from the isolated feature branch; the editor commit is ready for integration into the accepted dashboard release line.

Validation before build:

- Mobile TypeScript passed.
- Focused mobile ESLint had zero errors; six existing warnings remain in touched legacy files.
- Location layout, document rendering, task-template, addition-report, and pending-addition suites passed, including nine durable retry/idempotency cases.
- Full repository lint still contains six pre-existing errors outside this change.
- Backend TypeScript and 67 focused cases passed, plus the task-catalog flow.
- The emulator-only backend flow was not run because `FIRESTORE_EMULATOR_HOST` was not configured.
- Dashboard TypeScript, template-publication tests, and the webpack production build passed; 26 pages exported.
