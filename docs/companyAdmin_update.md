# Company Admin Page Update Plan

## Overview

Implement a tabbed interface for the company admin page with four main sections:

1. PLD/SDV (existing functionality)
2. Vacation
3. Admin Message
4. Admin Review

## 1. Component Structure

### New Components to Create

- `components/admin/TabBar.tsx`: Shared tab navigation component
- `components/admin/pld-sdv/PldSdvSection.tsx`: Refactored from existing code
- `components/admin/vacation/VacationSection.tsx`: New vacation management
- `components/admin/message/AdminMessageSection.tsx`: Admin messaging interface
- `components/admin/review/AdminReviewSection.tsx`: Review system interface

### Tab Management

- Equal width tabs
- Persist selected tab in local storage
- All content remains on company-admin page (no URL routing)

## 2. PLD/SDV Section Updates

### Confirmation Dialog

- Implement using ThemedToast for quick confirmations
- Display format:

  ```
  Confirm Action
  Name: John Smith
  PIN: 12345
  Type: PLD
  Date: Jan 1, 2024

  [OK] [Cancel]
  ```

- OK button processes the request
- Cancel button aborts with no action
- Keep existing denial modal functionality

## 3. Vacation Section Implementation

### Features

- Table view of vacation requests
- Display start_date as primary date reference
- Sortable columns (toggleable ascending/descending):
  - Name
  - PIN Number
  - Start Date
  - Division
  - Calendar
  - Status
  - Submission Date
- Sort management:
  - Default sort: Name (ascending), then Start Date (ascending)
  - Multi-column sort capability (maximum 3 columns)
  - Visual indicators showing sort priority (1, 2, 3)
  - "Reset to Default" button to clear custom sorts

### Filters

- Division filter (dropdown)
- Calendar filter (dropdown)
- Date range filter
- Clear all filters option
- Filters maintained independently per tab

### Actions

- Approve/Deny functionality similar to PLD/SDV
- Same confirmation dialog pattern
- Use shared denial reasons from pld_sdv_denial_reasons table

### Database Integration

Using existing vacation_requests table:

- Status management
- Request tracking
- Approval workflow
- Note: waitlist_position and metadata fields reserved for future use

## 4. Admin Message Section

### Initial Implementation

- Basic message composition interface
- Recipients filtered by admin type:
  - Division admins (by division)
  - Union admins
  - Application admins
- Support for selecting multiple admin types simultaneously
- Display total recipient count
- Text-only messages
- No threading/history
- Visual placeholder for future implementation
- Note indicating "Feature coming soon"

## 5. Admin Review Section

### Basic Structure

- List view of review items
- Simple status workflow:
  - Submitted
  - In Review
  - Resolved
- Basic fields:
  - Submission date
  - Admin who submitted
  - Request type
  - Description
  - Status

### Initial Features

- View-only interface
- Placeholder for future implementation
- Note indicating "Feature coming soon"

### Future Database Structure

- Plan for new admin_reviews table
- Include audit trail integration
- Track review items separately while maintaining audit history

## 6. Shared State Management

### Local Storage

- Selected tab persistence
- Filter preferences per tab
- Sort order preferences per tab
- Clear all preferences on logout
- Preferences to store:
  - Last selected tab
  - Per-tab filters
  - Per-tab sort configurations
  - Column visibility settings
  - Custom view preferences

### Performance Considerations

- Lazy loading of section content
- Efficient data fetching
- Optimistic UI updates
- Cache invalidation on logout

## 7. Mobile and Responsive Design Implementation

### Platform Detection and Adaptation

```typescript
// Utility hooks and constants
const isMobile = Platform.OS !== "web" || width < 768;
const isIOS = Platform.OS === "ios";
const isAndroid = Platform.OS === "android";
```

### Responsive Layout Considerations

