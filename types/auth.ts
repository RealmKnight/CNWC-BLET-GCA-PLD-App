export type UserRole = "application_admin" | "union_admin" | "division_admin" | "user";

// Company admin is handled separately through Supabase auth metadata
export type CompanyAdminRole = "company_admin";

export interface UserProfile {
  phone?: string;
  notificationPreferences?: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
}
