export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      members: {
        Row: {
          company_hire_date: string | null
          created_at: string | null
          date_of_birth: string | null
          deleted: boolean | null
          division: string | null
          dmir_sen_roster: number | null
          dwp_sen_roster: number | null
          eje_sen_roster: number | null
          engineer_date: string | null
          first_name: string | null
          home_zone: string | null
          id: string | null
          last_name: string | null
          misc_notes: string | null
          pin_number: number
          prior_vac_sys: number | null
          rank: string | null
          role: string | null
          sdv_entitlement: number | null
          status: string | null
          system_sen_type: string | null
          updated_at: string | null
          username: string | null
          wc_sen_roster: number | null
          zone: string | null
        }
        Insert: {
          company_hire_date?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deleted?: boolean | null
          division?: string | null
          dmir_sen_roster?: number | null
          dwp_sen_roster?: number | null
          eje_sen_roster?: number | null
          engineer_date?: string | null
          first_name?: string | null
          home_zone?: string | null
          id?: string | null
          last_name?: string | null
          misc_notes?: string | null
          pin_number: number
          prior_vac_sys?: number | null
          rank?: string | null
          role?: string | null
          sdv_entitlement?: number | null
          status?: string | null
          system_sen_type?: string | null
          updated_at?: string | null
          username?: string | null
          wc_sen_roster?: number | null
          zone?: string | null
        }
        Update: {
          company_hire_date?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          deleted?: boolean | null
          division?: string | null
          dmir_sen_roster?: number | null
          dwp_sen_roster?: number | null
          eje_sen_roster?: number | null
          engineer_date?: string | null
          first_name?: string | null
          home_zone?: string | null
          id?: string | null
          last_name?: string | null
          misc_notes?: string | null
          pin_number?: number
          prior_vac_sys?: number | null
          rank?: string | null
          role?: string | null
          sdv_entitlement?: number | null
          status?: string | null
          system_sen_type?: string | null
          updated_at?: string | null
          username?: string | null
          wc_sen_roster?: number | null
          zone?: string | null
        }
        Relationships: []
      }
      pld_sdv_allotments: {
        Row: {
          current_requests: number | null
          date: string
          division: string
          id: string
          max_allotment: number
        }
        Insert: {
          current_requests?: number | null
          date: string
          division: string
          id?: string
          max_allotment: number
        }
        Update: {
          current_requests?: number | null
          date?: string
          division?: string
          id?: string
          max_allotment?: number
        }
        Relationships: []
      }
      pld_sdv_requests: {
        Row: {
          division: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          member_id: string
          paid_in_lieu: boolean | null
          request_date: string
          requested_at: string | null
          responded_at: string | null
          responded_by: string | null
          status: Database["public"]["Enums"]["pld_sdv_status"]
          waitlist_position: number | null
        }
        Insert: {
          division: string
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          member_id: string
          paid_in_lieu?: boolean | null
          request_date: string
          requested_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["pld_sdv_status"]
          waitlist_position?: number | null
        }
        Update: {
          division?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          member_id?: string
          paid_in_lieu?: boolean | null
          request_date?: string
          requested_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["pld_sdv_status"]
          waitlist_position?: number | null
        }
        Relationships: []
      }
      vacation_allotments: {
        Row: {
          current_requests: number | null
          division: string
          id: string
          max_allotment: number
          vac_year: number
          week_start_date: string
        }
        Insert: {
          current_requests?: number | null
          division: string
          id?: string
          max_allotment: number
          vac_year: number
          week_start_date: string
        }
        Update: {
          current_requests?: number | null
          division?: string
          id?: string
          max_allotment?: number
          vac_year?: number
          week_start_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_pending_request: {
        Args: {
          request_id: string
          user_id: string
        }
        Returns: boolean
      }
      check_active_request_exists: {
        Args: {
          p_member_id: string
          p_request_date: string
          p_request_id?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      division:
        | "163"
        | "173"
        | "174"
        | "175"
        | "184"
        | "185"
        | "188"
        | "209"
        | "520"
      leave_type: "PLD" | "SDV"
      pld_sdv_status:
        | "pending"
        | "approved"
        | "denied"
        | "waitlisted"
        | "cancellation_pending"
        | "cancelled"
      role:
        | "user"
        | "division_admin"
        | "union_admin"
        | "application_admin"
        | "company_admin"
      sys_seniority_type: "WC" | "DMIR" | "DWP" | "SYS1" | "EJ&E" | "SYS2"
      user_role: "member" | "company_admin"
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
        | "zone 13"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
