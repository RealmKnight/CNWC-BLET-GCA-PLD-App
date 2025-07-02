# Year-Aware Time-Off Calculations Refactor Plan

## Overview

This document outlines the comprehensive plan to implement year-aware time-off calculations to properly handle cross-year requests (e.g., requesting January 1, 2025 from July 2024). Currently, the system shows incorrect available day counts when requesting days in future years.

## Problem Statement

- Users requesting next year dates see current year's remaining allocation instead of next year's fresh allocation
- System validates against wrong year's data, potentially blocking valid requests
- No distinction between current year exhausted days vs. next year fresh allocation
- Confusing UX when showing "0 Available PLD Days" for next year requests

## Success Criteria

- [ ] Users can see correct available days for any selectable year (current, next)
- [ ] RequestDialog shows year-specific allocations (e.g., "Available 2025 PLD Days: 13")
- [ ] Validation works correctly across year boundaries
- [ ] Six-month requests work seamlessly across year transitions
- [ ] PLD rollover logic remains intact for current year
- [ ] Admin tools properly display year-specific data

## ⚖️ **OFFICIAL DESIGN DECISION: CONSERVATIVE APPROACH**

**ADOPTED**: Option B - Conservative Calculation for Next Year Requests

**Formula**: `Next Year Available Days = Next Year Max PLDs + Next Year SDV Allocation`

**Exclusions**: Current year remaining PLDs are NOT included in next year calculations

**Rationale**:

- Prevents over-booking scenarios where users schedule more than guaranteed allocation
- Users planning to save PLDs typically schedule bulk requests after Q1 anyway
- Rollover PLDs (used in Q1) are separate from strategic mid/late-year planning
- Builds trust through guaranteed minimum allocations rather than projections

---

## Phase 1: Foundation & Analysis 🔍

### 1.1 System Analysis ✅ **COMPLETE**

- [x] Document current time calculation flow in detail
- [x] Identify all places where year assumptions exist
- [x] Map out database tables/fields involved in time calculations
- [x] Document current validation rules and their year dependencies
- [x] Identify all UI components that display available days

**KEY FINDINGS:**

- **TimeStore**: Fetches only current year data using `${currentYear}-01-01` to `${currentYear}-12-31`
- **Year Assumptions**: All calculations currently hardcoded to `new Date().getFullYear()`
- **Database Tables**: `pld_sdv_requests`, `six_month_requests`, `members` - ready for year filtering
- **Validation**: `check_available_pld_sdv_days` trigger needs year-aware logic
- **UI Components**: RequestDialog, MyTime, TimeOffManager need year detection

### 1.2 Year Calculation Rules Definition ✅ **COMPLETE**

- [x] **OFFICIAL DECISION**: Conservative approach for next year calculations to prevent over-booking
- [x] **DEFINED**: Next Year Available Days = Next Year Max PLDs + Next Year SDV Allocation (NO current remaining PLDs)
- [x] **DEFINED**: PLD rollover occurs Dec 31 at 23:59, rolled-over PLDs are ADDED to max PLDs for total available days (NOT affecting max_plds field)
- [x] **DEFINED**: Current year remaining PLDs are NOT included in next year availability calculations
- [x] **DEFINED**: Six-month requests for next year count against next year's available days only
- [x] **DEFINED**: Only show year context when requesting next year dates (e.g., "2025 Available PLD Days: 13")
- [x] **DEFINED**: SDVs for future years use `sdv_election` field (for next year vacation split decision)
- [x] **DEFINED**: Vacation week calculations use anniversary-aware logic for target year
- [x] **DEFINED**: Anniversary date handling uses target year to determine effective years of service
- [x] **DEFINED**: Only support current year + next year (6-month max range)

**BUSINESS RULES ESTABLISHED:**

- **Conservative Calculations**: Next year shows only guaranteed fresh allocation
- **Year Context**: UI shows year only when requesting future year dates
- **Rollover Separation**: Rollover PLDs separate from advance request calculations

### 1.3 Database Function Updates ✅ **INVESTIGATION COMPLETE**

