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
          week_start_date: string;
          max_allotment: number;
          current_requests?: number;
          created_at?: string;
          updated_at?: string;
        };
        Insert: {
          id?: string;
          division: string;
          week_start_date: string;
          max_allotment: number;
          current_requests?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          division?: string;
          week_start_date?: string;
          max_allotment?: number;
          current_requests?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      pld_sdv_requests: {
        Row: {
          id: string;
          member_id: string;
          week_start_date: string;
          status: string;
          created_at?: string;
          updated_at?: string;
          responded_at?: string;
          responded_by?: string;
          paid_in_lieu?: boolean;
        };
        Insert: {
          id?: string;
          member_id: string;
          week_start_date: string;
          status: string;
          created_at?: string;
          updated_at?: string;
          responded_at?: string;
          responded_by?: string;
          paid_in_lieu?: boolean;
        };
        Update: {
          id?: string;
          member_id?: string;
          week_start_date?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
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
      [_ in never]: never;
    };
  };
};
