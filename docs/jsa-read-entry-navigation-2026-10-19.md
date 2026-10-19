# Required read entry and step footer

Branch: feat/jsa-register-join-code-20260917.

The required-read Continue effect now routes from the verified matching governed
request and allowed workflow surface without waiting for saved-history hydration.
That hydration could be superseded during launch-mode resolution and only restart
on the next focus/foreground event. Launch mode is no longer treated as an identity
change that invalidates the refresh coordinator. Actual account/generation/company/
driver changes still invalidate it. Request mismatch, terminal state, and blocked
workflow guards remain intact.

The Steps footer uses three equal-width action slots. Next/PPE Checklist is centered
under the progress count; the animated check no longer moves that count off-center.

Validation: TypeScript, Welcome entry regression (including unhydrated history),
screen resume, 46 governed field checks, and 11 read/shift gate checks.
No build, installation, backend deployment, or customer record changes. Native
foreground behavior still needs confirmation in the next APK.
