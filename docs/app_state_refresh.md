# App-State Refresh & Realtime Resilience Plan

## Overview

When the app returns to the foreground after being backgrounded for more than ~1 hour the Supabase access-token is often expired. Opening or maintaining Realtime channels with this stale JWT produces the user-visible error:

> "realtime failed to connect (unspecified/unknown error)"

We will implement a foreground-resume refresh flow and harden channel management so that:

1. The session is refreshed **before** any network traffic using the JWT.
2. Existing Realtime sockets receive the new token.
3. New channels are only created when a valid token is present.
4. Errors are handled gracefully with automatic retry.

## Clarified Requirements (2025-06-19)

The customer confirmed:

1. **Platforms:** Native _and_ PWA must be covered – web tabs do not suspend timers but still need network-reconnect logic.
2. **SDK Upgrade:** Acceptable provided no breaking changes.
3. **Channel Locations:** Majority live in store files; additional matches found via search (see list below).
4. **Network Connectivity:** When device regains connectivity we must refresh the session before opening/resuming channels.

---

## Updated Plan

### Phase 0 – Prep / Audit

- [ ] Upgrade `@supabase/supabase-js` → latest **minor** (≥ 2.39).
- [ ] Enumerate every `supabase.channel()` call. Current grep results:
  - `store/calendarStore.ts`
  - `store/timeStore.ts`
  - `store/vacationCalendarStore.ts`
  - `store/notificationStore.ts`
  - `components/admin/pld-sdv/PldSdvSection.tsx`
  - `components/admin/vacation/VacationSection.tsx`
  - `components/ui/EmailAlertsBadge.tsx`
  - `app/_layout.tsx`
  - _(plus any future occurrences; CI lint rule will enforce wrapper usage)_

### Phase 1 – Cross-Platform Session Refresh

1. **utils/connectivity.ts** _(new)_
   - Expose `onReachabilityChange(cb)` which on RN uses `@react-native-community/netinfo`, on web uses `window.addEventListener("online|offline")`.
2. **hooks/useAuth.tsx**
   - _Foreground_ handler: `await refreshSessionIfNeeded()` (retry x3).
   - _Background_ handler: `supabase.realtime.removeAllChannels()`.
   - _Network-online_ handler: if `navigator.onLine === true` AND token is stale → refresh + reopen necessary channels (emit custom event that stores listen for).

### Phase 2 – Token Propagation to Realtime

1. **utils/supabase.ts** – one-time listener:

   ```ts
   supabase.auth.onAuthStateChange((evt, sess) => {
     if (evt === "TOKEN_REFRESHED" && sess?.access_token) {
       supabase.realtime.setAuth(sess.access_token);
     }
   });
   ```

   Ensures open sockets keep working.

### Phase 3 – Guarded Channel Wrapper

1. Introduce a small wrapper (`utils/realtime.ts`):

   ```ts
   export async function createRealtimeChannel(name: string) {
     await refreshSessionIfNeeded();
     return supabase.channel(name);
   }
   ```

2. Update every direct `supabase.channel(` call to use the wrapper:
   - `store/calendarStore.ts`
   - `store/timeStore.ts`
   - `store/adminCalendarManagementStore.ts` (if any)
   - Any Modal/components that open temp channels (search codebase).

### Phase 4 – Auto Retry & UX improvements

1. Central `utils/realtime.ts` adds `attachErrorHandlers(channel)` which listens for
   - `CHANNEL_ERROR` with `InvalidJWTToken` → refresh & `channel.resubscribe()`.
   - `NETWORK_ERROR` → wait for connectivity event then resubscribe (via connectivity util).
2. **User feedback**

   - Leverage existing `components/ThemedToast.tsx`:

     ```ts
     Toast.show({
       type: "info",
       text1: "Reconnecting…",
       text2: "Restoring real-time updates",
     });
     ```

   - Hide toast on successful `channel.on('SUBSCRIBED')`.
   - Optional banner variant for web where toast position might overlap PWA install bar.

3. Consider small (≈ 2 s) grace delay after foreground before opening first channel to guarantee token refresh. (Configurable constant.)

### Phase 5 – Testing

- Unit test `refreshSessionIfNeeded` with mock clock.
- E2E (Detox) scenario: background 65 min → foreground → expect silent reconnect.
- Web: offline 70 min then online.

## Revised File-Change Checklist

| File                                   | Change (summary)                                          |
| -------------------------------------- | --------------------------------------------------------- |
| `package.json`                         | bump `@supabase/supabase-js`                              |
| `utils/supabase.ts`                    | helper `refreshSessionIfNeeded`, onAuthState listener     |
| `utils/connectivity.ts` _(new)_        | cross-platform online/offline callbacks                   |
| `utils/realtime.ts` _(new or updated)_ | `createRealtimeChannel`, `attachErrorHandlers`            |
| `hooks/useAuth.tsx`                    | enhanced AppState & connectivity logic                    |
| Stores & components listed above       | use wrapper instead of raw `supabase.channel`             |
| Toast / notification utility           | optional reconnect banner                                 |
| `eslint` config                        | rule banning direct `supabase.channel(` except in wrapper |

## Open Points

1. **Grace period** – is a 2 s delay sufficient/acceptable on foreground before reconnect? (Defaults to constant we can tweak.)
2. Any other UX guidance/messages desired beyond toast?

_Answer these if further clarification is needed; otherwise the plan is ready for implementation._

### Progress Update (Phase 1-4 completed)

- [x] Added `refreshSessionIfNeeded` and token listeners in `utils/supabase.ts`.
- [x] Added cross-platform connectivity util.
- [x] Added Realtime wrapper + toast & auto-retry.
- [x] Replaced raw `supabase.channel` in:
      • `store/calendarStore.ts`
      • `store/vacationCalendarStore.ts`
      • `store/notificationStore.ts`
      • `components/ui/EmailAlertsBadge.tsx`
      • `components/admin/vacation/VacationSection.tsx`
      • `components/admin/pld-sdv/PldSdvSection.tsx`
- [x] All affected subscription helpers converted to `async` and call-sites updated (`hooks/useAuth.tsx`).
- [x] Installed `@react-native-community/netinfo`.
- [x] Added ESLint `no-restricted-syntax` rule to forbid raw `supabase.channel` uses.

Pending

- [ ] Run linter/build to surface any remaining direct calls (rule will flag).
- [ ] Manual QA on native & PWA (user).
- [ ] Code review before proceeding to Phase 5.
