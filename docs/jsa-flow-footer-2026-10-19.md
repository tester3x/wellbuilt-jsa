# Consistent read-flow actions

Branch: feat/jsa-register-join-code-20260917.

Steps, PPE, and Review & Submit now share footer spacing, equal-width action
slots, and compact outlined action buttons with a minimum 48-point touch height.
The center slot holds Next, PPE Checklist, or Submit JSA. Previous/Back and More
stay in the same horizontal positions across those screens. The progress count
stays centered independently of its animated check. Footer actions remain outside
the scrolling content. This changes layout only, not submission or evidence rules.

Validation: full TypeScript check and governed form-evidence regression checks.
Native visual confirmation remains for the next APK. No APK built or installed.