- Use flex-based layouts for dynamic resizing
- Implement column-to-row stacking on smaller screens
- Adjust padding and margins based on screen size
- Use SafeAreaView for proper inset handling on mobile

### Tab Navigation

- Desktop: Full width tabs with text and icons
- Mobile:
  - Icon-only tabs with tooltips
  - Increased touch targets (minimum 44x44 points)
  - Active state indicators optimized for touch
  - Bottom tab navigation consideration for better thumb reach

### List Views and Tables

- Desktop:
  - Full data table with all columns
  - Hover states for interactive elements
  - Multi-column sorting UI
- Mobile:
  - Card-based layout for requests
  - Collapsible sections for detailed information
  - Single-column sort with clear visual indicators
  - Swipe actions for approve/deny
  - Pull-to-refresh functionality

### Filters and Controls

- Desktop:
  - Expanded filter panels
  - Multi-select dropdowns
  - Date range pickers
- Mobile:
  - Modal filter screens
  - Full-screen date pickers
  - Simplified filter options
  - Clear visual feedback for active filters

### Typography and Spacing

```typescript
const styles = StyleSheet.create({
  text: {
    fontSize: isMobile ? 16 : 14,
    lineHeight: isMobile ? 24 : 20,
  },
  touchTarget: {
    minHeight: isMobile ? 44 : 32,
    padding: isMobile ? 12 : 8,
  },
  container: {
    padding: isMobile ? 16 : 24,
    gap: isMobile ? 16 : 24,
  },
});
```

### Platform-Specific Components

- iOS:
  - Native date picker
  - Modal slide-up animations
  - System font (SF Pro)
- Android:
  - Material date picker
  - Material ripple effects
  - Roboto font
- Web:
  - Hover states
  - Right-click context menus
  - Keyboard shortcuts

### Confirmation Dialogs

- Desktop:
  - ThemedToast for quick actions
  - Modal dialogs for complex confirmations
- Mobile:
  - Full-screen modals
  - Bottom sheet confirmations
  - Haptic feedback for actions

### Performance Optimizations

- Lazy loading for off-screen content
- Image optimization for different screen sizes
- Reduced animation complexity on mobile
- Virtual list rendering for long lists
- Debounced search and filter operations

### Testing Strategy

- Device-specific testing:
  - iOS simulators (various sizes)
  - Android emulators (various sizes)
  - Browser responsive testing
- Gesture testing:
  - Touch interactions
  - Swipe actions
  - Pinch-to-zoom where applicable
- Accessibility testing:
  - VoiceOver (iOS)
  - TalkBack (Android)
  - Screen readers (Web)

### Implementation Examples

#### Responsive Container

```typescript
const ResponsiveContainer = styled.View`
  padding: ${isMobile ? 16 : 24}px;
  flex-direction: ${isMobile ? "column" : "row"};
  gap: ${isMobile ? 16 : 24}px;
`;
```

#### Adaptive Tab Bar

```typescript
function TabBar({ tabs }) {
  return (
    <TabContainer>
      {tabs.map((tab) => (
        <TabButton key={tab.id}>
          <TabIcon name={tab.icon} size={isMobile ? 24 : 20} />
          {!isMobile && <TabText>{tab.label}</TabText>}
        </TabButton>
      ))}
    </TabContainer>
  );
}
```

#### Responsive List Item

```typescript
function RequestListItem({ request }) {
  if (isMobile) {
    return (
      <RequestCard>
        <RequestHeader>
          <MemberName>{request.memberName}</MemberName>
          <RequestType>{request.type}</RequestType>
        </RequestHeader>
        <RequestDetails>
          <DateInfo>{request.date}</DateInfo>
          <SwipeableActions>
            <ApproveAction />
            <DenyAction />
          </SwipeableActions>
        </RequestDetails>
      </RequestCard>
    );
  }

  return (
    <TableRow>
      <TableCell>{request.memberName}</TableCell>
      <TableCell>{request.type}</TableCell>
      <TableCell>{request.date}</TableCell>
      <TableCell>
        <ActionButtons>
          <ApproveButton />
          <DenyButton />
        </ActionButtons>
      </TableCell>
    </TableRow>
  );
}
```

