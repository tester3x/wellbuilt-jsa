// constants/jsaTemplate.ts

export type HazardControl = {
  hazard: string;
  controls: string;
};

export type JSAStep = {
  id: string;
  title: string;
  items: HazardControl[];
};

export type PpeItem = {
  id:
    | "safetyGlasses"
    | "safetyShoes"
    | "frClothing"
    | "hearingProtection"
    | "hardHat"
    | "respirator"
    | "chemicalGloves"
    | "fourGasMonitor"
    | "fallProtection"
    | "other1"
    | "other2"
    | "other3"
    | "other4";
  label: string;
};

export type PreparedItem = {
  id: "trained" | "toolsAndPpe" | "sds";
  label: string;
};

export type EmergencyContact = {
  id: string;
  label: string;
  phone: string;
};

export type CompanyContact = {
  id: string;
  label: string;
  phone: string;
};

/**
 * Core JSA steps, hazards, and controls for the "Loading" task.
 */
export const JSA_STEPS: JSAStep[] = [
  {
    id: "driving-on-location",
    title: "Driving on location",
    items: [
      {
        hazard:
          "Moving equipment, stationary equipment, personnel, flare, pressurized iron, wellheads, poor lighting/visibility, uneven ground, wet/soft ground, fire/explosion, triggering hazard.",
        controls:
          "Maintain 5 MPH on location at all times, scan the area while moving forward, maintain a safe distance from potential hazards, identify wind direction, muster points, and emergency evacuation routes, and maintain eye contact with moving personnel.",
      },
    ],
  },
  {
    id: "backing",
    title: "Backing",
    items: [
      {
        hazard: "Poor lighting/visibility, damage to equipment, personal injury.",
        controls:
          "Use forward movement if possible, use spotters when available, maintain constant radio contact with spotters at all times, walk the area before backing to identify potential hazards, and mark with orange cones.",
      },
    ],
  },
  {
    id: "connecting-hoses",
    title: "Connecting hoses",
    items: [
      {
        hazard:
          "Pressurized hoses, pinched fingers, poor connection, missing gaskets causing leaks, uneven/soft ground when moving hoses causing slips or falls, personal injury, static charge.",
        controls:
          "Check for trapped pressure and point hoses in a safe direction before connecting hoses; wear appropriate gloves when connecting hoses; inspect hose, fittings, and gaskets before connection; scan the area while walking on surfaces; connect grounding to prevent static discharge.",
      },
    ],
  },
  {
    id: "loading-fluids",
    title: "Loading fluids",
    items: [
      {
        hazard:
          "Overloading transport causes spills, personal exposure to fluids, and pinched fingers and hands while operating valves.",
        controls:
          "Maintain valve control and visual levels at all times, continuously scan hoses, valves, and manifolds for leaks, wear gloves and PPE prior to loading, and use headlights and transport lighting as needed.",
      },
    ],
  },
  {
    id: "checking-levels",
    title: "Checking levels on frac/production tanks",
    items: [
      {
        hazard: "Personal injury, slips, and trips when ascending and descending ladder, gases/fumes rising from the tank.",
        controls:
          "Maintain three points of contact when ascending and descending ladders, wear four gas monitors at all times to identify gases/fumes, and use appropriate measurement tools to ensure accurate levels.",
      },
    ],
  },
  {
    id: "offloading-fluids",
    title: "Offloading fluids",
    items: [
      {
        hazard:
          "Overloading tanks can cause spills, personal exposure to fluids, overpressure of the vacuum tank, and pinched fingers while operating valves.",
        controls:
          "Maintain valve control and visual levels at all times, continuously scan hoses, valves, and manifolds for leaks, wear gloves and PPE before loading, use headlights and transport lighting as needed.",
      },
    ],
  },
  {
    id: "disconnecting-hoses",
    title: "Disconnecting hoses",
    items: [
      {
        hazard: "Pressurized hoses, spills, pinched fingers/hands, static charge.",
        controls:
          "Verify valves are closed and hoses are depressurized before disconnecting, watch hand placement, and place buckets under connections to mitigate spills.",
      },
    ],
  },
  {
    id: "spill-cleanup",
    title: "Spill clean-up",
    items: [
      {
        hazard:
          "Working around overhead loads can cause injury, as can energized equipment, high-pressure iron causing damage to equipment and personal injury, and unknown fluids.",
        controls:
          "Understand overhead load fall radius, use caution while working around equipment, find and gauge high-pressure lines and mark and not run over them, question fluids being cleaned up, and maintain communication with employer in charge of equipment.",
      },
    ],
  },
  {
    id: "verify-complete",
    title: "Verify task is complete, job clean-up",
    items: [
      {
        hazard:
          "Slips, trips, falls while putting up equipment, leaving equipment or misplacing it while cleaning up, failing to ensure all job tasks are complete, causing poor work, and personal injury.",
        controls:
          "Utilize appropriate lighting, scan area for hoses and uneven ground, watch footing, walk around equipment to ensure everything is stored for transport, and speak with the pusher or facilities operator to ensure all tasks are complete.",
      },
    ],
  },
];

