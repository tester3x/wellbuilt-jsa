# Inline search parity with WB-T

Reference inspected: C:/dev/wbt-vc104-laptop-integration/components/AutocompleteInput.tsx. Its interaction is an editable field with a bounded inline scrollable list, one-tap selection, persistent keyboard taps and delayed blur dismissal.

JSA Oil Company now uses one editable field; selecting an assigned customer fills that field and narrows well loading. There is no intermediate field/picker or second query box. Existing standalone well selection keeps the selected name visible and supports typing to search again. Add Location uses the same focus/selection pattern for company and well/SWD, with nested scrollable results. Existing signed-record customer locking is retained.

TypeScript and the existing catalog-entry/location-catalog checks pass. No server, permissions or catalog-scope changes. Physical keyboard/dropdown behavior remains device verification. This change follows vc39 (which installed on ZFold; S24 installation deferred while JSA was open) and requires the subsequent candidate to test this new interaction.
