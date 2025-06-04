# Import Update Waitlist - Over-Allotment Detection & Drag-and-Drop Management

## Overview

Enhance the iCal import system to detect over-allotment situations where imported requests exceed calendar allotments, and provide a drag-and-drop interface for admins to manage approval/waitlist priorities.

## Priority Order (Corrected)

1. **Unmatched Members** (highest priority - needs admin action to proceed)
2. **Over-Allotment Situations** (after unmatched are resolved, may create new over-allotments)
3. **Duplicate Requests** (lower priority - can be skipped/ignored)
4. **Regular Import Requests** (sorted by date)

## Staged Import Preview Workflow

### Overview

The staged import preview workflow provides a comprehensive, step-by-step approach to importing PLD/SDV requests from iCal files. This workflow ensures data integrity, prevents conflicts, and gives administrators full control over the import process.

### Workflow Stages

#### Stage 1: Unmatched Member Resolution

- **Purpose**: Resolve requests that couldn't be automatically matched to existing members
- **Actions**: Search for correct members, assign matches, or skip invalid requests
- **Validation**: All unmatched items must be resolved or skipped to proceed

#### Stage 2: Duplicate Detection ⭐ **CRITICAL FIRST**

- **Purpose**: Identify and resolve duplicate requests before allotment calculations
- **Why First**: Duplicates aren't separate requests - they're the same request already in the database
- **Actions**:
  - Compare import requests with existing database entries
  - Choose to skip duplicates (recommended) or override if truly separate
  - Prevent double-counting in allotment calculations
- **Benefits**:
  - Accurate allotment calculations (no phantom requests)
  - Prevents data conflicts and integrity issues
  - Cleaner over-allotment analysis with only unique requests

#### Stage 3: Over-Allotment Review

- **Purpose**: Handle dates where unique requests exceed available allotments
- **Actions**:
  - Review over-allotted dates (after filtering out duplicates)
  - Drag-and-drop to set request priority
  - Adjust allotments or manage waitlists
- **Benefits**: Works with accurate request counts after duplicate removal

#### Stage 4: Final Review

- **Purpose**: Review final import summary and execute the operation
- **Actions**: Confirm all decisions and execute the import
- **Validation**: Final integrity checks before database changes

### Key Improvements

#### Logical Flow Enhancement

The new stage order (Unmatched → **Duplicates** → Over-Allotment → Final Review) provides:

1. **Accurate Data Foundation**: Duplicates are resolved before any calculations
2. **Proper Allotment Analysis**: Over-allotment calculations use only unique, valid requests
3. **Reduced Complexity**: No need to recalculate allotments after duplicate removal
4. **Better User Experience**: Clear decision points without conflicting information

#### Duplicate-First Benefits

- **Data Integrity**: Prevents importing the same request twice
- **Accurate Metrics**: Allotment calculations reflect true request volume
- **Cleaner Decisions**: Over-allotment management works with actual unique requests
- **Conflict Prevention**: Eliminates database constraint violations from duplicates

### Technical Implementation

#### Stage Transition Logic

```typescript
// New stage order
const stageOrder: ImportStage[] = [
  "unmatched",
  "duplicates", // ← Moved before over_allotment
  "over_allotment",
  "final_review",
];
```

#### Over-Allotment Analysis Enhancement

```typescript
// Filter out duplicates before allotment calculations
const itemsToAnalyze = originalItems.filter((item, index) => {
  if (unmatched.skippedItems.has(index)) return false;
  if (duplicates.skipDuplicates.has(index)) return false; // ← New filter
  return item.matchedMember.status === "matched" || unmatched.resolvedAssignments[index];
});
```

#### Validation Updates

- Stage transition validation updated for new order
- Data integrity checks account for duplicate filtering
- Progress metrics reflect accurate stage completion

### User Interface Updates

#### Stage Navigation

- Progress bar reflects new order
- Stage help content updated for duplicate-first approach
- Loading states and transitions updated

#### Enhanced Guidance

- "How Staged Import Works" guide updated
- Stage-specific help emphasizes duplicate importance
- Warnings about duplicate decisions and their impact

### Migration Considerations

#### Existing Imports

- Legacy quick import mode remains unchanged
- Staged import uses new order for all new imports
- No impact on existing database data

#### User Training

- Updated documentation reflects new workflow
- Stage help provides clear guidance on duplicate decisions
- Emphasis on "skip duplicates" as the safe default choice

## Dependencies Installed

- ✅ `react-native-draggable-flatlist` - For drag-and-drop functionality
- ✅ Existing packages: `react-native-gesture-handler`, `react-native-reanimated`, `react-native-modal`

---

## Phase 1: Core Infrastructure Updates

### 1.1 Enhanced Import Preview Service