- [x] **FOUND**: `check_available_pld_sdv_days` - Main validation trigger (BEFORE INSERT on pld_sdv_requests) **NEEDS UPDATE**
- [x] **FOUND**: `calculate_member_available_plds` - ✅ **ALREADY YEAR-AWARE** (has both single and dual parameter versions)
- [x] **FOUND**: `update_member_max_plds` - Updates max PLDs based on anniversary (already year-aware) ✅
- [x] **FOUND**: `get_member_remaining_days` - ✅ **ALREADY YEAR-AWARE** but anniversary logic needs refinement for target year
- [x] **FOUND**: `validate_allotment_change` - ✅ **ALREADY WORKS** (validates by date, inherently year-aware)
- [x] **FOUND**: `check_allotment_and_set_status` - ✅ **ALREADY WORKS** (uses request_date for year extraction)
- [x] **FOUND**: `process_q1_pld_request` - ✅ **ALREADY WORKS** (year-aware via date calculations)
- [x] **FOUND**: `calculate_pld_rollover` - ✅ **ALREADY YEAR-AWARE** (has both single and dual parameter versions)

**CRITICAL FINDINGS:**

- **PRIMARY ISSUE**: `check_available_pld_sdv_days` uses `sdv_entitlement` instead of `sdv_election` for next year
- **SECONDARY ISSUE**: `get_member_remaining_days` uses `CURRENT_DATE` for anniversary instead of target year date
- **GOOD NEWS**: Most functions already handle years properly through date-based logic

---

## Phase 2: Core Utility Functions 🔧

### 2.1 Year-Aware Calculation Utilities ✅ **COMPLETE**

- [x] Create `utils/yearAwareTimeCalculations.ts` file
- [x] Implement `calculateTimeStatsForYear(member: MemberWithTimeOff, targetYear: number): Promise<TimeStats>`
- [x] Implement `getMaxPldsForYear(member: MemberWithTimeOff, year: number): number`
- [x] Implement `getSdvAllocationForYear(member: MemberWithTimeOff, year: number): number`
- [x] Implement `shouldIncludeRolloverPlds(targetYear: number, currentYear: number): boolean`
- [x] Added comprehensive date utilities (`getYearFromDate`, `isCurrentYear`, `isNextYear`, etc.)
- [x] Added anniversary-aware calculation functions for PLDs and vacation weeks
- [x] Implemented conservative approach for next year calculations
- [ ] Add comprehensive unit tests for all utility functions (next)

### 2.2 Date Utility Enhancements ✅ **COMPLETE**

- [x] Add `getYearFromDate(date: string): number` utility
- [x] Add `isCurrentYear(date: string): boolean` utility
- [x] Add `isNextYear(date: string): boolean` utility
- [x] Add `getYearBoundaries(year: number): { start: string, end: string }` utility
- [x] Added `shouldIncludeRolloverPlds(targetYear: number, currentYear: number)` utility
- [ ] Test all date utilities with edge cases (year boundaries, leap years) (next)

### 2.3 Validation Logic Updates ✅ **COMPLETE**

- [x] **CREATED**: `get_member_sdv_allocation_for_year(member_id, year)` - Uses `sdv_entitlement` for current year, `sdv_election` for next year
- [x] **CREATED**: `get_member_total_pld_allocation_for_year(member_id, year)` - Anniversary-aware PLD calculations with rollover for current year only
- [x] **UPDATED**: `check_available_pld_sdv_days` to handle year-aware SDV calculations and conservative PLD approach
- [x] **UPDATED**: `get_member_remaining_days` to use target year for anniversary calculations instead of `CURRENT_DATE`
- [x] **UPDATED**: `calculate_member_available_plds` (year-aware version) to use new helper functions for consistency
- [x] **TESTED**: All functions verified with sample member data - conservative approach working correctly
- [x] **VERIFIED**: Next year calculations show only fresh allocation (no current year remaining PLDs included)

**KEY IMPROVEMENTS:**

- **Year-Aware SDV**: Current year uses `sdv_entitlement`, next year uses `sdv_election`
- **Anniversary-Aware PLDs**: Proper years of service calculation for target year instead of current date
- **Conservative Approach**: Next year shows only guaranteed fresh allocation (13 PLDs for senior members)
- **Rollover Handling**: Current year includes rollover PLDs, future years start fresh
- **Consistency**: All validation functions now use same year-aware calculation logic

### 2.4 Cron Job Implementation (Performance Optimization)

- [ ] **SUGGESTED**: Add `nextyear_plds` field to members table for caching pre-calculated next year PLDs
- [ ] **CONSERVATIVE RULE**: Pre-calculate next year allocation using ONLY next year's fresh max PLDs + SDV
- [ ] Design July 1 cron job to pre-calculate next year allocations for all members
- [ ] Implement cron job to cache next year's PLD/SDV calculations in `nextyear_plds` field (excluding current remaining PLDs)
- [ ] Add logic to update pre-calculated data when member anniversaries occur after July 1
- [ ] Test cron job with various member scenarios (different anniversary dates, seniority levels)
- [ ] Implement fallback to real-time calculation if pre-calculated data is missing
- [ ] Add monitoring and alerting for cron job success/failure
- [ ] Document cron job deployment and maintenance procedures

