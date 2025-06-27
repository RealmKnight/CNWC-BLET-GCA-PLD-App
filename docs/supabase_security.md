| name                         | title                        | level | facing   | categories   | description                                                   | detail                                                                                       | remediation                                                                                        | metadata                                                                                 | cache_key                                                                                                      |
| ---------------------------- | ---------------------------- | ----- | -------- | ------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.test_waitlist_promotion_email\` has a role mutable search_path             | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"test_waitlist_promotion_email","type":"function","schema":"public"}             | function_search_path_mutable_public_test_waitlist_promotion_email_f7179fd26d8cc63890ebffe0b7c7fe60             |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.test_waitlist_promotion_logic\` has a role mutable search_path             | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"test_waitlist_promotion_logic","type":"function","schema":"public"}             | function_search_path_mutable_public_test_waitlist_promotion_logic_79dce8154c1ae59fd0284ba8db607028             |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.get_waitlist_email_implementation_summary\` has a role mutable search_path | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"get_waitlist_email_implementation_summary","type":"function","schema":"public"} | function_search_path_mutable_public_get_waitlist_email_implementation_summary_9c25beaf17861269d1594b761dacb9f2 |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.log_email_attempt\` has a role mutable search_path                         | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"log_email_attempt","type":"function","schema":"public"}                         | function_search_path_mutable_public_log_email_attempt_b2f97c92601610d8957cda8e31aad3be                         |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.update_email_attempt\` has a role mutable search_path                      | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"update_email_attempt","type":"function","schema":"public"}                      | function_search_path_mutable_public_update_email_attempt_8848b451291f3922b0d3e01318d1898e                      |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.get_email_attempt_stats\` has a role mutable search_path                   | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"get_email_attempt_stats","type":"function","schema":"public"}                   | function_search_path_mutable_public_get_email_attempt_stats_4d85af222826fc11a2befe0378dac485                   |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.run_email_health_check\` has a role mutable search_path                    | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"run_email_health_check","type":"function","schema":"public"}                    | function_search_path_mutable_public_run_email_health_check_bc475f3fcb05391ce8a8b6c3962f3fcc                    |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.check_email_health\` has a role mutable search_path                        | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"check_email_health","type":"function","schema":"public"}                        | function_search_path_mutable_public_check_email_health_2b0ce3994df6cb131cb3a742e2ccea75                        |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.get_email_health_trends\` has a role mutable search_path                   | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"get_email_health_trends","type":"function","schema":"public"}                   | function_search_path_mutable_public_get_email_health_trends_72e2551f9d36101d1edb357045cf7d90                   |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.generate_email_reconciliation_report\` has a role mutable search_path      | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"generate_email_reconciliation_report","type":"function","schema":"public"}      | function_search_path_mutable_public_generate_email_reconciliation_report_8ac4f1c3e4b7c412ff921d1603884a66      |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.get_reconciliation_details\` has a role mutable search_path                | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"get_reconciliation_details","type":"function","schema":"public"}                | function_search_path_mutable_public_get_reconciliation_details_5112827d76571c75bd46aabc8daae34d                |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.move_to_dead_letter_queue\` has a role mutable search_path                 | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"move_to_dead_letter_queue","type":"function","schema":"public"}                 | function_search_path_mutable_public_move_to_dead_letter_queue_8ff91381cd77699faddddf61d5df7701                 |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.resolve_dlq_item\` has a role mutable search_path                          | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"resolve_dlq_item","type":"function","schema":"public"}                          | function_search_path_mutable_public_resolve_dlq_item_210dd4f758f325a59ea705effb27ba9c                          |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.validate_six_month_date_limits\` has a role mutable search_path            | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"validate_six_month_date_limits","type":"function","schema":"public"}            | function_search_path_mutable_public_validate_six_month_date_limits_52dfeefa15046ac82bcaee83d2eb85a8            |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.furlough_member\` has a role mutable search_path                           | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"furlough_member","type":"function","schema":"public"}                           | function_search_path_mutable_public_furlough_member_6491e0525aa7c05eda56f838c2892c8a                           |
| function_search_path_mutable | Function Search Path Mutable | WARN  | EXTERNAL | ["SECURITY"] | Detects functions where the search_path parameter is not set. | Function \`public.restore_member\` has a role mutable search_path                            | <https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable> | {"name":"restore_member","type":"function","schema":"public"}                            | function_search_path_mutable_public_restore_member_f11c7bc0a87ecd8f3bff28920d526931                            |

## Security Fix Progress Summary

| Issue Type                   | Total Count | Fixed | Remaining | Progress |
| ---------------------------- | ----------- | ----- | --------- | -------- |
| Function Search Path Mutable | 16          | 16    | 0         | 100%     |

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
| get_waitlist_email_implementation_summary        | Fixed  | 2025-01-08 | Added SET search_path = 'public'                                                  |
| log_email_attempt                                | Fixed  | 2025-01-08 | Added SET search_path = 'public'                                                  |
| update_email_attempt                             | Fixed  | 2025-01-08 | Added SET search_path = 'public'                                                  |
| get_email_attempt_stats                          | Fixed  | 2025-01-08 | Added SET search_path = 'public'                                                  |
| run_email_health_check                           | Fixed  | 2025-01-08 | Added SET search_path = 'public'                                                  |
| check_email_health                               | Fixed  | 2025-01-08 | Added SET search_path = 'public'                                                  |
| get_email_health_trends                          | Fixed  | 2025-01-08 | Added SET search_path = 'public'                                                  |
| generate_email_reconciliation_report             | Fixed  | 2025-01-08 | Added SET search_path = 'public'                                                  |
| get_reconciliation_details                       | Fixed  | 2025-01-08 | Added SET search_path = 'public'                                                  |
| move_to_dead_letter_queue                        | Fixed  | 2025-01-08 | Added SET search_path = 'public'                                                  |
| resolve_dlq_item                                 | Fixed  | 2025-01-08 | Added SET search_path = 'public'                                                  |
| validate_six_month_date_limits                   | Fixed  | 2025-01-08 | Added SET search_path = 'public', 'pg_catalog'                                    |
| furlough_member                                  | Fixed  | 2025-01-08 | Added SET search_path = 'public', 'pg_catalog'                                    |
| restore_member                                   | Fixed  | 2025-01-08 | Added SET search_path = 'public', 'pg_catalog'                                    |
| test_waitlist_promotion_email                    | Fixed  | 2025-01-08 | Added SET search_path = 'public', 'vault', 'pg_catalog', 'information_schema'     |
| test_waitlist_promotion_logic                    | Fixed  | 2025-01-08 | Added SET search_path = 'public', 'pg_catalog'                                    |
| get_user_details                                 | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| notify_on_admin_review_change                    | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| notify_on_meeting_change                         | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| notify_on_status_change_pld_sdv                  | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| notify_on_status_change_vacation                 | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| notify_on_waitlist_promotion                     | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| trace_check_available_days                       | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified table references                   |
| send_notification                                | Fixed  | 2025-08-04 | Added SET search_path = '' and fully qualified notifications table reference      |
| handle_status_change                             | Fixed  | 2025-01-08 | Added SET search_path = '' and fully qualified function calls                     |
| transfer_member                                  | Fixed  | 2025-01-08 | Added SET search_path = '' and fully qualified table references                   |
| notify_on_meeting_change                         | Fixed  | 2025-01-08 | Added SET search_path = '' and fully qualified table references                   |
| is_member_registered                             | Fixed  | 2025-01-08 | Added SET search_path = '' (auth.users already properly qualified)                |
| get_request_with_member_email                    | Fixed  | 2025-01-08 | Added SET search_path = '' and fully qualified table references                   |

## Final 16 Functions - Targeted Search Path Approach

For the final 16 functions identified in the security report, we used a targeted approach based on schema requirements rather than the blanket empty search path + full qualification method:

### Categorization by Schema Requirements

1. **Basic Email Functions** (`SET search_path = 'public'`):

   - Functions only accessing email tracking tables in public schema
   - Examples: `log_email_attempt`, `update_email_attempt`, `get_email_attempt_stats`

2. **Date/Time Functions** (`SET search_path = 'public', 'pg_catalog'`):

   - Functions using PostgreSQL built-ins like DATE_TRUNC, NOW(), INTERVAL
   - Examples: `validate_six_month_date_limits`, `furlough_member`, `restore_member`

3. **System Testing Functions** (`SET search_path = 'public', 'vault', 'pg_catalog', 'information_schema'`):
   - Functions accessing system catalogs and vault for validation/testing
   - Examples: `test_waitlist_promotion_email`

This approach maintains the security fix (immutable search path) while preserving functionality and readability without requiring extensive code changes.

## Guidance for New Function Creation

For any new functions created in the future, choose the appropriate search path based on schema requirements:

### Option 1: Minimal Access (Recommended)

```sql
CREATE OR REPLACE FUNCTION public.new_function_name(parameters)
RETURNS return_type
LANGUAGE sql|plpgsql
SET search_path = 'public'
AS $$
  -- Access only public schema tables
  SELECT * FROM users;
$$;
```

### Option 2: Maximum Security (When needed)

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

### Option 3: Multi-Schema Access (When required)

```sql
CREATE OR REPLACE FUNCTION public.new_function_name(parameters)
RETURNS return_type
LANGUAGE sql|plpgsql
SET search_path = 'public', 'auth', 'pg_catalog'
AS $$
  -- Access specific required schemas
  SELECT * FROM users u JOIN auth.users au ON u.id = au.id;
$$;
```

The key principle is to include only the schemas your function actually needs, ensuring both security and functionality.
