## Expo/EAS build authorization — all apps, both computers

- Batch fixes and features into substantial updates. Do not create cosmetic-only builds.
- Never start an Expo/EAS cloud build unless Mike specifically requests that build in the current work. A significant batch of changes alone is not authorization.
- This applies to every app, computer, build profile and platform, including builds started through scripts, CI, API calls or expo.dev. Do not launch additional builds or retries unless the explicit request covers them.
- Earlier blanket permission to build/install, autonomous-work instructions and old build requests do not authorize new builds under this policy.
- Continue coding, local validation, tests, commits and pushes while updates accumulate. Keep work preserved without spending cloud-build credits.
- Urgent fixes have no automatic exception: explain the need and wait for Mike's explicit build instruction.

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
