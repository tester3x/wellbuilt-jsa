# JSA signoff name and actions

Branch: `feat/jsa-register-join-code-20260917`.

Signoff now always shows an editable Legal name field. The saved profile/session legal name prefills it without overwriting driver edits. Submission uses that explicit attestation name; authenticated ownership, governed job context, signature, and step evidence checks remain required.

Submit JSA sits below the scrolling form. Missing-name/signature/evidence validation uses the existing branded JSA modal instead of the native Android alert, and missing-name dismissal focuses the field.

Validation: TypeScript passed; governed form evidence tests passed (28). Device layout and complete governed submission remain to be tested in the next JSA APK. These changes are source only, not part of WB T 184.

## JSA 60 build and installation

On October 17, TypeScript and all 28 governed form evidence tests passed again, along with requested-read history notice tests. EAS preview build `9637c943-833a-446b-b872-4e862b8fcf31` finished from source `7e5b0bc9dbef6269512dd597b457e666fb89a115`, including the opening notice and signoff changes.

APK SHA256: `9298A1C92B04BF959EE27D20CE372BE5E09758001C2B73ABA595025B83C12291`.

Installed successfully on ZFold `RFGL23VJCED` with `adb install --no-streaming -r`, retaining saved data. Package verification confirms `com.syconik801.jsaapp`, versionCode 60, versionName 1.0.0, lastUpdateTime 2026-10-17 15:34:35. Installation is verified; actual required-job handoff, signoff layout, and completed submission are awaiting driver testing. No live job, JSA completion, or HOS state was changed for verification.
