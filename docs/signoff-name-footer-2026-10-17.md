# JSA signoff name and actions

Branch: `feat/jsa-register-join-code-20260917`.

Signoff now always shows an editable Legal name field. The saved profile/session legal name prefills it without overwriting driver edits. Submission uses that explicit attestation name; authenticated ownership, governed job context, signature, and step evidence checks remain required.

Submit JSA sits below the scrolling form. Missing-name/signature/evidence validation uses the existing branded JSA modal instead of the native Android alert, and missing-name dismissal focuses the field.

Validation: TypeScript passed; governed form evidence tests passed (28). Device layout and complete governed submission remain to be tested in the next JSA APK. These changes are source only, not part of WB T 184.
