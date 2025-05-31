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

| Schema | Table Name                       | Foreign Key Name                                 | Verified Column Name    | SQL Statement to Create Index                                                                                                    | Notes                                                                                                     |
| ------ | -------------------------------- | ------------------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------- |
| public | admin_messages                   | `admin_messages_sender_user_id_fkey`             | `sender_user_id`        | `CREATE INDEX CONCURRENTLY idx_admin_messages_sender_user_id ON public.admin_messages (sender_user_id);`                         | Confirmed from schema inspection: references `users.id`                                                   | ✅ Done |
| public | admin_messages                   | `admin_messages_parent_message_id_fkey`          | `parent_message_id`     | `CREATE INDEX CONCURRENTLY idx_admin_messages_parent_message_id ON public.admin_messages (parent_message_id);`                   | Confirmed from schema inspection: references `admin_messages.id` (self-reference)                         | ✅ Done |
| public | admin_preferences                | `admin_preferences_last_selected_zone_id_fkey`   | `last_selected_zone_id` | `CREATE INDEX CONCURRENTLY idx_admin_preferences_last_selected_zone_id ON public.admin_preferences (last_selected_zone_id);`     | Inferred as `last_selected_zone_id`. Verify with schema.                                                  | ✅ Done |
| public | admin_review_audit_log           | `admin_review_audit_log_performed_by_fkey`       | `performed_by`          | `CREATE INDEX CONCURRENTLY idx_admin_review_audit_log_performed_by ON public.admin_review_audit_log (performed_by);`             | Inferred as `performed_by`. Verify with schema.                                                           | ✅ Done |
| public | admin_review_audit_log           | `admin_review_audit_log_review_id_fkey`          | `review_id`             | `CREATE INDEX idx_admin_review_audit_log_review_id ON public.admin_review_audit_log (review_id);`                                | Added after linter rerun showed the column was missing an index.                                          | ✅ Done |
| public | admin_reviews                    | `admin_reviews_deleted_by_fkey`                  | `deleted_by`            | `CREATE INDEX CONCURRENTLY idx_admin_reviews_deleted_by ON public.admin_reviews (deleted_by);`                                   | Inferred as `deleted_by`. Verify with schema.                                                             | ✅ Done |
| public | admin_reviews                    | `admin_reviews_resolved_by_fkey`                 | `resolved_by`           | `CREATE INDEX CONCURRENTLY idx_admin_reviews_resolved_by ON public.admin_reviews (resolved_by);`                                 | Inferred as `resolved_by`. Verify with schema.                                                            | ✅ Done |
| public | advertisement_analytics          | `advertisement_analytics_member_id_fkey`         | `member_id`             | `CREATE INDEX CONCURRENTLY idx_advertisement_analytics_member_id ON public.advertisement_analytics (member_id);`                 | Inferred as `member_id`. Verify with schema.                                                              | ✅ Done |
| public | advertisements                   | `advertisements_created_by_fkey`                 | `created_by`            | `CREATE INDEX CONCURRENTLY idx_advertisements_created_by ON public.advertisements (created_by);`                                 | Inferred as `created_by`. Verify with schema.                                                             | ✅ Done |
| public | meeting_minutes                  | `meeting_minutes_approved_by_fkey`               | `approved_by`           | `CREATE INDEX idx_meeting_minutes_approved_by ON public.meeting_minutes (approved_by);`                                          | Added after linter rerun showed the column was missing an index.                                          | ✅ Done |
| public | meeting_notification_preferences | `meeting_notification_preferences_user_id_fkey`  | `user_id`               | `CREATE INDEX idx_meeting_notification_preferences_user_id ON public.meeting_notification_preferences (user_id);`                | Added after linter rerun showed the column was missing an index.                                          | ✅ Done |
| public | messages                         | `messages_recipient_id_fkey`                     | `recipient_id`          | `CREATE INDEX CONCURRENTLY idx_messages_recipient_id ON public.messages (recipient_id);`                                         | Inferred as `recipient_id`. Verify with schema.                                                           | ✅ Done |
| public | pld_sdv_allotments               | `pld_sdv_allotments_override_by_fkey`            | `override_by`           | `CREATE INDEX CONCURRENTLY idx_pld_sdv_allotments_override_by ON public.pld_sdv_allotments (override_by);`                       | Inferred as `override_by`. Verify with schema.                                                            | ✅ Done |
| public | pld_sdv_allotments               | `pld_sdv_allotments_updated_by_fkey`             | `updated_by`            | `CREATE INDEX CONCURRENTLY idx_pld_sdv_allotments_updated_by ON public.pld_sdv_allotments (updated_by);`                         | Inferred as `updated_by`. Verify with schema.                                                             | ✅ Done |
| public | pld_sdv_requests                 | `pld_sdv_requests_member_id_fkey`                | `member_id`             | `CREATE INDEX CONCURRENTLY idx_pld_sdv_requests_member_id ON public.pld_sdv_requests (member_id);`                               | Confirmed from schema inspection: references both `members.id` and `users.id`. One index covers both FKs. | ✅ Done |
| public | pld_sdv_requests                 | `pld_sdv_requests_actioned_by_fkey`              | `actioned_by`           | `CREATE INDEX CONCURRENTLY idx_pld_sdv_requests_actioned_by ON public.pld_sdv_requests (actioned_by);`                           | Confirmed from schema inspection: references `users.id`                                                   | ✅ Done |
| public | pld_sdv_requests                 | `pld_sdv_requests_denial_reason_id_fkey`         | `denial_reason_id`      | `CREATE INDEX CONCURRENTLY idx_pld_sdv_requests_denial_reason_id ON public.pld_sdv_requests (denial_reason_id);`                 | Confirmed from schema inspection: references `pld_sdv_denial_reasons.id`                                  | ✅ Done |
| public | pld_sdv_requests                 | `pld_sdv_requests_responded_by_fkey`             | `responded_by`          | `CREATE INDEX CONCURRENTLY idx_pld_sdv_requests_responded_by ON public.pld_sdv_requests (responded_by);`                         | Confirmed from schema inspection: references `users.id`                                                   | ✅ Done |
| public | pld_sdv_requests                 | `pld_sdv_requests_override_by_fkey`              | `override_by`           | `CREATE INDEX CONCURRENTLY idx_pld_sdv_requests_override_by ON public.pld_sdv_requests (override_by);`                           | Confirmed from schema inspection: references `users.id`                                                   | ✅ Done |
| public | push_notification_deliveries     | `push_notification_deliveries_recipient_id_fkey` | `recipient_id`          | `CREATE INDEX CONCURRENTLY idx_push_notification_deliveries_recipient_id ON public.push_notification_deliveries (recipient_id);` | Inferred as `recipient_id`. Verify with schema.                                                           | ✅ Done |
| public | six_month_requests               | `six_month_requests_calendar_id_fkey`            | `calendar_id`           | `CREATE INDEX CONCURRENTLY idx_six_month_requests_calendar_id ON public.six_month_requests (calendar_id);`                       | Inferred as `calendar_id`. Verify with schema.                                                            | ✅ Done |
| public | vacation_allotments              | `vacation_allotments_override_by_fkey`           | `override_by`           | `CREATE INDEX CONCURRENTLY idx_vacation_allotments_override_by ON public.vacation_allotments (override_by);`                     | Inferred as `override_by`. Verify with schema.                                                            | ✅ Done |
| public | vacation_allotments              | `vacation_allotments_updated_by_fkey`            | `updated_by`            | `CREATE INDEX CONCURRENTLY idx_vacation_allotments_updated_by ON public.vacation_allotments (updated_by);`                       | Inferred as `updated_by`. Verify with schema.                                                             | ✅ Done |
| public | vacation_requests                | `vacation_requests_actioned_by_fkey`             | `actioned_by`           | `CREATE INDEX CONCURRENTLY idx_vacation_requests_actioned_by ON public.vacation_requests (actioned_by);`                         | Inferred as `actioned_by`. Verify with schema.                                                            | ✅ Done |
| public | vacation_requests                | `vacation_requests_denial_reason_id_fkey`        | `denial_reason_id`      | `CREATE INDEX CONCURRENTLY idx_vacation_requests_denial_reason_id ON public.vacation_requests (denial_reason_id);`               | Inferred as `denial_reason_id`. Verify with schema.                                                       | ✅ Done |
| public | vacation_requests                | `vacation_requests_override_by_fkey`             | `override_by`           | `CREATE INDEX CONCURRENTLY idx_vacation_requests_override_by ON public.vacation_requests (override_by);`                         | Inferred as `override_by`. Verify with schema.                                                            | ✅ Done |
| public | vacation_requests                | `vacation_requests_responded_by_fkey`            | `responded_by`          | `CREATE INDEX CONCURRENTLY idx_vacation_requests_responded_by ON public.vacation_requests (responded_by);`                       | Inferred as `responded_by`. Verify with schema.                                                           | ✅ Done |
| public | year_end_transactions            | `year_end_transactions_member_pin_fkey`          | `member_pin`            | `CREATE INDEX CONCURRENTLY idx_year_end_transactions_member_pin ON public.year_end_transactions (member_pin);`                   | Inferred as `member_pin`. Verify with schema.                                                             | ✅ Done |
| public | zones                            | `zones_division_id_fkey`                         | `division_id`           | `CREATE INDEX CONCURRENTLY idx_zones_division_id ON public.zones (division_id);`                                                 | Inferred as `division_id`. Verify with schema.                                                            | ✅ Done |
| public | member_transfer_log              | `member_transfer_log_old_division_id_fkey`       | `old_division_id`       | `CREATE INDEX idx_member_transfer_log_old_division_id ON public.member_transfer_log (old_division_id);`                          | Confirmed from schema inspection: references `divisions.id`                                               | ✅ Done |
| public | member_transfer_log              | `member_transfer_log_old_zone_id_fkey`           | `old_zone_id`           | `CREATE INDEX idx_member_transfer_log_old_zone_id ON public.member_transfer_log (old_zone_id);`                                  | Confirmed from schema inspection: references `zones.id`                                                   | ✅ Done |
| public | member_transfer_log              | `member_transfer_log_old_calendar_id_fkey`       | `old_calendar_id`       | `CREATE INDEX idx_member_transfer_log_old_calendar_id ON public.member_transfer_log (old_calendar_id);`                          | Confirmed from schema inspection: references `calendars.id`                                               | ✅ Done |
| public | member_transfer_log              | `member_transfer_log_old_home_zone_id_fkey`      | `old_home_zone_id`      | `CREATE INDEX idx_member_transfer_log_old_home_zone_id ON public.member_transfer_log (old_home_zone_id);`                        | Confirmed from schema inspection: references `zones.id`                                                   | ✅ Done |
| public | member_transfer_log              | `member_transfer_log_new_division_id_fkey`       | `new_division_id`       | `CREATE INDEX idx_member_transfer_log_new_division_id ON public.member_transfer_log (new_division_id);`                          | Confirmed from schema inspection: references `divisions.id`                                               | ✅ Done |
| public | member_transfer_log              | `member_transfer_log_new_zone_id_fkey`           | `new_zone_id`           | `CREATE INDEX idx_member_transfer_log_new_zone_id ON public.member_transfer_log (new_zone_id);`                                  | Confirmed from schema inspection: references `zones.id`                                                   | ✅ Done |
| public | member_transfer_log              | `member_transfer_log_new_calendar_id_fkey`       | `new_calendar_id`       | `CREATE INDEX idx_member_transfer_log_new_calendar_id ON public.member_transfer_log (new_calendar_id);`                          | Confirmed from schema inspection: references `calendars.id`                                               | ✅ Done |
| public | member_transfer_log              | `member_transfer_log_new_home_zone_id_fkey`      | `new_home_zone_id`      | `CREATE INDEX idx_member_transfer_log_new_home_zone_id ON public.member_transfer_log (new_home_zone_id);`                        | Confirmed from schema inspection: references `zones.id`                                                   | ✅ Done |