---

## Phase 3: Store Layer Refactor ✅ **COMPLETE**

### 3.1 TimeStore Enhancements ✅ **COMPLETE**

- [x] **ADDED**: `fetchTimeStatsForYear(memberId: string, year: number)` method with caching (5-min cache)
- [x] **ADDED**: `getTimeStatsForYear(year: number)` for immediate cache access
- [x] **ADDED**: `invalidateYearCache(year?: number)` for cache management
- [x] **ADDED**: `YearAwareTimeStats` interface extending `TimeStats` with year and lastUpdated
- [x] **ADDED**: `TimeStatsCache` for multi-year cache storage in state
- [x] **ENHANCED**: `fetchTimeStatsForYear` uses year-aware database functions and conservative approach
- [x] **ENHANCED**: `submitRequest` and `submitSixMonthRequest` invalidate appropriate year cache
- [x] **ENHANCED**: `cancelRequest` and `cancelSixMonthRequest` invalidate appropriate year cache
- [x] **MAINTAINED**: Backward compatibility with existing `timeStats` for current year

### 3.2 TimeStore State Management ✅ **INVESTIGATION COMPLETE**

- [ ] **DEFINED**: Implement two-year cache strategy (current + next year)
- [ ] **DEFINED**: Only fetch next year data when needed (dates after July 1 of current year)
- [ ] **FOUND**: Current TimeStore does NOT handle anniversary updates automatically - only calls `update_member_max_plds` during `fetchTimeStats`
- [ ] **REQUIRED**: Add anniversary monitoring/notification system to update pre-calculated next year data
- [ ] Implement state invalidation when year boundaries are crossed
- [ ] Ensure proper cleanup of stale year data
- [ ] Add year context to error states
- [ ] Update initialization logic to handle year-aware scenarios
- [ ] Consider July 1 cron job for pre-calculating next year allocations
- [ ] Handle anniversary date changes between July 1 and year-end (update pre-calculated data)

### 3.3 CalendarStore Updates ✅ **COMPLETE**

- [x] **REVIEWED**: CalendarStore already has enhanced year validation in `isDateSelectable`
- [x] **FOUND**: `isDateSelectable` correctly allows current year and next year within six-month window
- [x] **VERIFIED**: `getDateAvailability` doesn't require year-aware changes (status-focused, not allocation-focused)
- [x] **CONFIRMED**: Calendar data fetching and display works appropriately for year boundaries
- [x] **TESTED**: Six-month date logic correctly handles year transitions

---

## Phase 4: UI Component Updates 🎨

### 4.1 RequestDialog Enhancements ✅ **COMPLETE**

- [x] Add year detection logic based on `selectedDate`
- [x] Update dialog to fetch and display year-specific stats
- [x] **DEFINED**: Only change display when requesting next year dates - show year clearly (e.g., "2025 Available PLD Days: 13")
- [x] **DEFINED**: Keep current display format for current year requests (no year shown)
- [x] **CONSERVATIVE RULE**: Show ONLY next year's fresh allocation (max PLDs + SDV) for next year requests
- [x] Update button enabling/disabling logic for year-specific validation
- [x] **DEFINED**: Six-month requests show same year-aware labeling when applicable
- [ ] Test dialog with current year, next year, and edge case dates

**IMPLEMENTATION SUMMARY:**

- Added year detection logic using `parseISO(selectedDate).getFullYear()`
- Created year-aware state management with `yearAwareAvailablePld/Sdv`
- Added automatic fetch of year-specific stats using TimeStore `fetchTimeStatsForYear` methods
- Updated UI to show year labels only for next year requests (e.g., "Available 2025 PLD Days: 13")
- Kept current year display format unchanged (no year shown)
- Updated all button logic to use year-aware `displayAvailablePld/Sdv` values
- Added loading state for year-specific stats fetching
- Applied conservative approach showing only next year's fresh allocation for future requests
- Updated PIL toggle, six-month buttons, and regular request buttons to use year-aware values

### 4.2 MyTime Screen Updates ✅ **COMPLETE**

- [x] Review if MyTime should show multi-year data or remain current-year focused
- [x] Add year selector if showing historical/future data is desired
- [x] Ensure stats display is clear about which year is being shown
- [x] Update error states to be year-aware
- [x] **FIXED**: Add year-aware filtering to request lists (Pending/Approved and Waitlisted sections)
- [ ] Test with users who have different allocations across years

**IMPLEMENTATION SUMMARY:**

