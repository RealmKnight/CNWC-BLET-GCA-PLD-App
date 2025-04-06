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
\`\`\`

### Phase 2: Backend Logic Updates

#### Dependencies

- Requires Phase 1 completion
- Must be completed before UI updates

#### Required Files

- store/calendarStore.ts
- store/userStore.ts
- types/supabase.ts
- utils/supabase.ts

#### Tools Required

- edit_file
- read_file
- codebase_search

#### Calendar Store Modifications

\`\`\`typescript
// Updates to CalendarStore interface
interface CalendarState {
// Existing properties...
hasZoneSpecificCalendar: (division: string) => boolean;
getMemberZoneCalendar: (division: string, zone: string) => Promise<...>;
validateMemberZone: (memberId: string, zoneId: number) => Promise<boolean>;
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
}
\`\`\`

### Phase 5: Migration Strategy

#### Dependencies

- Requires all previous phases to be complete
- Must be executed during low-usage period

#### Required Files

- scripts/migrations/zone-calendar-setup.ts (new)
- scripts/migrations/zone-validation.ts (new)
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
\`\`\`

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
