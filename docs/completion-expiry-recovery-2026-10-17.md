# Completion expiry diagnosis and recovery

Branch: `feat/jsa-register-join-code-20260917`.

Read-only investigation found the pending request was created at 13:27 CDT, expired at 15:27 (the existing two-hour server TTL), and first reached completion at 15:46 after the build/test delay. Cloud logs show authenticated completion attempts rejected with HTTP 400. Replaying the downloaded deployed decision core against the stored record at the observed attempt time returns `expired / ttl`; the same record passes the decision before expiry. No server record was changed, no signature/completion was fabricated, and no expiry or authority checks were relaxed. The older completion endpoint source was inspected, but expiry is sufficient to reproduce this failure; no backend deployment is required for this repair.

The artifact queue incorrectly collapsed permanent completion refusals, including expired, into `complete_retry`, showing a generic Retry dialog indefinitely. It now preserves bounded refusal classification, blocks terminal items without discarding their local record/snapshot, explains expired-request recovery, and retains retries for network/auth/transient failures. Bounded completion reason codes are logged without payloads or identity.

Companion WB T changes on `codex/wbt-enroute-20261014` let explicit Start Job register a new ID only after an authenticated endpoint rejects the existing request as expired. The old evidence stays intact and the replacement needs fresh completion; no proof is granted by rotation. Both JSA and WB T APK updates are needed for the complete recovery flow.

Validation: JSA TypeScript passed; artifact queue 102, request lifecycle 100, and governed evidence 28 assertions passed. WB T runtime flows 10 passed, including expiry replacement and no Start bypass; no changed-module TypeScript diagnostics (existing embedded functions diagnostics remain). No new build/install requested for this diagnosis checkpoint; phone verification remains after the next builds.