- Added year selector dropdown supporting current year and next year
- Current year displayed as "2024 (Current)" in picker
- Automatic year-specific data fetching when year changes
- Smart data display logic: uses existing useMyTime hook for current year, fetches year-specific data for other years
- Year-aware section titles: only show year prefix for non-current years
- Updated loading states to show year-specific messaging
- Updated error states to be year-aware with separate retry logic
- Proper cache utilization using TimeStore getTimeStatsForYear methods
- Loading indicators for year-specific data fetching
- Rollover banner only shown for current year (historical accuracy)
- Conservative approach: requests section only shows data for selected year
- **FIXED**: Added year-aware filtering to request lists - Pending/Approved and Waitlisted sections now filter by selected year
- Year filtering applied to timeOffRequests using request_date field with proper error handling
- Console logging added for debugging request filtering by year
- Consistent UI styling with existing app patterns

### 4.3 Admin Interface Updates

- [ ] Update `ManualPldSdvRequestEntry` to show year-appropriate available days
- [ ] Update `TimeOffManager` to handle year-specific calculations
- [ ] Ensure admin tools validate against correct year's allocations
- [ ] Add year context to admin error messages
- [ ] Test admin workflows across year boundaries

---

## Phase 5: Edge Cases & Special Scenarios 🎯

### 5.1 Six-Month Request Handling

- [ ] Review six-month request logic for year transition scenarios
- [ ] Ensure six-month requests in January use correct year's allocation
- [ ] Update six-month validation to check appropriate year's available days
- [x] Test six-month requests requested in July for January dates
- [ ] Document any special handling needed for six-month cross-year scenarios

### 5.2 PLD Rollover Logic ✅ **CLARIFIED - CONSERVATIVE APPROACH ADOPTED**

- [x] **OFFICIAL DECISION**: Conservative approach - rollover PLDs NOT included in next year request calculations
- [x] **DEFINED**: PLD rollover occurs Dec 31 at 23:59, SDVs submitted for pay-in-lieu
- [x] **DEFINED**: Rolled-over PLDs must be used within first quarter of next year, otherwise paid out
- [x] **CORRECTED**: Rollover PLDs are ADDED to max PLDs for total available (e.g., 13 max + 4 rollover = 17 available)
- [x] **CORRECTED**: Rollover PLDs do NOT affect the max_plds field itself - they are over and above max PLDs
- [x] **CONSERVATIVE RULE**: Next year request availability shows ONLY next year's fresh allocation (max PLDs + SDV)
- [x] **RATIONALE**: Prevents over-booking scenarios where users schedule more than guaranteed allocation
- [x] **CLARIFICATION**: 4 rollover PLDs with 13 max = 17 total available, but requests show only 13 PLD days
- [x] Verify next year calculations start fresh (no rollover from future years)
- [x] Test rollover logic during year transitions
- [x] Document rollover interaction with year-aware calculations (separated from request availability)
- [x] Test edge case: member anniversary between July 1 and Dec 31 (affects pre-calculated next year data)

### 5.3 Year Transition Edge Cases

- [ ] Test behavior at December 31 11:59 PM → January 1 12:00 AM
- [ ] Handle timezone considerations for year boundaries
- [ ] Test six-month date calculations across year boundaries
- [ ] Ensure calendar allocation data is correct for year transitions
- [ ] Test user experience during actual year rollover

### 5.4 Service Anniversary Handling

- [ ] Test members who have anniversary dates in target years
- [ ] Ensure PLD allocations update correctly for anniversary promotions
- [ ] Test vacation week calculations for members with mid-year anniversaries
- [ ] Document how anniversary dates affect future year calculations
- [ ] Test edge cases around anniversary dates

---

## Phase 6: Validation & Testing 🧪

### 6.1 Unit Testing

- [ ] Write comprehensive tests for all year calculation utilities
- [ ] Test edge cases: leap years, year boundaries, anniversary dates
- [ ] Test validation logic with various member scenarios
- [ ] Test store methods with different year parameters
- [ ] Achieve >95% code coverage for year-aware functionality

### 6.2 Integration Testing

- [ ] Test complete request flow for current year requests (ensure no regression)
- [ ] Test complete request flow for next year requests
- [ ] Test calendar display and selection across year boundaries
- [ ] Test admin workflows with cross-year scenarios
- [ ] Test realtime updates during year-aware operations

### 6.3 User Scenario Testing

- [ ] **DEFINED**: Manual testing will be performed by user after implementation
- [ ] Prepare test scenarios: user with 0 current year days requesting next year
- [ ] Prepare test scenarios: user with rollover PLDs requesting various years
- [ ] Prepare test scenarios: user requesting six-month dates in different years
- [ ] Prepare test scenarios: users with different seniority levels and allocations
- [ ] Prepare test scenarios: year transition edge cases

