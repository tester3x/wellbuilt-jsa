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
