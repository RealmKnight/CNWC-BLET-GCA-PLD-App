import { Database } from "./supabase";

export type UserRole = "application_admin" | "union_admin" | "division_admin" | "company_admin" | "user";

export interface Member {
  id: string; // UUID from auth.user
  pin_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  division_id: number;
  zone_id: number;
  role: Exclude<UserRole, "company_admin">; // company_admin is stored in auth.user.metadata
  hire_date: string;
  seniority_date?: string; // Some members might have a different seniority date than hire date
  officer_roles?: string[]; // Division officer positions
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  isCompanyAdmin: boolean;
  member?: Member; // Will be undefined for company admins
}

export interface AuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  error: Error | null;
}

// Division interface as mentioned in instructions
export interface Division {
  id: number;
  name: string;
  location: string;
  zones: Zone[];
}

export interface Zone {
  id: number;
  name: string;
  division_id: number;
}

// Officer positions as mentioned in instructions
export const REQUIRED_OFFICER_POSITIONS = [
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

export const OPTIONAL_OFFICER_POSITIONS = [
  "Third Vice-Local Chairman",
  "Fourth Vice-Local Chairman",
  "Fifth Vice-Local Chairman",
] as const;

export type RequiredOfficerPosition = (typeof REQUIRED_OFFICER_POSITIONS)[number];
export type OptionalOfficerPosition = (typeof OPTIONAL_OFFICER_POSITIONS)[number];
export type OfficerPosition = RequiredOfficerPosition | OptionalOfficerPosition;
