# Completion photo and form footer follow-up

Branch: `feat/jsa-register-join-code-20260917`, based on installed JSA 61.

The photographed blank completion screen is governed-status, separate from the older completion modal. It now renders the existing package photo background, uses the standard glass card and company accent, and preserves its existing submitted/failed/replay routing and server verification. No background assets were generated or edited.

Home/History already have the shared three-button bar. Steps now exposes Previous, Next/PPE Checklist, More; PPE exposes Back, fixed Next, More; Review exposes Back, fixed Submit, More. More uses a compact trigger on forms to fit narrow phones. Existing form state, step evidence, handlers and submission ownership are unchanged. Header More remains available too. No universal New/Resume shortcut was introduced into an in-progress form.

Validation: TypeScript passed; governed form evidence 28, lifecycle 100, and branded alert audit passed. Device layout verification remains for the next APK. No new build/install for this follow-up.
