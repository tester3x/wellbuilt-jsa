// Centralized color palette for the entire app
// Single source of truth - import this everywhere instead of defining inline

export const colors = {
  // Primary brand colors
  primary: "#F5A623",
  primaryDark: "#D68910",

  // Backgrounds
  background: "#F5F5F5",
  card: "#FFFFFF",

  // Text
  textDark: "#111111",
  textMuted: "#666666",
  textLight: "#FFFFFF",

  // Borders & Dividers
  border: "#E0E0E0",

  // Status colors
  error: "#DC3545",
  success: "#28A745",

  // Shadows (use with shadow styles)
  shadow: "#000000",
} as const;

// Standardized shadow style for cards
export const cardShadow = {
  shadowColor: colors.shadow,
  shadowOpacity: 0.06,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

// Standardized spacing
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;
