# Shared profile lookup — 2026-10-17

Source change only; JSA58 remains installed. Canonical governed profile callers (baseline seeding and driver profile consumers) now share concurrent reads and reuse successful results for30seconds in process memory. Key includes UID, canonical driver/company and installation generation; auth mutation epoch/UID and local profile revision fence pending and cached values. Post-fetch storage binding is rechecked. Profile updates invalidate before and after the mutation; identity state clear invalidates immediately. Failures are not retained. Logout watcher and governed startup/route authorization remain active and are not cached by this helper.

History fetches stop forcing token refresh for every request: Firebase getIdToken() reuses valid SDK credentials and refreshes expired tokens normally. Exact user object is checked after token await; existing query ownership and error handling remain.

Validation: shared lookup concurrency/expiry/same-UID generation race/failure/logout3tests pass. Full JSA TypeScript passes. Strict lifecycle21, verified logout/signature15, governed artifact queue90 and auth presentation9 all pass. No build/install or measured on-device speed claim yet. This reduces redundant work; does not replace Suite broker authorization with persisted local identity.