**Note:** The latest linter report shows many of these indexes we created as "unused". This is expected as they're new indexes that haven't been used in queries yet. We'll keep them in place since they cover foreign keys and will likely improve query performance in the future.

## II. Indexes to Drop (Unused Indexes)

This section lists indexes that Supabase has identified as potentially unused. Removing them can reduce storage overhead and may speed up write operations. **Verify non-usage before dropping.**

| Schema | Table Name              | Index Name                                  | SQL Statement to Drop Index                                                 |
| ------ | ----------------------- | ------------------------------------------- | --------------------------------------------------------------------------- | ------- |
| public | admin_messages          | `idx_admin_messages_recipient_division_ids` | `DROP INDEX CONCURRENTLY public.idx_admin_messages_recipient_division_ids;` | ✅ Done |
| public | messages                | `idx_messages_acknowledged_at`              | `DROP INDEX CONCURRENTLY public.idx_messages_acknowledged_at;`              | ✅ Done |
| public | messages                | `idx_messages_acknowledged_by`              | `DROP INDEX CONCURRENTLY public.idx_messages_acknowledged_by;`              | ✅ Done |
| public | admin_messages          | `idx_admin_messages_recipient_roles`        | `DROP INDEX CONCURRENTLY public.idx_admin_messages_recipient_roles;`        | ✅ Done |
| public | admin_messages          | `idx_admin_messages_sender_role`            | `DROP INDEX CONCURRENTLY public.idx_admin_messages_sender_role;`            | ✅ Done |
| public | calendar_audit_trail    | `idx_calendar_audit_trail_record_id`        | `DROP INDEX CONCURRENTLY public.idx_calendar_audit_trail_record_id;`        | ✅ Done |
| public | vacation_requests       | `idx_vacation_requests_status`              | `DROP INDEX CONCURRENTLY public.idx_vacation_requests_status;`              | ✅ Done |
| public | advertisement_analytics | `advertisement_analytics_event_type_idx`    | `DROP INDEX CONCURRENTLY public.advertisement_analytics_event_type_idx;`    | ✅ Done |
| public | messages                | `idx_messages_read_at`                      | `DROP INDEX CONCURRENTLY public.idx_messages_read_at;`                      | ✅ Done |
| public | admin_reviews           | `idx_admin_reviews_status`                  | `DROP INDEX CONCURRENTLY public.idx_admin_reviews_status;`                  | ✅ Done |
| public | admin_reviews           | `idx_admin_reviews_request_type`            | `DROP INDEX CONCURRENTLY public.idx_admin_reviews_request_type;`            | ✅ Done |
| public | admin_reviews           | `idx_admin_reviews_follow_up_date`          | `DROP INDEX CONCURRENTLY public.idx_admin_reviews_follow_up_date;`          | ✅ Done |
| public | admin_reviews           | `idx_admin_reviews_is_deleted`              | `DROP INDEX CONCURRENTLY public.idx_admin_reviews_is_deleted;`              | ✅ Done |
| public | admin_review_audit_log  | `idx_admin_review_audit_log_performed_at`   | `DROP INDEX CONCURRENTLY public.idx_admin_review_audit_log_performed_at;`   | ✅ Done |

