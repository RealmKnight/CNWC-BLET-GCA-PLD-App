export const REQUIRED_POSITIONS = [
  "President",
  "Vice-President",
  "Secretary/Treasurer",
  "Alternate Secretary/Treasurer",
  "Legislative Representative",
  "Alternate Legislative Representative",
  "Local Chairman",
  "First Vice-Local Chairman",
  "Second Vice-Local Chairman",
  "Guide",
  "Chaplain",
  "Delegate to the National Division",
  "First Alternate Delegate to the National Division",
  "Second Alternate Delegate to the National Division",
  "First Trustee",
  "Second Trustee",
  "Third Trustee",
  "First Alternate Trustee",
  "Second Alternate Trustee",
  "Third Alternate Trustee",
] as const;

export const OPTIONAL_POSITIONS = [
  "Third Vice-Local Chairman",
  "Fourth Vice-Local Chairman",
  "Fifth Vice-Local Chairman",
] as const;

export type RequiredPosition = (typeof REQUIRED_POSITIONS)[number];
export type OptionalPosition = (typeof OPTIONAL_POSITIONS)[number];
export type OfficerPosition = RequiredPosition | OptionalPosition;

export interface OfficerAssignment {
  id: string;
  memberPin: number;
  position: OfficerPosition;
  division: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CurrentOfficer extends OfficerAssignment {
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  role: string;
}

// Position validation rules
export const POSITION_RULES = {
  // Positions that can't be held simultaneously
  mutuallyExclusive: [
    ["President", "Vice-President"],
    ["Secretary/Treasurer", "Alternate Secretary/Treasurer"],
    ["Legislative Representative", "Alternate Legislative Representative"],
  ] as const,

  // Positions that are allowed to be held together (not required)
  allowedCombinations: {
    "Local Chairman": [
      "First Vice-Local Chairman",
      "Second Vice-Local Chairman",
      "Third Vice-Local Chairman",
      "Fourth Vice-Local Chairman",
      "Fifth Vice-Local Chairman",
    ] as OfficerPosition[],
    "First Vice-Local Chairman": ["Local Chairman"] as OfficerPosition[],
    "Second Vice-Local Chairman": ["Local Chairman"] as OfficerPosition[],
    "Third Vice-Local Chairman": ["Local Chairman"] as OfficerPosition[],
    "Fourth Vice-Local Chairman": ["Local Chairman"] as OfficerPosition[],
    "Fifth Vice-Local Chairman": ["Local Chairman"] as OfficerPosition[],
  } as const,

  // Maximum number of positions a member can hold
  maxPositionsPerMember: 3,
} as const;
