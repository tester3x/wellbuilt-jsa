# WellBuilt JSA VC51 installed — 2026-09-16

Mobile source commit: `2d207b5cf1255a9ab3f01d7b9ff89d3be5b7a0df`

EAS build:

- Build ID: `d5ea9d2d-65da-4c32-9926-2e379df1460b`
- Profile: `preview`
- Package: `com.syconik801.jsaapp`
- Version: `1.0.0 (51)`
- APK: `C:\dev\output\jsa-vc51\jsa-preview-vc51-2d207b5.apk`
- APK SHA-256: `ad015562f9a9ec3357445c241b8014098b91a544e680018ed2590089f7ac6ea1`
- Signer SHA-256: `fc833ec7502cead7c5f7b0e5e394a2f7958ded629e92edb5ec7ff9522722d459`
- The signer matches VC50, and APK signature verification passed.

Installed with `adb install -r` so application data was preserved:

- ZFold `RFGL23VJCED` / `SM_F966U1`: install succeeded; `dumpsys package` reports version code 51.
- S24 `R5CX15HEGQB`: intentionally left on version code 50.

After installation, a normal launcher start reached the authenticated JSA welcome screen for Mike. It did not remain on the Suite sign-in spinner.

VC51 includes the English/Spanish pass, removes **Use as starting point**, makes closed saved records read-only, highlights active records, tightens the More menu, and changes the middle navigation action between **New JSA** and **Resume**. With exactly one active JSA, **Resume** opens that record directly. It also fixes cold launcher starts so an existing authenticated session resumes inside JSA instead of repeating Suite authorization from a retained deep link.

Validation before build:

- TypeScript passed.
- Focused ESLint passed.
- i18n validation passed.
- Suite governed-entry tests passed: 19/19.
- Auth presentation-refresh tests passed: 6/6.
- Entry-mode tests passed: 5/5.
- Standalone release-path tests passed: 13/13.
- Manual-login blocker checks passed: 46/46.
- Screen-resume coverage passed.
