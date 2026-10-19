# Submission feedback

Submit immediately shows a spinner and Submitting… during the existing async
save/verification path. It is disabled and reports busy accessibility state while
the existing duplicate-submit lock is held. Finally clears both lock and UI state
on success, refusal, or error. No completion claims or evidence rules changed.

Validation: TypeScript and governed form-evidence regressions. No APK built.
