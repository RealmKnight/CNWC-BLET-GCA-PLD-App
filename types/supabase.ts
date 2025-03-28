export type Database = {
  public: {
    Tables: {
      members: {
        Row: {
          id: string;
          created_at?: string;
          username?: string;
          pin_number: number;
          company_hire_date?: string;
          engineer_date?: string;
          first_name?: string;
          last_name?: string;
          system_sen_type?: string;
          prior_vac_sys?: number;
          misc_notes?: string;
          wc_sen_roster?: number;
          dwp_sen_roster?: number;
          dmir_sen_roster?: number;
          eje_sen_roster?: number;
          zone?: string;
          division?: string;
          date_of_birth?: string;
          status?: string;
          rank?: string;
          updated_at?: string;
          deleted?: boolean;
          home_zone?: string;
          role?: string;
          sdv_entitlement?: number;
          phone_number?: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          username?: string;
          pin_number: number;
          company_hire_date?: string;
          engineer_date?: string;
          first_name?: string;
          last_name?: string;
          system_sen_type?: string;
          prior_vac_sys?: number;
          misc_notes?: string;
          wc_sen_roster?: number;
          dwp_sen_roster?: number;
          dmir_sen_roster?: number;
          eje_sen_roster?: number;
          zone?: string;
          division?: string;
          date_of_birth?: string;
          status?: string;
          rank?: string;
          updated_at?: string;
          deleted?: boolean;
          home_zone?: string;
          role?: string;
          sdv_entitlement?: number;
          phone_number?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          username?: string;
          pin_number?: number;
          company_hire_date?: string;
          engineer_date?: string;
          first_name?: string;
          last_name?: string;
          system_sen_type?: string;
          prior_vac_sys?: number;
          misc_notes?: string;
          wc_sen_roster?: number;
          dwp_sen_roster?: number;
          dmir_sen_roster?: number;
          eje_sen_roster?: number;
          zone?: string;
          division?: string;
          date_of_birth?: string;
          status?: string;
          rank?: string;
          updated_at?: string;
          deleted?: boolean;
          home_zone?: string;
          role?: string;
          sdv_entitlement?: number;
          phone_number?: string;
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
      messages: {
        Row: {
          id: string;
          sender_id?: string;
          recipient_id?: string;
          subject: string;
          content: string;
          is_read?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          sender_id?: string;
          recipient_id?: string;
          subject: string;
          content: string;
          is_read?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          recipient_id?: string;
          subject?: string;
          content?: string;
          is_read?: boolean;
          is_deleted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      pld_sdv_allotments: {
        Row: {
          id: string;
          division: string;
          date: string;
          max_allotment: number;
          current_requests?: number;
        };
        Insert: {
          id?: string;
          division: string;
          date: string;
          max_allotment: number;
          current_requests?: number;
        };
        Update: {
          id?: string;
          division?: string;
          date?: string;
          max_allotment?: number;
          current_requests?: number;
        };
      };
      pld_sdv_requests: {
        Row: {
          id: string;
          member_id: string;
          division: string;
          request_date: string;
          leave_type: "PLD" | "SDV";
          status: "pending" | "approved" | "denied" | "waitlisted" | "cancellation_pending" | "cancelled";
          requested_at?: string;
          waitlist_position?: number;
          responded_at?: string;
          responded_by?: string;
          paid_in_lieu?: boolean;
        };
        Insert: {
          id?: string;
          member_id: string;
          division: string;
          request_date: string;
          leave_type: "PLD" | "SDV";
          status?: "pending" | "approved" | "denied" | "waitlisted" | "cancellation_pending" | "cancelled";
          requested_at?: string;
          waitlist_position?: number;
          responded_at?: string;
          responded_by?: string;
          paid_in_lieu?: boolean;
        };
        Update: {
          id?: string;
          member_id?: string;
          division?: string;
          request_date?: string;
          leave_type?: "PLD" | "SDV";
          status?: "pending" | "approved" | "denied" | "waitlisted" | "cancellation_pending" | "cancelled";
          requested_at?: string;
          waitlist_position?: number;
          responded_at?: string;
          responded_by?: string;
          paid_in_lieu?: boolean;
        };
      };
      vacation_allotments: {
        Row: {
          id: string;
          division: string;
          week_start_date: string;
          max_allotment: number;
          current_requests?: number;
          vac_year: number;
        };
        Insert: {
          id?: string;
          division: string;
          week_start_date: string;
          max_allotment: number;
          current_requests?: number;
          vac_year: number;
        };
        Update: {
          id?: string;
          division?: string;
          week_start_date?: string;
          max_allotment?: number;
          current_requests?: number;
          vac_year?: number;
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
      division: "163" | "173" | "174" | "175" | "184" | "185" | "188" | "209" | "520";
      leave_type: "PLD" | "SDV";
      pld_sdv_status: "pending" | "approved" | "denied" | "waitlisted" | "cancellation_pending" | "cancelled";
      role: "user" | "division_admin" | "union_admin" | "application_admin" | "company_admin";
      sys_seniority_type: "WC" | "DMIR" | "DWP" | "SYS1" | "EJ&E" | "SYS2";
      user_role: "member" | "company_admin";
      zone:
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
    };
  };
};
