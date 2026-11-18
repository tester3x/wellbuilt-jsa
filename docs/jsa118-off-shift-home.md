# JSA118 off-shift home

The current S24 test's signed JSA remained open after the job closed. The End JSA card saw its period, but the home-status contract forced all off-shift entries to New JSA. Both server and client now support Resume for a signed record in the exact current open off-shift period.

The matching server source is `801e18d76465de079c2d0f0b79d09b32257f202c` in the registered Dashboard repository. It reads the owner-bound active period without creating, ending or editing it. The client validates the period identity, distinguishes off-shift Resume in its message and welcome text, and binds the End JSA card to the same home state instead of a separate query. Ending from that card refreshes the shared home state. Existing signed content is not rewritten. On-shift Resume behavior is retained.

Checks: client TypeScript, on/off-shift home validation and messages, offline signed-view cache, account/session isolation and stale-response tests; server home/preview/work-period/summary tests 49/49. The actual S24 closed test job/open JSA reproduced Resume in a read-only server replay with its original signature intact.

Release scope: S24 first. Keep its off-shift JSA open for Mike. No signature submission, End JSA, printing or Fold interaction is part of verification. Installation and live-function source proof are recorded separately after completion.
