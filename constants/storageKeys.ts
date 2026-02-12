// Centralized storage keys for AsyncStorage
// This prevents typos and makes it easier to manage storage across the app

export const STORAGE_KEYS = {
  // JSA data
  saves: "@jsa/saves",

  // User preferences
  driverName: "@jsa/driverName",
  truckNumber: "@jsa/truckNumber",

  // Favorites
  favoriteLocations: "@jsa/favoriteLocations",
  favoriteWells: "@jsa/favoriteWells",

  // Workflow state
  prepared: "@jsa/prepared",
  savedLocations: "@jsa/savedLocations",
  locationAcks: "@jsa/locationAcks",

  // PPE selections
  ppeSelected: "@jsa/ppe/selected",
  ppeOther: "@jsa/ppe/other",

  // Language
  language: "@jsa/lang",
} as const;