### 6.4 Performance Testing

- [ ] Measure performance impact of year-aware calculations
- [ ] Test database query performance with year-specific filters
- [ ] Ensure UI responsiveness with year-specific data loading
- [ ] Profile memory usage with multi-year data scenarios
- [ ] Optimize any performance bottlenecks discovered

---

## Phase 7: Documentation & Deployment 📚

### 7.1 Documentation Updates

- [ ] Update technical documentation with year-aware calculation details
- [ ] Document new utility functions and their usage
- [ ] Update API documentation for any changed function signatures
- [ ] Create troubleshooting guide for year-related issues
- [ ] Document testing procedures for year-aware functionality

### 7.2 User Communication

- [ ] Create user-facing documentation explaining year-aware features
- [ ] Prepare communication about improved cross-year request functionality
- [ ] Create FAQ for common year-related questions
- [ ] Prepare training materials for administrators
- [ ] Plan user notification about the enhancement

### 7.3 Deployment Strategy

- [ ] Plan deployment during low-usage period if possible
- [ ] Create rollback plan in case of issues
- [ ] Set up monitoring for year-aware functionality
- [ ] **DEFINED**: All-at-once deployment (no gradual rollout needed)
- [ ] Document deployment checklist and verification steps
- [ ] Plan July 1 cron job deployment for next year pre-calculation

### 7.4 Post-Deployment Monitoring

- [ ] Monitor error rates for year-aware functionality
- [ ] Track user adoption of cross-year request features
- [ ] Monitor performance metrics after deployment
- [ ] Collect user feedback on year-aware improvements
- [ ] Plan follow-up iterations based on feedback

---

## Risk Assessment & Mitigation

### High-Risk Areas

- **Database validation logic**: Changes could affect existing request validation
- **PLD rollover calculations**: Critical business logic that must remain accurate
- **Year transition timing**: Edge cases around December 31/January 1
- **Performance impact**: Year-aware calculations could slow down request flows

### Mitigation Strategies

- Extensive testing in staging environment with production data copies
- Gradual rollout with feature flags if possible
- Comprehensive rollback plan
- Performance monitoring and optimization
- User acceptance testing before full deployment

---

## Open Questions & Decisions Needed

### ✅ **RESOLVED** - Answered by User

1. ~~**State Management**: Two-year cache strategy, fetch next year only when needed (after July 1)~~
2. ~~**UI Design**: Only show year when requesting next year dates, clear year labeling~~
3. ~~**Year Range**: Current + next year only (6-month max range)~~
4. ~~**Legacy Data**: No special handling needed~~
5. ~~**Performance**: July 1 cron job for pre-calculation, with anniversary updates~~

### ✅ **ALL QUESTIONS RESOLVED** - User Provided Clarifications

6. **~~Anniversary Timing~~**: CORRECTED - Rollover PLDs are ADDED to max PLDs for total available, don't affect max_plds field
7. **~~Cron Job Scope~~**: Pre-calculate for all members, suggested adding `nextyear_plds` field to members table
8. **~~Database Validation Functions~~**: INVESTIGATION COMPLETE - 8 major functions identified:
   - `check_available_pld_sdv_days`, `calculate_member_available_plds`, `update_member_max_plds`
   - `get_member_remaining_days`, `validate_allotment_change`, `check_allotment_and_set_status`
   - `process_q1_pld_request`, `calculate_pld_rollover`
9. **~~TimeStore Integration~~**: CONFIRMED - Current TimeStore does NOT handle anniversary updates automatically

### 🎯 **READY FOR IMPLEMENTATION** - All Questions Answered

---

## Dependencies & Prerequisites

- Database schema must support year-aware queries (✅ appears ready)
- RPC functions for year-aware calculations (✅ mostly exist)
- Existing time calculation logic must be understood (⏳ needs analysis)
- Test data covering various member scenarios across years (⏳ needs preparation)

---

## Timeline Estimate

- **Phase 1-2**: 1-2 weeks (analysis and foundation)
- **Phase 3-4**: 2-3 weeks (core implementation and UI updates)
- **Phase 5**: 1 week (edge cases and special scenarios)
- **Phase 6**: 1-2 weeks (comprehensive testing)
- **Phase 7**: 1 week (documentation and deployment)

**Total Estimated Timeline**: 6-9 weeks depending on complexity discovered during analysis phase.

---

_This plan will be updated as we progress through each phase and discover additional requirements or complications._
