# Paid In Lieu Flow Update Plan

## Implementation Progress

### ✅ Phase 1: Database Updates

- [x] Updated prevent_duplicate_active_requests trigger function
- [x] Added separate validation for paid in lieu requests
- [x] Added clear error messages with hints

### ✅ Phase 2: UI Updates (Completed)

- [x] Implement hydration-safe date handling
- [x] Create client-only components
- [x] Update DatePicker integration
- [x] Implement safe date comparisons
- [x] Updated useMyTime.ts hook to support date parameter
- [x] Created new PaidInLieuModal component with date selection

### ✅ Phase 3: Testing Plan (Completed)

- [x] Database tests
  - [x] Verified multiple paid in lieu requests can be created for different dates
  - [x] Verified duplicate paid in lieu requests for the same date are prevented
  - [x] Verified regular requests and paid in lieu requests can coexist on different dates
- [x] Hydration testing
- [x] UI tests
- [x] Integration tests

### 🔄 Phase 4: Accessibility & Error Handling (In Progress)

- [x] Accessibility enhancements
- [x] Enhanced error handling
- [x] Cross-platform considerations

### 🔄 Phase 5: Cross-Platform Considerations (In Progress)

- [x] Responsive layout adjustments
- [x] Platform-specific behavior
- [x] Safe area and layout handling
- [x] Performance optimizations
- [x] Testing requirements
- [x] Error handling

## Current Issues

1. Database constraint incorrectly prevents multiple paid in lieu requests
2. UI needs update to allow date selection for paid in lieu requests
3. Missing date range validation for paid in lieu requests
4. Potential hydration mismatches between server and client date handling

## Phase 1: Database Updates

### 1.1 Update Duplicate Request Check

The current `prevent_duplicate_active_requests` trigger function needs to be modified to handle paid in lieu requests differently. Currently, it blocks any request if there's an active request for the same date, regardless of whether it's a paid in lieu request.

```sql
CREATE OR REPLACE FUNCTION public.prevent_duplicate_active_requests()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.status IN ('pending', 'approved', 'waitlisted', 'cancellation_pending') THEN
        -- For paid in lieu requests, only check for existing paid in lieu requests on the same date
        IF NEW.paid_in_lieu THEN
            IF EXISTS (
                SELECT 1 FROM pld_sdv_requests
                WHERE member_id = NEW.member_id
                AND request_date = NEW.request_date
                AND id != NEW.id
                AND paid_in_lieu = true
                AND status IN ('pending', 'approved', 'waitlisted', 'cancellation_pending')
            ) THEN
                RAISE EXCEPTION 'A paid in lieu request already exists for this date'
                    USING HINT = 'You can not have more than one paid in lieu request on a given day';
            END IF;
        -- For regular requests, check for any active request on the same date
        ELSE
            IF check_active_request_exists(NEW.member_id, NEW.request_date, NEW.id) THEN
                RAISE EXCEPTION 'An active request already exists for this date'
                    USING HINT = 'Cancel the existing request before creating a new one';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;
```

## Phase 2: UI Updates

### 2.1 Hydration-Safe Date Handling

We'll use our existing hydration-safe patterns to prevent mismatches:

```typescript
// Add to useMyTime.ts
const getSafeDate = () => {
  if (typeof window === "undefined") {
    // During SSR, return a stable date string
    return new Date("2099-01-01").toISOString();
  }
  return new Date().toISOString();
};

// Add to mytime.tsx
const getDateRange = () => {
  if (typeof window === "undefined") {
    // During SSR, return stable date range
    return {
      minDate: "2099-01-01",
      maxDate: "2099-01-15",
    };
  }

  const now = new Date();
  return {
    minDate: subWeeks(now, 2).toISOString(),
    maxDate: addWeeks(now, 2).toISOString(),
  };
};
```

### 2.2 Client-Only Components

Create a new client-only component for the paid in lieu modal to prevent hydration mismatches:

```typescript
function ClientOnlyPaidInLieuModal({ isVisible, onConfirm, onCancel, stats }: PaidInLieuModalProps) {
  const [isMounted, setIsMounted] = useState(false);

  useIsomorphicLayoutEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return null;

  return (
    <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Modal content */}
    </Modal>
  );
}
```

### 2.3 Update DatePicker Integration

Wrap the DatePicker component in a client-only wrapper:

```typescript
function ClientOnlyDatePicker({ date, onDateChange, minDate, maxDate }: DatePickerProps) {
  return (
    <ClientOnlyComponent fallback={<DefaultLoadingFallback />}>
      <DatePicker date={date} onDateChange={onDateChange} minDate={minDate} maxDate={maxDate} />
    </ClientOnlyComponent>
  );
}
```

### 2.4 Safe Date Comparisons

Use our existing `safeCompareDate` function for date comparisons:

