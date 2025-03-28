import { Database } from "./supabase";

export type UserRole = "application_admin" | "union_admin" | "division_admin" | "user";

// Company admin is handled separately through Supabase auth metadata
export type CompanyAdminRole = "company_admin";

export type ContactPreference = "phone" | "text" | "email";

export type MemberRow = Database["public"]["Tables"]["members"]["Row"] & {
  phone_number?: string;
};

export interface UserProfile extends Omit<MemberRow, "contact_preference"> {
  contact_preference?: ContactPreference;
  phone?: string;
  notificationPreferences?: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
}