// Full-text Loading JSA record (matches provided wording)
export const LOADING_JSA = {
  task: "Loading",
  steps: [
    {
      step: "Entering & Exiting Location",
      hazard: "Running over objects",
      controls:
        "Be alert and go slow, 5 MPH, proper lighting, get out and look when backing, watch for markers",
    },
    {
      step: "Entering & Exiting Location",
      hazard: "Fire or Explosion",
      controls: "Notice wind direction",
    },
    {
      step: "Entering & Exiting Location",
      hazard: "Getting stuck",
      controls: "Tire placement, truck position, chains",
    },
    {
      step: "Gauge Tank",
      hazard: "Slips, trips & falls",
      controls: "Use handrail, watch footing, proper lighting",
    },
    {
      step: "Gauge Tank",
      hazard: "Pressure & fumes in tanks",
      controls: "Turn face away while opening, open tank slowly",
    },
    {
      step: "Gauge Tank",
      hazard: "Sparks or static discharge",
      controls:
        "Ground tank strap properly, touch grounded rail to discharge static",
    },
    {
      step: "Start Vacuum",
      hazard: "Creating Pressure",
      controls:
        "Be sure the selection on the pump is set to vacuum, be sure vents are free of obstruction and closed",
    },
    {
      step: "Connecting/Disconnecting Truck",
      hazard: "Leak or spill",
      controls:
        "Connect cam-lock correctly, use correct fittings, open valves in correct order, inspect hoses and fittings each load",
    },
    {
      step: "Connecting/Disconnecting Truck",
      hazard: "Pressure discharge",
      controls:
        "Release pressure or vacuum before disconnecting hoses or fittings",
    },
    {
      step: "Overfill truck",
      hazard: "Overfill truck",
      controls: "Watch gauges and gauge tank properly",
    },
    {
      step: "Sparks or static discharge (2)",
      hazard: "Sparks or static discharge",
      controls:
        "Ground tank strap properly, touch grounded rail to discharge static",
    },
    {
      step: "Watch Load",
      hazard: "Unwanted product entering truck",
      controls: "Watch site glass",
    },
  ],
  ppe: [
    "FR Clothing",
    "Hard Hat",
    "Hard Toe Boots",
    "Safety Glasses",
    "Gloves",
    "H2S Monitor",
    "Face Mask",
    "High-Vis Vest",
    "Fall Protection",
    "Hearing Protection",
    "Respirator",
    "SCBA",
    "Other",
  ],
  preparedForWorkChecklist: [
    "I am properly trained for the job",
    "I have the tools & PPE needed for work",
    "SDS",
  ],
  emergencyContacts: [
    "Fire/Ambulance/Rescue 911",
    "Montrail County Sheriff 701-628-2975",
    "ND Highway Patrol 701-857-6937",
    "McKenzie, Dunn and Billings County, ND State Radio County Sheriff 701-328-9921",
    "Williams County Sheriff 701-577-7700",
  ],
  companyContacts: ["Dispatch 701-730-5409", "Nile LeBaron 512-429-2344"],
};