- [x] Update `utils/importPreviewService.ts` to support staged analysis
- [x] Add stage-specific data filtering and analysis functions
- [x] Create re-analysis triggers for each stage completion
- [x] Implement data validation between stages
- [x] Add allotment querying logic for each import date
- [x] Create new interfaces for over-allotment data structures
- [x] Implement grouping logic by date for over-allotted requests
- [x] Add waitlist position calculation considering existing waitlisted requests

### 1.2 New Data Structures

- [x] Create `ImportStage` enum ("unmatched", "over_allotment", "duplicates", "final_review")
- [x] Create `StagedImportPreview` interface with stage-specific data
- [x] Create `OverAllotmentDate` interface
- [x] Create `OverAllotmentReview` interface
- [x] Update `ImportPreviewItem` interface to include stage flags
- [x] Add admin ordering state management types
- [x] Create `ImportProgressState` interface for tracking stage completion

### 1.3 Staged Analysis Logic

- [x] Implement stage-specific filtering functions
- [x] Create re-analysis pipeline for stage transitions
- [x] Add validation logic for stage completion requirements
- [x] Implement data consistency checks between stages
- [x] Query `pld_sdv_allotments` table for each import date
- [x] Compare request counts vs `max_allotment` values
- [x] Handle both daily overrides and yearly defaults
- [x] Account for existing requests in the database

---

## Phase 2: Staged Import Preview Interface

### 2.1 Stage Management Component

- [x] Create main `StagedImportPreview` component with progress indicators
- [x] Add stage navigation and completion tracking
- [x] Implement stage-specific content rendering
- [x] Add stage validation and progression controls
- [x] Create progress bar/stepper UI component

### 2.2 Unmatched Member Resolution Component

- [x] Create `UnmatchedMemberResolution` component for Stage 1
- [x] Add member search functionality with real-time results
- [x] Implement member assignment and skip options
- [x] Add visual indicators for resolution status
- [x] Create member selection interface with validation

### 2.3 Over-Allotment Review Component

- [x] Create `OverAllotmentReview` component for Stage 2
- [x] Implement drag-and-drop request ordering with `react-native-draggable-flatlist`
- [x] Add allotment adjustment controls (keep current, increase, custom)
- [x] Create date-specific grouping and navigation
- [x] Add visual waitlist position indicators
- [x] Implement real-time status updates during drag operations

### 2.4 Duplicate and Final Review Components

- [x] Create `DuplicateAndFinalReview` component for Stages 3 & 4
- [x] Add duplicate detection and resolution interface
- [x] Create final import summary with statistics
- [x] Implement import execution with progress indicators
- [x] Add error handling and success feedback

---

## Phase 3: Integration with Existing Import Flow

### 3.1 Import Component Integration

- [x] Update `ImportPldSdvComponent` to support both staged and legacy import modes
- [x] Add import mode toggle UI for user selection between workflows
- [x] Integrate `createStagedImportPreview` function call for staged imports
- [x] Maintain backward compatibility with existing `generateImportPreview` for quick imports
- [x] Update state management to handle both `StagedImportPreview` and `ImportPreviewItem[]` data
- [x] Add proper error handling and loading states for both import modes
- [x] Implement consistent theming and styling with existing app design

### 3.2 Component Routing and Display

- [x] Update preview display logic to route to appropriate component based on import mode
- [x] Ensure `StagedImportPreview` component receives correct props (`stagedPreview` instead of `previewData`)
- [x] Maintain existing `ImportPreviewComponent` functionality for quick import mode
- [x] Add proper cleanup and state reset for both import modes
- [x] Implement import completion handling for both workflows

### 3.3 User Experience Enhancements

- [x] Add visual toggle interface with icons and descriptions for import mode selection
- [x] Default to staged import mode while providing quick import as fallback option
- [x] Ensure consistent styling and theming across both import modes
- [x] Add proper loading indicators and status messages for both workflows
- [x] Maintain existing file upload and calendar selection functionality

---

## Phase 4: Drag-and-Drop Functionality Enhancement

### 4.1 Drag-and-Drop Configuration

- [x] Configure drag handles with `[≡]` icons in `OverAllotmentReview` component
- [x] Implement drop zones for approved vs waitlist sections
- [x] Add visual feedback during drag operations
- [x] Handle cross-section dragging (approved ↔ waitlist)
- [x] Enhanced drag handles with better visual design and touch targets
- [x] Added animated visual feedback during drag operations
- [x] Implemented proper drag start/end state management

### 4.2 Allotment Adjustment Options

- [x] Add "Keep current allotment" option
- [x] Add "Increase allotment to fit all" option
- [x] Add custom allotment input field
- [x] Implement allotment impact calculations
- [x] Added real-time impact preview for custom allotment values
- [x] Enhanced visual feedback for allotment adjustment options
- [x] Added adjustment tracking and display in summary

