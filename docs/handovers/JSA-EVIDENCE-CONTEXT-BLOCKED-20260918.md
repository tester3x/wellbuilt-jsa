# JSA evidence-context kickoff — blocked source reconciliation

Date: 2026-09-18. Repository: `tester3x/wellbuilt-jsa`.
Branch: `fix/jsa-evidence-context-integrity-20260917`.
Exact base: `aac80e739455487836a732764028adc42b419874`.
Local base was a clean Git checkout, verified against the GitHub commit object. This isolated worktree was created from that exact commit after the WB-eQuipment source/handoff had been pushed at `13824fc0d680f84777d0a88c37f980328989d1e6`.

Status: BLOCKED. This checkpoint adds this investigation/handoff only. No JSA runtime fix is claimed. The containing commit is the documentation checkpoint; resolve the branch HEAD for its exact result SHA.

## Why the five probes cannot yet be closed honestly

The kickoff names verified failures without their test files or production entry points. Several named mechanisms do not match the supplied JSA source. A correction needs the preserved failing probes, exact module/function names, or a corrected repository/checkpoint. Creating new unused launcher/resume/evidence abstractions would not repair a demonstrated runtime failure.

| Kickoff claim | Evidence at the exact checkpoint | Remaining work |
| --- | --- | --- |
| Source/package checks become launch success without a launcher | `services/sso/jsaStartOwner.ts` already injects `openSuite`; it awaits that call and distinguishes `suiteOpen: succeeded` from `failed`, while both remain `need_auth`. `services/sso/jsaStartLive.ts` supplies `Linking.openURL`. AppSwitcher also invokes Linking directly. | Identify the source-check-only launcher in the preserved probe. Do not reinterpret launcher acceptance as evidence completion. |
| Replay adopts a later shift/template | `services/sso/jsaArtifactSnapshot.ts` freezes request ID and authored snapshot; retries pass those frozen values. `services/jsaTaskSelectionDraft.ts` freezes standalone template refs/content under owner/session keys. The governed authored snapshot excludes local shift authority; the backend derives it from the request. | There is a real unresolved contract: the governed request response does not pin immutable template wording/version/hash. The preserved later-shift/later-template replay probes are needed to locate the failing runtime path; client-only invented authority fields would violate the current exact-key server contract. |
| Missing operator falls back to the first operator | No operator-list-first-element resolver matching that description was found. `app/signoff.tsx` does select the first non-empty operator from the saved wells before a route parameter, and may retain an empty value. | This is a concrete ambiguity candidate, not proof of the stated probe. Establish whether the probe targets location-derived operator selection, an operator catalog, or an upstream launcher. No fallback was silently rewritten here. |
| Unbound/non-HTTPS resume URLs accepted | No external resume-URL field/validator was found. `services/jsaScreenResume.ts` resumes allowlisted internal routes and excludes credentials/request authority. Governed transport uses deliberate custom app schemes, which are not an HTTPS document-resume surface. | Supply the resume-URL entry point and trusted server binding. There is no source surface here on which to implement the requested bound-HTTPS rejection without guessing or breaking the existing app transport. |
| Same-day cache crosses driver/company contexts | Standalone task drafts are keyed by UID/company/JSA-session; screen resume by UID/company, both with generation checks. Legacy date/shift paths exist elsewhere, but no preserved same-day-cache probe accompanies this packet. | Supply the cache function and fixture. Exact driver/revision scope still needs auditing once the actual failing cache is identified; existing UID/company isolation is not blanket proof. |

These findings do not declare the entire app defect-free. They separate observed source behavior from the kickoff's unlocated reproductions. No shared packet/capability architecture, server authority, or production contract was invented.

## Read-only regression checks

Six existing fake/pure test programs passed:
- `node --experimental-strip-types tools/test-jsaStartOwner.mjs`: 74 checks, 0 failures.
- `node --experimental-strip-types tools/test-jsaRequestLifecycle.mjs`: 100 checks, 0 failures.
- `node --experimental-strip-types tools/test-jsaGovernedArtifactQueue.mjs`: 90 checks, 0 failures.
- `tools/test-requestPeriodBinding.mjs`: 17 checks, 0 failures with the existing audit import resolver pointing at the verified vendored contracts. Direct Node invocation first failed because this isolated worktree has no installed contracts package; that was an environment resolution failure, not a passed run.
- `node tools/test-jsaTaskSelectionDraft.cjs`: all assertions passed (the script does not print an assertion count).
- `node tools/test-jsaScreenResume.cjs`: all assertions passed (the script does not print an assertion count).

Total reported assertions: 281/281 plus the two passing CJS assertion programs. This is a targeted baseline inspection, not five newly reproduced-and-fixed probes or full release validation. CJS programs used the already available TypeScript dependency via NODE_PATH. No dependencies were installed.

## Resume requirements

Provide the preserved probe file(s), or the repository/SHA and exact functions implementing the source-check launcher, replay binding, operator fallback, external resume URL, and same-day cache. Keep WB-eQuipment separate: its completed branch and handoff are already pushed. Continue JSA on this branch after reconciling the source; do not mark this documentation checkpoint release-ready.

No build, install, deploy, production mutation, real upload, external app launch, or native/device test occurred. Changed file: this handoff only. Original audited checkout remains unchanged.
