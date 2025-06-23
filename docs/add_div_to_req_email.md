# Add Division Location to Request Email Subject Lines

## 🎯 IMPLEMENTATION COMPLETE ✅

### Changes Made

#### ✅ send-request-email function updated

- Added division data query after member data fetch
- Added division location extraction logic for sender name
- Updated sender field to include division location (format: "Neenah WC GCA BLET PLD App")
- Added proper error handling and logging

#### ✅ send-cancellation-email function updated

- Applied same division data query pattern
- Added division location extraction with enhanced logging
- Updated sender field to include division location
- Maintained clean subject lines without division clutter

### Email Examples

**From Field:**

- **With Division:** `"Neenah WC GCA BLET PLD App <requests@pldapp.bletcnwcgca.org>"`
- **Without Division:** `"WC GCA BLET PLD App <requests@pldapp.bletcnwcgca.org>"`

**Subject Lines (Clean):**

- **Regular Request:** `"PLD Request - John Doe [Request ID: 123]"`
- **PIL Request:** `"PLD Payment Request - John Doe [Payment Request ID: 123]"`
- **Cancellation:** `"CANCELLATION - PLD Request - John Doe [Request ID: 123]"`

**Ready for deployment via Supabase CLI.**

---

## Overview

This plan outlines the changes needed to include division information (division code + location city) in the subject lines of request-related emails. The goal is to help CN staff sort emails by subject line in their shared inbox by showing which division the request is coming from.

## Requirements Summary (Based on Clarification Answers)

- **Format:** Division code + city (e.g., "175-Neenah")
- **Recipients:** Internal CN staff via shared email accounts
- **Scope:** Only request and cancellation emails (PIL fully handled in send-request-email)
- **Rollout:** Direct implementation (no backward compatibility needed)
- **Edge Cases:** Unassigned members can't submit requests, so no special handling needed
- **Performance:** Additional database query fully acceptable

## Current State Analysis

### Database Structure

- **members** table has `division_id` (integer) linking to divisions
- **divisions** table has:
  - `id` (primary key)
  - `name` (e.g., "175", "184", "185")
  - `location` (e.g., "Neenah, WI", "Schiller Park, IL", "Gladstone, MI")

### Current Email Functions

1. **send-request-email** - Sends emails for new PLD/SDV requests (including PIL) ✅
2. **send-cancellation-email** - Sends emails for request cancellations (including PIL) ✅
3. **send-payment-request** - Empty file (PIL handled in send-request-email) ❌ No changes needed
4. **send-division-welcome-email** - Already includes division name in subject ❌ No changes needed
5. **send-email** - Generic backup email function ❌ No changes needed

### Email Recipients

- **Target:** Internal CN staff via shared email accounts
- **Purpose:** Subject line sorting for inbox management
- **Format preference:** Division code + city for quick identification

### Current Subject Line Format

**send-request-email:**

- Regular: `"PLD Request - John Doe [Request ID: 123]"`
- PIL: `"PLD Payment Request - John Doe [Payment Request ID: 123]"`

**send-cancellation-email:**

- Regular: `"CANCELLATION - PLD Request - John Doe [Request ID: 123]"`
- PIL: `"CANCELLATION - PLD Payment Request - John Doe [Payment Request ID: 123]"`

### Target New Format (175-Neenah style)

**send-request-email:**

- Regular: `"PLD Request - John Doe - 175-Neenah [Request ID: 123]"`
- PIL: `"PLD Payment Request - John Doe - 175-Neenah [Payment Request ID: 123]"`

**send-cancellation-email:**

- Regular: `"CANCELLATION - PLD Request - John Doe - 175-Neenah [Request ID: 123]"`
- PIL: `"CANCELLATION - PLD Payment Request - John Doe - 175-Neenah [Payment Request ID: 123]"`

## Simplified Implementation Plan

### Phase 1: Update send-request-email Function

**File:** `supabase/functions/send-request-email/index.ts`

#### 1.1 Modify Member Data Query

**Current query (line ~56):**

```typescript
const { data: memberData, error: memberError } = await supabase
  .from("members")
  .select("first_name, last_name, pin_number, division_id")
  .eq("id", requestData.member_id)
  .single();
```

**New query approach (Two queries for reliability):**

```typescript
// Keep existing member query
const { data: memberData, error: memberError } = await supabase
  .from("members")
  .select("first_name, last_name, pin_number, division_id")
  .eq("id", requestData.member_id)
  .single();

if (memberError) {
  throw new Error(`Failed to get member details: ${memberError.message}`);
}

// Add new division query
let divisionData = null;
if (memberData?.division_id) {
  const { data: division, error: divisionError } = await supabase
    .from("divisions")
    .select("name, location")
    .eq("id", memberData.division_id)
    .single();

  if (divisionError) {
    console.warn(
      `[send-request-email] Failed to get division details for division_id ${memberData.division_id}: ${divisionError.message}`
    );
  } else {
    divisionData = division;
  }
}
```

#### 1.2 Extract Division Information

**Add after division data fetch:**

```typescript
// Extract division info for subject line
let divisionCode = "";
if (divisionData?.name && divisionData?.location) {
  // Extract city from "City, ST" format
  const city = divisionData.location.split(",")[0].trim();
  divisionCode = ` - ${divisionData.name}-${city}`;
} else if (memberData?.division_id) {
  console.warn(`[send-request-email] Division data incomplete for division_id: ${memberData.division_id}`);
}
```

#### 1.3 Update Subject Line Construction (line ~122)

