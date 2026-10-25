# Visible Android navigation

Base: `24fd4e2`, preserving JSA97's restored original steps/PPE/signoff and offline behavior.

JSA now keeps Android navigation visible on startup and resume, following WB M's visible/inset-touch policy. Existing form safe areas and BottomActionBar bottom inset handling remain in place. No form format, acknowledgment rule, signature flow, shift binding or offline delivery behavior changed.

Exact Expo v57 docs were read; SDK unchanged. TypeScript check passed. Source-only checkpoint: no APK build or installation. Physical checks of system navigation, original forms, dialogs, keyboard and return to Tickets remain for the next build.

Android JS export passed. Generated bundles and command logs remain outside Git.

## APK build completed 2026-10-25

- Source: 28aa7167274ec55c071a3833abbf9e21c64925ca.
- EAS build: afbca7ab-3929-468d-8309-0b8daf86fec7; profile account-device-test; Android versionCode 98; FINISHED.
- Artifact: WellBuiltJSA-v98.apk (arm64-v8a).
- SHA-256: b3f335fb3f4d7e2e639109f1f852e1f4f4503a27ff6cad17a76255b662f13c0a.
- APK package/version and cryptographic signature verified; signing certificate matches the previous app APK.
- Built and downloaded; not installed in this task. Device acceptance of navigation, keyboard, camera and dialogs remains pending.