```typescript
// Already implemented in mytime.tsx
const safeCompareDate = (dateA: string, dateB: string, descending: boolean = false) => {
  if (typeof window === "undefined") {
    return descending ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
  }
  const dateObjA = parseISO(dateA);
  const dateObjB = parseISO(dateB);
  return descending ? dateObjB.getTime() - dateObjA.getTime() : dateObjA.getTime() - dateObjB.getTime();
};
```

## Phase 3: Testing Plan

### 3.1 Hydration Testing

1. Test SSR rendering:

   - Verify no hydration mismatches in console
   - Check date handling during SSR
   - Verify client-only components render correctly after hydration

2. Test date handling:

   - Verify date comparisons work in both SSR and client environments
   - Check date picker behavior after hydration
   - Verify date range validation works consistently

3. Test modal behavior:
   - Verify modal appears correctly after hydration
   - Check date picker integration in modal
   - Verify no flickering or UI jumps during hydration

### 3.2 Database Tests

1. Verify multiple paid in lieu requests can be created for different dates
2. Verify duplicate paid in lieu requests for the same date are prevented
3. Verify regular requests and paid in lieu requests can coexist on different dates
4. Verify regular requests still prevent duplicates on the same date

### 3.3 UI Tests

1. Verify date picker shows correct date range (±2 weeks)
2. Verify date validation prevents out-of-range selections
3. Verify error messages display correctly for invalid dates
4. Verify type selection works with date selection
5. Verify all warning messages display correctly based on available days

### 3.4 Integration Tests

1. Verify complete flow from date selection to request submission
2. Verify error handling for all edge cases
3. Verify real-time updates work correctly
4. Verify calendar updates reflect new paid in lieu requests

## Phase 4: Accessibility & Error Handling

### 4.1 Accessibility Enhancements

1. ARIA Attributes

   ```typescript
   // Add to paid in lieu modal
   <DatePicker
     date={selectedDate}
     onDateChange={setSelectedDate}
     mode="date"
     placeholder="Select date for paid in lieu"
     accessibilityLabel="Select the date you want to request paid in lieu for"
     accessibilityHint="Opens a date picker to select a date within two weeks of today"
   />
   ```

2. Screen Reader Support

   - Add clear status messages for screen readers
   - Ensure error messages are announced
   - Add role="alert" for important status changes

3. Keyboard Navigation
   - Ensure all interactive elements are focusable
   - Add keyboard shortcuts for common actions
   - Maintain logical tab order

### 4.2 Enhanced Error Handling

1. Toast Notifications

   ```typescript
   // Consistent with existing MyTime screen pattern
   const handleDateError = (error: Error) => {
     Toast.show({
       type: "error",
       text1: "Date Selection Error",
       text2: error.message,
       position: "bottom",
       visibilityTime: 3000,
     });
   };

   const handleSuccess = (message: string) => {
     Toast.show({
       type: "success",
       text1: "Success",
       text2: message,
       position: "bottom",
       visibilityTime: 3000,
     });
   };

   const handleWarning = (message: string) => {
     Toast.show({
       type: "info",
       text1: "Warning",
       text2: message,
       position: "bottom",
       visibilityTime: 3000,
     });
   };
   ```

2. Error States

   - Invalid date range: "Date must be within two weeks of today"
   - Duplicate request: "A paid in lieu request already exists for this date"
   - No available days: "No available {type} days to request"
   - Network errors: "Unable to process request. Please try again"
   - Database errors: Custom error messages from the backend

3. Success States

   - Request submitted: "Your request for paid in lieu has been submitted"
   - Request cancelled: "Your request has been cancelled"
   - Request updated: "Your request has been updated"

4. Warning States
   - Date approaching limit: "Selected date is near the allowed range limit"
   - Low available days: "You have {n} {type} days remaining"
   - System maintenance: "System updates may affect request processing"

### 4.3 Cross-Platform Considerations

1. Platform-Specific Date Pickers

   - iOS: Use native date picker with spinner style
   - Android: Use native calendar style picker
   - Web: Use enhanced HTML5 date input with fallback

2. Responsive Design

   - Adjust modal size based on platform/screen size
   - Handle different date formats per platform
   - Ensure touch targets are appropriately sized

3. Performance Optimizations
   - Memoize date calculations
   - Lazy load date picker components
   - Cache validation results where appropriate

## Phase 5: Cross-Platform Considerations

### 5.1 Platform-Specific Date Picker Implementation

We'll leverage our existing `DatePicker` component which already handles platform differences:

```typescript
// Platform-specific date picker implementation
const PaidInLieuDatePicker = ({ date, onDateChange, minDate, maxDate }) => {
  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const isMobileWeb = Platform.OS === "web" && width < 768;

  return (
    <DatePicker
      date={date}
      onDateChange={onDateChange}
      mode="date"
      placeholder="Select date for paid in lieu"
      minDate={minDate}
      maxDate={maxDate}
      style={[
        styles.datePicker,
        Platform.OS === "web" && styles.webDatePicker,
        isMobileWeb && styles.mobileWebDatePicker,
      ]}
      textStyle={Platform.select({
        web: styles.webDatePickerText,
        default: styles.nativeDatePickerText,
      })}
    />
  );
};
```

