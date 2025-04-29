# Routing System Refactoring Plan

## Current State Analysis

Our application currently uses a hybrid routing approach:

- File-based routing through the Expo Router file structure
- Explicit route declaration using `Stack.Screen` in the root `_layout.tsx`
- Imperative navigation in some components (using `router.replace()`)
- Authentication-based navigation handled by a custom `NavigationHandler` component

Issues with the current approach:

- Duplication of route declarations (both in file system and explicit Stack.Screen)
- Potential conflicts between file-based routing and explicit route declarations
- Difficulty in maintaining consistent route behavior across the app
- Unclear navigation patterns for authentication flows

## Refactoring Goals

1. Properly leverage Expo Router's file-based routing
2. Use nested `_layout.tsx` files for route group configurations
3. Implement consistent, declarative navigation patterns
4. Preserve special handling for critical routes (company-admin, member-association)
5. Maintain correct authentication flows

## Implementation Phases

### Phase 1: Document Current Routing Structure

1. Map all existing routes and their relationships
2. Identify which routes require special handling
3. Document current navigation patterns and dependencies

### Phase 2: Establish Proper Layout Structure

1. Refactor root `_layout.tsx` to serve as the application's base layout
2. Create proper nested `_layout.tsx` files for each route group
3. Define appropriate screen options and animations in the correct layout files

### Phase 3: Authentication Flow Refactoring

1. Maintain the current auth state management in `useAuth.tsx`
2. Replace the current `NavigationHandler` with proper route guards
3. Implement protected routes pattern using `Redirect` component
4. Ensure critical pages (member-association, company-admin) maintain their functionality

### Phase 4: Special Cases Implementation

1. Handle company-admin page as a special case with its custom layout
2. Ensure member-association page authentication flow works correctly
3. Implement proper navigation handling for one-time flows (password reset)

### Phase 5: Cleanup and Testing

1. Remove unnecessary `Stack.Screen` declarations
2. Test all navigation flows thoroughly
3. Verify authentication routing under all possible states
4. Document the new routing architecture

## Detailed Implementation Plan

### Phase 1: Detailed Steps

1. **Root Layout (`app/_layout.tsx`)**

   - Simplify to provide basic app structure
   - Remove explicit route declarations for routes handled by the file system
   - Maintain authentication state provider and theme provider
   - Implement a simplified route guard for authentication

   ```tsx
   // Simplified example
   export default function RootLayout() {
     return (
       <GestureHandlerRootView style={styles.container}>
         <ThemeProvider>
           <AuthProvider>
             <AuthAwareRouteHandler />
           </AuthProvider>
         </ThemeProvider>
       </GestureHandlerRootView>
     );
   }

   function AuthAwareRouteHandler() {
     // Basic navigation guard
     const { authStatus } = useAuth();
     const segments = useSegments();
     const pathname = usePathname();

     // Render app content or loading screen
     return authStatus === "loading" ? <LoadingScreen /> : <Slot />;
   }
   ```

2. **Auth Group Layout (`app/(auth)/_layout.tsx`)**

   - Create proper layout for auth routes
   - Implement route guards specific to auth routes
   - Handle redirects for authenticated users

   ```tsx
   export default function AuthLayout() {
     const { authStatus } = useAuth();

     // Protect against authenticated users accessing auth pages
     if (authStatus === "signedInMember") {
       return <Redirect href="/(tabs)" />;
     }

     if (authStatus === "signedInAdmin") {
       return <Redirect href="/company-admin" />;
     }

     // Special case for member-association
     const segments = useSegments();
     if (authStatus === "needsAssociation" && segments[1] !== "member-association") {
       return <Redirect href="/member-association" />;
     }

     return <Stack />;
   }
   ```

3. **Tabs Group Layout (`app/(tabs)/_layout.tsx`)**

   - Implement proper tab navigation
   - Protect against unauthenticated users

   ```tsx
   export default function TabsLayout() {
     const { authStatus } = useAuth();

     // Protect against unauthenticated users
     if (authStatus === "signedOut" || authStatus === "needsAssociation") {
       return <Redirect href="/sign-in" />;
     }

     // Tab configuration stays the same
     return <Tabs>{/* Tab screens */}</Tabs>;
   }
   ```

4. **Company Admin Layout (`app/company-admin/_layout.tsx`)**

   - Create special handling for company admin
   - Implement admin-specific route guards

   ```tsx
   export default function CompanyAdminLayout() {
     const { authStatus, isCompanyAdmin } = useAuth();

     // Protect against non-admin users
     if (!isCompanyAdmin || authStatus !== "signedInAdmin") {
       return <Redirect href="/sign-in" />;
     }

     return <Stack />;
   }
   ```

