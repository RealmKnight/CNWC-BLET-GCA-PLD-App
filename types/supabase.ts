export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          operationName?: string;
          query?: string;
          variables?: Json;
          extensions?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_messages: {
        Row: {
          created_at: string | null;
          from_user_id: string;
          id: string;
          message: string;
          status: string;
          to_division_id: number;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          from_user_id: string;
          id?: string;
          message: string;
          status?: string;
          to_division_id: number;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          from_user_id?: string;
          id?: string;
          message?: string;
          status?: string;
          to_division_id?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "admin_messages_from_user_id_fkey";
            columns: ["from_user_id"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_messages_to_division_id_fkey";
            columns: ["to_division_id"];
            isOneToOne: false;
            referencedRelation: "divisions";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_preferences: {
        Row: {
          created_at: string | null;
          division: string;
          id: string;
          last_selected_zone_id: number | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          division: string;
          id?: string;
          last_selected_zone_id?: number | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          division?: string;
          id?: string;
          last_selected_zone_id?: number | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_preferences_last_selected_zone_id_fkey";
            columns: ["last_selected_zone_id"];
            isOneToOne: false;
            referencedRelation: "zones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_roles: {
        Row: {
          created_at: string | null;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          role: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      calendar_audit_trail: {
        Row: {
          action_type: string;
          changed_at: string | null;
          changed_by: string | null;
          id: string;
          metadata: Json | null;
          new_values: Json | null;
          old_values: Json | null;
          record_id: string;
          table_name: string;
        };
        Insert: {
          action_type: string;
          changed_at?: string | null;
          changed_by?: string | null;
          id?: string;
          metadata?: Json | null;
          new_values?: Json | null;
          old_values?: Json | null;
          record_id: string;
          table_name: string;
        };
        Update: {
          action_type?: string;
          changed_at?: string | null;
          changed_by?: string | null;
          id?: string;
          metadata?: Json | null;
          new_values?: Json | null;
          old_values?: Json | null;
          record_id?: string;
          table_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_audit_trail_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      calendars: {
        Row: {
          created_at: string;
          description: string | null;
          division_id: number;
          id: string;
          is_active: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          division_id: number;
          id?: string;
          is_active?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          division_id?: number;
          id?: string;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendars_division_id_fkey";
            columns: ["division_id"];
            isOneToOne: false;
            referencedRelation: "divisions";
            referencedColumns: ["id"];
          },
        ];
      };
      divisions: {
        Row: {
          created_at: string;
          id: number;
          location: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          location: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          location?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      members: {
        Row: {
          calendar_id: string | null;
          company_hire_date: string | null;
          created_at: string | null;
          current_zone_id: number | null;
          date_of_birth: string | null;
          deleted: boolean | null;
          division_id: number | null;
          dmir_sen_roster: number | null;
          dwp_sen_roster: number | null;
          eje_sen_roster: number | null;
          engineer_date: string | null;
          first_name: string | null;
          home_zone_id: number | null;
          id: string | null;
          last_name: string | null;
          max_plds: number | null;
          misc_notes: string | null;
          phone_number: string | null;
          pin_number: number;
          pld_rolled_over: number | null;
          prior_vac_sys: number | null;
          rank: string | null;
          role: string | null;
          sdv_election: number | null;
          sdv_entitlement: number | null;
          status: string | null;
          system_sen_type: string | null;
          updated_at: string | null;
          username: string | null;
          wc_sen_roster: number | null;
        };
        Insert: {
          calendar_id?: string | null;
          company_hire_date?: string | null;
          created_at?: string | null;
          current_zone_id?: number | null;
          date_of_birth?: string | null;
          deleted?: boolean | null;
          division_id?: number | null;
          dmir_sen_roster?: number | null;
          dwp_sen_roster?: number | null;
          eje_sen_roster?: number | null;
          engineer_date?: string | null;
          first_name?: string | null;
          home_zone_id?: number | null;
          id?: string | null;
          last_name?: string | null;
          max_plds?: number | null;
          misc_notes?: string | null;
          phone_number?: string | null;
          pin_number: number;
          pld_rolled_over?: number | null;
          prior_vac_sys?: number | null;
          rank?: string | null;
          role?: string | null;
          sdv_election?: number | null;
          sdv_entitlement?: number | null;
          status?: string | null;
          system_sen_type?: string | null;
          updated_at?: string | null;
          username?: string | null;
          wc_sen_roster?: number | null;
        };
        Update: {
          calendar_id?: string | null;
          company_hire_date?: string | null;
          created_at?: string | null;
          current_zone_id?: number | null;
          date_of_birth?: string | null;
          deleted?: boolean | null;
          division_id?: number | null;
          dmir_sen_roster?: number | null;
          dwp_sen_roster?: number | null;
          eje_sen_roster?: number | null;
          engineer_date?: string | null;
          first_name?: string | null;
          home_zone_id?: number | null;
          id?: string | null;
          last_name?: string | null;
          max_plds?: number | null;
          misc_notes?: string | null;
          phone_number?: string | null;
          pin_number?: number;
          pld_rolled_over?: number | null;
          prior_vac_sys?: number | null;
          rank?: string | null;
          role?: string | null;
          sdv_election?: number | null;
          sdv_entitlement?: number | null;
          status?: string | null;
          system_sen_type?: string | null;
          updated_at?: string | null;
          username?: string | null;
          wc_sen_roster?: number | null;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string[] | null;
          content: string;
          created_at: string | null;
          id: string;
          is_archived: boolean | null;
          is_deleted: boolean | null;
          is_read: boolean | null;
          message_type: string | null;
          metadata: Json | null;
          read_at: string | null;
          read_by: Json | null;
          recipient_id: string | null;
          recipient_pin_number: number | null;
          requires_acknowledgment: boolean | null;
          sender_id: string | null;
          sender_pin_number: number | null;
          subject: string;
          updated_at: string | null;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string[] | null;
          content: string;
          created_at?: string | null;
          id?: string;
          is_archived?: boolean | null;
          is_deleted?: boolean | null;
          is_read?: boolean | null;
          message_type?: string | null;
          metadata?: Json | null;
          read_at?: string | null;
          read_by?: Json | null;
          recipient_id?: string | null;
          recipient_pin_number?: number | null;
          requires_acknowledgment?: boolean | null;
          sender_id?: string | null;
          sender_pin_number?: number | null;
          subject: string;
          updated_at?: string | null;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string[] | null;
          content?: string;
          created_at?: string | null;
          id?: string;
          is_archived?: boolean | null;
          is_deleted?: boolean | null;
          is_read?: boolean | null;
          message_type?: string | null;
          metadata?: Json | null;
          read_at?: string | null;
          read_by?: Json | null;
          recipient_id?: string | null;
          recipient_pin_number?: number | null;
          requires_acknowledgment?: boolean | null;
          sender_id?: string | null;
          sender_pin_number?: number | null;
          subject?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_recipient_pin_number";
            columns: ["recipient_pin_number"];
            isOneToOne: false;
            referencedRelation: "member_profiles";
            referencedColumns: ["pin_number"];
          },
          {
            foreignKeyName: "fk_recipient_pin_number";
            columns: ["recipient_pin_number"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["pin_number"];
          },
          {
            foreignKeyName: "messages_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      officer_positions: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          division: string;
          end_date: string | null;
          id: string;
          member_pin: number;
          position: Database["public"]["Enums"]["officer_position_type"];
          start_date: string;
          updated_at: string | null;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          division: string;
          end_date?: string | null;
          id?: string;
          member_pin: number;
          position: Database["public"]["Enums"]["officer_position_type"];
          start_date?: string;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          division?: string;
          end_date?: string | null;
          id?: string;
          member_pin?: number;
          position?: Database["public"]["Enums"]["officer_position_type"];
          start_date?: string;
          updated_at?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "officer_positions_member_pin_fkey";
            columns: ["member_pin"];
            isOneToOne: false;
            referencedRelation: "member_profiles";
            referencedColumns: ["pin_number"];
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey";
            columns: ["member_pin"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["pin_number"];
          },
        ];
      };
      pld_sdv_allotments: {
        Row: {
          calendar_id: string | null;
          current_requests: number | null;
          date: string;
          id: string;
          is_override: boolean | null;
          max_allotment: number;
          override_at: string | null;
          override_by: string | null;
          override_reason: string | null;
          updated_at: string | null;
          updated_by: string | null;
          year: number | null;
        };
        Insert: {
          calendar_id?: string | null;
          current_requests?: number | null;
          date: string;
          id?: string;
          is_override?: boolean | null;
          max_allotment: number;
          override_at?: string | null;
          override_by?: string | null;
          override_reason?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          year?: number | null;
        };
        Update: {
          calendar_id?: string | null;
          current_requests?: number | null;
          date?: string;
          id?: string;
          is_override?: boolean | null;
          max_allotment?: number;
          override_at?: string | null;
          override_by?: string | null;
          override_reason?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          year?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "pld_sdv_allotments_override_by_fkey";
            columns: ["override_by"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pld_sdv_allotments_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      pld_sdv_denial_reasons: {
        Row: {
          created_at: string | null;
          id: number;
          is_active: boolean | null;
          reason: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          is_active?: boolean | null;
          reason: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          is_active?: boolean | null;
          reason?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      pld_sdv_requests: {
        Row: {
          actioned_at: string | null;
          actioned_by: string | null;
          calendar_id: string | null;
          created_at: string | null;
          denial_comment: string | null;
          denial_reason_id: number | null;
          id: string;
          is_rollover_pld: boolean | null;
          leave_type: Database["public"]["Enums"]["leave_type"];
          member_id: string;
          metadata: Json | null;
          override_by: string | null;
          paid_in_lieu: boolean | null;
          request_date: string;
          requested_at: string | null;
          responded_at: string | null;
          responded_by: string | null;
          status: Database["public"]["Enums"]["pld_sdv_status"];
          updated_at: string | null;
          waitlist_position: number | null;
        };
        Insert: {
          actioned_at?: string | null;
          actioned_by?: string | null;
          calendar_id?: string | null;
          created_at?: string | null;
          denial_comment?: string | null;
          denial_reason_id?: number | null;
          id?: string;
          is_rollover_pld?: boolean | null;
          leave_type: Database["public"]["Enums"]["leave_type"];
          member_id: string;
          metadata?: Json | null;
          override_by?: string | null;
          paid_in_lieu?: boolean | null;
          request_date: string;
          requested_at?: string | null;
          responded_at?: string | null;
          responded_by?: string | null;
          status?: Database["public"]["Enums"]["pld_sdv_status"];
          updated_at?: string | null;
          waitlist_position?: number | null;
        };
        Update: {
          actioned_at?: string | null;
          actioned_by?: string | null;
          calendar_id?: string | null;
          created_at?: string | null;
          denial_comment?: string | null;
          denial_reason_id?: number | null;
          id?: string;
          is_rollover_pld?: boolean | null;
          leave_type?: Database["public"]["Enums"]["leave_type"];
          member_id?: string;
          metadata?: Json | null;
          override_by?: string | null;
          paid_in_lieu?: boolean | null;
          request_date?: string;
          requested_at?: string | null;
          responded_at?: string | null;
          responded_by?: string | null;
          status?: Database["public"]["Enums"]["pld_sdv_status"];
          updated_at?: string | null;
          waitlist_position?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_member";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "member_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fk_member";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pld_sdv_requests_actioned_by_fkey";
            columns: ["actioned_by"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pld_sdv_requests_denial_reason_id_fkey";
            columns: ["denial_reason_id"];
            isOneToOne: false;
            referencedRelation: "pld_sdv_denial_reasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pld_sdv_requests_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pld_sdv_requests_override_by_fkey";
            columns: ["override_by"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pld_sdv_requests_responded_by_fkey";
            columns: ["responded_by"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      push_notification_deliveries: {
        Row: {
          created_at: string | null;
          delivered_at: string | null;
          error_message: string | null;
          id: string;
          message_id: string | null;
          push_token: string;
          recipient_id: string | null;
          sent_at: string | null;
          status: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          delivered_at?: string | null;
          error_message?: string | null;
          id?: string;
          message_id?: string | null;
          push_token: string;
          recipient_id?: string | null;
          sent_at?: string | null;
          status?: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          delivered_at?: string | null;
          error_message?: string | null;
          id?: string;
          message_id?: string | null;
          push_token?: string;
          recipient_id?: string | null;
          sent_at?: string | null;
          status?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "push_notification_deliveries_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_notification_deliveries_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      six_month_requests: {
        Row: SixMonthRequest;
        Insert: Omit<SixMonthRequest, "id">;
        Update: Partial<SixMonthRequest>;
        Relationships: [
          {
            foreignKeyName: "six_month_requests_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "six_month_requests_calendar_id_fkey";
            columns: ["calendar_id"];
            isOneToOne: false;
            referencedRelation: "calendars";
            referencedColumns: ["id"];
          },
        ];
      };
      user_preferences: {
        Row: {
          contact_preference: string | null;
          created_at: string;
          id: string;
          pin_number: number;
          push_token: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          contact_preference?: string | null;
          created_at?: string;
          id?: string;
          pin_number: number;
          push_token?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          contact_preference?: string | null;
          created_at?: string;
          id?: string;
          pin_number?: number;
          push_token?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_preferences_pin_number_fkey";
            columns: ["pin_number"];
            isOneToOne: true;
            referencedRelation: "member_profiles";
            referencedColumns: ["pin_number"];
          },
          {
            foreignKeyName: "user_preferences_pin_number_fkey";
            columns: ["pin_number"];
            isOneToOne: true;
            referencedRelation: "members";
            referencedColumns: ["pin_number"];
          },
          {
            foreignKeyName: "user_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      vacation_allotments: {
        Row: {
          calendar_id: string | null;
          current_requests: number | null;
          id: string;
          is_override: boolean | null;
          max_allotment: number;
          override_at: string | null;
          override_by: string | null;
          override_reason: string | null;
          updated_at: string | null;
          updated_by: string | null;
          vac_year: number;
          week_start_date: string;
        };
        Insert: {
          calendar_id?: string | null;
          current_requests?: number | null;
          id?: string;
          is_override?: boolean | null;
          max_allotment: number;
          override_at?: string | null;
          override_by?: string | null;
          override_reason?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          vac_year: number;
          week_start_date: string;
        };
        Update: {
          calendar_id?: string | null;
          current_requests?: number | null;
          id?: string;
          is_override?: boolean | null;
          max_allotment?: number;
          override_at?: string | null;
          override_by?: string | null;
          override_reason?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          vac_year?: number;
          week_start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vacation_allotments_override_by_fkey";
            columns: ["override_by"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vacation_allotments_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      vacation_requests: {
        Row: {
          actioned_at: string | null;
          actioned_by: string | null;
          calendar_id: string | null;
          created_at: string | null;
          denial_comment: string | null;
          denial_reason_id: number | null;
          end_date: string;
          id: string;
          metadata: Json | null;
          override_by: string | null;
          pin_number: number;
          requested_at: string | null;
          responded_at: string | null;
          responded_by: string | null;
          start_date: string;
          status: Database["public"]["Enums"]["vacation_request_status"];
          updated_at: string | null;
          waitlist_position: number | null;
        };
        Insert: {
          actioned_at?: string | null;
          actioned_by?: string | null;
          calendar_id?: string | null;
          created_at?: string | null;
          denial_comment?: string | null;
          denial_reason_id?: number | null;
          end_date: string;
          id?: string;
          metadata?: Json | null;
          override_by?: string | null;
          pin_number: number;
          requested_at?: string | null;
          responded_at?: string | null;
          responded_by?: string | null;
          start_date: string;
          status?: Database["public"]["Enums"]["vacation_request_status"];
          updated_at?: string | null;
          waitlist_position?: number | null;
        };
        Update: {
          actioned_at?: string | null;
          actioned_by?: string | null;
          calendar_id?: string | null;
          created_at?: string | null;
          denial_comment?: string | null;
          denial_reason_id?: number | null;
          end_date?: string;
          id?: string;
          metadata?: Json | null;
          override_by?: string | null;
          pin_number?: number;
          requested_at?: string | null;
          responded_at?: string | null;
          responded_by?: string | null;
          start_date?: string;
          status?: Database["public"]["Enums"]["vacation_request_status"];
          updated_at?: string | null;
          waitlist_position?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "vacation_requests_actioned_by_fkey";
            columns: ["actioned_by"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vacation_requests_denial_reason_id_fkey";
            columns: ["denial_reason_id"];
            isOneToOne: false;
            referencedRelation: "pld_sdv_denial_reasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vacation_requests_override_by_fkey";
            columns: ["override_by"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vacation_requests_pin_number_fkey";
            columns: ["pin_number"];
            isOneToOne: false;
            referencedRelation: "member_profiles";
            referencedColumns: ["pin_number"];
          },
          {
            foreignKeyName: "vacation_requests_pin_number_fkey";
            columns: ["pin_number"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["pin_number"];
          },
          {
            foreignKeyName: "vacation_requests_responded_by_fkey";
            columns: ["responded_by"];
            isOneToOne: false;
            referencedRelation: "user_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      year_end_transactions: {
        Row: {
          created_at: string | null;
          final_sdv_entitlement: number | null;
          id: string;
          member_pin: number | null;
          new_value: number | null;
          notes: string | null;
          plds_rolled_over: number | null;
          previous_value: number | null;
          retry_count: number | null;
          sdv_election: number | null;
          status: string | null;
          transaction_date: string | null;
          transaction_type: string;
        };
        Insert: {
          created_at?: string | null;
          final_sdv_entitlement?: number | null;
          id?: string;
          member_pin?: number | null;
          new_value?: number | null;
          notes?: string | null;
          plds_rolled_over?: number | null;
          previous_value?: number | null;
          retry_count?: number | null;
          sdv_election?: number | null;
          status?: string | null;
          transaction_date?: string | null;
          transaction_type: string;
        };
        Update: {
          created_at?: string | null;
          final_sdv_entitlement?: number | null;
          id?: string;
          member_pin?: number | null;
          new_value?: number | null;
          notes?: string | null;
          plds_rolled_over?: number | null;
          previous_value?: number | null;
          retry_count?: number | null;
          sdv_election?: number | null;
          status?: string | null;
          transaction_date?: string | null;
          transaction_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "year_end_transactions_member_pin_fkey";
            columns: ["member_pin"];
            isOneToOne: false;
            referencedRelation: "member_profiles";
            referencedColumns: ["pin_number"];
          },
          {
            foreignKeyName: "year_end_transactions_member_pin_fkey";
            columns: ["member_pin"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["pin_number"];
          },
        ];
      };
      zones: {
        Row: {
          created_at: string;
          division_id: number;
          id: number;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          division_id: number;
          id?: number;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          division_id?: number;
          id?: number;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "zones_division_id_fkey";
            columns: ["division_id"];
            isOneToOne: false;
            referencedRelation: "divisions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      current_officers: {
        Row: {
          created_at: string | null;
          division: string | null;
          end_date: string | null;
          first_name: string | null;
          id: string | null;
          last_name: string | null;
          member_pin: number | null;
          phone_number: string | null;
          position: Database["public"]["Enums"]["officer_position_type"] | null;
          role: string | null;
          start_date: string | null;
          updated_at: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "officer_positions_member_pin_fkey";
            columns: ["member_pin"];
            isOneToOne: false;
            referencedRelation: "member_profiles";
            referencedColumns: ["pin_number"];
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey";
            columns: ["member_pin"];
            isOneToOne: false;
            referencedRelation: "members";
            referencedColumns: ["pin_number"];
          },
        ];
      };
      member_profiles: {
        Row: {
          created_at: string | null;
          division: string | null;
          first_name: string | null;
          id: string | null;
          last_name: string | null;
          pin_number: number | null;
          role: string | null;
          status: string | null;
          updated_at: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string | null;
          role: string | null;
        };
        Insert: {
          id?: string | null;
          role?: never;
        };
        Update: {
          id?: string | null;
          role?: never;
        };
        Relationships: [];
      };
    };
    Functions: {
      calculate_member_available_plds: {
        Args: { p_member_id: string } | {
          p_member_id: string;
          p_year?: number;
        };
        Returns: number;
      };
      calculate_pld_rollover: {
        Args: Record<PropertyKey, never> | { p_year?: number };
        Returns: {
          member_id: string;
          status: string;
          message: string;
        }[];
      };
      bulk_update_pld_sdv_range: {
        Args: {
          p_calendar_id: string;
          p_start_date: string;
          p_end_date: string;
          p_max_allotment: number;
          p_user_id: string;
          p_reason?: string;
        };
        Returns: {
          affected_count: number;
          start_date: string;
          end_date: string;
        }[];
      };
      bulk_update_vacation_range: {
        Args: {
          p_calendar_id: string;
          p_start_date: string;
          p_end_date: string;
          p_max_allotment: number;
          p_user_id: string;
          p_reason?: string;
        };
        Returns: {
          affected_count: number;
          start_date: string;
          end_date: string;
        }[];
      };
      cancel_leave_request: {
        Args: { p_request_id: string; p_member_id: string };
        Returns: boolean;
      };
      cancel_pending_request: {
        Args: { request_id: string; user_id: string };
        Returns: boolean;
      };
      check_active_request_exists: {
        Args:
          | {
            p_member_id: string;
            p_request_date: string;
            p_request_id?: string;
          }
          | {
            p_member_id: string;
            p_request_date: string;
            p_request_id?: string;
          };
        Returns: boolean;
      };
      get_member_remaining_days: {
        Args: { p_member_id: string; p_year: number; p_leave_type: string };
        Returns: number;
      };
      get_server_timestamp: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      handle_cancellation_approval: {
        Args: { p_request_id: string; p_actioned_by: string };
        Returns: undefined;
      };
      is_admin: {
        Args: { user_id: string };
        Returns: boolean;
      };
      is_cron_job_request: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_six_months_out: {
        Args: { check_date: string };
        Returns: boolean;
      };
      process_q1_pld_request: {
        Args: {
          p_member_id: string;
          p_request_date: string;
          p_division: string;
        };
        Returns: string;
      };
      process_six_month_requests: {
        Args: { target_date: string } | Record<PropertyKey, never>;
        Returns: undefined;
      };
      process_unused_rollover_plds: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      process_year_end_transactions: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      schedule_six_month_processing: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      send_admin_message: {
        Args: { p_user_id: string; p_pin_number: string; p_message: string };
        Returns: {
          success: boolean;
          message: string;
        }[];
      };
      submit_user_request: {
        Args: {
          p_member_id: string;
          p_division: string;
          p_zone_id: number;
          p_request_date: string;
          p_leave_type: string;
        };
        Returns: string;
      };
      test_admin_messages_policies: {
        Args: Record<PropertyKey, never>;
        Returns: {
          test_name: string;
          should_pass: boolean;
          actual_result: string;
        }[];
      };
      update_member_max_plds: {
        Args: { p_member_id: string };
        Returns: number;
      };
      validate_member_association: {
        Args: { pin_number: string };
        Returns: {
          is_valid: boolean;
          error_message: string;
          member_id: string;
        }[];
      };
      warn_unused_rollover_plds: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
    };
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
        | "520";
      leave_type: "PLD" | "SDV";
      officer_position_type:
        | "President"
        | "Vice-President"
        | "Secretary/Treasurer"
        | "Alternate Secretary/Treasurer"
        | "Legislative Representative"
        | "Alternate Legislative Representative"
        | "Local Chairman"
        | "First Vice-Local Chairman"
        | "Second Vice-Local Chairman"
        | "Third Vice-Local Chairman"
        | "Fourth Vice-Local Chairman"
        | "Fifth Vice-Local Chairman"
        | "Guide"
        | "Chaplain"
        | "Delegate to the National Division"
        | "First Alternate Delegate to the National Division"
        | "Second Alternate Delegate to the National Division"
        | "First Trustee"
        | "Second Trustee"
        | "Third Trustee"
        | "First Alternate Trustee"
        | "Second Alternate Trustee"
        | "Third Alternate Trustee";
      pld_sdv_status:
        | "pending"
        | "approved"
        | "denied"
        | "waitlisted"
        | "cancellation_pending"
        | "cancelled";
      role:
        | "user"
        | "division_admin"
        | "union_admin"
        | "application_admin"
        | "company_admin";
      sys_seniority_type: "WC" | "DMIR" | "DWP" | "SYS1" | "EJ&E" | "SYS2";
      user_role: "member" | "company_admin";
      vacation_request_status:
        | "pending"
        | "approved"
        | "denied"
        | "cancelled"
        | "waitlisted";
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
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  } ? keyof (
      & Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
      & Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"]
    )
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database } ? (
    & Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    & Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"]
  )[TableName] extends {
    Row: infer R;
  } ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (
    & DefaultSchema["Tables"]
    & DefaultSchema["Views"]
  ) ? (
      & DefaultSchema["Tables"]
      & DefaultSchema["Views"]
    )[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R;
    } ? R
    : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  } ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][
    TableName
  ] extends {
    Insert: infer I;
  } ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I;
    } ? I
    : never
  : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  } ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][
    TableName
  ] extends {
    Update: infer U;
  } ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U;
    } ? U
    : never
  : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
  } ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  } ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]][
      "CompositeTypes"
    ]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][
    CompositeTypeName
  ]
  : PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      division: ["163", "173", "174", "175", "184", "185", "188", "209", "520"],
      leave_type: ["PLD", "SDV"],
      officer_position_type: [
        "President",
        "Vice-President",
        "Secretary/Treasurer",
        "Alternate Secretary/Treasurer",
        "Legislative Representative",
        "Alternate Legislative Representative",
        "Local Chairman",
        "First Vice-Local Chairman",
        "Second Vice-Local Chairman",
        "Third Vice-Local Chairman",
        "Fourth Vice-Local Chairman",
        "Fifth Vice-Local Chairman",
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
      ],
      pld_sdv_status: [
        "pending",
        "approved",
        "denied",
        "waitlisted",
        "cancellation_pending",
        "cancelled",
      ],
      role: [
        "user",
        "division_admin",
        "union_admin",
        "application_admin",
        "company_admin",
      ],
      sys_seniority_type: ["WC", "DMIR", "DWP", "SYS1", "EJ&E", "SYS2"],
      user_role: ["member", "company_admin"],
      vacation_request_status: [
        "pending",
        "approved",
        "denied",
        "cancelled",
        "waitlisted",
      ],
      zone: [
        "zone 1",
        "zone 2",
        "zone 3",
        "zone 4",
        "zone 5",
        "zone 6",
        "zone 7",
        "zone 8",
        "zone 9",
        "zone 10",
        "zone 11",
        "zone 12",
        "zone 13",
      ],
    },
  },
} as const;

interface SixMonthRequest {
  id: string;
  member_id: string;
  calendar_id: string;
  request_date: string;
  leave_type: "PLD" | "SDV";
  requested_at?: string;
  processed: boolean;
  processed_at?: string;
  final_status?: string;
  position?: number;
}