### 5.2 Responsive Layout Adjustments

```typescript
const styles = StyleSheet.create({
  modalContent: {
    width: Platform.select({
      web: width < 768 ? "95%" : "90%",
      default: "90%",
    }),
    maxWidth: 400,
    padding: Platform.select({
      ios: 20,
      android: 24,
      web: width < 768 ? 16 : 24,
    }),
    borderRadius: Platform.select({
      ios: 14,
      android: 8,
      web: 12,
    }),
  },
  datePicker: {
    width: "100%",
    marginVertical: 16,
    ...Platform.select({
      ios: {
        height: 40,
      },
      android: {
        height: 48,
      },
      web: {
        height: 40,
      },
    }),
  },
});
```

### 5.3 Platform-Specific Behavior

1. Web (Desktop/Mobile):

   - Use modal dialog with custom styled HTML date input
   - Support keyboard input and calendar popup
   - Implement responsive design for different screen sizes
   - Handle focus/blur states for better web accessibility

2. iOS:

   - Use native iOS date picker with spinner style
   - Support gesture-based interactions
   - Implement haptic feedback
   - Follow iOS design guidelines for spacing and typography

3. Android:
   - Use native Android calendar style picker
   - Support Material Design interactions
   - Implement ripple effects for touch feedback
   - Follow Material Design guidelines for elevation and spacing

### 5.4 Safe Area and Layout Handling

```typescript
const PaidInLieuModal = () => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  return (
    <Modal>
      <ThemedView
        style={[
          styles.container,
          {
            paddingTop: Platform.OS === "ios" ? insets.top : 0,
            paddingBottom: Platform.OS === "ios" ? insets.bottom : 0,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        {/* Modal content */}
      </ThemedView>
    </Modal>
  );
};
```

### 5.5 Performance Optimizations

1. Web-specific:

   - Use `useIsomorphicLayoutEffect` for SSR compatibility
   - Implement lazy loading for date picker components
   - Use CSS transitions for smooth animations
   - Optimize bundle size with code splitting

2. Native-specific:
   - Use native date picker components for better performance
   - Implement proper cleanup in useEffect hooks
   - Use `react-native-reanimated` for smooth animations
   - Optimize modal transitions

### 5.6 Testing Requirements

1. Cross-platform testing:

   - Test on iOS devices (different sizes)
   - Test on Android devices (different versions)
   - Test on web browsers (desktop and mobile)
   - Verify date handling across timezones

2. Responsive testing:

   - Test different screen sizes
   - Test orientation changes
   - Test with different font sizes
   - Test with different device settings

3. Accessibility testing:
   - Test screen readers on all platforms
   - Verify keyboard navigation on web
   - Test color contrast ratios
   - Verify ARIA attributes on web

### 5.7 Error Handling

Implement platform-specific error handling:

```typescript
const handleDateError = (error: Error) => {
  if (Platform.OS === "web") {
    // Web-specific error handling
    Toast.show({
      type: "error",
      text1: "Date Selection Error",
      text2: error.message,
      position: "bottom",
      visibilityTime: 3000,
      // Web-specific styling
      style: styles.webToast,
    });
  } else {
    // Native-specific error handling
    Alert.alert("Date Selection Error", error.message, [{ text: "OK", onPress: () => console.log("OK Pressed") }]);
  }
};
```

## Implementation Order

1. Database Updates

   - Update trigger function
   - Test database changes

2. Hydration-Safe Components

   - Create ClientOnlyPaidInLieuModal
   - Create ClientOnlyDatePicker wrapper
   - Implement safe date handling functions

3. UI Updates

   - Add date picker to modal
   - Add date validation
   - Update styles and layout

4. Hook Updates

   - Update requestPaidInLieu function
   - Add date validation logic
   - Implement safe date handling

5. Testing
   - Test SSR behavior
   - Verify hydration
   - Run all test cases
   - Fix any issues found
   - Document any edge cases discovered

## Rollback Plan

1. Database

   - Keep old trigger function as backup
   - Create rollback migration

2. UI
   - Keep old modal code in comments initially
   - Remove after successful testing
   - Keep hydration-safe wrappers for future use

## Notes

- All UI changes should maintain existing theme and styling
- Error messages should be user-friendly and clear
- Real-time updates should continue to work as expected
- Performance impact should be minimal
- Hydration safety is critical for cross-platform compatibility
- Use existing patterns from the codebase for consistency
- Ensure all accessibility features work across platforms
- Test with screen readers on all supported platforms
- Validate date handling in different timezones
- All UI components should maintain consistent behavior across platforms while respecting platform-specific conventions
- Use existing cross-platform components from our codebase
- Maintain consistent theming and styling across platforms
- Ensure proper handling of platform-specific gestures and interactions
- Follow platform-specific accessibility guidelines
- Test thoroughly on all supported platforms and form factors
