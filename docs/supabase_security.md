| name                            | title                               | level | facing   | categories   | description                                                   | detail                                                                                                                                   | remediation                                                                                                | metadata                                                                       | cache_key                                                                                            |
| ------------------------------- | ----------------------------------- | ----- | -------- | ------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| function_search_path_mutable    | Function Search Path Mutable        | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.handle_status_change\` has a role mutable search_path                                                                  | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable>         | {"name":"handle_status_change","type":"function","schema":"public"}            | function_search_path_mutable_public_handle_status_change_aa6c26862037b3264ad0209985b99119            |
| function_search_path_mutable    | Function Search Path Mutable        | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.get_division_admin_emails\` has a role mutable search_path                                                             | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable>         | {"name":"get_division_admin_emails","type":"function","schema":"public"}       | function_search_path_mutable_public_get_division_admin_emails_f5fd8f74280ccefa713b8ee66bc248d0       |
| function_search_path_mutable    | Function Search Path Mutable        | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.get_request_with_member_email\` has a role mutable search_path                                                         | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable>         | {"name":"get_request_with_member_email","type":"function","schema":"public"}   | function_search_path_mutable_public_get_request_with_member_email_71301abb44ff8aece8e604094baee4f9   |
| function_search_path_mutable    | Function Search Path Mutable        | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.notify_on_status_change_pld_sdv\` has a role mutable search_path                                                       | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable>         | {"name":"notify_on_status_change_pld_sdv","type":"function","schema":"public"} | function_search_path_mutable_public_notify_on_status_change_pld_sdv_c6ccd51b93f2d80a1e814cb594134cb1 |
| auth_leaked_password_protection | Leaked Password Protection Disabled | WARN  | EXTERNAL | ["SECURITY"] | Leaked password protection is currently disabled.             | Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this feature to enhance security. | <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection> | {"type":"auth","entity":"Auth"}                                                | auth_leaked_password_protection                                                                      |

## Security Fix Progress Summary

| Issue Type                   | Total Count | Fixed | Remaining | Progress |
| ---------------------------- | ----------- | ----- | --------- | -------- |
| Function Search Path Mutable | 5           | 0     | 0         | 0%       |

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
