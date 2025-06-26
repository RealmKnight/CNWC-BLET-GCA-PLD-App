# MemberTransfer Component Refactor Plan

## Overview

The company is cutting positions and junior members are being set back to Conductor (CO) status in certain terminals. We need to add functionality to "transfer" these members by:

- **NOT** changing their division/zone/home_zone designations
- Marking all current requests as "transferred"
- Setting member status to "INACTIVE"
- Preserving location data for potential future restoration when positions are restored

## Current System Analysis

### Current transfer_member Function Limitations

Based on investigation of the `transfer_member` function, current limitations include:

1. **Requires Field Changes**: Function validates that at least one location field (division_id, zone_id, calendar_id, home_zone_id) must be changed

   ```sql
   -- Current validation prevents our use case:
   IF (p_new_division_id IS NULL OR p_new_division_id = v_member_record.division_id) AND
      (p_new_zone_id IS NULL OR p_new_zone_id = v_member_record.current_zone_id) AND
      (p_new_calendar_id IS NULL OR p_new_calendar_id = v_member_record.calendar_id) AND
      (p_new_home_zone_id IS NULL OR p_new_home_zone_id = v_member_record.home_zone_id) THEN
       RETURN json_build_object('success', false, 'error', 'No changes specified for transfer');
   ```

2. **No Status Update**: Function doesn't update member status
3. **Transfer Log Assumptions**: Assumes location changes are happening

### Member Status Values

Current status values in the database:

- "ACTIVE" (548 members)
- "IN-ACTIVE" (115 members)

### Request Status Handling

Current system handles these request statuses properly:

- `pending` and `waitlisted` → cancelled
- `approved` → transferred
- `cancellation_pending` → unchanged

## Refactor Requirements

### 1. Database Function Changes

**Decision: Create New Functions**

- Create new `furlough_member` function specifically for furlough use case
- Create new `restore_member` function for restoration
- Keep existing `transfer_member` function unchanged
- Clean separation of concerns between location transfers and furloughs

### 2. Component Changes

#### UI/UX Changes Needed

1. **New Transfer Type Selection**

   - Radio buttons or toggle for "Location Transfer" vs "Furlough/Layoff"
   - Different form layouts based on selection

2. **Furlough Mode UI**

   - Hide division/zone/calendar selectors
   - Show current assignments as read-only
   - Add furlough reason field
   - Clear messaging about what will happen

3. **Enhanced Confirmation Screen**
   - Different messaging for furlough vs transfer
   - Show that location data will be preserved
   - Emphasize reversibility

#### State Management Changes

1. Add transfer type state (`'transfer' | 'furlough'`)
2. Conditional validation based on transfer type
3. Different API calls based on transfer type

### 3. Member Transfer Log Changes

**Decision: Extend Current Log Table**

- Add new fields to `member_transfer_log`:
  - `transfer_type` text ('location_transfer', 'furlough', 'restore')
  - `old_status` text
  - `new_status` text
  - `furlough_reason` text ('voluntary', 'forced')
  - `original_calendar_id` uuid (for restoration purposes)
- Maintains single audit trail for all member changes

## Implementation Plan

### Phase 1: Database Changes ✅ **COMPLETED**

1. **Extend member_transfer_log table** ✅ **COMPLETED**

   ```sql
   ALTER TABLE public.member_transfer_log
   ADD COLUMN transfer_type text DEFAULT 'location_transfer',
   ADD COLUMN old_status text,
   ADD COLUMN new_status text,
   ADD COLUMN furlough_reason text, -- e.g., 'voluntary', 'forced', future reasons
   ADD COLUMN furlough_notes text, -- Admin notes/details
   ADD COLUMN original_calendar_id uuid; -- Store for restoration
   ```