### Style Guidelines

- Use relative units (rem/em) for web
- Use density-independent pixels for mobile
- Implement dark mode support
- Maintain consistent touch targets
- Follow platform-specific design patterns

### Accessibility Considerations

- Minimum contrast ratios
- Scalable text support
- Touch target sizing
- Screen reader support
- Keyboard navigation (web)

## Implementation Phases

### Phase 1: Database Preparation

1. Create admin_reviews table:

```sql
CREATE TABLE public.admin_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submitted_by UUID NOT NULL REFERENCES auth.users(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    request_type TEXT NOT NULL,
    request_id UUID NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted',
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    follow_up_date TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_admin_reviews_submitted_by ON public.admin_reviews(submitted_by);
CREATE INDEX idx_admin_reviews_status ON public.admin_reviews(status);
CREATE INDEX idx_admin_reviews_request_type ON public.admin_reviews(request_type);
CREATE INDEX idx_admin_reviews_follow_up_date ON public.admin_reviews(follow_up_date);
CREATE INDEX idx_admin_reviews_is_deleted ON public.admin_reviews(is_deleted);

-- Add validation trigger for follow_up_date
CREATE OR REPLACE FUNCTION validate_follow_up_date()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.follow_up_date IS NOT NULL AND NEW.follow_up_date <= NEW.submitted_at THEN
        RAISE EXCEPTION 'follow_up_date must be after submitted_at';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_valid_follow_up_date
    BEFORE INSERT OR UPDATE ON public.admin_reviews
    FOR EACH ROW
    EXECUTE FUNCTION validate_follow_up_date();

-- Add RLS policies
ALTER TABLE public.admin_reviews ENABLE ROW LEVEL SECURITY;

-- Create trigger for updated_at
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.admin_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

2. Create admin_review_audit_log table:

```sql
CREATE TABLE public.admin_review_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES public.admin_reviews(id),
    action TEXT NOT NULL,
    performed_by UUID NOT NULL REFERENCES auth.users(id),
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    old_values JSONB,
    new_values JSONB
);

