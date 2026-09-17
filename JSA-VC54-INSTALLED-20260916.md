# WellBuilt JSA VC54 installed — 2026-09-16

Mobile source commit: `968f2f97fd18e1cceb0cda519aad8758f0fb35f0`

EAS build:

- Build ID: `362256f8-31ad-4c35-8b59-4c547974b3b2`
- Profile: `preview`
- Package: `com.syconik801.jsaapp`
- Version: `1.0.0 (54)`
- APK: `C:\dev\output\jsa-vc54\jsa-preview-vc54-968f2f9.apk`
- APK SHA-256: `efd59af8c9b2fc94424e2f6c096c79fe04266033e00c954685ae84977e6cea05`
- Signer SHA-256: `fc833ec7502cead7c5f7b0e5e394a2f7958ded629e92edb5ec7ff9522722d459`
- APK signature verification passed and the signer matches the retained JSA builds.

Installed with `adb install -r` so application data was preserved:

- ZFold `RFGL23VJCED` / `SM_F966U1`: install succeeded; `dumpsys package` reports version code 54.
- S24 `R5CX15HEGQB`: intentionally left on version code 50.

VC54 changes the major JSA cards from effectively opaque white to a shared 72% glass surface and reduces the full-screen artwork wash from 58% to 22%. Job Details, Saved JSAs, Open JSAs, steps, PPE, signoff, saved-record viewing, and settings now reveal the package-aware transportation artwork through their working area. Input controls and menus remain solid for legibility.

The Job Details screen was visually checked on the ZFold after installation. The scene is visible through the full-height form container while labels and input fields remain readable.

Validation before build:

- TypeScript passed.
- Diff whitespace validation passed.
- Background resolver passed 10/10 cases.
- JSA task-template package identity tests passed.
- i18n validation passed with 604 Spanish entries.
