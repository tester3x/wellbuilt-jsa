# JSA122: durable workflow updates refresh the root gate

The Fold captured a successful governed server `get` for the current job while the root still showed the generic sign-in refusal over Steps & Hazards. The root re-inspected on identity changes, but persisted launch/context/failure changes published no revision. An unchanged authenticated user could therefore keep an older failure overlay after a replacement launch or successful retry.

Added a separate durable-workflow revision signal, emitted only after successful storage writes for launch, context and terminal failure state. The root subscribes to it as well as identity revisions. Its existing inspection-generation fence rejects stale async results. Authentication, owner/session binding, matching authoritative context, terminal failure and signed evidence checks remain unchanged; notifications never grant access themselves.

Production-runtime regression reproduces old failure → new launch → matching successful get with no sign-in event, plus same-request success clearing a failure, context removal, failed persistence and unrelated-request protection. Against the previous runtime, the two behavior cases fail; fixed runtime passes. Root listener cleanup is checked. Start owner77, governed auth97, lifecycle100, focused workflow/prepared/startup8 and TypeScript pass. Device acceptance remains separate from automated checks.

Release source retains JSA121's prepared-entry ownership/restart repairs. Fresh all-head comparison found only the authoritative branch advanced by the JSA121 receipt; other remote tips are unchanged. EAS read-only maximum99; installed/local/reserved121. Build122 locally with the registered-home runner and existing signer; S24 before Fold. Other-machine unpushed work cannot be discovered.

No signed JSA, job, duty record or queued evidence is deleted or changed by this fix. No cloud build authorized or used.
