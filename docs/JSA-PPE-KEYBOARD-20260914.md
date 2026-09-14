# PPE Other keyboard correction

The PPE ScrollView used keyboardDismissMode=on-drag and a surrounding
Pressable dismissed the keyboard. The previous legacy native scroll-responder
helper did not reveal the field on the ZFold during Mike's device test.

The screen now keeps the keyboard open while scrolling, measures the focused
input and visible viewport after keyboard/layout changes, and scrolls by the
actual overlap plus 24 points of clearance. Android gets enough scrollable
bottom space even when an edge-to-edge keyboard overlays rather than resizes
the screen. iOS retains KeyboardAvoidingView padding. No attestation or saved
PPE behavior changes; no server deployment is needed.

The shared summary card also removes the redundant Location & Activity title.
Location and Activity appear once as column headers, with single-line values
underneath. This applies to Steps, PPE, Review/Submit and Saved JSA details.

Five geometry cases pass (overlay, native resize, already-visible field,
changed keyboard height and clearance). Android export is checked for the
release. TypeScript retains the same four pre-existing unrelated errors.
Device verification still needs typing into Other with keyboard visible,
scrolling without dismissing it, and adding/removing an item without advancing
or signing a JSA. Preserve the user's currently open form during installation.

Pushed source e8ec269f1da4cda133b968307dfb4cb238ed7f4e; Android export passed.
Preview vc37 build f5050387-c2af-4763-9731-e018d4c6b337 is submitted.
The local install helper verifies source/version, hashes the downloaded APK,
and installs with -r only when JSA is not foreground. Build/install/device
verification are pending; no server deployment for these changes.