// Full-text Unloading JSA record (exact provided wording)
export const UNLOADING_JSA = {
  task: "Unloading",
  steps: [
    {
      step: "Entering & Exiting Location",
      hazard: "Running over objects",
      controls:
        "Be alert and go slow, 5 MPH, proper lighting, get out and look when backing, watch for markers",
    },
    {
      step: "Entering & Exiting Location",
      hazard: "Fire or Explosion",
      controls: "Notice wind direction",
    },
    {
      step: "Entering & Exiting Location",
      hazard: "Getting stuck",
      controls: "Tire placement, truck position, chains",
    },
    {
      step: "Entering & Exiting Location",
      hazard: "Pressure & fumes in tanks",
      controls: "Turn face away while opening, open tank slowly",
    },
    {
      step: "Entering & Exiting Location",
      hazard: "Sparks or static discharge",
      controls: "Ground tank strap properly, touch grounded rail to discharge static",
    },
    {
      step: "Connecting/Disconnecting Truck",
      hazard: "Leak or spill",
      controls:
        "Connect cam-lock correctly, use correct fittings, open valves in correct order, inspect hoses and fittings each load",
    },
    {
      step: "Connecting/Disconnecting Truck",
      hazard: "Pressure discharge",
      controls: "Release pressure or vacuum before disconnecting hoses or fittings",
    },
    {
      step: "Connecting/Disconnecting Truck",
      hazard: "Sparks or static discharge",
      controls: "Ground tank strap properly, touch grounded rail to discharge static",
    },
    {
      step: "Start Pressure",
      hazard: "Creating Vacuum",
      controls:
        "Be sure the selection on the pump is set to pressure and vents are free of obstruction and closed, watch pressure gauge",
    },
    {
      step: "Watch Load",
      hazard: "Unwanted product entering disposal",
      controls: "Watch site glass",
    },
    {
      step: "Watch Load",
      hazard: "Overfill truck",
      controls: "Watch levels, don't blow air",
    },
  ],
  ppe: [
    "FR Clothing",
    "Hard Hat",
    "Hard Toe Boots",
    "Safety Glasses",
    "Gloves",
    "H2S Monitor",
    "Face Mask",
    "High-Vis Vest",
    "Fall Protection",
    "Hearing Protection",
    "Respirator",
    "SCBA",
    "Other",
  ],
  preparedForWorkChecklist: [
    "I am proberly trained for the job",
    "I have the tools & PPE needed for work",
    "SDS",
  ],
  emergencyContacts: [
    "Fire/Ambulance/Rescue 911",
    "Montrail County Sheriff 701-628-2975",
    "ND Highway Patrol 701-857-6937",
    "McKenzie, Dunn and Billings County, ND State Radio County Sheriff 701-328-9921",
    "Williams County Sheriff 701-577-7700",
  ],
  companyContacts: ["Dispatch 701-730-5409", "Nile LeBaron 512-429-2344"],
};

/**
 * PPE options listed on the JSA:
 * Required PPE for Liquid Gold Trucking
 */
export const PPE_ITEMS: PpeItem[] = [
  { id: "safetyGlasses", label: "Safety Glasses" },
  { id: "safetyShoes", label: "Safety Shoes" },
  { id: "frClothing", label: "FR Clothing" },
  { id: "hearingProtection", label: "Hearing Protection" },
  { id: "hardHat", label: "Hard Hat" },
  { id: "respirator", label: "Respirator" },
  { id: "chemicalGloves", label: "Chemical/Impact Gloves" },
  { id: "fourGasMonitor", label: "Four Gas Monitor" },
  { id: "fallProtection", label: "Fall Protection" },
  { id: "other1", label: "Other" },
  { id: "other2", label: "Other" },
  { id: "other3", label: "Other" },
  { id: "other4", label: "Other" },
];

/**
 * "I am prepared for work" checklist from the form:
 *  [ ] I am properly trained for the job
 *  [ ] I have the tools & PPE needed for work
 *  [ ] SDS
 */
export const PREPARED_FOR_WORK_ITEMS: PreparedItem[] = [
  {
    id: "trained",
    label: "I am properly trained for the job",
  },
  {
    id: "toolsAndPpe",
    label: "I have the tools & PPE needed for work",
  },
  {
    id: "sds",
    label: "SDS",
  },
];

/**
 * Emergency contact info for Liquid Gold Trucking.
 */
export const EMERGENCY_CONTACTS: EmergencyContact[] = [
  { id: "travisJohnson", label: "Travis Johnson", phone: "636-573-3822" },
  { id: "phillipNowak", label: "Phillip Nowak", phone: "701-609-2604" },
  { id: "liquidGoldDispatch", label: "Liquid Gold Dispatch", phone: "701-730-5409" },
  { id: "emergency911", label: "Emergency", phone: "911" },
  { id: "ndHighwayPatrol", label: "ND Highway Patrol", phone: "701-857-6937" },
  { id: "williamsCountySheriff", label: "Williams County Sheriff", phone: "701-577-7700" },
  { id: "mckenzieCountySheriff", label: "McKenzie County Sheriff", phone: "701-444-3654" },
];

export const COMPANY_CONTACTS: CompanyContact[] = [
  { id: "dispatch", label: "Dispatch", phone: "701-730-5409" },
  { id: "nileLeBaron", label: "Nile LeBaron", phone: "512-429-2344" },
];
