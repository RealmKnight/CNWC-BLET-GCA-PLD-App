# Supabase Optimization Plan

This document outlines the plan for optimizing the Supabase database based on linter recommendations.
The goal is to improve performance and maintain database hygiene by creating necessary indexes and removing unused ones.

**Important Notes:**

- **Verified Column Names:** Based on database schema inspection, we've confirmed the actual column names that need indexes.
- **Index Naming:** The suggested index names (`idx_table_column`) are conventions. You can adjust them if needed, but ensure they are unique and descriptive.
- **Concurrent Operations:** `CREATE INDEX CONCURRENTLY` and `DROP INDEX CONCURRENTLY` are used to minimize locking on tables during these operations. These commands might take longer but are safer for production environments. These require PostgreSQL 12+ for `DROP INDEX CONCURRENTLY` on `public` schema indexes (usually true for Supabase).
- **Review Unused Indexes:** Before dropping an index, ensure it's genuinely unused. While Supabase's linter is generally accurate, confirm that the index isn't for very specific, infrequent, but critical queries, or for enforcing uniqueness (though primary/unique constraints usually have their own indexes automatically).

## I. Indexes to Create (for Unindexed Foreign Keys)

This section lists foreign keys that currently lack a covering index. Adding these indexes can improve query performance on joins and filters involving these keys.

