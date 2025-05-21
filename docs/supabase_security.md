## Warniings

| name              | title                        | level | facing   | categories      | description                                                                                                                           | detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | remediation                                                                             | metadata                                                                  | cache_key                                                                                   |
| ----------------- | ---------------------------- | ----- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| auth_rls_initplan | Auth RLS Initialization Plan | WARN  | EXTERNAL | ["PERFORMANCE"] | Detects if calls to \`current_setting()\` and \`auth.<function>()\` in RLS policies are being unnecessarily re-evaluated for each row | Table \`public.user_push_tokens\` has a row level security policy \`manage_own_tokens\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.                                | <https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan> | {"name":"user_push_tokens","type":"table","schema":"public"}              | auth_rls_init_plan_public_user_push_tokens_manage_own_tokens                                |
| auth_rls_initplan | Auth RLS Initialization Plan | WARN  | EXTERNAL | ["PERFORMANCE"] | Detects if calls to \`current_setting()\` and \`auth.<function>()\` in RLS policies are being unnecessarily re-evaluated for each row | Table \`public.notifications\` has a row level security policy \`view_own_notifications\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.                              | <https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan> | {"name":"notifications","type":"table","schema":"public"}                 | auth_rls_init_plan_public_notifications_view_own_notifications                              |
| auth_rls_initplan | Auth RLS Initialization Plan | WARN  | EXTERNAL | ["PERFORMANCE"] | Detects if calls to \`current_setting()\` and \`auth.<function>()\` in RLS policies are being unnecessarily re-evaluated for each row | Table \`public.notifications\` has a row level security policy \`update_own_notifications\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.                            | <https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan> | {"name":"notifications","type":"table","schema":"public"}                 | auth_rls_init_plan_public_notifications_update_own_notifications                            |
| auth_rls_initplan | Auth RLS Initialization Plan | WARN  | EXTERNAL | ["PERFORMANCE"] | Detects if calls to \`current_setting()\` and \`auth.<function>()\` in RLS policies are being unnecessarily re-evaluated for each row | Table \`public.user_notification_preferences\` has a row level security policy \`manage_own_notification_preferences\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info. | <https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan> | {"name":"user_notification_preferences","type":"table","schema":"public"} | auth_rls_init_plan_public_user_notification_preferences_manage_own_notification_preferences |
| auth_rls_initplan | Auth RLS Initialization Plan | WARN  | EXTERNAL | ["PERFORMANCE"] | Detects if calls to \`current_setting()\` and \`auth.<function>()\` in RLS policies are being unnecessarily re-evaluated for each row | Table \`public.messages\` has a row level security policy \`Users can view their own messages\` that re-evaluates current_setting() or auth.<function>() for each row. This produces suboptimal query performance at scale. Resolve the issue by replacing \`auth.<function>()\` with \`(select auth.<function>())\`. See [docs](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select) for more info.                        | <https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan> | {"name":"messages","type":"table","schema":"public"}                      | auth_rls_init_plan_public_messages_Users can view their own messages                        |

## Security Fix Progress Summary

| Issue Type                   | Total Count | Fixed | Remaining | Progress |
| ---------------------------- | ----------- | ----- | --------- | -------- |
| Function Search Path Mutable | 7           | 7     | 0         | 100%     |

## Important Note on Function Fixes

After applying the `SET search_path = ''` fix to functions, we discovered that table references within the functions must be fully qualified with their schema (e.g., `public.members` instead of just `members`). Failure to update these references causes errors like:

```
Error: relation "members" does not exist
```

We've updated the following functions with proper schema qualification:

- update_member_max_plds - Added schema prefixes to all 'members' table references
- check_available_pld_sdv_days - Added schema prefixes to all table references
- calculate_member_available_plds - Added schema prefixes to all table references
- calculate_pld_rollover - Added schema prefixes to all table references
- process_q1_pld_request - Added schema prefixes to all table references
- process_unused_rollover_plds - Added schema prefixes to all table references
- warn_unused_rollover_plds - Added schema prefixes to all table references
- process_waitlist_after_allotment_change - Added schema prefixes to all table references
- process_waitlist_on_vacation_allotment_change - Added schema prefixes to all table references
- get_advertisement_summary - Added schema prefixes to advertisement_analytics table
- get_advertisement_device_breakdown - Added schema prefixes to advertisement_analytics table
- get_advertisement_location_breakdown - Added schema prefixes to advertisement_analytics table
- process_waitlist_on_allotment_change - Added schema prefixes to all table references
- test_six_month_processing - Added schema prefixes to all table references and function calls
- bulk_update_vacation_range - Added schema prefixes to vacation_allotments table
- validate_allotment_change - Added schema prefixes to pld_sdv_requests table
- process_year_end_transactions - Added schema prefixes to all table references
- handle_spot_opened - Added schema prefixes to all table references
- associate_member_requests - Added schema prefixes to pld_sdv_requests table
- before_document_insert_set_versioning - Added schema prefixes to documents table
- process_vacation_waitlist_after_allotment_change - Added schema prefixes to all table references
- validate_member_association - Added schema prefixes to members table
- check_allotment_and_set_status - Added schema prefixes to pld_sdv_allotments and pld_sdv_requests tables
- is_division_admin_for_division - Added schema prefixes to members and officer_positions tables
- run_six_month_processor - Added fully qualified function calls to process_six_month_requests
- associate_member_with_pin - Added schema prefixes to members table and fully qualified function calls
- get_admin_sender_display_name - Added schema prefixes to members table
- get_sender_display_name - Added schema prefixes to members table
- run_six_month_processing - Added schema prefixes to six_month_requests and messages tables, and qualified function calls
- calculate_pld_rollover - Added schema prefixes to members and other tables
- unmark_admin_message_read - Added schema prefixes to admin_messages and admin_message_read_status tables
- bulk_update_pld_sdv_range - Added schema prefixes to pld_sdv_allotments table
- delete_future_non_overridden_occurrences - Added schema prefixes to meeting_occurrences table
- log_meeting_notification_run - Added schema prefixes to meeting_notification_log table
- process_q1_pld_request - Added schema prefixes to members and pld_sdv_requests tables
- handle_ical_import_status - Added schema prefixes to pld_sdv_requests table
- submit_user_request - Added schema prefixes to pld_sdv_requests table
- prevent_duplicate_active_requests - Added schema prefixes to pld_sdv_requests table and qualified check_active_request_exists function call
- cancel_pending_request - Added schema prefixes to pld_sdv_requests table
- is_document_in_user_division - Added schema prefixes to documents table

For all future function fixes, make sure to:

1. Use the `SET search_path = ''` setting
2. Update all table references to include their schema (usually `public.`)
3. Update all internal function calls to use fully qualified schema paths (e.g., `public.function_name()`)

## Function Search Path Fix Progress

| Function Name                                    | Status | Fix Date   | Notes                                                                             |
| ------------------------------------------------ | ------ | ---------- | --------------------------------------------------------------------------------- |
| update_advertisement_updated_at                  | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| get_server_timestamp                             | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| has_admin_role                                   | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| log_advertisement_event                          | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| get_max_prior_vac_sys                            | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| get_active_advertisements                        | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| send_admin_message                               | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| get_advertisements_for_rotation                  | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| get_user_division_id                             | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| test_admin_messages_policies                     | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| update_member_max_plds                           | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| handle_cancellation_approval                     | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| get_advertisement_daily_stats                    | Fixed  | 2025-08-01 | Added SET search_path = '' for both overloads                                     |
| generate_meeting_occurrences                     | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| process_six_month_requests                       | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| prune_old_meeting_occurrences                    | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| check_active_request_exists                      | Fixed  | 2025-08-01 | Added SET search_path = '' for both overloads                                     |
| handle_updated_at                                | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| get_division_member_counts                       | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| get_zone_member_counts                           | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| is_admin                                         | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| is_six_months_out                                | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| schedule_six_month_processing                    | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| check_six_month_request                          | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| ensure_divisions_have_zones                      | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| cancel_leave_request                             | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| check_available_pld_sdv_days                     | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| fix_six_month_cron_job                           | Fixed  | 2025-08-01 | Added SET search_path = ''                                                        |
| check_six_month_request_exists                   | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| process_waitlist_after_allotment_change          | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| log_allotment_changes                            | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| process_waitlist_on_vacation_allotment_change    | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| get_advertisement_summary                        | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| get_advertisement_device_breakdown               | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| get_advertisement_location_breakdown             | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| process_waitlist_on_allotment_change             | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| test_six_month_processing                        | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed function calls                               |
| count_six_month_requests_by_date                 | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| bulk_update_vacation_range                       | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| validate_follow_up_date                          | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| log_admin_review_changes                         | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| soft_delete_admin_review                         | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| restore_admin_review                             | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| update_updated_at_column                         | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| validate_allotment_change                        | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| mark_admin_message_read                          | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| process_year_end_transactions                    | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| handle_spot_opened                               | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| associate_member_requests                        | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| create_admin_reply                               | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| create_admin_message                             | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| archive_admin_thread                             | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| before_document_insert_set_versioning            | Fixed  | 2025-08-02 | Added SET search_path = '' and fixed table references                             |
| after_document_metadata_update_log_edit          | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| after_document_delete_storage                    | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| get_latest_documents_for_division                | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| get_latest_documents_for_gca                     | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| get_document_versions                            | Fixed  | 2025-08-02 | Added SET search_path = ''                                                        |
| process_vacation_waitlist_after_allotment_change | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| validate_member_association                      | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| check_allotment_and_set_status                   | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| is_division_admin_for_division                   | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| update_vacation_allotments_updated_at            | Fixed  | 2025-08-03 | Added SET search_path = ''                                                        |
| run_six_month_processor                          | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified function calls                     |
| associate_member_with_pin                        | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table and function references      |
| get_admin_sender_display_name                    | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| get_sender_display_name                          | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| run_six_month_processing                         | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table and function references      |
| calculate_pld_rollover                           | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| unmark_admin_message_read                        | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| bulk_update_pld_sdv_range                        | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| delete_future_non_overridden_occurrences         | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| log_meeting_notification_run                     | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| process_q1_pld_request                           | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| handle_ical_import_status                        | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| temp_check_status_change                         | Fixed  | 2025-08-03 | Added SET search_path = ''                                                        |
| submit_user_request                              | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| prevent_duplicate_active_requests                | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified function call and table references |
| cancel_pending_request                           | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| is_document_in_user_division                     | Fixed  | 2025-08-03 | Added SET search_path = '' and fully qualified table references                   |
| get_user_contact_info                            | Fixed  | 2025-08-04 | Added SET search_path = '' and ensured auth schema references                     |
| get_user_details                                 | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| notify_on_admin_review_change                    | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| notify_on_meeting_change                         | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| notify_on_status_change_pld_sdv                  | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| notify_on_status_change_vacation                 | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| notify_on_waitlist_promotion                     | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| trace_check_available_days                       | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| send_notification                                | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified notifications table reference      |

## Guidance for New Function Creation

For any new functions created in the future, remember to include the search_path setting and use fully qualified table names:

```sql
CREATE OR REPLACE FUNCTION public.new_function_name(parameters)
RETURNS return_type
LANGUAGE sql|plpgsql
SET search_path = ''
AS $$
  -- Use fully qualified table names (schema.table_name)
  SELECT * FROM public.users;
$$;
```

This two-step process (setting search_path AND using fully qualified references) is essential for maintaining security while ensuring functionality.
