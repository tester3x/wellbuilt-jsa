# WellBuilt JSA VC53 installed — 2026-09-16

Mobile source commits:

- Package-aware backgrounds and More menu: `74e6e16bced8ea01b96a201aab59f7b544fdc485`
- Navigation transparency fix: `8ea82630dc1bfd7ce6c6eac791e0b9b7b0423f84`

EAS build:

- Build ID: `f872ee43-5f24-46bf-b1c5-0e59ae155f1d`
- Profile: `preview`
- Package: `com.syconik801.jsaapp`
- Version: `1.0.0 (53)`
- APK: `C:\dev\output\jsa-vc53\jsa-preview-vc53-8ea8263.apk`
- APK SHA-256: `9eb20cc75b00051698855155c6e466649724865c493b6e6b8198ef17d8581639`
- Signer SHA-256: `fc833ec7502cead7c5f7b0e5e394a2f7958ded629e92edb5ec7ff9522722d459`
- APK signature verification passed and the signer matches VC51/VC52.

Installed with `adb install -r` so application data was preserved:

- ZFold `RFGL23VJCED` / `SM_F966U1`: install succeeded; `dumpsys package` reports version code 53.
- S24 `R5CX15HEGQB`: intentionally left on version code 50.

VC53 adds four transport-package backgrounds: water hauling/oilfield, LTL freight, aggregate/quarry, and a neutral transportation fallback. The app resolves standard and custom Dashboard job types to a package, switches the background as the driver selects the job, carries the package through saved JSA records, and restores the appropriate scene when the record is reopened. Companies with one recognized active package use that scene by default; mixed or unresolved packages use the neutral scene.

The More menu now uses larger labels and a single right-aligned icon column. The menu and app cards were checked on the ZFold over the new background. The neutral background rendered before package selection, and entering `Production Water` switched to the oilfield water-hauling artwork. The temporary job-type input was cleared after the check and no test JSA was saved.

Validation before build:

- TypeScript passed.
- Diff whitespace validation passed.
- Background resolver passed 10/10 cases.
- JSA task-template package identity tests passed.
- i18n validation passed with 604 Spanish entries.
- Standalone release-path tests passed 13/13.
- Screen-resume coverage passed.