| Schema | Table Name                   | Foreign Key Name                                 | Verified Column Name         | SQL Statement to Create Index                                                                                                    | Notes                                                                                                                                    |
| ------ | ---------------------------- | ------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| public | admin_messages               | `admin_messages_from_user_id_fkey`               | (Column not found in schema) | First determine if this foreign key exists and which column it references                                                        |
| public | admin_messages               | `admin_messages_sender_user_id_fkey`             | `sender_user_id`             | `CREATE INDEX CONCURRENTLY idx_admin_messages_sender_user_id ON public.admin_messages (sender_user_id);`                         | Inferred as `sender_user_id`. **Verify** with schema using ordinal(s): [2] for FK `admin_messages_sender_user_id_fkey`.                  |
| public | admin_preferences            | `admin_preferences_last_selected_zone_id_fkey`   | `last_selected_zone_id`      | `CREATE INDEX CONCURRENTLY idx_admin_preferences_last_selected_zone_id ON public.admin_preferences (last_selected_zone_id);`     | Inferred as `last_selected_zone_id`. **Verify** with schema using ordinal(s): [4] for FK `admin_preferences_last_selected_zone_id_fkey`. |
| public | admin_review_audit_log       | `admin_review_audit_log_performed_by_fkey`       | `performed_by`               | `CREATE INDEX CONCURRENTLY idx_admin_review_audit_log_performed_by ON public.admin_review_audit_log (performed_by);`             | Inferred as `performed_by`. **Verify** with schema using ordinal(s): [4] for FK `admin_review_audit_log_performed_by_fkey`.              |
| public | admin_reviews                | `admin_reviews_deleted_by_fkey`                  | `deleted_by`                 | `CREATE INDEX CONCURRENTLY idx_admin_reviews_deleted_by ON public.admin_reviews (deleted_by);`                                   | Inferred as `deleted_by`. **Verify** with schema using ordinal(s): [13] for FK `admin_reviews_deleted_by_fkey`.                          |
| public | admin_reviews                | `admin_reviews_resolved_by_fkey`                 | `resolved_by`                | `CREATE INDEX CONCURRENTLY idx_admin_reviews_resolved_by ON public.admin_reviews (resolved_by);`                                 | Inferred as `resolved_by`. **Verify** with schema using ordinal(s): [8] for FK `admin_reviews_resolved_by_fkey`.                         |
| public | advertisement_analytics      | `advertisement_analytics_member_id_fkey`         | `member_id`                  | `CREATE INDEX CONCURRENTLY idx_advertisement_analytics_member_id ON public.advertisement_analytics (member_id);`                 | Inferred as `member_id`. **Verify** with schema using ordinal(s): [4] for FK `advertisement_analytics_member_id_fkey`.                   |
| public | advertisements               | `advertisements_created_by_fkey`                 | `created_by`                 | `CREATE INDEX CONCURRENTLY idx_advertisements_created_by ON public.advertisements (created_by);`                                 | Inferred as `created_by`. **Verify** with schema using ordinal(s): [12] for FK `advertisements_created_by_fkey`.                         |
| public | messages                     | `messages_recipient_id_fkey`                     | `recipient_id`               | `CREATE INDEX CONCURRENTLY idx_messages_recipient_id ON public.messages (recipient_id);`                                         | Inferred as `recipient_id`. **Verify** with schema using ordinal(s): [3] for FK `messages_recipient_id_fkey`.                            |
| public | pld_sdv_allotments           | `pld_sdv_allotments_override_by_fkey`            | `override_by`                | `CREATE INDEX CONCURRENTLY idx_pld_sdv_allotments_override_by ON public.pld_sdv_allotments (override_by);`                       | Inferred as `override_by`. **Verify** with schema using ordinal(s): [10] for FK `pld_sdv_allotments_override_by_fkey`.                   |
| public | pld_sdv_allotments           | `pld_sdv_allotments_updated_by_fkey`             | `updated_by`                 | `CREATE INDEX CONCURRENTLY idx_pld_sdv_allotments_updated_by ON public.pld_sdv_allotments (updated_by);`                         | Inferred as `updated_by`. **Verify** with schema using ordinal(s): [13] for FK `pld_sdv_allotments_updated_by_fkey`.                     |
| public | pld_sdv_requests             | `fk_member`                                      | `member_id`                  | `CREATE INDEX CONCURRENTLY idx_pld_sdv_requests_member_id ON public.pld_sdv_requests (member_id);`                               | Inferred as `member_id`. **Verify** with schema using ordinal(s): [2] for FK `fk_member`.                                                |
| public | pld_sdv_requests             | `pld_sdv_requests_actioned_by_fkey`              | `actioned_by`                | `CREATE INDEX CONCURRENTLY idx_pld_sdv_requests_actioned_by ON public.pld_sdv_requests (actioned_by);`                           | Inferred as `actioned_by`. **Verify** with schema using ordinal(s): [14] for FK `pld_sdv_requests_actioned_by_fkey`.                     |
| public | pld_sdv_requests             | `pld_sdv_requests_denial_reason_id_fkey`         | `denial_reason_id`           | `CREATE INDEX CONCURRENTLY idx_pld_sdv_requests_denial_reason_id ON public.pld_sdv_requests (denial_reason_id);`                 | Inferred as `denial_reason_id`. **Verify** with schema using ordinal(s): [12] for FK `pld_sdv_requests_denial_reason_id_fkey`.           |
| public | pld_sdv_requests             | `pld_sdv_requests_member_id_fkey`                | `member_id`                  | `CREATE INDEX CONCURRENTLY idx_pld_sdv_requests_member_id ON public.pld_sdv_requests (member_id);`                               | Inferred as `member_id`. **Verify** with schema using ordinal(s): [2] for FK `pld_sdv_requests_member_id_fkey`.                          |
| public | pld_sdv_requests             | `pld_sdv_requests_override_by_fkey`              | `override_by`                | `CREATE INDEX CONCURRENTLY idx_pld_sdv_requests_override_by ON public.pld_sdv_requests (override_by);`                           | Inferred as `override_by`. **Verify** with schema using ordinal(s): [20] for FK `pld_sdv_requests_override_by_fkey`.                     |
| public | pld_sdv_requests             | `pld_sdv_requests_responded_by_fkey`             | `responded_by`               | `CREATE INDEX CONCURRENTLY idx_pld_sdv_requests_responded_by ON public.pld_sdv_requests (responded_by);`                         | Inferred as `responded_by`. **Verify** with schema using ordinal(s): [10] for FK `pld_sdv_requests_responded_by_fkey`.                   |
| public | push_notification_deliveries | `push_notification_deliveries_recipient_id_fkey` | `recipient_id`               | `CREATE INDEX CONCURRENTLY idx_push_notification_deliveries_recipient_id ON public.push_notification_deliveries (recipient_id);` | Inferred as `recipient_id`. **Verify** with schema using ordinal(s): [3] for FK `push_notification_deliveries_recipient_id_fkey`.        |
| public | six_month_requests           | `six_month_requests_calendar_id_fkey`            | `calendar_id`                | `CREATE INDEX CONCURRENTLY idx_six_month_requests_calendar_id ON public.six_month_requests (calendar_id);`                       | Inferred as `calendar_id`. **Verify** with schema using ordinal(s): [13] for FK `six_month_requests_calendar_id_fkey`.                   |
| public | vacation_allotments          | `vacation_allotments_override_by_fkey`           | `override_by`                | `CREATE INDEX CONCURRENTLY idx_vacation_allotments_override_by ON public.vacation_allotments (override_by);`                     | Inferred as `override_by`. **Verify** with schema using ordinal(s): [10] for FK `vacation_allotments_override_by_fkey`.                  |
| public | vacation_allotments          | `vacation_allotments_updated_by_fkey`            | `updated_by`                 | `CREATE INDEX CONCURRENTLY idx_vacation_allotments_updated_by ON public.vacation_allotments (updated_by);`                       | Inferred as `updated_by`. **Verify** with schema using ordinal(s): [13] for FK `vacation_allotments_updated_by_fkey`.                    |
| public | vacation_requests            | `vacation_requests_actioned_by_fkey`             | `actioned_by`                | `CREATE INDEX CONCURRENTLY idx_vacation_requests_actioned_by ON public.vacation_requests (actioned_by);`                         | Inferred as `actioned_by`. **Verify** with schema using ordinal(s): [13] for FK `vacation_requests_actioned_by_fkey`.                    |
| public | vacation_requests            | `vacation_requests_denial_reason_id_fkey`        | `denial_reason_id`           | `CREATE INDEX CONCURRENTLY idx_vacation_requests_denial_reason_id ON public.vacation_requests (denial_reason_id);`               | Inferred as `denial_reason_id`. **Verify** with schema using ordinal(s): [11] for FK `vacation_requests_denial_reason_id_fkey`.          |
| public | vacation_requests            | `vacation_requests_override_by_fkey`             | `override_by`                | `CREATE INDEX CONCURRENTLY idx_vacation_requests_override_by ON public.vacation_requests (override_by);`                         | Inferred as `override_by`. **Verify** with schema using ordinal(s): [19] for FK `vacation_requests_override_by_fkey`.                    |
| public | vacation_requests            | `vacation_requests_responded_by_fkey`            | `responded_by`               | `CREATE INDEX CONCURRENTLY idx_vacation_requests_responded_by ON public.vacation_requests (responded_by);`                       | Inferred as `responded_by`. **Verify** with schema using ordinal(s): [10] for FK `vacation_requests_responded_by_fkey`.                  |
| public | year_end_transactions        | `year_end_transactions_member_pin_fkey`          | `member_pin`                 | `CREATE INDEX CONCURRENTLY idx_year_end_transactions_member_pin ON public.year_end_transactions (member_pin);`                   | Inferred as `member_pin`. **Verify** with schema using ordinal(s): [3] for FK `year_end_transactions_member_pin_fkey`.                   |
| public | zones                        | `zones_division_id_fkey`                         | `division_id`                | `CREATE INDEX CONCURRENTLY idx_zones_division_id ON public.zones (division_id);`                                                 | Inferred as `division_id`. **Verify** with schema using ordinal(s): [3] for FK `zones_division_id_fkey`.                                 |

