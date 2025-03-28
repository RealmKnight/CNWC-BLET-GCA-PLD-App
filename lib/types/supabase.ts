export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Custom enums from database
export type Division = "163" | "173" | "174" | "175" | "184" | "185" | "188" | "209" | "520";
export type Zone =
  | "zone 1"
  | "zone 2"
  | "zone 3"
  | "zone 4"
  | "zone 5"
  | "zone 6"
  | "zone 7"
  | "zone 8"
  | "zone 9"
  | "zone 10"
  | "zone 11"
  | "zone 12"
  | "zone 13";
export type LeaveType = "PLD" | "SDV";
export type PldSdvStatus = "pending" | "approved" | "denied" | "waitlisted" | "cancellation_pending" | "cancelled";
export type Role = "user" | "division_admin" | "union_admin" | "application_admin" | "company_admin";
export type SysSeniorityType = "WC" | "DMIR" | "DWP" | "SYS1" | "EJ&E" | "SYS2";
export type UserRole = "member" | "company_admin";

export interface Database {
  public: {
    Tables: {
      members: {
        Row: {
          id: string | null;
          created_at: string | null;
          username: string | null;
          pin_number: number;
          company_hire_date: string | null;
          engineer_date: string | null;
          first_name: string | null;
          last_name: string | null;
          system_sen_type: string | null;
          prior_vac_sys: number | null;
          misc_notes: string | null;
          wc_sen_roster: number | null;
          dwp_sen_roster: number | null;
          dmir_sen_roster: number | null;
          eje_sen_roster: number | null;
          zone: string | null;
          division: string | null;
          date_of_birth: string | null;
          status: string | null;
          rank: string | null;
          updated_at: string | null;
          deleted: boolean | null;
          home_zone: string | null;
          role: string | null;
          sdv_entitlement: number | null;
        };
        Insert: {
          id?: string | null;
          created_at?: string | null;
          username?: string | null;
          pin_number: number;
          company_hire_date?: string | null;
          engineer_date?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          system_sen_type?: string | null;
          prior_vac_sys?: number | null;
          misc_notes?: string | null;
          wc_sen_roster?: number | null;
          dwp_sen_roster?: number | null;
          dmir_sen_roster?: number | null;
          eje_sen_roster?: number | null;
          zone?: string | null;
          division?: string | null;
          date_of_birth?: string | null;
          status?: string | null;
          rank?: string | null;
          updated_at?: string | null;
          deleted?: boolean | null;
          home_zone?: string | null;
          role?: string | null;
          sdv_entitlement?: number | null;
        };
        Update: {
          id?: string | null;
          created_at?: string | null;
          username?: string | null;
          pin_number?: number;
          company_hire_date?: string | null;
          engineer_date?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          system_sen_type?: string | null;
          prior_vac_sys?: number | null;
          misc_notes?: string | null;
          wc_sen_roster?: number | null;
          dwp_sen_roster?: number | null;
          dmir_sen_roster?: number | null;
          eje_sen_roster?: number | null;
          zone?: string | null;
          division?: string | null;
          date_of_birth?: string | null;
          status?: string | null;
          rank?: string | null;
          updated_at?: string | null;
          deleted?: boolean | null;
          home_zone?: string | null;
          role?: string | null;
          sdv_entitlement?: number | null;
        };
      };
      messages: {
        Row: {
          id: string;
          sender_id: string | null;
          recipient_id: string | null;
          subject: string;
          content: string;
          is_read: boolean | null;
          is_deleted: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          sender_id?: string | null;
          recipient_id?: string | null;
          subject: string;
          content: string;
          is_read?: boolean | null;
          is_deleted?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          sender_id?: string | null;
          recipient_id?: string | null;
          subject?: string;
          content?: string;
          is_read?: boolean | null;
          is_deleted?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      pld_sdv_allotments: {
        Row: {
          id: string;
          division: string;
          date: string;
          max_allotment: number;
          current_requests: number | null;
        };
        Insert: {
          id?: string;
          division: string;
          date: string;
          max_allotment: number;
          current_requests?: number | null;
        };
        Update: {
          id?: string;
          division?: string;
          date?: string;
          max_allotment?: number;
          current_requests?: number | null;
        };
      };
      pld_sdv_requests: {
        Row: {
          id: string;
          member_id: string;
          division: string;
          request_date: string;
          leave_type: LeaveType;
          status: PldSdvStatus;
          requested_at: string | null;
          waitlist_position: number | null;
          responded_at: string | null;
          responded_by: string | null;
          paid_in_lieu: boolean | null;
        };
        Insert: {
          id?: string;
          member_id: string;
          division: string;
          request_date: string;
          leave_type: LeaveType;
          status?: PldSdvStatus;
          requested_at?: string | null;
          waitlist_position?: number | null;
          responded_at?: string | null;
          responded_by?: string | null;
          paid_in_lieu?: boolean | null;
        };
        Update: {
          id?: string;
          member_id?: string;
          division?: string;
          request_date?: string;
          leave_type?: LeaveType;
          status?: PldSdvStatus;
          requested_at?: string | null;
          waitlist_position?: number | null;
          responded_at?: string | null;
          responded_by?: string | null;
          paid_in_lieu?: boolean | null;
        };
      };
      vacation_allotments: {
        Row: {
          id: string;
          division: string;
          week_start_date: string;
          max_allotment: number;
          current_requests: number | null;
          vac_year: number;
        };
        Insert: {
          id?: string;
          division: string;
          week_start_date: string;
          max_allotment: number;
          current_requests?: number | null;
          vac_year: number;
        };
        Update: {
          id?: string;
          division?: string;
          week_start_date?: string;
          max_allotment?: number;
          current_requests?: number | null;
          vac_year?: number;
        };
      };
      divisions: {
        Row: {
          id: number;
          name: string;
          location: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          location: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          location?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      zones: {
        Row: {
          id: number;
          name: string;
          division_id: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          name: string;
          division_id: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          name?: string;
          division_id?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      division: Division;
      zone: Zone;
      leave_type: LeaveType;
      pld_sdv_status: PldSdvStatus;
      role: Role;
      sys_seniority_type: SysSeniorityType;
      user_role: UserRole;
    };
  };
}
