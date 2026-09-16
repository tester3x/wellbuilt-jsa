# S24 empty JSA lists investigation — 2026-09-15

Base: 680c4fe on fix/jsa-app-access-handoff-20260913.

ADB verified S24 package com.syconik801.jsaapp versionCode 48, last update 2026-09-15 20:27:46, original install date 2026-03-14. The prior install used install -r; no uninstall or data clear was performed. Release is not debuggable: Android denied run-as access to private storage. Relevant available ReactNativeJS logs did not identify a failure.

Read-only Firestore metadata inspection found three standalone records total, none with an S24 printed name; the legacy jsas collection had one record dated September 14 or later, none with an S24 driver name. These display-name checks are diagnostic only, NOT canonical ownership proof. RTDB profile lookup was unauthorized, so the currently signed-in canonical S24 ID and private local saves remain unverified. No database changes or recovery actions performed.

Do not claim the record was wiped or that Save closed it. Inspected save paths retain records; standalone creation on the server explicitly uses state open. The cause of this user's missing record remains unresolved.

Confirmed bugs fixed:
- History skipped server refresh when the local saves key was absent.
- History refreshed only on mount, leaving the mounted tab stale after returning from submission.
- History and Open JSAs suppressed refresh errors; Open JSAs claimed no records during loading or failed refresh.
- Cached owner-scoped history remains visible on refresh failure; failures now have retry messaging. Open JSAs only reports none after a successful check.

Validation: TypeScript passed; four history refresh regression cases passed; diff whitespace check passed. Source-only checkpoint, not built or installed. Both devices remain on vc48.

Next device verification requires this checkpoint in a build. Recheck loading state/error, then create a test standalone JSA and verify submission, Open JSAs, history, and process restart. Do not recover historical test data merely for its own sake.