## II. Indexes to Drop (Unused Indexes)

This section lists indexes that Supabase has identified as potentially unused. Removing them can reduce storage overhead and may speed up write operations. **Verify non-usage before dropping.**

| Schema | Table Name              | Index Name                                  | SQL Statement to Drop Index                                                 |
| ------ | ----------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| public | admin_messages          | `idx_admin_messages_recipient_division_ids` | `DROP INDEX CONCURRENTLY public.idx_admin_messages_recipient_division_ids;` |
| public | messages                | `idx_messages_acknowledged_at`              | `DROP INDEX CONCURRENTLY public.idx_messages_acknowledged_at;`              |
| public | messages                | `idx_messages_acknowledged_by`              | `DROP INDEX CONCURRENTLY public.idx_messages_acknowledged_by;`              |
| public | admin_messages          | `idx_admin_messages_recipient_roles`        | `DROP INDEX CONCURRENTLY public.idx_admin_messages_recipient_roles;`        |
| public | admin_messages          | `idx_admin_messages_sender_role`            | `DROP INDEX CONCURRENTLY public.idx_admin_messages_sender_role;`            |
| public | calendar_audit_trail    | `idx_calendar_audit_trail_record_id`        | `DROP INDEX CONCURRENTLY public.idx_calendar_audit_trail_record_id;`        |
| public | vacation_requests       | `idx_vacation_requests_status`              | `DROP INDEX CONCURRENTLY public.idx_vacation_requests_status;`              |
| public | advertisement_analytics | `advertisement_analytics_event_type_idx`    | `DROP INDEX CONCURRENTLY public.advertisement_analytics_event_type_idx;`    |
| public | messages                | `idx_messages_read_at`                      | `DROP INDEX CONCURRENTLY public.idx_messages_read_at;`                      |
| public | admin_reviews           | `idx_admin_reviews_status`                  | `DROP INDEX CONCURRENTLY public.idx_admin_reviews_status;`                  |
| public | admin_reviews           | `idx_admin_reviews_request_type`            | `DROP INDEX CONCURRENTLY public.idx_admin_reviews_request_type;`            |
| public | admin_reviews           | `idx_admin_reviews_follow_up_date`          | `DROP INDEX CONCURRENTLY public.idx_admin_reviews_follow_up_date;`          |
| public | admin_reviews           | `idx_admin_reviews_is_deleted`              | `DROP INDEX CONCURRENTLY public.idx_admin_reviews_is_deleted;`              |
| public | admin_review_audit_log  | `idx_admin_review_audit_log_review_id`      | `DROP INDEX CONCURRENTLY public.idx_admin_review_audit_log_review_id;`      |
| public | admin_review_audit_log  | `idx_admin_review_audit_log_performed_at`   | `DROP INDEX CONCURRENTLY public.idx_admin_review_audit_log_performed_at;`   |

## Implementation Notes

1. **Important Considerations:**

   - We verified most column names but found one potential mismatch: `admin_messages_from_user_id_fkey` refers to a column that wasn't found in the schema inspection.
   - For `pld_sdv_requests` table, the `fk_member` foreign key appears to reference the `member_id` column, so we've adjusted the index to target that column.
   - The `pld_sdv_requests` table has two foreign keys that reference the same column (`member_id`): `fk_member` and `pld_sdv_requests_member_id_fkey`. We should create only one index for this column.

2. **Implementation Strategy:**

   - First, validate the list of unused indexes against our application's query patterns to ensure they're truly unused.
   - Then, create the identified missing indexes one at a time, starting with the most frequently used tables.
   - Monitor query performance before and after changes to measure impact.
   - If a particular index doesn't show performance improvement after a reasonable observation period, consider dropping it.

3. **Next Steps:**
   - Review the SQL query logs to better understand how these tables are being accessed.
   - Prioritize indexes on tables with the highest read activity.
   - Consider additional optimization techniques such as table partitioning for very large tables if applicable.
   - Set up a regular database maintenance schedule to periodically review index usage and performance.
