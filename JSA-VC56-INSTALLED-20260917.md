# WellBuilt JSA VC56 installed — 2026-09-17

Mobile source commit: `4557f5ca047038585bfa3a837ba0a4ab4c15e55e`

EAS build:

- Build ID: `da6cf05c-e53a-4722-a21f-427b930c4ab3`
- Profile: `preview`
- Package: `com.syconik801.jsaapp`
- Version: `1.0.0 (56)`
- APK: `C:\dev\output\jsa-vc56\jsa-preview-vc56-4557f5c.apk`
- APK SHA-256: `5393feecb9ea75bcf9c3fc122a99ac745a2bc5c2215fd3c4d21ccb6c4ef565e6`
- Signer SHA-256: `fc833ec7502cead7c5f7b0e5e394a2f7958ded629e92edb5ec7ff9522722d459`
- APK signature verification passed and the signer matches the retained JSA builds.

Installed with `adb install -r` so application data was preserved:

- ZFold `RFGL23VJCED` / `SM_F966U1`: install succeeded; `dumpsys package` reports version code 56.
- S24 `R5CX15HEGQB`: intentionally left on version code 50.

VC56 makes form controls translucent and explicitly frames the complete package-aware office scene. A low-opacity full-screen backdrop fills the display while an undistorted foreground layer keeps the desk, clipboard, plants, and office interior visible. The package selection remains dynamic for water hauling, LTL, aggregate, and general transportation work.

The New JSA screen was visually checked on the ZFold after installation. The scene remains visible through the main card and input fields, and the desk foreground is present in the lower half instead of being cropped out.

Validation before build:

- TypeScript passed.
- Diff whitespace validation passed.
- Background resolver passed 10/10 cases.
- APK package, version, hash, and signing certificate were verified before installation.
- Post-install screenshot: `C:\dev\output\jsa-vc56\zfold-vc56-form.png`.