2. **Create furlough_member function** ✅ **COMPLETED**

   ```sql
   CREATE OR REPLACE FUNCTION public.furlough_member(
       p_member_pin bigint,
       p_furloughed_by uuid,
       p_furlough_reason text, -- e.g., 'voluntary', 'forced'
       p_furlough_notes text DEFAULT NULL
   ) RETURNS json
   ```

   - Set member status to 'IN-ACTIVE'
   - Store original calendar_id in transfer log for restoration
   - Set member calendar_id to NULL (prevents new requests)
   - Mark all pending/waitlisted requests as cancelled
   - Mark all approved requests as transferred
   - Log the furlough action with transfer_type = 'furlough'

3. **Create restore_member function** ✅ **COMPLETED**

   ```sql
   CREATE OR REPLACE FUNCTION public.restore_member(
       p_member_pin bigint,
       p_restored_by uuid,
       p_new_division_id integer DEFAULT NULL,
       p_new_zone_id integer DEFAULT NULL,
       p_new_calendar_id uuid DEFAULT NULL,
       p_restore_notes text DEFAULT NULL
   ) RETURNS json
   ```

   - Set member status back to 'ACTIVE'
   - Restore to original location OR use provided new location if original no longer exists
   - Retrieve original location from most recent furlough log entry
   - Allow admin override of location during restoration
   - Log the restoration action with transfer_type = 'restore'

### Phase 2: Component Refactor ✅ **COMPLETED**

1. **Add transfer type selection UI** ✅ **COMPLETED**

   - Radio buttons for "Location Transfer" → "Furlough Member" → "Restore Member"
   - Conditional form rendering based on selection

2. **Update MemberTransfer component for furlough mode** ✅ **COMPLETED**

   - Added furlough reason text field (flexible for future reasons)
   - Added separate furlough notes field for admin details
   - Hide location selectors in furlough mode
   - Show read-only current assignments
   - Different validation logic per transfer type
   - Updated confirmation messaging

3. **Add restoration capability to MemberTransfer** ✅ **COMPLETED**

   - Third option in same component
   - Search for inactive members only
   - Show original assignments from member data
   - Allow admin to choose new location if original doesn't exist
   - Confirm restoration details

4. **Update calendar route protection** ✅ **COMPLETED**

   **Current Implementation (lines 2089-2098 in calendar.tsx):**

   ```typescript
   if (!member?.calendar_id) {
     return (
       <ThemedView style={styles.centeredContainer}>
         <Ionicons name="alert-circle-outline" size={48} color={Colors[theme].warning} />
         <ThemedText style={styles.errorText}>Calendar not assigned.</ThemedText>
         <ThemedText style={{ textAlign: "center" }}>Please contact support or your division admin.</ThemedText>
       </ThemedView>
     );
   }
   ```

   **Required Changes:**

   - Check if member status is "IN-ACTIVE" AND they have division/zone assignments (indicating furlough)
   - Query member_transfer_log to check if they were furloughed vs never assigned
   - Show different messages:
     - **Furloughed members**: "Member furloughed - Calendar access temporarily unavailable"
     - **Never assigned**: Keep current "Calendar not assigned" message
   - Add optional "Contact admin for restoration" message for furloughed members

5. **API integration** ✅ **COMPLETED**
   - Added furlough_member API call
   - Added restore_member API call with location override capability
   - Updated existing transfer flow
   - Integrated all three modes in single component interface

### Phase 3: Testing & Validation ⏳ **PENDING**

1. **Test furlough scenarios** ⏳ **PENDING**
2. **Test restoration scenarios**
3. **Validate request handling**
4. **Test edge cases**

## Requirements Clarification ✅

1. **Furlough Reasons**: Two types - "voluntary" and "forced"

2. **Restoration Process**: Manual process similar to transfer flow - select member and confirm they return to same division/zone/calendar as when they left

3. **Member Notification**: No app notification needed (company handles this)

4. **App Access**: Members retain app access for urgent notifications, but:

   - Remove calendar assignment (set to null)
   - Cannot make new requests (no calendar = no request capability)
   - Should get error when visiting (tabs)/calendar route

5. **Request Prevention**: Handled automatically by removing calendar assignment