## III. Row Level Security (RLS) Optimizations

The Supabase performance warnings identified numerous RLS policies that are using inefficient patterns. These issues fall into two main categories:

### A. Auth RLS Initialization Plan Issues

Many RLS policies are using direct calls to `auth.<function>()` which are being re-evaluated for each row. This creates significant performance overhead, especially for tables with many rows.

**Solution:** Modify all affected policies to use the more efficient `(SELECT auth.<function>())` pattern. This ensures the function is evaluated only once per query rather than once per row.

**✅ COMPLETED: All policies have been updated to use the efficient pattern, including:**

- `admin_messages` (all policies using `auth.uid()` or `get_my_effective_roles()`)
- `pld_sdv_allotments` (all policies using `auth.uid()` or `auth.jwt()`, including the `manage_allotments_company_admin` policy)
- `admin_message_read_status` (all policies using `auth.uid()`, including `Allow users to read their own status` and `Allow user to delete own read status`)
- `pld_sdv_requests` (all policies using `auth.uid()` or `auth.jwt()`)
- `vacation_allotments` (all policies using `auth.uid()`)
- `push_notification_deliveries` (all policies using `auth.uid()` or `auth.jwt()`)
- `user_preferences` (all policies using `auth.uid()` or `auth.jwt()`)
- `divisions` (all policies using `auth.uid()`)
- `zones` (all policies using `auth.uid()`)
- `vacation_requests` (all policies using `auth.uid()`)
- `calendar_audit_trail` (all policies using `auth.uid()`)
- `admin_preferences` (all policies using `auth.uid()`)
- `messages` (all policies using `auth.uid()` or `auth.jwt()`)
- `meeting_notification_preferences` (all policies using `auth.uid()`)
- `year_end_transactions` (all policies using `auth.jwt()`)
- `calendars` (all policies using `auth.uid()` or `auth.jwt()`)
- `advertisements` (all policies using `auth.uid()`)
- `advertisement_analytics` (all policies using `auth.uid()`)
- `member_transfer_log` (all policies using `auth.uid()`) ✅ Done

