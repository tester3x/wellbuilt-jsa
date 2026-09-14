# JSA thermal printing

Reuses the WB-E native printer implementation from the local `wbe-route-fix` checkout, including its existing Brother SDK AAR. Package registration is changed to `com.syconik801.jsaapp`; printer preferences use JSA's own storage key.

Brother uses the existing Brother PDF SDK path. Epson, Star, Zebra and generic selections use the existing ESC/POS raster path and require a compatible printer/model/protocol. A brand selector alone does not certify every model. Device verification is required, especially for Star models configured for a different command language.

No inter-page tear-off pause is added. This plugin requires a native Android build; OTA JavaScript alone cannot install the printer modules. The AAR is the existing vendor binary, not modified source.
