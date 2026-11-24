# Guided native handoff acceptance — in progress, no deploy

Production Tickets 460, JSA 122 and their app data remain separate. Never clear
or uninstall them. S24 only; do not operate the Fold. Preserve Burger 1, nine
unrelated pending operations and all real signed originals.

The isolated pair uses `com.syconik801.jsaapp.audit` and
`com.syconik801.jsaapp.audit.tickets`, test-only URI schemes, native Firebase
Auth/Functions emulator SDKs, and native AsyncStorage. The caller imports the
registered Tickets checkout's actual handoff coordinator and final receipt
validator without copying source. The JSA renders the unchanged production
Steps, PPE and Signoff components through their existing injected-flow context.
Mike reviews, confirms and signs; automation does not attest for him.

This is a guided component-and-contract integration, **not** a production 460
installation end-to-end pass. Audit-only adapters replace the router shell,
branding, profile and SSO bootstrap; the real production SSO and AccountGate
remain untested here. PreparedReadContext is reused for screen navigation, but
the audit adapter submits to the governed complete/artifact endpoints rather
than the offline prepared transport. The normal completion modal may therefore
say saved-on-device although the adapter has confirmed the emulator artifact;
the emulator proof is authoritative for this test. Do not change production
copy just for the fixture.

Local backend fixture exposes the real governed register/get/complete/persist/
consume wrappers with synthetic contracts, membership, job and JSA period.
Emulator Firebase Auth still validates each callable. No result is accepted
from a URL alone. Tickets validates request/job, policy day/JSA period and action
using its production validator. Freeze user-authored evidence before transport,
retain the exact original and refuse a conflicting retry.

Acceptance still pending: launch from caller, normal guided human review,
return to caller and authenticated receipt verification, replay yields one
unchanged artifact, mismatch/premature-return refusals, production package
version and pending-work preservation checks. Existing legacy native-audit v1
work remains in its original namespaced key. No cloud build or deployment.
