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
      admin_message_read_status: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_message_read_status_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "admin_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_message_read_status_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "admin_messages_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_message_read_status_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "sender_display_names"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_messages: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string[]
          created_at: string | null
          expiry_date: string | null
          id: string
          is_archived: boolean
          message: string
          parent_message_id: string | null
          recipient_division_ids: number[] | null
          recipient_roles: string[]
          requires_acknowledgment: boolean
          sender_role: string | null
          sender_user_id: string
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string[]
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          is_archived?: boolean
          message: string
          parent_message_id?: string | null
          recipient_division_ids?: number[] | null
          recipient_roles?: string[]
          requires_acknowledgment?: boolean
          sender_role?: string | null
          sender_user_id: string
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string[]
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          is_archived?: boolean
          message?: string
          parent_message_id?: string | null
          recipient_division_ids?: number[] | null
          recipient_roles?: string[]
          requires_acknowledgment?: boolean
          sender_role?: string | null
          sender_user_id?: string
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "admin_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "admin_messages_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "sender_display_names"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_preferences: {
        Row: {
          created_at: string | null
          division: string
          id: string
          last_selected_zone_id: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          division: string
          id?: string
          last_selected_zone_id?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          division?: string
          id?: string
          last_selected_zone_id?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_preferences_last_selected_zone_id_fkey"
            columns: ["last_selected_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_review_audit_log: {
        Row: {
          action: string
          id: string
          new_values: Json | null
          old_values: Json | null
          performed_at: string
          performed_by: string
          review_id: string
        }
        Insert: {
          action: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          performed_at?: string
          performed_by: string
          review_id: string
        }
        Update: {
          action?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          performed_at?: string
          performed_by?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_review_audit_log_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "admin_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_reviews: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          follow_up_date: string | null
          id: string
          is_deleted: boolean
          request_id: string
          request_type: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          submitted_at: string
          submitted_by: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          follow_up_date?: string | null
          id?: string
          is_deleted?: boolean
          request_id: string
          request_type: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          follow_up_date?: string | null
          id?: string
          is_deleted?: boolean
          request_id?: string
          request_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_scripts: {
        Row: {
          created_at: string | null
          description: string
          executed_at: string | null
          executed_by: string | null
          id: number
          name: string
          script: string
        }
        Insert: {
          created_at?: string | null
          description: string
          executed_at?: string | null
          executed_by?: string | null
          id?: number
          name: string
          script: string
        }
        Update: {
          created_at?: string | null
          description?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: number
          name?: string
          script?: string
        }
        Relationships: []
      }
      advertisement_analytics: {
        Row: {
          advertisement_id: string
          device_type: string | null
          event_type: string
          id: string
          ip_address: string | null
          location: string
          member_id: string | null
          occurred_at: string | null
          platform: string | null
          user_agent: string | null
        }
        Insert: {
          advertisement_id: string
          device_type?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          location: string
          member_id?: string | null
          occurred_at?: string | null
          platform?: string | null
          user_agent?: string | null
        }
        Update: {
          advertisement_id?: string
          device_type?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          location?: string
          member_id?: string | null
          occurred_at?: string | null
          platform?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advertisement_analytics_advertisement_id_fkey"
            columns: ["advertisement_id"]
            isOneToOne: false
            referencedRelation: "advertisements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisement_analytics_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisement_analytics_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisement_analytics_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      advertisements: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          destination_url: string | null
          end_date: string
          file_type: string
          id: string
          image_url: string | null
          is_deleted: boolean | null
          placement_locations: string[] | null
          start_date: string
          status: string
          target_devices: string[] | null
          target_divisions: number[] | null
          target_member_ranks: string[] | null
          target_member_statuses: string[] | null
          title: string
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          destination_url?: string | null
          end_date: string
          file_type: string
          id?: string
          image_url?: string | null
          is_deleted?: boolean | null
          placement_locations?: string[] | null
          start_date: string
          status?: string
          target_devices?: string[] | null
          target_divisions?: number[] | null
          target_member_ranks?: string[] | null
          target_member_statuses?: string[] | null
          title: string
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          destination_url?: string | null
          end_date?: string
          file_type?: string
          id?: string
          image_url?: string | null
          is_deleted?: boolean | null
          placement_locations?: string[] | null
          start_date?: string
          status?: string
          target_devices?: string[] | null
          target_divisions?: number[] | null
          target_member_ranks?: string[] | null
          target_member_statuses?: string[] | null
          title?: string
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "advertisements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_read_status: {
        Row: {
          announcement_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_read_status_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcement_read_counts"
            referencedColumns: ["announcement_id"]
          },
          {
            foreignKeyName: "announcement_read_status_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_read_status_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements_with_author"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          acknowledged_by: string[] | null
          created_at: string
          created_by: string
          creator_role: string
          document_ids: string[] | null
          end_date: string | null
          id: string
          is_active: boolean
          links: Json | null
          message: string
          read_by: string[] | null
          require_acknowledgment: boolean
          start_date: string
          target_division_ids: number[] | null
          target_type: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_by?: string[] | null
          created_at?: string
          created_by: string
          creator_role: string
          document_ids?: string[] | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          links?: Json | null
          message: string
          read_by?: string[] | null
          require_acknowledgment?: boolean
          start_date?: string
          target_division_ids?: number[] | null
          target_type: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_by?: string[] | null
          created_at?: string
          created_by?: string
          creator_role?: string
          document_ids?: string[] | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          links?: Json | null
          message?: string
          read_by?: string[] | null
          require_acknowledgment?: boolean
          start_date?: string
          target_division_ids?: number[] | null
          target_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_audit_trail: {
        Row: {
          action_type: string
          changed_at: string | null
          changed_by: string | null
          id: string
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action_type: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action_type?: string
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      calendars: {
        Row: {
          created_at: string
          description: string | null
          division_id: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          division_id: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          division_id?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendars_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      division_email_audit_log: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          admin_id: string
          change_type: string
          created_at: string | null
          division_id: number
          id: number
          new_value: Json | null
          previous_value: Json | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          admin_id: string
          change_type: string
          created_at?: string | null
          division_id: number
          id?: number
          new_value?: Json | null
          previous_value?: Json | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          admin_id?: string
          change_type?: string
          created_at?: string | null
          division_id?: number
          id?: number
          new_value?: Json | null
          previous_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "division_email_audit_log_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      division_email_settings: {
        Row: {
          additional_emails: string[] | null
          created_at: string | null
          division_id: number
          enabled: boolean | null
          id: number
          primary_email: string | null
          updated_at: string | null
        }
        Insert: {
          additional_emails?: string[] | null
          created_at?: string | null
          division_id: number
          enabled?: boolean | null
          id?: number
          primary_email?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_emails?: string[] | null
          created_at?: string | null
          division_id?: number
          enabled?: boolean | null
          id?: number
          primary_email?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "division_email_settings_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: true
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      division_meetings: {
        Row: {
          adjust_for_dst: boolean
          created_at: string
          created_by: string
          default_agenda: string | null
          division_id: number
          id: string
          is_active: boolean
          location_address: string
          location_name: string
          meeting_frequency: string | null
          meeting_notes: string | null
          meeting_pattern: Json
          meeting_pattern_type: string
          meeting_time: string
          meeting_type: string
          time_zone: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          adjust_for_dst?: boolean
          created_at?: string
          created_by: string
          default_agenda?: string | null
          division_id: number
          id?: string
          is_active?: boolean
          location_address: string
          location_name: string
          meeting_frequency?: string | null
          meeting_notes?: string | null
          meeting_pattern: Json
          meeting_pattern_type: string
          meeting_time: string
          meeting_type: string
          time_zone: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          adjust_for_dst?: boolean
          created_at?: string
          created_by?: string
          default_agenda?: string | null
          division_id?: number
          id?: string
          is_active?: boolean
          location_address?: string
          location_name?: string
          meeting_frequency?: string | null
          meeting_notes?: string | null
          meeting_pattern?: Json
          meeting_pattern_type?: string
          meeting_time?: string
          meeting_type?: string
          time_zone?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "division_meetings_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          created_at: string
          default_sort_order: string | null
          id: number
          location: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_sort_order?: string | null
          id?: number
          location: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_sort_order?: string | null
          id?: number
          location?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_edits_audit_log: {
        Row: {
          changed_fields: Json
          document_version_id: string
          edit_reason: string | null
          edit_timestamp: string | null
          editor_id: string
          id: string
        }
        Insert: {
          changed_fields: Json
          document_version_id: string
          edit_reason?: string | null
          edit_timestamp?: string | null
          editor_id: string
          id?: string
        }
        Update: {
          changed_fields?: Json
          document_version_id?: string
          edit_reason?: string | null
          edit_timestamp?: string | null
          editor_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_edits_audit_log_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string | null
          description: string | null
          display_name: string
          division_id: number | null
          document_category: string | null
          document_group_id: string
          file_name: string
          file_size: number
          file_type: string
          gca_id: string | null
          id: string
          is_deleted: boolean | null
          is_latest: boolean | null
          is_public: boolean | null
          storage_path: string
          uploader_id: string | null
          version_number: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_name: string
          division_id?: number | null
          document_category?: string | null
          document_group_id: string
          file_name: string
          file_size: number
          file_type: string
          gca_id?: string | null
          id?: string
          is_deleted?: boolean | null
          is_latest?: boolean | null
          is_public?: boolean | null
          storage_path: string
          uploader_id?: string | null
          version_number?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_name?: string
          division_id?: number | null
          document_category?: string | null
          document_group_id?: string
          file_name?: string
          file_size?: number
          file_type?: string
          gca_id?: string | null
          id?: string
          is_deleted?: boolean | null
          is_latest?: boolean | null
          is_public?: boolean | null
          storage_path?: string
          uploader_id?: string | null
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_gca_id_fkey"
            columns: ["gca_id"]
            isOneToOne: false
            referencedRelation: "gca_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      email_attempt_log: {
        Row: {
          app_component: string | null
          attempt_data: Json | null
          attempt_status: Database["public"]["Enums"]["email_attempt_status"]
          attempted_at: string
          completed_at: string | null
          email_tracking_id: number | null
          email_type: string
          error_message: string | null
          function_name: string | null
          id: number
          request_id: string | null
          response_data: Json | null
        }
        Insert: {
          app_component?: string | null
          attempt_data?: Json | null
          attempt_status?: Database["public"]["Enums"]["email_attempt_status"]
          attempted_at?: string
          completed_at?: string | null
          email_tracking_id?: number | null
          email_type: string
          error_message?: string | null
          function_name?: string | null
          id?: number
          request_id?: string | null
          response_data?: Json | null
        }
        Update: {
          app_component?: string | null
          attempt_data?: Json | null
          attempt_status?: Database["public"]["Enums"]["email_attempt_status"]
          attempted_at?: string
          completed_at?: string | null
          email_tracking_id?: number | null
          email_type?: string
          error_message?: string | null
          function_name?: string | null
          id?: number
          request_id?: string | null
          response_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attempt_log_email_tracking_id_fkey"
            columns: ["email_tracking_id"]
            isOneToOne: false
            referencedRelation: "email_tracking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_attempt_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_attempt_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_attempt_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "pld_sdv_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_attempt_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["id"]
          },
        ]
      }
      email_dead_letter_queue: {
        Row: {
          created_at: string | null
          email_type: string
          id: number
          max_retries: number | null
          original_error: string
          payload: Json
          request_id: string | null
          requires_manual_review: boolean | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email_type: string
          id?: number
          max_retries?: number | null
          original_error: string
          payload: Json
          request_id?: string | null
          requires_manual_review?: boolean | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email_type?: string
          id?: number
          max_retries?: number | null
          original_error?: string
          payload?: Json
          request_id?: string | null
          requires_manual_review?: boolean | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_dead_letter_queue_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_dead_letter_queue_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_dead_letter_queue_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "pld_sdv_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_dead_letter_queue_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["id"]
          },
        ]
      }
      email_health_log: {
        Row: {
          average_execution_time_ms: number | null
          checked_at: string | null
          health_status: Json
          healthy: boolean
          id: number
          issues: string[] | null
          recent_failures: number
          stuck_attempts: number
        }
        Insert: {
          average_execution_time_ms?: number | null
          checked_at?: string | null
          health_status: Json
          healthy: boolean
          id?: number
          issues?: string[] | null
          recent_failures: number
          stuck_attempts: number
        }
        Update: {
          average_execution_time_ms?: number | null
          checked_at?: string | null
          health_status?: Json
          healthy?: boolean
          id?: number
          issues?: string[] | null
          recent_failures?: number
          stuck_attempts?: number
        }
        Relationships: []
      }
      email_responses: {
        Row: {
          content: string
          created_at: string | null
          denial_reason: string | null
          id: number
          processed: boolean | null
          processed_at: string | null
          request_id: string | null
          resulting_status: string | null
          sender_email: string
          subject: string
        }
        Insert: {
          content: string
          created_at?: string | null
          denial_reason?: string | null
          id?: number
          processed?: boolean | null
          processed_at?: string | null
          request_id?: string | null
          resulting_status?: string | null
          sender_email: string
          subject: string
        }
        Update: {
          content?: string
          created_at?: string | null
          denial_reason?: string | null
          id?: number
          processed?: boolean | null
          processed_at?: string | null
          request_id?: string | null
          resulting_status?: string | null
          sender_email?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "pld_sdv_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["id"]
          },
        ]
      }
      email_tracking: {
        Row: {
          created_at: string | null
          email_type: string
          error_message: string | null
          fallback_notification_sent: boolean | null
          id: number
          last_updated_at: string | null
          message_id: string | null
          next_retry_at: string | null
          recipient: string
          request_id: string | null
          retry_count: number | null
          status: string
          subject: string
        }
        Insert: {
          created_at?: string | null
          email_type: string
          error_message?: string | null
          fallback_notification_sent?: boolean | null
          id?: number
          last_updated_at?: string | null
          message_id?: string | null
          next_retry_at?: string | null
          recipient: string
          request_id?: string | null
          retry_count?: number | null
          status?: string
          subject: string
        }
        Update: {
          created_at?: string | null
          email_type?: string
          error_message?: string | null
          fallback_notification_sent?: boolean | null
          id?: number
          last_updated_at?: string | null
          message_id?: string | null
          next_retry_at?: string | null
          recipient?: string
          request_id?: string | null
          retry_count?: number | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_tracking_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_tracking_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_tracking_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "pld_sdv_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_tracking_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["id"]
          },
        ]
      }
      gca_entities: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      meeting_minutes: {
        Row: {
          approval_date: string | null
          approved_by: string | null
          content: string | null
          created_at: string
          created_by: string
          id: string
          is_approved: boolean
          is_archived: boolean
          meeting_date: string
          meeting_id: string
          structured_content: Json
          updated_at: string
          updated_by: string
        }
        Insert: {
          approval_date?: string | null
          approved_by?: string | null
          content?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_approved?: boolean
          is_archived?: boolean
          meeting_date: string
          meeting_id: string
          structured_content: Json
          updated_at?: string
          updated_by: string
        }
        Update: {
          approval_date?: string | null
          approved_by?: string | null
          content?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_approved?: boolean
          is_archived?: boolean
          meeting_date?: string
          meeting_id?: string
          structured_content?: Json
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_minutes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "division_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_notification_log: {
        Row: {
          day_before_count: number
          error_message: string | null
          hour_before_count: number
          id: string
          notifications_sent: number
          run_at: string
          success: boolean
          week_before_count: number
        }
        Insert: {
          day_before_count?: number
          error_message?: string | null
          hour_before_count?: number
          id?: string
          notifications_sent?: number
          run_at?: string
          success: boolean
          week_before_count?: number
        }
        Update: {
          day_before_count?: number
          error_message?: string | null
          hour_before_count?: number
          id?: string
          notifications_sent?: number
          run_at?: string
          success?: boolean
          week_before_count?: number
        }
        Relationships: []
      }
      meeting_notification_preferences: {
        Row: {
          created_at: string
          id: string
          notify_day_before: boolean
          notify_hour_before: boolean
          notify_week_before: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notify_day_before?: boolean
          notify_hour_before?: boolean
          notify_week_before?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notify_day_before?: boolean
          notify_hour_before?: boolean
          notify_week_before?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meeting_occurrences: {
        Row: {
          actual_scheduled_datetime_utc: string
          agenda: string | null
          created_at: string
          created_by: string
          id: string
          is_cancelled: boolean
          location_address: string | null
          location_name: string | null
          meeting_pattern_id: string
          notes: string | null
          original_scheduled_datetime_utc: string
          override_reason: string | null
          time_zone: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          actual_scheduled_datetime_utc: string
          agenda?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_cancelled?: boolean
          location_address?: string | null
          location_name?: string | null
          meeting_pattern_id: string
          notes?: string | null
          original_scheduled_datetime_utc: string
          override_reason?: string | null
          time_zone: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          actual_scheduled_datetime_utc?: string
          agenda?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_cancelled?: boolean
          location_address?: string | null
          location_name?: string | null
          meeting_pattern_id?: string
          notes?: string | null
          original_scheduled_datetime_utc?: string
          override_reason?: string | null
          time_zone?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_occurrences_meeting_pattern_id_fkey"
            columns: ["meeting_pattern_id"]
            isOneToOne: false
            referencedRelation: "division_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      member_transfer_log: {
        Row: {
          created_at: string | null
          furlough_notes: string | null
          furlough_reason: string | null
          id: string
          member_pin: number
          new_calendar_id: string | null
          new_division_id: number | null
          new_home_zone_id: number | null
          new_status: string | null
          new_zone_id: number | null
          old_calendar_id: string | null
          old_division_id: number | null
          old_home_zone_id: number | null
          old_status: string | null
          old_zone_id: number | null
          original_calendar_id: string | null
          transfer_date: string
          transfer_notes: string | null
          transfer_type: string | null
          transferred_by: string
        }
        Insert: {
          created_at?: string | null
          furlough_notes?: string | null
          furlough_reason?: string | null
          id?: string
          member_pin: number
          new_calendar_id?: string | null
          new_division_id?: number | null
          new_home_zone_id?: number | null
          new_status?: string | null
          new_zone_id?: number | null
          old_calendar_id?: string | null
          old_division_id?: number | null
          old_home_zone_id?: number | null
          old_status?: string | null
          old_zone_id?: number | null
          original_calendar_id?: string | null
          transfer_date?: string
          transfer_notes?: string | null
          transfer_type?: string | null
          transferred_by: string
        }
        Update: {
          created_at?: string | null
          furlough_notes?: string | null
          furlough_reason?: string | null
          id?: string
          member_pin?: number
          new_calendar_id?: string | null
          new_division_id?: number | null
          new_home_zone_id?: number | null
          new_status?: string | null
          new_zone_id?: number | null
          old_calendar_id?: string | null
          old_division_id?: number | null
          old_home_zone_id?: number | null
          old_status?: string | null
          old_zone_id?: number | null
          original_calendar_id?: string | null
          transfer_date?: string
          transfer_notes?: string | null
          transfer_type?: string | null
          transferred_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_transfer_log_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "member_transfer_log_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "member_divisions"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "member_transfer_log_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "member_transfer_log_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "member_transfer_log_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "member_transfer_log_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "member_transfer_log_new_calendar_id_fkey"
            columns: ["new_calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfer_log_new_division_id_fkey"
            columns: ["new_division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfer_log_new_home_zone_id_fkey"
            columns: ["new_home_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfer_log_new_zone_id_fkey"
            columns: ["new_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfer_log_old_calendar_id_fkey"
            columns: ["old_calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfer_log_old_division_id_fkey"
            columns: ["old_division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfer_log_old_home_zone_id_fkey"
            columns: ["old_home_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_transfer_log_old_zone_id_fkey"
            columns: ["old_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          calendar_id: string | null
          company_hire_date: string | null
          created_at: string | null
          curr_vacation_split: number | null
          curr_vacation_weeks: number | null
          current_zone_id: number | null
          date_of_birth: string | null
          deleted: boolean | null
          division_id: number | null
          dmir_sen_roster: number | null
          dwp_sen_roster: number | null
          eje_sen_roster: number | null
          engineer_date: string | null
          first_name: string | null
          home_zone_id: number | null
          id: string | null
          last_name: string | null
          max_plds: number | null
          misc_notes: string | null
          next_vacation_split: number | null
          next_vacation_weeks: number | null
          phone_number: string | null
          pin_number: number
          pld_rolled_over: number | null
          prior_vac_sys: number | null
          rank: string | null
          role: string | null
          sdv_election: number | null
          sdv_entitlement: number | null
          status: string | null
          system_sen_type: string | null
          updated_at: string | null
          username: string | null
          wc_sen_roster: number | null
        }
        Insert: {
          calendar_id?: string | null
          company_hire_date?: string | null
          created_at?: string | null
          curr_vacation_split?: number | null
          curr_vacation_weeks?: number | null
          current_zone_id?: number | null
          date_of_birth?: string | null
          deleted?: boolean | null
          division_id?: number | null
          dmir_sen_roster?: number | null
          dwp_sen_roster?: number | null
          eje_sen_roster?: number | null
          engineer_date?: string | null
          first_name?: string | null
          home_zone_id?: number | null
          id?: string | null
          last_name?: string | null
          max_plds?: number | null
          misc_notes?: string | null
          next_vacation_split?: number | null
          next_vacation_weeks?: number | null
          phone_number?: string | null
          pin_number: number
          pld_rolled_over?: number | null
          prior_vac_sys?: number | null
          rank?: string | null
          role?: string | null
          sdv_election?: number | null
          sdv_entitlement?: number | null
          status?: string | null
          system_sen_type?: string | null
          updated_at?: string | null
          username?: string | null
          wc_sen_roster?: number | null
        }
        Update: {
          calendar_id?: string | null
          company_hire_date?: string | null
          created_at?: string | null
          curr_vacation_split?: number | null
          curr_vacation_weeks?: number | null
          current_zone_id?: number | null
          date_of_birth?: string | null
          deleted?: boolean | null
          division_id?: number | null
          dmir_sen_roster?: number | null
          dwp_sen_roster?: number | null
          eje_sen_roster?: number | null
          engineer_date?: string | null
          first_name?: string | null
          home_zone_id?: number | null
          id?: string | null
          last_name?: string | null
          max_plds?: number | null
          misc_notes?: string | null
          next_vacation_split?: number | null
          next_vacation_weeks?: number | null
          phone_number?: string | null
          pin_number?: number
          pld_rolled_over?: number | null
          prior_vac_sys?: number | null
          rank?: string | null
          role?: string | null
          sdv_election?: number | null
          sdv_entitlement?: number | null
          status?: string | null
          system_sen_type?: string | null
          updated_at?: string | null
          username?: string | null
          wc_sen_roster?: number | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string[] | null
          content: string
          created_at: string | null
          id: string
          is_archived: boolean | null
          is_deleted: boolean | null
          is_read: boolean | null
          message_type: string | null
          metadata: Json | null
          read_at: string | null
          read_by: Json | null
          recipient_id: string | null
          recipient_pin_number: number | null
          requires_acknowledgment: boolean | null
          sender_id: string | null
          sender_pin_number: number | null
          subject: string
          updated_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string[] | null
          content: string
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_deleted?: boolean | null
          is_read?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          read_at?: string | null
          read_by?: Json | null
          recipient_id?: string | null
          recipient_pin_number?: number | null
          requires_acknowledgment?: boolean | null
          sender_id?: string | null
          sender_pin_number?: number | null
          subject: string
          updated_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string[] | null
          content?: string
          created_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_deleted?: boolean | null
          is_read?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          read_at?: string | null
          read_by?: Json | null
          recipient_id?: string | null
          recipient_pin_number?: number | null
          requires_acknowledgment?: boolean | null
          sender_id?: string | null
          sender_pin_number?: number | null
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_recipient_pin_number"
            columns: ["recipient_pin_number"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "fk_recipient_pin_number"
            columns: ["recipient_pin_number"]
            isOneToOne: false
            referencedRelation: "member_divisions"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "fk_recipient_pin_number"
            columns: ["recipient_pin_number"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "fk_recipient_pin_number"
            columns: ["recipient_pin_number"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "fk_recipient_pin_number"
            columns: ["recipient_pin_number"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "fk_recipient_pin_number"
            columns: ["recipient_pin_number"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["pin_number"]
          },
        ]
      }
      notification_analytics: {
        Row: {
          id: string
          message_id: string | null
          notification_type: string
          reason: string | null
          success: boolean
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          message_id?: string | null
          notification_type: string
          reason?: string | null
          success: boolean
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          message_id?: string | null
          notification_type?: string
          reason?: string | null
          success?: boolean
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notification_categories: {
        Row: {
          allow_emergency_override: boolean | null
          code: string
          created_at: string | null
          default_importance: string
          description: string | null
          id: string
          is_mandatory: boolean | null
          name: string
          sms_rate_limit_minutes: number | null
          updated_at: string | null
        }
        Insert: {
          allow_emergency_override?: boolean | null
          code: string
          created_at?: string | null
          default_importance?: string
          description?: string | null
          id?: string
          is_mandatory?: boolean | null
          name: string
          sms_rate_limit_minutes?: number | null
          updated_at?: string | null
        }
        Update: {
          allow_emergency_override?: boolean | null
          code?: string
          created_at?: string | null
          default_importance?: string
          description?: string | null
          id?: string
          is_mandatory?: boolean | null
          name?: string
          sms_rate_limit_minutes?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          category_code: string | null
          created_at: string | null
          id: string
          importance_level: string | null
          is_read: boolean | null
          message: string
          metadata: Json | null
          notification_type: string
          read_at: string | null
          related_id: string | null
          requires_acknowledgment: boolean | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          category_code?: string | null
          created_at?: string | null
          id?: string
          importance_level?: string | null
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          notification_type: string
          read_at?: string | null
          related_id?: string | null
          requires_acknowledgment?: boolean | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          category_code?: string | null
          created_at?: string | null
          id?: string
          importance_level?: string | null
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          notification_type?: string
          read_at?: string | null
          related_id?: string | null
          requires_acknowledgment?: boolean | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "notification_categories"
            referencedColumns: ["code"]
          },
        ]
      }
      officer_positions: {
        Row: {
          created_at: string | null
          created_by: string | null
          division: string
          end_date: string | null
          id: string
          member_pin: number
          position: Database["public"]["Enums"]["officer_position_type"]
          start_date: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          division: string
          end_date?: string | null
          id?: string
          member_pin: number
          position: Database["public"]["Enums"]["officer_position_type"]
          start_date?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          division?: string
          end_date?: string | null
          id?: string
          member_pin?: number
          position?: Database["public"]["Enums"]["officer_position_type"]
          start_date?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "member_divisions"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["pin_number"]
          },
        ]
      }
      organization_sms_budget: {
        Row: {
          admin_notes: string | null
          alert_threshold_percent: number | null
          created_at: string | null
          created_by: string | null
          current_daily_spend: number | null
          current_monthly_spend: number | null
          daily_budget: number | null
          id: string
          last_daily_reset: string | null
          last_modified_by: string | null
          last_monthly_reset: string | null
          monthly_budget: number | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          alert_threshold_percent?: number | null
          created_at?: string | null
          created_by?: string | null
          current_daily_spend?: number | null
          current_monthly_spend?: number | null
          daily_budget?: number | null
          id?: string
          last_daily_reset?: string | null
          last_modified_by?: string | null
          last_monthly_reset?: string | null
          monthly_budget?: number | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          alert_threshold_percent?: number | null
          created_at?: string | null
          created_by?: string | null
          current_daily_spend?: number | null
          current_monthly_spend?: number | null
          daily_budget?: number | null
          id?: string
          last_daily_reset?: string | null
          last_modified_by?: string | null
          last_monthly_reset?: string | null
          monthly_budget?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      phone_verifications: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          id: string
          otp_hash: string
          phone: string
          session_id: string
          updated_at: string
          user_id: string
          verified: boolean
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at: string
          id?: string
          otp_hash: string
          phone: string
          session_id?: string
          updated_at?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          phone?: string
          session_id?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      pld_sdv_allotments: {
        Row: {
          calendar_id: string | null
          current_requests: number | null
          date: string
          id: string
          is_override: boolean | null
          max_allotment: number
          override_at: string | null
          override_by: string | null
          override_reason: string | null
          updated_at: string | null
          updated_by: string | null
          year: number | null
        }
        Insert: {
          calendar_id?: string | null
          current_requests?: number | null
          date: string
          id?: string
          is_override?: boolean | null
          max_allotment: number
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          updated_at?: string | null
          updated_by?: string | null
          year?: number | null
        }
        Update: {
          calendar_id?: string | null
          current_requests?: number | null
          date?: string
          id?: string
          is_override?: boolean | null
          max_allotment?: number
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          updated_at?: string | null
          updated_by?: string | null
          year?: number | null
        }
        Relationships: []
      }
      pld_sdv_denial_reasons: {
        Row: {
          created_at: string | null
          id: number
          is_active: boolean | null
          reason: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          reason: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          reason?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pld_sdv_requests: {
        Row: {
          actioned_at: string | null
          actioned_by: string | null
          calendar_id: string | null
          created_at: string | null
          denial_comment: string | null
          denial_reason_id: number | null
          id: string
          import_source: string | null
          imported_at: string | null
          is_rollover_pld: boolean | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          member_id: string | null
          metadata: Json | null
          override_by: string | null
          paid_in_lieu: boolean | null
          pin_number: number | null
          request_date: string
          requested_at: string | null
          responded_at: string | null
          responded_by: string | null
          status: Database["public"]["Enums"]["pld_sdv_status"]
          updated_at: string | null
          waitlist_position: number | null
        }
        Insert: {
          actioned_at?: string | null
          actioned_by?: string | null
          calendar_id?: string | null
          created_at?: string | null
          denial_comment?: string | null
          denial_reason_id?: number | null
          id?: string
          import_source?: string | null
          imported_at?: string | null
          is_rollover_pld?: boolean | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          member_id?: string | null
          metadata?: Json | null
          override_by?: string | null
          paid_in_lieu?: boolean | null
          pin_number?: number | null
          request_date: string
          requested_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["pld_sdv_status"]
          updated_at?: string | null
          waitlist_position?: number | null
        }
        Update: {
          actioned_at?: string | null
          actioned_by?: string | null
          calendar_id?: string | null
          created_at?: string | null
          denial_comment?: string | null
          denial_reason_id?: number | null
          id?: string
          import_source?: string | null
          imported_at?: string | null
          is_rollover_pld?: boolean | null
          leave_type?: Database["public"]["Enums"]["leave_type"]
          member_id?: string | null
          metadata?: Json | null
          override_by?: string | null
          paid_in_lieu?: boolean | null
          pin_number?: number | null
          request_date?: string
          requested_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: Database["public"]["Enums"]["pld_sdv_status"]
          updated_at?: string | null
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_member"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_member"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_member"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pld_sdv_requests_denial_reason_id_fkey"
            columns: ["denial_reason_id"]
            isOneToOne: false
            referencedRelation: "pld_sdv_denial_reasons"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notification_deliveries: {
        Row: {
          created_at: string | null
          delivered_at: string | null
          error_message: string | null
          id: string
          message_id: string | null
          push_token: string
          recipient_id: string | null
          sent_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          push_token: string
          recipient_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          push_token?: string
          recipient_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_deliveries_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notification_queue: {
        Row: {
          body: string
          created_at: string | null
          data: Json | null
          error: string | null
          first_attempted_at: string | null
          id: string
          last_attempted_at: string | null
          max_attempts: number | null
          next_attempt_at: string | null
          notification_id: string | null
          push_token: string
          retry_count: number | null
          sent_at: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          data?: Json | null
          error?: string | null
          first_attempted_at?: string | null
          id?: string
          last_attempted_at?: string | null
          max_attempts?: number | null
          next_attempt_at?: string | null
          notification_id?: string | null
          push_token: string
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          data?: Json | null
          error?: string | null
          first_attempted_at?: string | null
          id?: string
          last_attempted_at?: string | null
          max_attempts?: number | null
          next_attempt_at?: string | null
          notification_id?: string | null
          push_token?: string
          retry_count?: number | null
          sent_at?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_queue_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_entries: {
        Row: {
          created_at: string | null
          details: Json | null
          id: string
          member_pin_number: number | null
          order_in_roster: number
          roster_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          id?: string
          member_pin_number?: number | null
          order_in_roster: number
          roster_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          id?: string
          member_pin_number?: number | null
          order_in_roster?: number
          roster_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roster_entries_member_pin_number_fkey"
            columns: ["member_pin_number"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "roster_entries_member_pin_number_fkey"
            columns: ["member_pin_number"]
            isOneToOne: false
            referencedRelation: "member_divisions"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "roster_entries_member_pin_number_fkey"
            columns: ["member_pin_number"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "roster_entries_member_pin_number_fkey"
            columns: ["member_pin_number"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "roster_entries_member_pin_number_fkey"
            columns: ["member_pin_number"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "roster_entries_member_pin_number_fkey"
            columns: ["member_pin_number"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "roster_entries_roster_id_fkey"
            columns: ["roster_id"]
            isOneToOne: false
            referencedRelation: "rosters"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rosters: {
        Row: {
          created_at: string | null
          effective_date: string | null
          id: string
          name: string
          roster_type_id: string | null
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          effective_date?: string | null
          id?: string
          name: string
          roster_type_id?: string | null
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          effective_date?: string | null
          id?: string
          name?: string
          roster_type_id?: string | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "rosters_roster_type_id_fkey"
            columns: ["roster_type_id"]
            isOneToOne: false
            referencedRelation: "roster_types"
            referencedColumns: ["id"]
          },
        ]
      }
      six_month_job_log: {
        Row: {
          base_date: string | null
          details: Json | null
          id: number
          run_at: string | null
          step: string | null
          target_date: string | null
        }
        Insert: {
          base_date?: string | null
          details?: Json | null
          id?: number
          run_at?: string | null
          step?: string | null
          target_date?: string | null
        }
        Update: {
          base_date?: string | null
          details?: Json | null
          id?: number
          run_at?: string | null
          step?: string | null
          target_date?: string | null
        }
        Relationships: []
      }
      six_month_requests: {
        Row: {
          calendar_id: string
          final_status: string | null
          id: string
          leave_type: string
          member_id: string
          metadata: Json | null
          position: number | null
          processed: boolean | null
          processed_at: string | null
          request_date: string
          requested_at: string | null
        }
        Insert: {
          calendar_id: string
          final_status?: string | null
          id?: string
          leave_type: string
          member_id: string
          metadata?: Json | null
          position?: number | null
          processed?: boolean | null
          processed_at?: string | null
          request_date: string
          requested_at?: string | null
        }
        Update: {
          calendar_id?: string
          final_status?: string | null
          id?: string
          leave_type?: string
          member_id?: string
          metadata?: Json | null
          position?: number | null
          processed?: boolean | null
          processed_at?: string | null
          request_date?: string
          requested_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "six_month_requests_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "six_month_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "six_month_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "six_month_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_cost_analytics: {
        Row: {
          cost_amount: number | null
          created_at: string | null
          date_sent: string | null
          division_name: string | null
          id: string
          message_count: number | null
          user_role: string | null
        }
        Insert: {
          cost_amount?: number | null
          created_at?: string | null
          date_sent?: string | null
          division_name?: string | null
          id?: string
          message_count?: number | null
          user_role?: string | null
        }
        Update: {
          cost_amount?: number | null
          created_at?: string | null
          date_sent?: string | null
          division_name?: string | null
          id?: string
          message_count?: number | null
          user_role?: string | null
        }
        Relationships: []
      }
      sms_deliveries: {
        Row: {
          cost_amount: number | null
          created_at: string | null
          error_message: string | null
          full_content: string
          id: string
          message_id: string
          phone_number: string
          priority: string | null
          recipient_id: string
          sent_at: string | null
          sms_content: string
          status: string
          twilio_sid: string | null
          updated_at: string | null
          was_truncated: boolean | null
        }
        Insert: {
          cost_amount?: number | null
          created_at?: string | null
          error_message?: string | null
          full_content: string
          id?: string
          message_id: string
          phone_number: string
          priority?: string | null
          recipient_id: string
          sent_at?: string | null
          sms_content: string
          status?: string
          twilio_sid?: string | null
          updated_at?: string | null
          was_truncated?: boolean | null
        }
        Update: {
          cost_amount?: number | null
          created_at?: string | null
          error_message?: string | null
          full_content?: string
          id?: string
          message_id?: string
          phone_number?: string
          priority?: string | null
          recipient_id?: string
          sent_at?: string | null
          sms_content?: string
          status?: string
          twilio_sid?: string | null
          updated_at?: string | null
          was_truncated?: boolean | null
        }
        Relationships: []
      }
      sms_rate_limits: {
        Row: {
          category_code: string
          created_at: string | null
          id: string
          last_sms_sent: string
          sms_count_last_hour: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category_code: string
          created_at?: string | null
          id?: string
          last_sms_sent: string
          sms_count_last_hour?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category_code?: string
          created_at?: string | null
          id?: string
          last_sms_sent?: string
          sms_count_last_hour?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sms_webhook_audit_log: {
        Row: {
          account_sid: string | null
          created_at: string
          event_type: string
          id: string
          message_body: string
          message_sid: string | null
          phone_number: string
          user_id: string | null
        }
        Insert: {
          account_sid?: string | null
          created_at?: string
          event_type: string
          id?: string
          message_body: string
          message_sid?: string | null
          phone_number: string
          user_id?: string | null
        }
        Update: {
          account_sid?: string | null
          created_at?: string
          event_type?: string
          id?: string
          message_body?: string
          message_sid?: string | null
          phone_number?: string
          user_id?: string | null
        }
        Relationships: []
      }
      status_change_queue: {
        Row: {
          created_at: string | null
          id: number
          new_status: string
          old_status: string
          processed: boolean | null
          request_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          new_status: string
          old_status: string
          processed?: boolean | null
          request_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          new_status?: string
          old_status?: string
          processed?: boolean | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_change_queue_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_change_queue_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_change_queue_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "pld_sdv_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_change_queue_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          category_code: string
          created_at: string | null
          delivery_method: string
          enabled: boolean | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category_code: string
          created_at?: string | null
          delivery_method?: string
          enabled?: boolean | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category_code?: string
          created_at?: string | null
          delivery_method?: string
          enabled?: boolean | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_preferences_category_code_fkey"
            columns: ["category_code"]
            isOneToOne: false
            referencedRelation: "notification_categories"
            referencedColumns: ["code"]
          },
        ]
      }
      user_preferences: {
        Row: {
          contact_preference: string | null
          created_at: string
          id: string
          phone_verification_status: Database["public"]["Enums"]["phone_verification_status"]
          phone_verified: boolean
          pin_number: number
          push_token: string | null
          sms_cost_alerts: boolean | null
          sms_daily_limit: number | null
          sms_lockout_until: string | null
          sms_monthly_limit: number | null
          sms_opt_out: boolean
          sms_rate_limit_minutes: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_preference?: string | null
          created_at?: string
          id?: string
          phone_verification_status?: Database["public"]["Enums"]["phone_verification_status"]
          phone_verified?: boolean
          pin_number: number
          push_token?: string | null
          sms_cost_alerts?: boolean | null
          sms_daily_limit?: number | null
          sms_lockout_until?: string | null
          sms_monthly_limit?: number | null
          sms_opt_out?: boolean
          sms_rate_limit_minutes?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_preference?: string | null
          created_at?: string
          id?: string
          phone_verification_status?: Database["public"]["Enums"]["phone_verification_status"]
          phone_verified?: boolean
          pin_number?: number
          push_token?: string | null
          sms_cost_alerts?: boolean | null
          sms_daily_limit?: number | null
          sms_lockout_until?: string | null
          sms_monthly_limit?: number | null
          sms_opt_out?: boolean
          sms_rate_limit_minutes?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: true
            referencedRelation: "failed_email_requests"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "user_preferences_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: true
            referencedRelation: "member_divisions"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "user_preferences_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: true
            referencedRelation: "member_profiles"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "user_preferences_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "user_preferences_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: true
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "user_preferences_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: true
            referencedRelation: "stuck_email_records"
            referencedColumns: ["pin_number"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          app_version: string | null
          created_at: string | null
          device_id: string
          device_name: string | null
          id: string
          is_active: boolean | null
          last_used: string | null
          platform: string
          push_token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string | null
          device_id: string
          device_name?: string | null
          id?: string
          is_active?: boolean | null
          last_used?: string | null
          platform: string
          push_token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string | null
          device_id?: string
          device_name?: string | null
          id?: string
          is_active?: boolean | null
          last_used?: string | null
          platform?: string
          push_token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vacation_allotments: {
        Row: {
          calendar_id: string | null
          current_requests: number | null
          id: string
          is_override: boolean | null
          max_allotment: number
          override_at: string | null
          override_by: string | null
          override_reason: string | null
          updated_at: string | null
          updated_by: string | null
          vac_year: number
          week_start_date: string
        }
        Insert: {
          calendar_id?: string | null
          current_requests?: number | null
          id?: string
          is_override?: boolean | null
          max_allotment: number
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vac_year: number
          week_start_date: string
        }
        Update: {
          calendar_id?: string | null
          current_requests?: number | null
          id?: string
          is_override?: boolean | null
          max_allotment?: number
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vac_year?: number
          week_start_date?: string
        }
        Relationships: []
      }
      vacation_requests: {
        Row: {
          actioned_at: string | null
          actioned_by: string | null
          calendar_id: string | null
          created_at: string | null
          denial_comment: string | null
          denial_reason_id: number | null
          end_date: string
          id: string
          metadata: Json | null
          override_by: string | null
          pin_number: number
          requested_at: string | null
          responded_at: string | null
          responded_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["vacation_request_status"]
          updated_at: string | null
          waitlist_position: number | null
        }
        Insert: {
          actioned_at?: string | null
          actioned_by?: string | null
          calendar_id?: string | null
          created_at?: string | null
          denial_comment?: string | null
          denial_reason_id?: number | null
          end_date: string
          id?: string
          metadata?: Json | null
          override_by?: string | null
          pin_number: number
          requested_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["vacation_request_status"]
          updated_at?: string | null
          waitlist_position?: number | null
        }
        Update: {
          actioned_at?: string | null
          actioned_by?: string | null
          calendar_id?: string | null
          created_at?: string | null
          denial_comment?: string | null
          denial_reason_id?: number | null
          end_date?: string
          id?: string
          metadata?: Json | null
          override_by?: string | null
          pin_number?: number
          requested_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["vacation_request_status"]
          updated_at?: string | null
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vacation_requests_denial_reason_id_fkey"
            columns: ["denial_reason_id"]
            isOneToOne: false
            referencedRelation: "pld_sdv_denial_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_requests_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "vacation_requests_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: false
            referencedRelation: "member_divisions"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "vacation_requests_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "vacation_requests_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "vacation_requests_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "vacation_requests_pin_number_fkey"
            columns: ["pin_number"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["pin_number"]
          },
        ]
      }
      year_end_transactions: {
        Row: {
          created_at: string | null
          final_sdv_entitlement: number | null
          id: string
          member_pin: number | null
          new_value: number | null
          notes: string | null
          plds_rolled_over: number | null
          previous_value: number | null
          retry_count: number | null
          sdv_election: number | null
          status: string | null
          transaction_date: string | null
          transaction_type: string
        }
        Insert: {
          created_at?: string | null
          final_sdv_entitlement?: number | null
          id?: string
          member_pin?: number | null
          new_value?: number | null
          notes?: string | null
          plds_rolled_over?: number | null
          previous_value?: number | null
          retry_count?: number | null
          sdv_election?: number | null
          status?: string | null
          transaction_date?: string | null
          transaction_type: string
        }
        Update: {
          created_at?: string | null
          final_sdv_entitlement?: number | null
          id?: string
          member_pin?: number | null
          new_value?: number | null
          notes?: string | null
          plds_rolled_over?: number | null
          previous_value?: number | null
          retry_count?: number | null
          sdv_election?: number | null
          status?: string | null
          transaction_date?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "year_end_transactions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "year_end_transactions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "member_divisions"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "year_end_transactions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "year_end_transactions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "year_end_transactions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "year_end_transactions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["pin_number"]
          },
        ]
      }
      zones: {
        Row: {
          created_at: string
          division_id: number
          id: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          division_id: number
          id?: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          division_id?: number
          id?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_messages_with_names: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string[] | null
          created_at: string | null
          id: string | null
          is_archived: boolean | null
          message: string | null
          parent_message_id: string | null
          recipient_division_ids: number[] | null
          recipient_roles: string[] | null
          requires_acknowledgment: boolean | null
          sender_display_name: string | null
          sender_role: string | null
          sender_user_id: string | null
          subject: string | null
          updated_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string[] | null
          created_at?: string | null
          id?: string | null
          is_archived?: boolean | null
          message?: string | null
          parent_message_id?: string | null
          recipient_division_ids?: number[] | null
          recipient_roles?: string[] | null
          requires_acknowledgment?: boolean | null
          sender_display_name?: never
          sender_role?: string | null
          sender_user_id?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string[] | null
          created_at?: string | null
          id?: string | null
          is_archived?: boolean | null
          message?: string | null
          parent_message_id?: string | null
          recipient_division_ids?: number[] | null
          recipient_roles?: string[] | null
          requires_acknowledgment?: boolean | null
          sender_display_name?: never
          sender_role?: string | null
          sender_user_id?: string | null
          subject?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "admin_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "admin_messages_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "sender_display_names"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_read_counts: {
        Row: {
          announcement_id: string | null
          created_at: string | null
          eligible_member_count: number | null
          read_count: number | null
          require_acknowledgment: boolean | null
          target_division_ids: number[] | null
          target_type: string | null
          title: string | null
        }
        Relationships: []
      }
      announcements_with_author: {
        Row: {
          acknowledged_by: string[] | null
          author_name: string | null
          created_at: string | null
          created_by: string | null
          creator_role: string | null
          document_ids: string[] | null
          end_date: string | null
          id: string | null
          is_active: boolean | null
          links: Json | null
          message: string | null
          read_by: string[] | null
          require_acknowledgment: boolean | null
          start_date: string | null
          target_division_ids: number[] | null
          target_type: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      company_admin_thread_roots: {
        Row: {
          thread_root_id: string | null
        }
        Relationships: []
      }
      current_officers: {
        Row: {
          created_at: string | null
          division: string | null
          end_date: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          member_pin: number | null
          phone_number: string | null
          position: Database["public"]["Enums"]["officer_position_type"] | null
          role: string | null
          start_date: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "failed_email_requests"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "member_divisions"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "missing_cancellation_emails"
            referencedColumns: ["pin_number"]
          },
          {
            foreignKeyName: "officer_positions_member_pin_fkey"
            columns: ["member_pin"]
            isOneToOne: false
            referencedRelation: "stuck_email_records"
            referencedColumns: ["pin_number"]
          },
        ]
      }
      failed_email_requests: {
        Row: {
          attempt_status:
            | Database["public"]["Enums"]["email_attempt_status"]
            | null
          attempted_at: string | null
          division_name: string | null
          email_type: string | null
          error_message: string | null
          first_name: string | null
          id: string | null
          issue_type: string | null
          last_name: string | null
          leave_type: Database["public"]["Enums"]["leave_type"] | null
          pin_number: number | null
          request_date: string | null
          retry_count: number | null
          status: Database["public"]["Enums"]["pld_sdv_status"] | null
          time_since_failure: unknown | null
        }
        Relationships: []
      }
      member_divisions: {
        Row: {
          calendar_id: string | null
          company_hire_date: string | null
          created_at: string | null
          curr_vacation_split: number | null
          curr_vacation_weeks: number | null
          current_zone_id: number | null
          date_of_birth: string | null
          deleted: boolean | null
          division_id: number | null
          division_name: string | null
          dmir_sen_roster: number | null
          dwp_sen_roster: number | null
          eje_sen_roster: number | null
          engineer_date: string | null
          first_name: string | null
          home_zone_id: number | null
          id: string | null
          last_name: string | null
          max_plds: number | null
          misc_notes: string | null
          next_vacation_split: number | null
          next_vacation_weeks: number | null
          phone_number: string | null
          pin_number: number | null
          pld_rolled_over: number | null
          prior_vac_sys: number | null
          rank: string | null
          role: string | null
          sdv_election: number | null
          sdv_entitlement: number | null
          status: string | null
          system_sen_type: string | null
          updated_at: string | null
          username: string | null
          wc_sen_roster: number | null
        }
        Relationships: []
      }
      member_profiles: {
        Row: {
          created_at: string | null
          division: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          pin_number: number | null
          role: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      missing_cancellation_emails: {
        Row: {
          actioned_at: string | null
          division_name: string | null
          expected_email_type: string | null
          first_name: string | null
          id: string | null
          issue_type: string | null
          last_name: string | null
          leave_type: Database["public"]["Enums"]["leave_type"] | null
          pin_number: number | null
          request_date: string | null
          status: Database["public"]["Enums"]["pld_sdv_status"] | null
          time_since_action: unknown | null
        }
        Relationships: []
      }
      sender_display_names: {
        Row: {
          display_name: string | null
          id: string | null
        }
        Insert: {
          display_name?: never
          id?: string | null
        }
        Update: {
          display_name?: never
          id?: string | null
        }
        Relationships: []
      }
      stuck_email_records: {
        Row: {
          created_at: string | null
          division_name: string | null
          email_status: string | null
          email_type: string | null
          first_name: string | null
          id: string | null
          issue_type: string | null
          last_name: string | null
          leave_type: Database["public"]["Enums"]["leave_type"] | null
          pin_number: number | null
          request_date: string | null
          retry_count: number | null
          status: Database["public"]["Enums"]["pld_sdv_status"] | null
          time_since_creation: unknown | null
        }
        Relationships: []
      }
    }
    Functions: {
      acknowledge_announcement: {
        Args: { p_announcement_id: string }
        Returns: undefined
      }
      admin_get_member_auth: {
        Args: { member_pin_number: number } | { member_pin_number: string }
        Returns: Json
      }
      archive_admin_thread: {
        Args: { thread_id_to_archive: string }
        Returns: undefined
      }
      associate_member_with_pin: {
        Args: { input_pin: number; input_user_id: string; input_email: string }
        Returns: boolean
      }
      bulk_update_pld_sdv_range: {
        Args: {
          p_calendar_id: string
          p_start_date: string
          p_end_date: string
          p_max_allotment: number
          p_user_id: string
          p_reason?: string
        }
        Returns: {
          affected_count: number
          start_date: string
          end_date: string
        }[]
      }
      bulk_update_vacation_range: {
        Args: {
          p_calendar_id: string
          p_start_date: string
          p_end_date: string
          p_max_allotment: number
          p_user_id: string
          p_reason?: string
        }
        Returns: {
          affected_count: number
          start_date: string
          end_date: string
        }[]
      }
      calculate_member_available_plds: {
        Args:
          | { p_member_id: string }
          | { p_member_id: string; p_year: number }
          | { p_member_id: string; p_year: number; p_pin_number: number }
        Returns: number
      }
      calculate_pld_rollover: {
        Args: Record<PropertyKey, never> | { p_year?: number }
        Returns: {
          member_id: string
          status: string
          message: string
        }[]
      }
      call_notification_queue_function: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cancel_leave_request: {
        Args: { p_request_id: string; p_member_id: string }
        Returns: boolean
      }
      cancel_pending_request: {
        Args: { request_id: string; user_id: string }
        Returns: boolean
      }
      check_active_request_exists: {
        Args:
          | {
              p_member_id: string
              p_request_date: string
              p_request_id?: string
            }
          | {
              p_member_id: string
              p_request_date: string
              p_request_id?: string
            }
        Returns: boolean
      }
      check_email_health: {
        Args: { check_hours?: number }
        Returns: Json
      }
      check_sms_budget_admin_permission: {
        Args: { user_id: string }
        Returns: boolean
      }
      count_six_month_requests_by_date: {
        Args: { p_request_date: string; p_calendar_id: string }
        Returns: number
      }
      create_admin_message: {
        Args: {
          p_recipient_roles: string[]
          p_subject: string
          p_message: string
          p_requires_acknowledgment: boolean
          p_recipient_division_ids: number[]
        }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string[]
          created_at: string | null
          expiry_date: string | null
          id: string
          is_archived: boolean
          message: string
          parent_message_id: string | null
          recipient_division_ids: number[] | null
          recipient_roles: string[]
          requires_acknowledgment: boolean
          sender_role: string | null
          sender_user_id: string
          subject: string | null
          updated_at: string | null
        }[]
      }
      create_admin_reply: {
        Args: { p_parent_message_id: string; p_message: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string[]
          created_at: string | null
          expiry_date: string | null
          id: string
          is_archived: boolean
          message: string
          parent_message_id: string | null
          recipient_division_ids: number[] | null
          recipient_roles: string[]
          requires_acknowledgment: boolean
          sender_role: string | null
          sender_user_id: string
          subject: string | null
          updated_at: string | null
        }[]
      }
      create_announcement: {
        Args: {
          p_title: string
          p_message: string
          p_links: Json
          p_target_type: string
          p_target_division_ids: number[]
          p_start_date?: string
          p_end_date?: string
          p_require_acknowledgment?: boolean
          p_document_ids?: string[]
        }
        Returns: {
          acknowledged_by: string[] | null
          created_at: string
          created_by: string
          creator_role: string
          document_ids: string[] | null
          end_date: string | null
          id: string
          is_active: boolean
          links: Json | null
          message: string
          read_by: string[] | null
          require_acknowledgment: boolean
          start_date: string
          target_division_ids: number[] | null
          target_type: string
          title: string
          updated_at: string
        }[]
      }
      debug_check_available_days: {
        Args: {
          p_member_id: string
          p_pin_number: number
          p_request_date: string
          p_leave_type: string
        }
        Returns: {
          debug_step: string
          member_uuid: string
          max_plds_value: number
          pld_rolled_over_value: number
          sdv_entitlement_value: number
          used_plds_count: number
          used_sdvs_count: number
          available_plds_count: number
          available_sdvs_count: number
        }[]
      }
      delete_future_non_overridden_occurrences: {
        Args: { pattern_id: string; from_date: string }
        Returns: undefined
      }
      fix_six_month_cron_job: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      furlough_member: {
        Args: {
          p_member_pin: number
          p_furloughed_by: string
          p_furlough_reason?: string
          p_furlough_notes?: string
        }
        Returns: Json
      }
      generate_email_reconciliation_report: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      generate_meeting_occurrences: {
        Args: { days_ahead?: number }
        Returns: number
      }
      get_active_advertisements: {
        Args: { location_filter?: string; device_filter?: string }
        Returns: {
          created_at: string | null
          created_by: string | null
          description: string | null
          destination_url: string | null
          end_date: string
          file_type: string
          id: string
          image_url: string | null
          is_deleted: boolean | null
          placement_locations: string[] | null
          start_date: string
          status: string
          target_devices: string[] | null
          target_divisions: number[] | null
          target_member_ranks: string[] | null
          target_member_statuses: string[] | null
          title: string
          updated_at: string | null
          weight: number | null
        }[]
      }
      get_admin_sender_display_name: {
        Args: { p_user_id: string; p_sender_role: string }
        Returns: string
      }
      get_advertisement_daily_stats: {
        Args: { ad_id: string } | { ad_id: string; start_date?: string }
        Returns: {
          date: string
          impressions: number
          clicks: number
          ctr: number
        }[]
      }
      get_advertisement_device_breakdown: {
        Args: { ad_id: string }
        Returns: {
          device_type: string
          impressions: number
          clicks: number
          cancels: number
          ctr: number
          conversion_rate: number
        }[]
      }
      get_advertisement_location_breakdown: {
        Args: { ad_id: string }
        Returns: {
          location: string
          impressions: number
          clicks: number
          cancels: number
          ctr: number
          conversion_rate: number
        }[]
      }
      get_advertisement_summary: {
        Args: { ad_id: string }
        Returns: {
          impressions: number
          views: number
          clicks: number
          cancels: number
          ctr: number
          conversion_rate: number
        }[]
      }
      get_advertisements_for_rotation: {
        Args: {
          location_filter: string
          device_filter: string
          limit_count?: number
        }
        Returns: {
          created_at: string | null
          created_by: string | null
          description: string | null
          destination_url: string | null
          end_date: string
          file_type: string
          id: string
          image_url: string | null
          is_deleted: boolean | null
          placement_locations: string[] | null
          start_date: string
          status: string
          target_devices: string[] | null
          target_divisions: number[] | null
          target_member_ranks: string[] | null
          target_member_statuses: string[] | null
          title: string
          updated_at: string | null
          weight: number | null
        }[]
      }
      get_available_weeks_for_transfer: {
        Args: {
          p_calendar_id: string
          p_year: number
          p_exclude_start_date?: string
        }
        Returns: {
          week_start_date: string
          max_allotment: number
          current_requests: number
          available_slots: number
          vac_year: number
        }[]
      }
      get_division_admin_emails: {
        Args: { division_id_param: number }
        Returns: {
          email: string
        }[]
      }
      get_division_member_counts: {
        Args: Record<PropertyKey, never>
        Returns: {
          division_id: number
          count: number
        }[]
      }
      get_document_versions: {
        Args: { p_document_group_id: string; p_include_deleted?: boolean }
        Returns: {
          created_at: string | null
          description: string | null
          display_name: string
          division_id: number | null
          document_category: string | null
          document_group_id: string
          file_name: string
          file_size: number
          file_type: string
          gca_id: string | null
          id: string
          is_deleted: boolean | null
          is_latest: boolean | null
          is_public: boolean | null
          storage_path: string
          uploader_id: string | null
          version_number: number | null
        }[]
      }
      get_email_attempt_stats: {
        Args: { p_start_date?: string; p_end_date?: string }
        Returns: {
          email_type: string
          total_attempts: number
          initiated_attempts: number
          function_invoked_attempts: number
          function_failed_attempts: number
          email_queued_attempts: number
          email_sent_attempts: number
          email_failed_attempts: number
          email_delivered_attempts: number
          success_rate: number
          failure_rate: number
        }[]
      }
      get_email_health_trends: {
        Args: { hours_back?: number }
        Returns: Json
      }
      get_latest_documents_for_division: {
        Args: { p_division_id: number }
        Returns: {
          created_at: string | null
          description: string | null
          display_name: string
          division_id: number | null
          document_category: string | null
          document_group_id: string
          file_name: string
          file_size: number
          file_type: string
          gca_id: string | null
          id: string
          is_deleted: boolean | null
          is_latest: boolean | null
          is_public: boolean | null
          storage_path: string
          uploader_id: string | null
          version_number: number | null
        }[]
      }
      get_latest_documents_for_gca: {
        Args: { p_gca_id: string }
        Returns: {
          created_at: string | null
          description: string | null
          display_name: string
          division_id: number | null
          document_category: string | null
          document_group_id: string
          file_name: string
          file_size: number
          file_type: string
          gca_id: string | null
          id: string
          is_deleted: boolean | null
          is_latest: boolean | null
          is_public: boolean | null
          storage_path: string
          uploader_id: string | null
          version_number: number | null
        }[]
      }
      get_max_prior_vac_sys: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_member_approved_weeks: {
        Args: { p_pin_number: number; p_calendar_id: string; p_year: number }
        Returns: {
          id: string
          start_date: string
          end_date: string
          requested_at: string
          actioned_at: string
        }[]
      }
      get_member_remaining_days: {
        Args:
          | { p_member_id: string; p_leave_type: string; p_year: number }
          | { p_member_id: string; p_year: number; p_leave_type: string }
          | {
              p_member_id: string
              p_year: number
              p_leave_type: string
              p_pin_number: number
            }
        Returns: number
      }
      get_member_sdv_allocation_for_year: {
        Args:
          | { p_member_id: string; p_year: number }
          | { p_member_id: string; p_year: number; p_pin_number: number }
        Returns: number
      }
      get_member_total_pld_allocation_for_year: {
        Args:
          | { p_member_id: string; p_year: number }
          | { p_member_id: string; p_year: number; p_pin_number: number }
        Returns: number
      }
      get_my_effective_roles: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      get_reconciliation_details: {
        Args: { limit_per_category?: number }
        Returns: Json
      }
      get_request_with_member_email: {
        Args: { request_id: string }
        Returns: {
          id: string
          request_date: string
          leave_type: string
          status: string
          denial_comment: string
          member_id: string
          first_name: string
          last_name: string
          division_id: number
          email: string
          pin_number: number
          paid_in_lieu: boolean
        }[]
      }
      get_sender_display_name: {
        Args: { sender_id: string; sender_role: string }
        Returns: string
      }
      get_server_timestamp: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_by_id: {
        Args: { user_id: string }
        Returns: Json
      }
      get_user_contact_info: {
        Args: { user_id: string }
        Returns: {
          email: string
          phone: string
        }[]
      }
      get_user_details: {
        Args: { user_uuid: string }
        Returns: Json
      }
      get_user_division_id: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_waitlist_email_implementation_summary: {
        Args: Record<PropertyKey, never>
        Returns: {
          feature: string
          status: string
          details: string
        }[]
      }
      get_zone_member_counts: {
        Args: { division_id: number }
        Returns: {
          zone_id: number
          count: number
        }[]
      }
      handle_allotment_count: {
        Args: { p_date: string; p_calendar_id: string; p_action: string }
        Returns: undefined
      }
      handle_cancellation_approval: {
        Args: { p_request_id: string; p_actioned_by: string }
        Returns: undefined
      }
      has_admin_role: {
        Args: { role_to_check: string }
        Returns: boolean
      }
      is_admin: {
        Args: { user_id: string }
        Returns: boolean
      }
      is_cron_job_request: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_division_admin_for_division: {
        Args: { division_id: number }
        Returns: boolean
      }
      is_document_in_user_division: {
        Args: { document_id: string }
        Returns: boolean
      }
      is_member_registered: {
        Args: { member_uuid: string }
        Returns: boolean
      }
      is_six_months_out: {
        Args: { check_date: string }
        Returns: boolean
      }
      log_advertisement_event: {
        Args: {
          ad_id: string
          event: string
          member: string
          loc: string
          device?: string
          platform?: string
        }
        Returns: string
      }
      log_email_attempt: {
        Args: {
          p_request_id?: string
          p_email_type?: string
          p_attempt_status?: Database["public"]["Enums"]["email_attempt_status"]
          p_function_name?: string
          p_app_component?: string
          p_attempt_data?: Json
          p_response_data?: Json
          p_error_message?: string
          p_email_tracking_id?: number
        }
        Returns: number
      }
      log_meeting_notification_run: {
        Args: {
          p_success: boolean
          p_week_before_count?: number
          p_day_before_count?: number
          p_hour_before_count?: number
          p_notifications_sent?: number
          p_error_message?: string
        }
        Returns: string
      }
      mark_admin_message_read: {
        Args: { message_id_to_mark: string }
        Returns: undefined
      }
      mark_announcement_as_read: {
        Args: { p_announcement_id: string }
        Returns: undefined
      }
      mark_announcement_as_unread: {
        Args: { p_announcement_id: string }
        Returns: undefined
      }
      move_to_dead_letter_queue: {
        Args: {
          p_request_id: string
          p_email_type: string
          p_error_message: string
          p_original_payload?: Json
        }
        Returns: number
      }
      process_q1_pld_request: {
        Args:
          | { p_member_id: string; p_division: number; p_request_date: string }
          | { p_member_id: string; p_division: string; p_request_date: string }
          | { p_member_id: string; p_request_date: string; p_division: string }
        Returns: string
      }
      process_six_month_requests: {
        Args: { target_date: string }
        Returns: undefined
      }
      process_unused_rollover_plds: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_year_end_transactions: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      prune_old_meeting_occurrences: {
        Args: { days_to_keep?: number }
        Returns: number
      }
      queue_push_notification: {
        Args: {
          p_user_id: string
          p_title: string
          p_body: string
          p_data?: Json
          p_notification_id?: string
        }
        Returns: string
      }
      resolve_dlq_item: {
        Args: {
          p_dlq_id: number
          p_resolved_by: string
          p_resolution_notes?: string
        }
        Returns: boolean
      }
      restore_admin_review: {
        Args: { review_id: string }
        Returns: undefined
      }
      restore_member: {
        Args: {
          p_member_pin: number
          p_restored_by: string
          p_new_division_id?: number
          p_new_zone_id?: number
          p_new_calendar_id?: string
          p_restore_notes?: string
        }
        Returns: Json
      }
      run_email_health_check: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_six_month_processing: {
        Args: Record<PropertyKey, never>
        Returns: {
          date_processed: string
          requests_processed: number
          status: string
        }[]
      }
      schedule_six_month_processing: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      send_admin_message: {
        Args: { p_user_id: string; p_pin_number: string; p_message: string }
        Returns: {
          success: boolean
          message: string
        }[]
      }
      send_notification: {
        Args: {
          user_id: string
          title: string
          body: string
          notification_type?: string
          importance?: string
          related_id?: string
          extra_data?: Json
        }
        Returns: Json
      }
      soft_delete_admin_review: {
        Args: { review_id: string }
        Returns: undefined
      }
      submit_user_request: {
        Args: {
          p_member_id: string
          p_division: string
          p_zone_id: number
          p_request_date: string
          p_leave_type: string
        }
        Returns: string
      }
      temp_check_status_change: {
        Args: Record<PropertyKey, never>
        Returns: {
          req_date: string
          current_d: string
          status: string
          would_be_status: string
        }[]
      }
      test_admin_messages_policies: {
        Args: Record<PropertyKey, never>
        Returns: {
          test_name: string
          should_pass: boolean
          actual_result: string
        }[]
      }
      test_six_month_processing: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      test_waitlist_promotion_email: {
        Args: Record<PropertyKey, never>
        Returns: {
          test_name: string
          result: string
          details: string
        }[]
      }
      test_waitlist_promotion_logic: {
        Args: Record<PropertyKey, never>
        Returns: {
          step_number: number
          step_name: string
          status: string
          details: string
        }[]
      }
      trace_check_available_days: {
        Args: {
          p_member_id: string
          p_pin_number: number
          p_request_date: string
          p_leave_type: string
        }
        Returns: string
      }
      transfer_member: {
        Args: {
          p_member_pin: number
          p_new_division_id?: number
          p_new_zone_id?: number
          p_new_calendar_id?: string
          p_new_home_zone_id?: number
          p_transferred_by?: string
          p_transfer_notes?: string
        }
        Returns: Json
      }
      transfer_vacation_week: {
        Args: {
          p_pin_number: number
          p_old_start_date: string
          p_new_start_date: string
          p_calendar_id: string
          p_admin_user_id: string
          p_reason?: string
        }
        Returns: Json
      }
      unmark_admin_message_read: {
        Args: { p_thread_id: string }
        Returns: undefined
      }
      update_email_attempt: {
        Args: {
          p_attempt_id: number
          p_attempt_status: Database["public"]["Enums"]["email_attempt_status"]
          p_response_data?: Json
          p_error_message?: string
          p_email_tracking_id?: number
        }
        Returns: boolean
      }
      update_member_max_plds: {
        Args: { p_member_id: string }
        Returns: number
      }
      validate_member_association: {
        Args: { input_pin: string }
        Returns: {
          is_valid: boolean
          error_message: string
          member_id: string
        }[]
      }
      warn_unused_rollover_plds: {
        Args: Record<PropertyKey, never>
        Returns: undefined
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
      email_attempt_status:
        | "initiated"
        | "function_invoked"
        | "function_failed"
        | "email_queued"
        | "email_sent"
        | "email_failed"
        | "email_delivered"
      leave_type: "PLD" | "SDV"
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
        | "Third Alternate Trustee"
      phone_verification_status:
        | "not_started"
        | "pending"
        | "verified"
        | "locked_out"
        | "admin_unlocked"
      pld_sdv_status:
        | "pending"
        | "approved"
        | "denied"
        | "waitlisted"
        | "cancellation_pending"
        | "cancelled"
        | "transferred"
      role:
        | "user"
        | "division_admin"
        | "union_admin"
        | "application_admin"
        | "company_admin"
      sys_seniority_type: "WC" | "DMIR" | "DWP" | "SYS1" | "EJ&E" | "SYS2"
      user_role: "member" | "company_admin"
      vacation_request_status:
        | "pending"
        | "approved"
        | "denied"
        | "cancelled"
        | "waitlisted"
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      division: ["163", "173", "174", "175", "184", "185", "188", "209", "520"],
      email_attempt_status: [
        "initiated",
        "function_invoked",
        "function_failed",
        "email_queued",
        "email_sent",
        "email_failed",
        "email_delivered",
      ],
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
      phone_verification_status: [
        "not_started",
        "pending",
        "verified",
        "locked_out",
        "admin_unlocked",
      ],
      pld_sdv_status: [
        "pending",
        "approved",
        "denied",
        "waitlisted",
        "cancellation_pending",
        "cancelled",
        "transferred",
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
} as const
