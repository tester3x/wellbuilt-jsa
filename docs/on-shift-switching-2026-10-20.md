# On-shift switching follow-up

Live S24 testing exposed a device-login rotation followed by unexpected shared revocation. The shift-start DVIR recovered after an interruption, but first-time Equipment adoption hit transport deadlines. Ordinary warm Equipment entry then used its local receipt quickly. The full on-shift matrix has not passed.

JSA saved-session startup previously called publishJsaDeviceAccount(true), treating every initialization/revision as a new explicit login. Startup now performs a non-explicit publication; only a successful user-entered login can explicitly replace a shared device login. A safe app-only logout diagnostic was added. The exact revocation trigger still needs live confirmation; do not claim the fix verified before retesting.

The actual AuthProvider is executed by the shared tools/test-jsa-device-publication.mjs test: startup and revision stay non-explicit; successful manual login explicitly publishes. Typecheck and Android JS export pass. Build/install/retest pending. No backend changes. Raw phone/account evidence stays outside Git.

Historical logout protection: a cached JSA installation can have a baseline older than the current shared device login. A signal at or before that verified shared login no longer signs it out. Signals after the shared login remain effective; standalone/foreign-owner behavior is unchanged, and SDK ownership is checked again after reading the shared account. Five actual-watcher VM cases cover old/new signals, no shared account, foreign owner and replacement during the native read. This addition follows build84; a later build is required for the full fix.