### Phase 2: Special Case Handler Implementation

1. **Member Association Handling**

   - Ensure the member-association route behaves correctly
   - Implement proper redirects based on authentication state

2. **Password Reset Flow**

   - Establish correct handling of password reset flow
   - Implement proper state management for reset process

3. **Index Route Handling**
   - Configure the root index route to redirect appropriately

### Phase 3: Navigation Consistency

1. **Replace Imperative Navigation**

   - Replace `router.replace()` calls with declarative `<Link>` and `<Redirect>` components
   - Use the `href` prop for all navigation

2. **Refine Auth-Based Redirects**
   - Implement consistent rules for redirects based on auth states
   - Document these rules for future reference

### Phase 4: Testing & Verification

1. **Authentication State Transitions**

   - Test all possible state transitions
   - Verify correct routing behavior in each state

2. **Deep Linking**

   - Test deep linking to various routes
   - Ensure auth protection works with direct URL access

3. **Edge Cases**
   - Test behavior during loading states
   - Test navigation during authentication processes

## File Structure Changes

The refactored structure will focus on leveraging the file system:

```
app/
├── _layout.tsx              # Root layout (minimal)
├── index.tsx                # Root index (simple redirect)
├── (auth)/                  # Auth group
│   ├── _layout.tsx          # Auth group layout
│   ├── sign-in.tsx
│   ├── sign-up.tsx
│   ├── forgot-password.tsx
│   └── member-association.tsx
├── company-admin/           # Admin section
│   ├── _layout.tsx          # Admin layout
│   └── index.tsx            # Admin dashboard
├── (tabs)/                  # Main app tabs
│   ├── _layout.tsx          # Tabs configuration
│   ├── index.tsx            # Home tab
│   └── [other tab files]
├── change-password.tsx      # Password reset page
└── [other route groups]     # Other sections
```

## Migration Approach

We will implement this refactoring incrementally:

1. First establish the new layout structure
2. Implement route guards in each layout
3. Test each section thoroughly before moving on
4. Gradually remove the old navigation system
5. Test the entire application after each significant change

This approach minimizes disruption and ensures we can roll back if issues are encountered.

## Special Considerations

1. **Authentication State Management**

   - The `useAuth` hook will continue to manage auth state
   - Layout files will consume this state for routing decisions

2. **Preserving Critical Flows**

   - Member association flow will be preserved with special attention
   - Company admin access will maintain its security requirements

3. **Backward Compatibility**
   - During transition, maintain compatibility with existing code
   - Gradually phase out old patterns as new ones are established

# Implementation Progress

## Phase 1, 2 & 3: Completed

We have successfully refactored the core routing structure:

1. **Root Layout (`app/_layout.tsx`)**

   - Simplified to use Expo Router's built-in `Slot` component
   - Removed explicit route declarations
   - Implemented an `AuthAwareRouteHandler` component for centralized auth-based routing
   - Maintained authentication state provider

2. **Auth Group Layout (`app/(auth)/_layout.tsx`)**

   - Updated to use proper route guards
   - Implemented redirects for authenticated users
   - Correctly configured Stack navigation for auth screens

3. **Company Admin Section**

   - Created a proper directory structure: `app/company-admin/`
   - Added a layout file with strict admin-only access control: `app/company-admin/_layout.tsx`
   - Moved the admin screen content to `app/company-admin/index.tsx`
   - Updated imports and navigation patterns

4. **Root Index (`app/index.tsx`)**

   - Implemented proper redirects based on auth status
   - Ensures users land on the correct screen based on their authentication state

5. **Member Association Page**

   - Updated to use declarative navigation with `Redirect`
   - Replaced imperative `router.replace()` with React state-based redirects
   - Maintained the same association flow functionality

6. **Password Reset Flow**

   - Updated the change-password page to use declarative navigation
   - Created a root-level change-password redirect for the password reset flow
   - Ensured proper handling of password reset URLs and state

7. **Removed Imperative Navigation**
   - Replaced all instances of imperative `router.replace()` with declarative `Redirect`
   - Maintained the same user experience with improved code structure

## Next Steps

1. Test all authentication flows
2. Ensure deep linking works correctly
3. Validate member association process
4. Document the new routing architecture for future reference

## Completion Status

- ✅ Phase 1: Document Current Routing Structure
- ✅ Phase 2: Establish Proper Layout Structure
- ✅ Phase 3: Authentication Flow Refactoring
- ⏳ Phase 4: Special Cases Implementation (Partially completed)
- ⏳ Phase 5: Cleanup and Testing

## Remaining Components to Review

- Password reset flow
- Member association page
- Verify other route groups follow the correct pattern
