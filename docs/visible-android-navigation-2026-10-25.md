# Visible Android navigation

Base: `24fd4e2`, preserving JSA97's restored original steps/PPE/signoff and offline behavior.

JSA now keeps Android navigation visible on startup and resume, following WB M's visible/inset-touch policy. Existing form safe areas and BottomActionBar bottom inset handling remain in place. No form format, acknowledgment rule, signature flow, shift binding or offline delivery behavior changed.

Exact Expo v57 docs were read; SDK unchanged. TypeScript check passed. Source-only checkpoint: no APK build or installation. Physical checks of system navigation, original forms, dialogs, keyboard and return to Tickets remain for the next build.

Android JS export passed. Generated bundles and command logs remain outside Git.
