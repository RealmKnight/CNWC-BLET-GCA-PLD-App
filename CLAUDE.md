# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm start` - Start Expo development server
- `npm run android` - Run on Android device/emulator
- `npm run ios` - Run on iOS device/simulator  
- `npm run web` - Run in web browser
- `npm run reset-project` - Reset project to clean state

### Testing
- `npm test` or `vitest` - Run tests with Vitest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report
- `npm run test:ui` - Open Vitest UI

### Quality Assurance
- `npm run lint` - Run ESLint via Expo's linter
- Always run linting before commits - project uses strict TypeScript and code quality standards

## Architecture Overview

### Technology Stack
- **Frontend**: React Native + Expo (v52) with TypeScript
- **Navigation**: Expo Router with file-based routing
- **State Management**: Zustand stores + Supabase realtime synchronization
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Styling**: Styled components inspired by shadcn/ui with dark mode support
- **Testing**: Vitest + Jest + React Native Testing Library

### Project Structure
```
app/                    # File-based routing (Expo Router)
├── (admin)/           # Admin panel routes (division, union, application)
├── (auth)/            # Authentication flows  
├── (tabs)/            # Main tab navigation
├── (profile)/         # User profile management
└── (feature-groups)/ # Feature-specific route groups

components/            # Reusable UI components
├── admin/            # Admin-specific components
├── modals/           # Modal dialogs
└── ui/               # Common UI components

store/                # Zustand state management
├── userStore.ts      # User identity & authentication
├── notificationStore.ts # User messages & communications  
├── announcementStore.ts # Organization announcements
├── calendarStore.ts  # PLD/SDV request calendar
├── timeStore.ts      # Personal time management
└── [others].ts       # Feature-specific stores

hooks/                # Custom React hooks
utils/                # Utility functions and services
types/                # TypeScript definitions
```

### State Management Architecture

**Hybrid Zustand + Supabase Realtime Pattern:**
- Zustand provides instant local UI updates and caching
- Supabase realtime ensures cross-user synchronization  
- Each domain (notifications, calendar, time tracking) has dedicated stores
- Stores are initialized through `useAuth` hook after authentication
- Event-driven communication between stores via StoreEventManager

**Key Store Responsibilities:**
- `userStore`: Member profile, role, division, phone verification status
- `notificationStore`: User messages with badge integration and realtime updates
- `announcementStore`: Division/union announcements with read tracking
- `calendarStore`: PLD/SDV requests with 48-hour rules and allotment management
- `timeStore`: Year-aware time calculations with cross-store event listening
- `badgeStore`: Device badge synchronization across platforms

### Authentication & Authorization
- Multi-status auth: "loading" → "signedOut" → "needsAssociation" → "signedInMember/Admin"
- Role-based access control via Supabase RLS policies
- Context-aware routing with NavigationGuard component
- Store initialization orchestrated by authentication state

### Platform-Specific Features
- **Mobile**: Push notifications, device badges, haptic feedback, native PDF viewing
- **Web**: Fallback UI patterns, polling instead of some realtime features
- **Cross-platform**: Shared business logic with platform-specific implementations

## Development Guidelines

### Code Style (from .cursorrules)
- TypeScript with strict mode, prefer interfaces over types
- Functional programming patterns, avoid classes  
- Use descriptive variable names with auxiliary verbs (isLoading, hasError)
- File structure: exported component → subcomponents → helpers → types
- Lowercase with dashes for directories (auth-wizard)

### UI & Styling
- Use Expo's built-in components for common patterns
- Responsive design with Flexbox and useWindowDimensions
- SafeAreaProvider/SafeAreaView for proper safe area handling
- Dark mode support via useColorScheme
- High accessibility standards with ARIA roles

### State Management Best Practices
- Minimize useState/useEffect, prefer Zustand + Supabase pattern
- Initialize stores only after authentication
- Use optimistic updates for immediate UI feedback
- Handle realtime subscription cleanup on unmount/logout
- Implement proper error boundaries and retry logic

### Performance Optimization
- Memoize components with useMemo/useCallback appropriately
- Implement code splitting with React Suspense
- Use WebP images with lazy loading
- Profile performance with React Native's built-in tools
- Year-aware caching for time calculations to reduce API calls

### Security & Validation
- Use Zod for runtime validation and error handling
- Sanitize user inputs to prevent XSS
- Use expo-secure-store for sensitive data
- Follow Supabase RLS policies for data access control
- Never commit sensitive information (API keys, tokens)

### Testing Strategy
- Unit tests with Vitest for utilities and hooks
- Component tests with React Native Testing Library
- Focus on critical user flows and business logic
- Snapshot testing for UI consistency where appropriate

### Common Patterns

**Realtime Subscriptions:**
```typescript
// Always check for valid session before creating channels
const channel = supabase
  .channel('feature-updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public', 
    table: 'table_name',
    filter: `user_id=eq.${userId}`
  }, handleChange)
  .subscribe(createRealtimeCallback('FeatureName', onError, onSuccess));

// Always cleanup subscriptions
return () => supabase.removeChannel(channel);
```

**Store Initialization:**
```typescript
// Initialize stores after authentication in priority order
// 1. User store (core identity)
// 2. Notification store (high priority for UX)  
// 3. Feature stores (calendar, time, etc.)
// 4. Admin stores (if applicable)
```

**Cross-Platform Components:**
```typescript
// Use platform-specific extensions: Component.native.tsx, Component.web.tsx
// Fallback to base Component.tsx for shared logic
```

### Supabase Integration
- Global MCP server available for database operations
- Edge Functions for server-side logic (notifications, webhooks, processing)
- RLS policies enforce authorization at database level
- Use database functions for complex queries and calculations
- Realtime subscriptions with proper error handling and reconnection

### Common Pitfalls to Avoid
- Don't create realtime subscriptions without proper cleanup
- Don't initialize stores before authentication is confirmed
- Don't forget platform-specific handling for push notifications
- Don't bypass Zod validation for user inputs
- Don't commit without running linting - strict quality standards enforced