**Current:**

```typescript
const subject = isPaidInLieu
  ? safeLeaveType + " Payment Request - " + safeMemberName + " [Payment Request ID: " + safeRequestId + "]"
  : safeLeaveType + " Request - " + safeMemberName + " [Request ID: " + safeRequestId + "]";
```

**New:**

```typescript
const subject = isPaidInLieu
  ? safeLeaveType +
    " Payment Request - " +
    safeMemberName +
    divisionCode +
    " [Payment Request ID: " +
    safeRequestId +
    "]"
  : safeLeaveType + " Request - " + safeMemberName + divisionCode + " [Request ID: " + safeRequestId + "]";
```

### Phase 2: Update send-cancellation-email Function

**File:** `supabase/functions/send-cancellation-email/index.ts`

#### 2.1 Apply Same Changes as Phase 1

- Modify member data query to include division JOIN
- Extract division information with same logic
- Update subject line construction (line ~153) with same pattern

### Phase 3: Testing Strategy

#### 3.1 Test Cases

1. **Happy Path:** Member with valid division_id and complete division data
   - Verify subject: `"PLD Request - John Doe - 175-Neenah [Request ID: 123]"`
2. **Missing Division:** Member with null division_id
   - Verify fallback: `"PLD Request - John Doe [Request ID: 123]"`
3. **Incomplete Division:** Division exists but missing location
   - Verify fallback: `"PLD Request - John Doe [Request ID: 123]"`
4. **PIL Requests:** Payment in lieu formatting
   - Verify subject: `"PLD Payment Request - John Doe - 175-Neenah [Payment Request ID: 123]"`
5. **Cancellations:** Both regular and PIL cancellations
   - Verify subject: `"CANCELLATION - PLD Request - John Doe - 175-Neenah [Request ID: 123]"`

#### 3.2 Edge Cases

- Database query failures (should fallback gracefully)
- Various location formats in database
- Long division codes or city names (subject line length)

### Phase 4: Implementation Steps

#### Step 1: Update send-request-email

1. Modify member query to include division data
2. Add division code extraction logic
3. Update subject line construction
4. Test locally with Supabase CLI

#### Step 2: Update send-cancellation-email

1. Apply same changes as send-request-email
2. Ensure cancellation prefix maintained
3. Test cancellation flow

#### Step 3: Deploy and Monitor

1. Deploy both functions
2. Monitor email delivery success rates
3. Verify subject line formatting in received emails
4. Check logs for any division lookup issues

## Database Query Details

### Recommended Approach: Two-Query Pattern (Most Reliable)

```typescript
// Query 1: Get member data (existing query)
const { data: memberData, error: memberError } = await supabase
  .from("members")
  .select("first_name, last_name, pin_number, division_id")
  .eq("id", requestData.member_id)
  .single();

// Query 2: Get division data if division_id exists
let divisionData = null;
if (memberData?.division_id) {
  const { data: division, error: divisionError } = await supabase
    .from("divisions")
    .select("name, location")
    .eq("id", memberData.division_id)
    .single();

  if (!divisionError) divisionData = division;
}
```

**Benefits:**

- Guaranteed to work regardless of foreign key constraints
- Clear error handling for each step
- Easy to debug if division lookup fails
- Follows existing patterns in Edge Functions

### Fallback Handling

```typescript
// Extract division info for subject line
let divisionCode = "";
if (divisionData?.name && divisionData?.location) {
  // Extract city from "City, ST" format (e.g., "Neenah, WI" -> "Neenah")
  const city = divisionData.location.split(",")[0].trim();
  divisionCode = ` - ${divisionData.name}-${city}`;
}
// If division data missing, divisionCode remains empty string
// Subject line automatically falls back to current format
```

## Risk Assessment

### Low Risk

- **Single query approach** - Leverages existing Supabase patterns
- **Graceful fallbacks** - Missing division data doesn't break emails
- **No new files needed** - Only modifying existing Edge Functions
- **Performance impact** - JOIN query vs separate query minimal difference

### Considerations

- **Subject line length** - "175-Neenah" format keeps subjects reasonable
- **Location format consistency** - Database has "City, ST" format
- **Monitoring** - Watch for any division lookup failures

## Success Criteria

### Functional Requirements

- [ ] Request emails include division code-city in subject (e.g., "175-Neenah")
- [ ] Cancellation emails include division code-city in subject
- [ ] PIL requests properly formatted with division info
- [ ] Graceful fallback when division data missing
- [ ] No breaking changes to email delivery

### Technical Requirements

- [ ] No new files created (Edge Functions self-contained)
- [ ] Minimal performance impact (single JOIN query)
- [ ] Proper error handling and logging
- [ ] Both HTML and text email content unchanged

## Deployment Plan

### Direct Deployment (No Backward Compatibility Needed)

1. **Test locally** with Supabase CLI and sample data
2. **Deploy both functions** simultaneously
3. **Monitor email delivery** for 24-48 hours
4. **Verify subject formatting** in CN staff inbox
5. **Check function logs** for any division lookup issues

### Rollback Plan

- Revert to previous function versions if issues arise
- No database changes needed (only subject line formatting affected)

## Final Notes

**This is a much simpler implementation than originally planned:**

- ✅ No new utility files needed
- ✅ No client-side changes required
- ✅ Only 2 Edge Functions to modify
- ✅ Built-in fallback handling
- ✅ Direct deployment strategy

**The key insight:** Edge Functions are self-contained and already have database access - just need to expand existing queries to include division data.
