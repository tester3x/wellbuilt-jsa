# Prepared JSA presentation regression

JSA94 on ZFold was installed on October 23. Its protected `/offline-job` route,
introduced by `baac2a3`, used a separate one-page form with a solid background,
default-color switches, no signature preview and an inline submit button. This
caused the reported visual/workflow regression. The WB M106 build is unrelated.

The protected route now uses `PreparedJsaForm`: the established Steps → PPE →
Review & Submit sequence, canonical summary card, company accent, transparent
background over the existing scene, glass cards, visible signature preview and
fixed Back / Next-or-Submit / More footer. Required prepared switches still gate
Submit, and the existing submission validator still checks every required step,
prepared confirmation, legal name and signature.

The request ID, draft key, account/shift/operator binding, frozen assessment
selection, evidence payload, native record operation and server-confirmed delivery
protocol are unchanged. Old one-page drafts retain their entered evidence and can
resume review when all required steps were already acknowledged. Screen markers
cannot bypass unread steps. Navigation state is persisted with the draft.

Validation: four navigation tests passed (sequential acknowledgment, missing-step
gate, old signed-draft preservation and restart position); TypeScript and targeted
lint passed. Android export passed. No customer job, signature, shift or evidence
was created or modified during validation. Physical acceptance on the dedicated
test phone remains pending the corrected APK. Do not claim this source is already
installed, and do not reinstall over the user's active workflow without timing it
with the requested truck stop.

## JSA95 installation

Build `7dfa79a0-f66b-4621-af6a-65a18e4d2502` finished from source
`3397b3ca9046e31f335d80958d15305c84c0d635`. APK SHA-256:
`0D3AE4C531AFBC333776F06C461FE1EFB62D3A906A7D3667A130B351C07A1C2C`.
Installed by data-preserving replacement on ZFold at the user's requested truck
stop. Package manager confirmed versionCode 95. Launch reached the current-shift
home/welcome surface with no fatal/JS startup errors. The user returned to Tickets,
so screen automation stopped rather than competing with their live work.

Nine lifecycle tests were rerun against this app's actual prepared-JSA runtime:
offline full-read validation, no-RPC prepared operator use, cold restart, lost or
wrong confirmation retention, account/period fences, native auth readiness and
shift-end replay all passed. The four presentation-navigation tests also passed.
The canonical suite's newer missing-native-module compatibility test is outside
this app's mirrored runtime version; it is not counted as an app test.

The ZFold displayed an active call, so no network settings were changed. A user
question is pending before the physical offline screen cycle. Current-shift
evidence, preparation switches and signatures were not changed or submitted.
Physical restored-form fit and offline/reconnect UI verification remain pending;
installation and code-level offline tests must not be reported as that acceptance.