**Phase III A is now 100% complete - All RLS policies have been optimized to use the efficient auth pattern.**

#### Specific Examples of Required Changes

1. **admin_messages** - "Allow access based on effective role or sender" policy:

```sql
-- CURRENT (inefficient):
CREATE POLICY "Allow access based on effective role or sender" ON public.admin_messages
FOR SELECT USING (
  (auth.uid() = sender_user_id) OR
  (('application_admin'::text = ANY (get_my_effective_roles())) OR
   ('union_admin'::text = ANY (get_my_effective_roles()))) OR
  -- additional conditions...
);

-- OPTIMIZED:
CREATE POLICY "Allow access based on effective role or sender" ON public.admin_messages
FOR SELECT USING (
  ((SELECT auth.uid()) = sender_user_id) OR
  (('application_admin'::text = ANY ((SELECT get_my_effective_roles()))) OR
   ('union_admin'::text = ANY ((SELECT get_my_effective_roles())))) OR
  -- additional conditions with similar changes...
);
```

2. **pld_sdv_allotments** - "Users can view division allotments" policy:

```sql
-- CURRENT (inefficient):
CREATE POLICY "Users can view division allotments" ON public.pld_sdv_allotments
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM members m
    JOIN calendars c ON (m.calendar_id = c.id)
    WHERE (m.id = auth.uid() AND c.division_id = (
      SELECT c2.division_id
      FROM calendars c2
      WHERE c2.id = pld_sdv_allotments.calendar_id
    ))
  )
);

-- OPTIMIZED:
CREATE POLICY "Users can view division allotments" ON public.pld_sdv_allotments
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM members m
    JOIN calendars c ON (m.calendar_id = c.id)
    WHERE (m.id = (SELECT auth.uid()) AND c.division_id = (
      SELECT c2.division_id
      FROM calendars c2
      WHERE c2.id = pld_sdv_allotments.calendar_id
    ))
  )
);
```

