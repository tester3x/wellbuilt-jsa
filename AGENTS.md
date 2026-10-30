## Registered laptop checkout — October 29, 2026

- First read `C:/dev/workspace-control/POLICY.md` fully. Its desktop D: control paths map to C: on this laptop. Current user-authorized policy overrides old build notes.
- Existing registered home: `C:/dev/JSA`, branch `feat/jsa-register-join-code-20260917`, remote `https://github.com/tester3x/wellbuilt-jsa.git`, common Git directory `C:/dev/wellbuilt-jsa/.git`.
- Claim/check/finish using `C:/dev/workspace-control/guard.cjs` and the actual session ID before writing; one writer per repository. Preserve other copies, local edits and native files; do not create another checkout or source-copy build, reset, force-push or bypass hooks.
- Local builds, under the standing authorization above, use exact reconciled committed source in this registered home under current workspace policy. Keep credentials and generated APKs outside Git.

## Build authorization - user amendment October 30, 2026

- Local Android APK builds and rebuilds have Mike's standing authorization for user-authorized development, fixes and validation. Use the laptop Android SDK, JDK and project Gradle wrapper; do not ask for separate permission to build locally.
- Batch meaningful changes. Standing local-build permission does not authorize unrelated features, cosmetic-only releases, unrequested installations or live-data changes. Carry forward installation/testing authorization already given for the task.
- Any Expo.dev/EAS cloud build, cloud retry, submission or upload requires Mike's explicit permission in the current work. Local-build authorization never grants cloud authorization. Never fall back to cloud automatically when a local build fails.
- Preserve ownership guards, registered existing homes, fresh cross-computer source reconciliation, exact committed clean build source, immutable remote version reservations, existing package ID/release signer, required checks and durable source/version/APK/signing receipts. Keep signing credentials and APKs outside Git. Test on S24 before a ZFold rollout.
- Build in the registered home under the current workspace policy; do not create a separate source/build checkout. The registered-home runner and current app instructions override historical source-copy examples.
- This amendment supersedes older instructions requiring a fresh request or separate approval for a local APK build. Historical release receipts remain historical evidence. Expo/EAS cloud approval remains explicit.

# Shared development and handoff rules

## Mike's working preference

- After proposing a concrete fix within the authorized task, implement and test it without waiting for another "OK". Report actual progress rather than ending with a plan.
- When Mike explicitly asks "Thoughts?", "Discuss?", or says to settle the design first, discuss before coding that undecided change.

## Preserve work independently of release readiness

- Commit and push meaningful checkpoints throughout work, before switching tasks/computers, and before ending a work session. Do not wait for bedtime instructions or for all tests to pass.
- Preserve unfinished source on the current isolated working branch with a clearly marked WIP commit. Never represent WIP as release-ready.
- Before each push, inspect the staged diff and exclude credentials, personal/customer data, device logs, scans, generated builds, and unrelated changes. Never force-push or discard someone else's work.
- Maintain a concise handoff note with branch, checkpoint, completed changes, unfinished work, test results/failures, and next steps. Distinguish committed, pushed, built, installed, deployed, and verified.
- At the start of work on another computer, fetch and verify the intended remote branch and checkpoint before editing or building. A clean tree alone does not prove the correct starting point. Preserve local changes rather than resetting them.
- Before release, verify that the source includes the prior approved fixes, run relevant regression checks, and record the exact source commit with the build/deployment identity. Unfinished checkpoints are not deployment authorization.
- If a push fails, retain the local commit and report the precise failure and unpushed checkpoint. Do not claim it is available on the other computer.

## Shared bottom action bar and Switcher standard

- Default to three buttons: secondary action left, primary/most-used action center, and ... More right. Never exceed four; discuss a four-button standard before adopting it.
- Keep each app's branding. Consistency means placement and behavior, not identical colors.
- More holds app-specific secondary options plus shared Settings and Switcher; avoid an oversized menu.
- Switcher opens a dismissible two-by-two app modal, excluding the current app and respecting the existing app availability filter. No floating Switcher badge.
- JSA main bar: Back to Tickets (when there is an owner-bound Tickets return; otherwise empty) | Resume JSA or New JSA | ... More, each with an icon. Saved JSAs belongs in More. Resolve the center action from verified current-shift/JSA state, never stale local open rows. More top to bottom: New JSA, Open JSA, Saved JSAs, Switcher, Settings, optional About. Stay lands on home without repeating welcome and retains the exact completion callback. Further app migrations must be verified individually.