### 4.3 Status Indicators & Warnings

- [x] Show original vs modified status for each request
- [x] Add warning indicators for status changes
- [x] Display conflict warnings (originally approved → waitlisted)
- [x] Add visual indicators for request origins
- [x] Implemented status change tracking with visual indicators
- [x] Added warning badges for requests with changed status
- [x] Enhanced item display with request origin information
- [x] Added section headers with counts for approved/waitlisted requests

---

## Phase 5: Stage Transition & Re-Analysis Logic

### 5.1 Re-Analysis Pipeline

- [x] Create stage transition validation functions
- [x] Implement automatic re-analysis triggers
- [x] Add data consistency validation between stages
- [x] Create rollback mechanisms for stage navigation

### 5.2 Progress Tracking

- [x] Implement stage completion tracking
- [x] Add visual progress indicators
- [x] Create stage summary displays
- [x] Add time estimates for remaining stages

### 5.3 Data Integrity Validation

- [x] Add cross-stage data validation
- [x] Implement consistency checks after each stage
- [x] Create error handling for data conflicts
- [x] Add warning systems for potential issues

---

## Phase 6: Waitlist Position Management

### 6.1 Position Calculation Logic

- [x] Enhanced waitlist position calculation functions
- [x] Cross-date position management
- [x] Drag operation position updates
- [x] Position conflict detection and resolution

### 6.2 Database Integration

- [x] Enhanced batch import with position management
- [x] Position validation before database operations
- [x] Waitlist position update functions
- [x] Position consistency validation

### 6.3 Real-Time Position Updates

- [x] Live position preview during drag operations
- [x] Real-time validation feedback
- [x] Position reset functionality
- [ ] Update position numbers during drag operations
- [ ] Show live preview of position changes
- [ ] Implement position validation (no gaps, no duplicates)
- [ ] Add position reset functionality

---

## Phase 7: User Experience Enhancements

### 7.1 Visual Design & Feedback

- [x] Enhanced drag handle styling with professional appearance
- [x] Smooth transition animations for drag operations
- [x] Improved drop zone highlighting with dynamic feedback
- [x] Enhanced visual hierarchy and component styling

### 7.2 Help Text & Guidance

- [x] Contextual help tooltips for each stage
- [x] Stage-specific guidance with step-by-step instructions
- [x] "How Staged Import Works" comprehensive guide
- [x] Quick tips and best practices for each stage

### 7.3 Progress Indicators

- [x] Enhanced progress bar with real-time metrics
- [x] Stage completion indicators with visual feedback
- [x] Data integrity scoring and display
- [x] Time estimation and progress tracking

### 7.4 Accessibility

- [x] ARIA labels and roles for screen readers
- [x] Keyboard navigation support
- [x] Accessibility hints and state management
- [x] Screen reader announcements for progress updates

---

## Phase 8: Database Reconciliation & Conflict Detection

### 8.1 Existing Request Analysis

- [ ] Query all existing PLD/SDV requests for the target calendar year
- [ ] Compare existing requests against iCal import data
- [ ] Identify requests that exist in database but not in iCal import
- [ ] Detect requests that exist in both with potential conflicts (different status, dates, etc.)
- [ ] Calculate true allotment availability considering ALL existing requests

### 8.2 Conflict Detection & Resolution

- [ ] Create conflict detection algorithms for:
  - Requests approved in database but not in iCal (manual approvals)
  - Requests waitlisted in database with different positions than iCal
  - Requests with different dates between database and iCal
  - Allotment calculations that don't account for existing requests
- [ ] Add conflict resolution interface for admins to:
  - Choose to preserve database state vs iCal state
  - Merge conflicting information
  - Skip conflicting requests from import
  - Update existing requests to match iCal data

### 8.3 True Allotment Calculation

- [ ] Enhance allotment calculation to include:
  - All existing approved requests for each date
  - All existing waitlisted requests and their positions
  - Manual allotment adjustments made outside of iCal
  - Calendar-specific overrides and exceptions
- [ ] Update over-allotment detection to use true available slots
- [ ] Recalculate waitlist positions considering existing waitlisted requests

### 8.4 Database State Reconciliation

- [ ] Create reconciliation workflow for:
  - Updating existing requests that have changed in iCal
  - Preserving manually created requests not in iCal
  - Handling deleted requests (in database but not in iCal)
  - Maintaining data integrity across all request sources
- [ ] Add admin review interface for reconciliation decisions
- [ ] Implement batch update operations for reconciled data

### 8.5 Import Impact Preview

- [ ] Show comprehensive import impact including:
  - New requests to be added
  - Existing requests to be updated
  - Existing requests to be preserved (not in iCal)
  - Allotment changes and their effects on existing requests
  - Waitlist position changes for existing waitlisted requests