### B. Multiple Permissive Policies

Several tables have multiple permissive policies for the same role and action. This is inefficient because each policy must be executed for every relevant query.

**Solution:** Consolidate multiple permissive policies into a single policy using OR conditions where possible.

#### Specific Examples of Required Consolidations

1. **admin_message_read_status** - Duplicate SELECT policies:

```sql
-- CURRENT (inefficient - two separate policies):
CREATE POLICY "Allow users to select their own read status"
  ON public.admin_message_read_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Allow users to read their own status"
  ON public.admin_message_read_status FOR SELECT
  USING (auth.uid() = user_id);

-- OPTIMIZED (single consolidated policy):
CREATE POLICY "Allow users to access their own read status"
  ON public.admin_message_read_status FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
-- Note: We're also fixing the auth.uid() call at the same time
-- Only one policy is needed since both have identical conditions
```

2. **admin_message_read_status** - Duplicate DELETE policies:

```sql
-- CURRENT (inefficient - two separate policies):
CREATE POLICY "Allow users to delete their own read status"
  ON public.admin_message_read_status FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Allow user to delete own read status"
  ON public.admin_message_read_status FOR DELETE
  USING (auth.uid() = user_id);

-- OPTIMIZED (single consolidated policy):
CREATE POLICY "Allow users to delete their own read status"
  ON public.admin_message_read_status FOR DELETE
  USING ((SELECT auth.uid()) = user_id);
-- Note: We're also fixing the auth.uid() call at the same time
```