-- Add indexes
CREATE INDEX idx_admin_review_audit_log_review_id ON public.admin_review_audit_log(review_id);
CREATE INDEX idx_admin_review_audit_log_performed_at ON public.admin_review_audit_log(performed_at);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION log_admin_review_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- For soft deletes, set action to 'DELETE' instead of 'UPDATE'
        IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
            INSERT INTO public.admin_review_audit_log (
                review_id,
                action,
                performed_by,
                old_values,
                new_values
            ) VALUES (
                NEW.id,
                'DELETE',
                auth.uid(),
                to_jsonb(OLD),
                to_jsonb(NEW)
            );
        -- For restores, set action to 'RESTORE' instead of 'UPDATE'
        ELSIF NEW.is_deleted = false AND OLD.is_deleted = true THEN
            INSERT INTO public.admin_review_audit_log (
                review_id,
                action,
                performed_by,
                old_values,
                new_values
            ) VALUES (
                NEW.id,
                'RESTORE',
                auth.uid(),
                to_jsonb(OLD),
                to_jsonb(NEW)
            );
        ELSE
            INSERT INTO public.admin_review_audit_log (
                review_id,
                action,
                performed_by,
                old_values,
                new_values
            ) VALUES (
                NEW.id,
                TG_OP,
                auth.uid(),
                to_jsonb(OLD),
                to_jsonb(NEW)
            );
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO public.admin_review_audit_log (
            review_id,
            action,
            performed_by,
            new_values
        ) VALUES (
            NEW.id,
            TG_OP,
            auth.uid(),
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'DELETE' THEN
        -- This shouldn't happen as we're using soft deletes, but log it just in case
        INSERT INTO public.admin_review_audit_log (
            review_id,
            action,
            performed_by,
            old_values
        ) VALUES (
            OLD.id,
            TG_OP,
            auth.uid(),
            to_jsonb(OLD)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit trigger
CREATE TRIGGER audit_admin_review_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.admin_reviews
    FOR EACH ROW
    EXECUTE FUNCTION log_admin_review_changes();

-- Create function for soft delete
CREATE OR REPLACE FUNCTION soft_delete_admin_review(review_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.admin_reviews
    SET
        is_deleted = true,
        deleted_at = now(),
        deleted_by = auth.uid()
    WHERE id = review_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for restoring soft-deleted reviews
CREATE OR REPLACE FUNCTION restore_admin_review(review_id UUID)
RETURNS VOID AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Get the user's role from metadata
    SELECT user_metadata->>'role'
    INTO user_role
    FROM auth.users
    WHERE id = auth.uid();

    -- Check if user has appropriate role
    IF user_role NOT IN ('division_admin', 'union_admin', 'application_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only division, union, or application admins can restore reviews';
    END IF;

    UPDATE public.admin_reviews
    SET
        is_deleted = false,
        deleted_at = NULL,
        deleted_by = NULL
    WHERE id = review_id
    RETURNING id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

3. Add RLS Policies (following existing table patterns):

```sql
-- Admin reviews policies
CREATE POLICY "Enable read access for authenticated users" ON public.admin_reviews
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable write access for authenticated users" ON public.admin_reviews
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON public.admin_reviews
    FOR UPDATE
    TO authenticated
    USING (true);

-- Audit log policies
CREATE POLICY "Enable read access for authenticated users" ON public.admin_review_audit_log
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert for authenticated users" ON public.admin_review_audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
```

### Phase 2: Base Structure

1. Create tab navigation system
2. Implement local storage persistence
3. Set up basic component structure

### Phase 3: PLD/SDV Updates

1. Refactor existing code into PldSdvSection
2. Add confirmation dialog
3. Test and verify functionality

### Phase 4: Vacation Section

1. Implement vacation request list with sort indicators
2. Add sorting (max 3 columns) and filtering
3. Implement approval/denial workflow

### Phase 5: Admin Sections

1. Create placeholder interfaces
2. Add "coming soon" messaging
3. Prepare for future functionality

### Phase 6: Testing & Deployment

1. Unit test new components
2. Integration test tab system
3. Test database migrations
4. Verify RLS policies
5. Deploy database changes
6. Deploy application updates

## Technical Considerations

### Database Tables

- Utilizing existing tables:
  - vacation_requests
  - pld_sdv_requests
  - pld_sdv_denial_reasons (shared for both request types)
  - messages
  - admin_messages (future use)
- New tables:
  - admin_reviews (with soft delete)
  - admin_review_audit_log

### Type Definitions

Create shared types for:

- Request statuses
- Admin types
- Filter configurations
- Sort configurations

### Error Handling

- Consistent error messaging
- Graceful fallbacks
- Loading states

### Testing Strategy

1. Component unit tests
2. Integration tests for workflows
3. E2E tests for critical paths

### Soft Delete Handling

- Reviews are never physically deleted
- UI should filter out deleted reviews by default
- Soft deletes tracked in audit log as 'DELETE' actions
- Deletion includes timestamp and user tracking
- Restore functionality:
  - Limited to division_admin, union_admin, and application_admin roles
  - Tracked in audit log as 'RESTORE' actions
  - Will be implemented in application admin interface (not company admin)
  - Restores clear deletion metadata (timestamp and user)

## Future Considerations

1. Admin message threading
2. Review system attachments
3. Enhanced filtering options
4. Reporting capabilities
5. Audit logging improvements
6. Waitlist functionality for vacation requests
7. Metadata field utilization for vacation requests
