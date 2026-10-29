FIRST: Read D:/dev/workspace-control/POLICY.md in full before taking action. Then read the assigned repository's applicable AGENTS.md and CLAUDE.md. Follow the current user-authorized workspace policy over obsolete task notes.

# Interactive sign-in startup follow-up

Existing registered laptop checkout: `C:/dev/JSA`; remote `https://github.com/tester3x/wellbuilt-jsa.git`; branch `feat/jsa-register-join-code-20260917`; clean fetched starting checkpoint `77dbd2116330ac8abe89f857298ee9aba9e4a1de`. Actual owner/session `01a139b5-d3f7-7401-bdf0-3443ec841c28`. This continues Mike's authorized first-field handoff repair and subsequent resume instruction. No new checkout, source copy, reset or force push. Historical CLAUDE.md remote/native-build descriptions are obsolete; use verified registered workflow and current policy.

## Repair and evidence

The queued common AccountGate repair at 77dbd21 kept interactive login visible but left its startup readiness signal false. Suite109 device acceptance demonstrated that this combination leaves a blank login because its AuthProvider never initializes. Suite110 corrected this, passed explicit signed-out sign-in, restored the existing shift, and kept login stable across background/foreground.

JSA's AuthProvider also gates its initial governed-identity subscription on this signal. This source follow-up applies the same small correction: after local clear succeeds and interactive sign-in is presented, release auth startup. This is not an authentication grant. The actual identity inspection still chooses login for no identity, and access denial remains blocking. Late pre-action signed-out results and recurring signed-out background checks still cannot cover login.

Added a regression extracting and executing the actual JSA AuthProvider subscription and checkInitialState code with controlled backend boundaries. It confirms startup stays gated initially, then reaches login with null session after interactive Sign in. The two existing gate regressions retain foreground/account-change/reconnect, stale-result and access-denied checks.

Validation: gate/startup 3 passed; prepared first-entry readiness 3 passed; original prepared flow 5 passed; governed authentication 97 passed; auth presentation refresh passed; `npx tsc --noEmit` passed; whitespace check passed. No tests skipped to report green.

## Installed behavior and next work

Installed S24 JSA102 does not contain the queued 77dbd21 repair or this follow-up. Independently, after Suite110 restored the shared account, its first Tickets Start Job request opened JSA102 directly at populated Steps & Hazards. Mike completed/signed it and used its return action once; ADB foreground and screenshot confirmed Tickets EN ROUTE for software-test ticket21002. That verifies this restored-account handoff/return, not manual JSA login with the queued source.

Test ticket21002 remains open with no measured BBL/load submitted; preserve until deliberate software-test cleanup. Existing test shift and pre-trip remain. No APK build, reservation, installation, production deployment or migration in this follow-up. New JSA APK and explicit manual-login device acceptance remain pending a current build request. WB e has separate queued consumed-route/return diagnostics, not included here. Desktop Dashboard checkpoint remains d215b879cefcd3c995449414fadd9107965cacf0; its SMB share is unreachable from the current laptop network and no new pushed handoff was found.

Commit/push this scoped checkpoint and verify remote before releasing ownership. Future handoff must report the actual resulting commit, not treat this document as an APK receipt.
