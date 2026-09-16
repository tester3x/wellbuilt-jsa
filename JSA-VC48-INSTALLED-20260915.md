# JSA vc48 installed

- Build source: f90fb1be3ccde75fd50335dcd4e20f8c63ca7b48, branch fix/jsa-app-access-handoff-20260913.
- EAS preview build: 90d14547-9c44-4053-a0f2-bef01f7d52ab.
- Package com.syconik801.jsaapp, versionCode 48, versionName 1.0.0.
- APK SHA-256 A1DA6D1895B1CFF8E692AAA9BEE8AF0679CF663CF0C8EDF19D4F0851F72C73CE.
- Signer SHA-256 fc833ec7502cead7c5f7b0e5e394a2f7958ded629e92edb5ec7ff9522722d459, matches vc47.
- Local APK C:/dev/output/jsa-vc48/jsa-preview-vc48-f90fb1b.apk.
- Replacement installation succeeded on S24 and ZFold; package manager confirms vc48 on both. No uninstall/data clear or driver acknowledgement performed.

Changes: remove persistent origin-app header chips; Job Type → Oil Company → Well/Location keyboard focus; auto-next after search selection; compact PPE summary/padding and tappable rows; distinct JSA details and direct Add location control only for explicitly open standalone reports; remove nested read-tap around add control.

Validation: TypeScript, diff check, paper/3-inch/4-inch document checks, 9 durable addition cases, PPE keyboard overlay/resize/reveal checks passed. Phone interactive testing remains with user. No backend/Functions/rules or WB S deployment in this build turn.

Standalone create code authors state open. Local Save Changes handler does not close a record. User's closed record cause remains unproven; do not mark lifecycle bug solved. Android Back-to-origin proposal is not implemented in vc48. Dashboard task-template publication is separate.

Test first on S24: home-screen launch, confirm removed return chip, inspect existing record status; open records should show direct Add location, closed records should offer details only. Then test field order, suggestions, PPE fit/Other keyboard, signing and adding location to a new standalone JSA without choosing Close or End day. Do not confuse Saved with Closed.
