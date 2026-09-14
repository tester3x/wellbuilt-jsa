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
- JSA main bar: Saved JSAs | Job Details | ... More. Further app migrations must be verified individually.
