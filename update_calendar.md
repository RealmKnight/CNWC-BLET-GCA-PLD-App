# Zone-Based Calendar Implementation Plan

## Overview

This document outlines the implementation plan for adding zone-specific calendar support to the PLD/SDV calendar system. The changes will allow divisions to optionally maintain separate calendars for different zones while maintaining backward compatibility for divisions that use a single calendar.

## Requirements

### Division/Zone Relationship

- Divisions can optionally split their calendar by zones
- Zones without specific calendars will use the division's main calendar
- Division admins can manage calendars for all their zones
- Members will only see their specific zone's calendar (if applicable)

### Data Management

- Zone-specific allotments start fresh (no copying from division calendar)
- Historical requests remain with their original division
- Zone transfers will be handled in a future update
- Approved requests don't count towards allotments after zone transfer

## Implementation Phases

### Phase 1: Database Schema Updates

#### Dependencies

- Must be completed before any other phases
- Requires database admin access
- Requires MCP Supabase tools

#### Required Files

None - All changes made through MCP tools

#### Tools Required

- mcp_supabase_execute_postgresql
- mcp_supabase_get_schemas
- mcp_supabase_get_tables
- mcp_supabase_get_table_schema

#### Database Updates

\`\`\`sql
-- Enable unsafe mode first
-- Add zone calendar support to divisions
ALTER TABLE divisions
ADD COLUMN uses_zone_calendars BOOLEAN DEFAULT false;

-- Add zone support to allotments
ALTER TABLE pld_sdv_allotments
ADD COLUMN zone_id INTEGER REFERENCES zones(id);

-- Add zone support to requests
ALTER TABLE pld_sdv_requests
ADD COLUMN zone_id INTEGER REFERENCES zones(id);

-- Add zone support to six month requests
ALTER TABLE six_month_requests
ADD COLUMN zone_id INTEGER REFERENCES zones(id);
\`\`\`

### Phase 2: Backend Processing Updates

#### Dependencies

- Requires Phase 1 completion
- Must be completed before UI updates

#### Required Files

- store/calendarStore.ts
- store/userStore.ts
- types/supabase.ts
- utils/supabase.ts

#### Tools Required

- mcp_supabase_execute_postgresql
- edit_file
- read_file
- codebase_search

#### Processing Function Updates

\`\`\`sql
-- Update process_six_month_requests function to handle zones
CREATE OR REPLACE FUNCTION public.process_six_month_requests(target_date date)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
v_max_allotment INTEGER;
v_division TEXT;
v_zone_id INTEGER;
v_year INTEGER;
v_request record;
v_position INTEGER := 1;
v_waitlist_position INTEGER := 1;
BEGIN
-- Get the year for the target date
v_year := EXTRACT(YEAR FROM target_date);

    -- Process each division/zone combination separately
    FOR v_division, v_zone_id IN (
        SELECT DISTINCT division, zone_id
        FROM six_month_requests
        WHERE request_date = target_date
        AND NOT processed
    ) LOOP
        -- Reset position counters for each division/zone
        v_position := 1;
        v_waitlist_position := 1;

        -- Get max allotment for the date/division/zone
        SELECT COALESCE(
            -- First check for specific date allotment
            (SELECT max_allotment FROM pld_sdv_allotments
             WHERE date = target_date
             AND division = v_division
             AND zone_id = v_zone_id),
            -- Then check for specific date division-wide allotment
            (SELECT max_allotment FROM pld_sdv_allotments
             WHERE date = target_date
             AND division = v_division
             AND zone_id IS NULL),
            -- Then check for yearly zone-specific allotment
            (SELECT max_allotment FROM pld_sdv_allotments
             WHERE year = v_year
             AND division = v_division
             AND zone_id = v_zone_id
             AND date = make_date(v_year, 1, 1)),
            -- Finally check for yearly division-wide allotment
            (SELECT max_allotment FROM pld_sdv_allotments
             WHERE year = v_year
             AND division = v_division
             AND zone_id IS NULL
             AND date = make_date(v_year, 1, 1)),
            6  -- Default if no allotment set
        ) INTO v_max_allotment;

        -- Process requests in seniority order
        FOR v_request IN (
            SELECT r.*,
                   COALESCE(m.wc_sen_roster, m.prior_vac_sys) as seniority
            FROM six_month_requests r
            JOIN members m ON r.member_id = m.id
            WHERE r.request_date = target_date
            AND r.division = v_division
            AND (r.zone_id = v_zone_id OR (r.zone_id IS NULL AND v_zone_id IS NULL))
            AND NOT r.processed
            ORDER BY
                CASE WHEN m.wc_sen_roster IS NOT NULL THEN 0 ELSE 1 END,  -- WC roster first
                COALESCE(m.wc_sen_roster, m.prior_vac_sys) ASC NULLS LAST
        ) LOOP
            -- Rest of the processing logic remains the same,
            -- just ensure zone_id is included in inserts
            IF v_position <= v_max_allotment THEN
                -- Insert approved request with zone_id
                INSERT INTO pld_sdv_requests (
                    member_id, division, zone_id, request_date, leave_type,
                    status, requested_at
                ) VALUES (
                    v_request.member_id, v_request.division, v_request.zone_id,
                    v_request.request_date, v_request.leave_type, 'pending',
                    v_request.requested_at
                );

                -- Update six_month_requests status
                UPDATE six_month_requests
                SET processed = TRUE,
                    processed_at = NOW(),
                    final_status = 'approved',
                    position = v_position
                WHERE id = v_request.id;

                v_position := v_position + 1;
            ELSE
                -- Insert waitlisted request with zone_id
                INSERT INTO pld_sdv_requests (
                    member_id, division, zone_id, request_date, leave_type,
                    status, requested_at, waitlist_position
                ) VALUES (
                    v_request.member_id, v_request.division, v_request.zone_id,
                    v_request.request_date, v_request.leave_type, 'waitlisted',
                    v_request.requested_at, v_waitlist_position
                );

                -- Update six_month_requests status
                UPDATE six_month_requests
                SET processed = TRUE,
                    processed_at = NOW(),
                    final_status = 'waitlisted',
                    position = v_waitlist_position
                WHERE id = v_request.id;

                v_waitlist_position := v_waitlist_position + 1;
            END IF;
        END LOOP;
    END LOOP;

END;
$function$;

-- Update cron job to handle all zones
UPDATE cron.job
SET command = $$
SELECT process_six_month_requests((CURRENT_DATE - INTERVAL '1 day' + INTERVAL '6 months')::DATE);

$$
WHERE jobname = 'process-six-month-requests';
\`\`\`

#### Calendar Store Modifications

\`\`\`typescript
// Updates to CalendarStore interface
interface CalendarState {
// Existing properties...
hasZoneSpecificCalendar: (division: string) => boolean;
getMemberZoneCalendar: (division: string, zone: string) => Promise<...>;
validateMemberZone: (memberId: string, zoneId: number) => Promise<boolean>;
submitSixMonthRequest: (date: string, type: "PLD" | "SDV", zoneId?: number) => Promise<void>;
}

// New Zone Management Store
interface ZoneManagementStore {
divisionsWithZones: Record<string, number[]>;
setDivisionZoneCalendars: (division: string, zoneIds: number[]) => Promise<void>;
removeDivisionZoneCalendars: (division: string, zoneIds: number[]) => Promise<void>;
}
\`\`\`

### Phase 3: Admin UI Updates

#### Dependencies

- Requires Phase 1 & 2 completion
- Must be completed before Member UI updates

#### Required Files

- components/admin/division/CalendarAllotments.tsx
- components/Calendar.tsx
- components/ThemedView.tsx
- components/ThemedText.tsx
- hooks/useAuth.ts
- hooks/useColorScheme.ts

#### Tools Required

- edit_file
- read_file
- codebase_search
- grep_search

#### New Components

\`\`\`typescript
// New ZoneCalendarAdmin component
interface ZoneCalendarManagementProps {
division: string;
onZoneSelect: (zoneId: number) => void;
}

// Updates to CalendarAllotments component
interface CalendarAllotmentsProps {
// Existing props...
zoneId?: number;
isZoneSpecific: boolean;
}
\`\`\`

### Phase 4: Member UI Updates

#### Dependencies

- Requires Phase 1, 2, & 3 completion
- Can be deployed independently of admin UI

#### Required Files

- app/(tabs)/calendar.tsx
- components/Calendar.tsx
- components/RequestDialog.tsx
- store/calendarStore.ts
- hooks/useAuth.ts
- hooks/useUserStore.ts

#### Tools Required

- edit_file
- read_file
- codebase_search
- grep_search

#### Component Updates

\`\`\`typescript
// Updates to Calendar component
interface CalendarProps {
// Existing props...
zoneId?: number;
}

// Updates to RequestDialog
interface RequestDialogProps {
// Existing props...
zoneId?: number;
isZoneSpecific: boolean;
isSixMonthRequest: boolean;
}

// Add SixMonthRequestInfo component
interface SixMonthRequestInfoProps {
date: string;
zoneId?: number;
onClose: () => void;
}
\`\`\`

### Phase 5: Migration and Data Handling

#### Dependencies

- Requires all previous phases to be complete
- Must be executed during low-usage period

#### Required Files

- scripts/migrations/zone-calendar-setup.ts (new)
- scripts/migrations/zone-validation.ts (new)
- scripts/migrations/six-month-request-migration.ts (new)
- store/calendarStore.ts
- utils/supabase.ts

#### Tools Required

- mcp_supabase_execute_postgresql
- edit_file
- read_file

#### Migration Scripts

\`\`\`typescript
// Zone calendar setup
async function setupZoneCalendars() {
// Implementation
}

// Zone validation
async function validateZoneAssignments() {
// Implementation
}

// Six month request migration
async function migrateSixMonthRequests() {
// Handle existing six month requests
// No backfilling needed as these are temporary records
}
\`\`\`

#### Migration Considerations

1. Data Migration
- Existing requests and allotments will have NULL zone_id
- Six month requests are temporary, no backfilling needed
- Historical requests remain with their original division

2. Processing Order
- Maintain existing seniority-based processing within zones
- Zone-specific allotments take precedence
- Fall back to division-wide allotments if no zone-specific allotment exists

3. Error Handling
- Add zone validation to ensure requests match member's assigned zone
- Log any zone-related processing errors for monitoring
- Handle six month request validation and conflicts

### Phase 6: Monitoring and Testing

#### Additional Test Cases
1. Six Month Request Processing
- Test zone-specific processing order
- Verify seniority calculations within zones
- Test fallback to division allotments
- Verify waitlist handling

2. Integration Tests
- End-to-end six month request flow
- Multiple zone processing
- Cron job execution
- Zone transfer scenarios

3. Load Tests
- Process multiple zones simultaneously
- Test high-volume six month request processing
- Verify performance under load

## Testing Strategy

### Unit Tests

#### Required Files

- **tests**/store/calendarStore.test.ts
- **tests**/components/Calendar.test.tsx
- **tests**/components/admin/CalendarAllotments.test.tsx

### Integration Tests

#### Required Files

- cypress/integration/calendar.spec.ts
- cypress/integration/admin/zone-management.spec.ts

### UI Tests

#### Required Files

- **tests**/components/Calendar.test.tsx
- **tests**/components/RequestDialog.test.tsx

## Rollout Plan

### 1. Database Schema Updates

- Timing: Off-peak hours
- Requires: Database backup
- Validation: Schema verification

### 2. Backend Logic Implementation

- Timing: After schema updates
- Requires: Unit tests passing
- Validation: Integration tests

### 3. Admin UI Deployment

- Timing: After backend logic
- Requires: UI tests passing
- Validation: Manual testing

### 4. Member UI Updates

- Timing: After admin UI
- Requires: All tests passing
- Validation: User acceptance testing

### 5. Migration Script Execution

- Timing: Off-peak hours
- Requires: All systems operational
- Validation: Data integrity checks

## Monitoring and Maintenance

### Logging Requirements

#### Required Files

- utils/logger.ts
- store/calendarStore.ts
- components/admin/division/CalendarAllotments.tsx

### Error Tracking

#### Required Files

- utils/error-tracking.ts
- store/calendarStore.ts

### Performance Monitoring

#### Required Tools

- Supabase Dashboard
- Application Performance Monitoring (APM)
- Browser Developer Tools

## Risk Mitigation

### Database Risks

- Backup before schema changes
- Rollback scripts prepared
- Data validation checks

### UI/UX Risks

- Progressive rollout
- Feature flags for quick disable
- Clear user communication

### Performance Risks

- Load testing before deployment
- Monitoring strategy in place
- Optimization plan ready

## Timeline Estimates

### Phase 1: Database Schema

- Estimated time: 1-2 days
- Critical path: Yes
- Risk level: High

### Phase 2: Backend Logic

- Estimated time: 3-5 days
- Critical path: Yes
- Risk level: Medium

### Phase 3: Admin UI

- Estimated time: 3-4 days
- Critical path: Yes
- Risk level: Medium

### Phase 4: Member UI

- Estimated time: 2-3 days
- Critical path: No
- Risk level: Low

### Phase 5: Migration

- Estimated time: 1-2 days
- Critical path: Yes
- Risk level: High
$$