- [ ] Add warnings for high-impact changes
- [ ] Provide rollback options for reconciliation decisions

---

## Phase 9: Final Integration & Testing

### 9.1 Staged Import Flow Integration

- [ ] Update main import workflow to handle staged progression
- [ ] Integrate stage validation with existing systems
- [ ] Update final import confirmation process
- [ ] Add import summary with all stage actions
- [ ] Implement stage rollback functionality

### 9.2 Database Operations

- [ ] Update batch import functions to handle staged data
- [ ] Implement allotment adjustment database operations
- [ ] Add transaction handling for complex imports
- [ ] Update import logging and audit trails
- [ ] Add stage-specific error recovery

### 9.3 Error Handling

- [ ] Add validation for each stage transition
- [ ] Handle network errors during stage analysis
- [ ] Implement rollback mechanisms for failed stages
- [ ] Add user-friendly error messages for each stage
- [ ] Create recovery options for data conflicts

### 9.4 Testing

- [ ] Create test cases for staged import progression
- [ ] Test stage transition validation
- [ ] Validate re-analysis accuracy after each stage
- [ ] Test rollback and recovery mechanisms
- [ ] Validate final data integrity

---

## Phase 10: Documentation & Polish

### 10.1 User Documentation

- [ ] Create admin guide for staged import process
- [ ] Document each stage's purpose and requirements
- [ ] Add troubleshooting section for each stage
- [ ] Create video tutorials for complex workflows

### 10.2 Technical Documentation

- [ ] Document staged analysis architecture
- [ ] Add code comments for stage transition logic
- [ ] Update API documentation for new endpoints
- [ ] Document data integrity safeguards

### 10.3 Performance Optimization

- [ ] Optimize re-analysis performance for large imports
- [ ] Implement caching for repeated stage analysis
- [ ] Add lazy loading for stage-specific data
- [ ] Optimize stage transition performance

---

## Implementation Notes

### Key Technical Decisions

- **Staged Progression**: Each stage must be 100% complete before advancing
- **Re-Analysis Pipeline**: Automatic data re-analysis after each stage completion
- **Data Integrity**: Multiple validation layers to prevent inconsistent imports
- **User Control**: Ability to navigate back with appropriate warnings
- **Backward Compatibility**: Maintained existing quick import workflow alongside new staged import
- Using `react-native-draggable-flatlist` for cross-platform drag-and-drop
- Maintaining consistency with existing `waitlist_position` database field
- Preserving original iCal status information for admin reference

### Database Considerations

- No schema changes required - using existing `waitlist_position` field
- Allotment queries will use existing `pld_sdv_allotments` table
- Import operations will use existing batch insert patterns
- **Transaction Safety**: Each stage completion creates a safe checkpoint

### UX Principles

- **Progressive Disclosure**: Show only relevant data for current stage
- **Clear Progression**: Visual indicators of stage completion and requirements
- **Data Integrity First**: Block progression until stage requirements are met
- **Reversible Actions**: Allow going back with appropriate warnings
- **Mode Selection**: Clear choice between advanced staged import and simple quick import
- Intuitive drag-and-drop with immediate visual feedback
- Consistent with existing admin interface patterns

---

## Current Status

- **Phase**: Phase 7 Complete ✅
- **Next Step**: Begin Phase 8.1 - Existing Request Analysis
- **Dependencies**: All required packages installed ✅
- **Critical Addition**: Added Phase 8 for Database Reconciliation & Conflict Detection
- **Phase 7 Summary**:
  - ✅ Enhanced visual design with professional drag handles and smooth animations
  - ✅ Improved drop zone highlighting with dynamic feedback and scaling effects
  - ✅ Implemented comprehensive contextual help system with stage-specific guidance
  - ✅ Created "How Staged Import Works" guide with detailed explanations
  - ✅ Added enhanced progress indicators with real-time metrics and integrity scoring
  - ✅ Implemented accessibility features with ARIA labels and keyboard navigation
  - ✅ Added screen reader support with proper announcements and hints
  - ✅ Enhanced visual hierarchy and component styling throughout the interface
  - ✅ Created quick tips and best practices for each import stage
  - ✅ Implemented time estimation and progress tracking for user feedback

**Phase 8 Rationale**:
The staged import workflow was missing a critical component - reconciliation with existing database requests that aren't reflected in the iCal import. This could lead to:

- Over-allotment situations not being detected (existing approved requests not counted)
- Waitlist position conflicts (existing waitlisted requests not considered)
- Data integrity issues (manual approvals being overwritten)
- Incomplete allotment calculations (missing existing request data)

Phase 8 addresses these concerns by adding comprehensive database reconciliation and conflict detection before final import execution.
