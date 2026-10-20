# Session restore checkpoint — 2026-10-19

Branch: feat/jsa-register-join-code-20260917. Base: edbf9d3.

Android launcher opens retain the governed Suite session. A transport-only token refresh failure can restore local presentation only with matching SDK UID, finalized installation and bound logout baseline. Company access is cached per UID/session generation/company/driver, prewarmed after handoff, and refreshed in the background. Explicit denials evict the cache; backend actions still authorize each request. In-flight account changes cannot restore the prior identity.

Validation: TypeScript passed; offline-session, standalone-client, durable-addition and auth-presentation regression checks passed. No APK built or installed. Next: device test launcher reopening and offline reopening after a successful Suite handoff; confirm explicit logout remains signed out.
