# Canonical platform runtime migration checkpoint

JSA: canonical app-open is separate from governed job starts. Finalized installations with exact SDK owner and bound logout baseline open before claims refresh; one refresh per generation runs in the background. Only confirmed owner/auth refusal retires that exact installation. General Switcher links use the canonical builder. Standalone access keeps its owner/generation-bound presentation cache. Tests: 97 governed auth, 9 presentation refresh, offline session checks and pending-token/confirmed-revocation startup checks passed. New entry files have no TypeScript diagnostics.

Canonical source: tester3x/wellbuilt-contracts, codex/platform-entry-offline-20261019, checkpoint 245278d. Runtime source SHA256: dcee868372558608a0e79eb521cd487f9b2f5a1e6a7085c8ea301deaaba3eec6. Mirrors are generated and byte checked; do not independently edit them.

Source-only checkpoint. No APK, deployment or device certification. Still required platform-wide: authenticated device/account broker, canonical server-derived app-access list propagation after any-app login, common connection hold/recovery integration in every durable queue, and offline/reconnect/restart device acceptance. Pure runtime/URI/quality tests pass (20) but do not certify app behavior. Keep these facts separate from the tested cached-entry adapters.