6. **Approval Workflow**: Current admin levels (union_admin/application_admin) are sufficient

7. **Bulk Operations**: One-by-one only to ensure correct changes

8. **Status Value**: Use "IN-ACTIVE" for consistency with existing system

## Final Decisions ✅

1. **Furlough Reason Storage**: Use text field for flexibility, plus separate notes field for admin details

2. **Calendar Route Error**: Show specific "member furloughed" message to furloughed members

3. **Restoration Component**: Integrate into MemberTransfer as third option (Transfer → Furlough → Restore)

4. **Restoration Validation**: Allow admin to choose new location during restore if original no longer exists

## Technical Considerations

### Data Integrity

- Ensure furlough operations are atomic
- Maintain referential integrity
- Proper error handling and rollback

### Performance

- Efficient queries for member lookup
- Batch operations for request updates
- Proper indexing on status fields

### Security

- Role-based access control
- Audit logging
- Secure parameter handling

### User Experience

- Clear visual distinction between transfer types
- Intuitive workflow
- Proper error messaging
- Confirmation safeguards

### Calendar Route Protection Implementation

**Detection Strategy for Furloughed vs Never Assigned:**

```typescript
// In calendar.tsx, replace the simple !member?.calendar_id check with:
const [memberAccessStatus, setMemberAccessStatus] = useState<"loading" | "active" | "furloughed" | "unassigned">(
  "loading"
);

useEffect(() => {
  const checkMemberAccess = async () => {
    if (!member?.pin_number) {
      setMemberAccessStatus("unassigned");
      return;
    }

    // Case 1: Has calendar_id - member is active
    if (member.calendar_id) {
      setMemberAccessStatus("active");
      return;
    }

    // Case 2: No calendar_id - check if furloughed or never assigned
    if (member.status === "IN-ACTIVE" && member.division_id) {
      // Check if they have a furlough transfer log entry
      const { data } = await supabase
        .from("member_transfer_log")
        .select("id, transfer_type, original_calendar_id")
        .eq("member_pin", member.pin_number)
        .eq("transfer_type", "furlough")
        .order("transfer_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.original_calendar_id) {
        setMemberAccessStatus("furloughed");
        return;
      }
    }

    // Case 3: Default - never assigned
    setMemberAccessStatus("unassigned");
  };

  checkMemberAccess();
}, [member?.pin_number, member?.calendar_id, member?.status, member?.division_id]);

// Then replace the existing conditional render with:
if (memberAccessStatus === "loading") {
  return <LoadingSpinner />;
}

if (memberAccessStatus === "furloughed") {
  return (
    <ThemedView style={styles.centeredContainer}>
      <Ionicons name="pause-circle-outline" size={48} color={Colors[theme].warning} />
      <ThemedText style={styles.errorText}>Member Furloughed</ThemedText>
      <ThemedText style={{ textAlign: "center" }}>
        Calendar access temporarily unavailable. Contact your admin for restoration.
      </ThemedText>
    </ThemedView>
  );
}

if (memberAccessStatus === "unassigned") {
  return (
    <ThemedView style={styles.centeredContainer}>
      <Ionicons name="alert-circle-outline" size={48} color={Colors[theme].warning} />
      <ThemedText style={styles.errorText}>Calendar not assigned.</ThemedText>
      <ThemedText style={{ textAlign: "center" }}>Please contact support or your division admin.</ThemedText>
    </ThemedView>
  );
}
```

## Next Steps

1. ✅ **Finalized all requirements and design decisions**
2. ✅ **Create database schema changes and functions**
3. ✅ **Refactor MemberTransfer component with three modes**
4. ✅ **Update calendar route protection**
5. ✅ **Implement API integration**
6. ⏳ **Add comprehensive testing** - _Phase 3_
7. ⏳ **Update documentation** - _Phase 3_

---

**Status**: Phase 2 Complete - Component refactor implemented successfully with three transfer modes (Location Transfer, Furlough, Restore). Calendar route protection updated. Ready for Phase 3 testing.