3. **pld_sdv_allotments** - Multiple SELECT policies that could be consolidated:

```sql
-- CURRENT (inefficient - multiple separate policies):
CREATE POLICY "Users can view division allotments"
  ON public.pld_sdv_allotments FOR SELECT
  USING (EXISTS (...));

CREATE POLICY "Admins can view all allotments"
  ON public.pld_sdv_allotments FOR SELECT
  USING (EXISTS (...));

CREATE POLICY "Users can read allotments that match their assigned calendar"
  ON public.pld_sdv_allotments FOR SELECT
  USING (EXISTS (...));

-- OPTIMIZED (consolidated policy):
CREATE POLICY "Combined allotment view policy"
  ON public.pld_sdv_allotments FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM members
      WHERE (members.id = (SELECT auth.uid()) AND members.role = ANY (ARRAY['application_admin', 'union_admin', 'division_admin', 'company_admin']))
    ) OR
    EXISTS (
      SELECT 1
      FROM members m
      JOIN calendars c ON (m.calendar_id = c.id)
      WHERE (m.id = (SELECT auth.uid()) AND c.division_id = (
        SELECT c2.division_id FROM calendars c2 WHERE c2.id = pld_sdv_allotments.calendar_id
      ))
    ) OR
    EXISTS (
      SELECT 1
      FROM members
      WHERE (members.id = (SELECT auth.uid()) AND members.calendar_id = pld_sdv_allotments.calendar_id)
    )
  );
```

**Tables Requiring Consolidation:**

The following tables have multiple permissive policies that should be consolidated:

1. public.admin_message_read_status - Duplicate policies for SELECT, INSERT, and DELETE actions
2. public.advertisements - Multiple SELECT policies for authenticated role
3. public.calendars - Multiple policies for all actions across different roles
4. public.divisions - Multiple SELECT policies
5. public.members - Multiple SELECT and UPDATE policies
6. public.messages - Multiple INSERT, SELECT, and UPDATE policies
7. public.pld_sdv_allotments - Multiple SELECT and UPDATE policies
8. public.pld_sdv_requests - Multiple INSERT, SELECT, and UPDATE policies
9. public.push_notification_deliveries - Multiple SELECT policies
10. public.vacation_allotments - Multiple SELECT policies
11. public.zones - Multiple SELECT policies

## Implementation Notes

1. **Important Considerations:**

   - We've verified most column names from schema inspection. For `admin_messages`, we found that `
