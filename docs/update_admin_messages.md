# Admin Messages: Division-Specific Targeting & Per-User Read Status Plan

## 1. Goals

1. Modify the admin messaging system so that messages intended for the `division_admin` role can be targeted to **all, multiple, or single specific divisions**, selected by the sender.
2. Implement **per-user read status tracking** for admin messages, ensuring notification badges accurately reflect only messages unread by the currently logged-in user.
3. Provide **role-based viewing access** in the Admin Messages UI:
   - `division_admin`: Automatically sees messages relevant to their assigned division.
   - `application_admin`, `union_admin`: Can select a specific division to view messages using a `DivisionSelector`, defaulting to their own assigned division (if any) or the first available division alphabetically.
4. Ensure the `adminNotificationStore` (for unread message count and badges) is initialized and its Supabase realtime subscription is established immediately upon application startup after user authentication, reflecting the accurate per-user unread count _for their default view_.

## 2. Affected Areas & Required Changes

Implementing these features requires modifications across the database schema, RLS policies, backend services/functions, frontend UI components, state management, and core authentication logic.

- **Database (`admin_messages` Table):**

  - **Schema Change (Division Targeting):** Add a new column, `recipient_division_ids` (Type: `UUID[]`, Nullable: Yes, Default: `{}`). This will store the `id`s of the specific divisions targeted _when_ `recipient_roles` contains `'division_admin'`.
  - **Schema Change (Read Status):** Remove the existing `is_read` (boolean) and `read_by` (uuid[]) columns, as they will be replaced by the new junction table.
  - **Indexes (Division Targeting):** Consider if a GIN index on `recipient_division_ids` is necessary.

- **Database (NEW `admin_message_read_status` Table):**

  - **Schema:** Create a new junction table:
    - `message_id` (Type: `UUID`, Foreign Key -> `admin_messages.id`, Part of Composite Primary Key)
    - `user_id` (Type: `UUID`, Foreign Key -> `auth.users.id`, Part of Composite Primary Key)
    - `read_at` (Type: `TIMESTAMPTZ`, Default: `now()`)
  - **Primary Key:** Composite key on (`message_id`, `user_id`).
  - **Indexes:** Ensure indexes are created on `message_id` and `user_id` individually if needed for specific query patterns (besides the PK index).

- **Database (RLS Policies):**

  - **`SELECT` Policy (`admin_messages`):**
    - Modify the primary SELECT policy (`Allow access based on effective role or sender`) for division targeting as previously outlined (check `recipient_division_ids`).
    - This policy **does not** need to filter based on read status directly; filtering unread messages will happen in specific queries (e.g., for badge counts) using the `admin_message_read_status` table.
  - **`UPDATE` Policy (`admin_messages`):** Modify for division targeting checks.
  - **NEW Policies (`admin_message_read_status`):**
    - **`SELECT` Policy:** Allow users to select read statuses for messages they are allowed to see (JOIN with `admin_messages` RLS check) or perhaps just their own read statuses (`user_id = auth.uid()`).
    - **`INSERT` Policy:** Allow a user to insert a record (`user_id = auth.uid()`) only if they have `SELECT` access to the corresponding `message_id` in `admin_messages`. This prevents marking messages they shouldn't see as read.
    - **`DELETE` Policy:** (Optional) If users should be able to un-mark messages, allow deletion only for their own records (`user_id = auth.uid()`).
    - **`UPDATE` Policy:** Likely not needed if only `read_at` is captured on insert.

- **Database (Functions/RPC):**

  - **NEW RPC:** Create a function `mark_admin_message_read(message_id_to_mark UUID)`.
    - This function should perform an `INSERT INTO admin_message_read_status (message_id, user_id) VALUES (message_id_to_mark, auth.uid()) ON CONFLICT DO NOTHING;`
    - It relies on RLS on `admin_message_read_status` to enforce permissions.

- **Backend Service (`utils/notificationService.ts`):**

  - `sendAdminMessage`:
    - Update signature to accept an optional `targetDivisionIds: string[]` parameter.
    - Modify insertion logic: If `recipient_roles` includes `'division_admin'`, store the provided `targetDivisionIds` in the `recipient_division_ids` column. If `targetDivisionIds` is empty or null (representing "All"), store an empty array `{}`.
  - `replyToAdminMessage`: Update for division targeting propagation (ensure replies stay within the original target divisions if applicable).

- **State Management (`store/adminNotificationStore.ts`):**

  - **State:** Add `isAdminInitialized: boolean`, `unreadCount: number`, `viewingDivisionId: string | null` (tracks the division selected by higher admins, null for division admins or potentially 'all').
  - **Initialization:** `initializeAdminNotifications` action needs to:
    - Determine the user's role and assigned division.
    - Fetch the initial unread count based on the _default_ view (assigned division for all admins, or first division if higher admin has no assigned one). The query needs to check `admin_message_read_status`.
    - Set up the realtime subscription, potentially filtered by the default division view initially.
  - **Actions:**
    - Add `setViewDivision(divisionId: string | null)` action for higher admins to change the division filter.
    - Modify fetching logic (or add new fetch action like `fetchMessagesForDivision`) to query messages based on the `viewingDivisionId`. The query must check RLS _and_ filter by `recipient_division_ids` appropriately (i.e., show messages where `recipient_division_ids` is empty OR contains the `viewingDivisionId`).
    - `markMessageAsRead(messageId: string)`: Calls the RPC.
  - **Subscription Handling:** Realtime updates might need to be smarter – either subscribe broadly and filter client-side based on `viewingDivisionId` (simpler subscription, more client work) or manage specific subscriptions per viewed division (more complex subscription management).
  - **Cleanup:** `cleanupAdminNotifications` needs to unsubscribe and reset state.

- **Authentication Hook (`hooks/useAuth.tsx`):**

  - **Initialization Logic:** Call `initializeAdminNotifications` in `updateAuthState`.
  - **Cleanup Logic:** Add `adminNotificationStore` cleanup to `runCleanupActions`.

- **Frontend UI (`components/modals/ContactAdminModal.tsx`):**

  - **State:** Add state `targetDivisionIds: string[]`.
  - **Data Fetching:** Fetch list of available divisions (IDs and names).
  - **UI Element:**
    - Add a multi-select component (e.g., dropdown with checkboxes, list) for selecting target divisions.
    - Display division _names_ to the user.
    - This component should only be visible/enabled when the "Division Admin" role is selected in the "To:" section.
    - Include an "All Divisions" option (which maps to an empty `targetDivisionIds` array).
  - **Handler (`handleSend`):** Pass the `targetDivisionIds` state to the `sendAdminMessage` function.

- **Frontend UI (Admin Views - `AdminMessages.tsx`, `AdminMessageSection.tsx`, Detail Views):**
  - **Integration (`AdminMessages.tsx`):**
    - Import `DivisionSelector`, `useEffectiveRoles`, `useUserStore`.
    - Get current user's roles and assigned `division_id`.
    - Determine if the user is `application_admin` or `union_admin`.
    - Add state `selectedDivision` initialized based on role/assigned division (defaulting to first alphabetical if no assigned division for higher admins).
    - Render `DivisionSelector` conditionally for higher admins, updating the `selectedDivision` state and calling `adminNotificationStore.setViewDivision()`.
    - Display the currently viewed division clearly.
  - **Data Fetching/Display:** Ensure the message list reflects the data filtered by the store based on the selected division (or user's assigned division).
  - **Mark as Read Trigger:** Call `markMessageAsRead` when a message detail is viewed.
  - **Badging:** Ensure badge components consume `unreadCount` from the store (reflecting the current view).
  - **UI Indicators:** (Optional) Show visual read/unread indicators.

## 3. Implementation Phases

**Note:** All database modifications (schema changes, RLS policies, RPC functions) in the following phases will be implemented using the available Supabase Management tools (`mcp_supabase_...`).

1. **Phase 1: Database Modifications (Schema)**

   - [x] Define and write migration script content for:
     - Adding `recipient_division_ids UUID[]` to `admin_messages`.
     - Creating the `admin_message_read_status` table (message_id, user_id, read_at) with composite PK and FKs.
     - Removing `is_read` and `read_by` columns from `admin_messages`.
   - [x] Determine necessary indexes (GIN on `recipient_division_ids`? Indexes on junction table FKs?).
   - [x] Apply schema changes using `mcp_supabase_execute_postgresql`.

2. **Phase 2: Database Modifications (RPC & RLS)**

   - [x] Create `mark_admin_message_read(message_id_to_mark UUID)` RPC function using `mcp_supabase_execute_postgresql`.
   - [x] Update `SELECT` and `UPDATE` RLS policies on `admin_messages` for division targeting using `mcp_supabase_execute_postgresql`.
   - [x] Create `SELECT`, `INSERT`, (optional `DELETE`) RLS policies for `admin_message_read_status` using `mcp_supabase_execute_postgresql`.
   - [x] Thoroughly test RLS and RPC changes (may involve test queries via tools or UI testing).

3. **Phase 3: `adminNotificationStore` Updates (Read Status, Division Filter & Early Init)**

   - [x] Add `isAdminInitialized`, `unreadCount`, `viewingDivisionId` state.
   - [x] Implement `initializeAdminNotifications` action:
     - Determine user role/assigned division.
     - Fetch initial unread count for the _default_ view using `NOT EXISTS` check and division logic.
     - Set up initial realtime subscription (consider broad vs specific).
     - Store cleanup function.
   - [x] Implement `setViewDivision(divisionId)` action.
   - [x] Implement/Modify message fetching logic to incorporate `viewingDivisionId` filter (checking `recipient_division_ids`).
   - [x] Implement `markMessageAsRead(messageId)` action calling the RPC.
   - [x] Implement `cleanupAdminNotifications` action.

4. **Phase 4: `useAuth` Hook Updates (Trigger Early Init)**

   - [x] Modify `hooks/useAuth.tsx`:
     - Call `initializeAdminNotifications` (which now handles default view) in `updateAuthState`.
     - Store cleanup ref.
     - Add cleanup call to `runCleanupActions`.

5. **Phase 5: Backend Service Updates (Division Targeting)**

   - [x] Modify `sendAdminMessage` signature and logic in `utils/notificationService.ts` to accept and store `targetDivisionIds`.
   - [x] Modify `replyToAdminMessage` logic in `utils/notificationService.ts` to handle division targeting context.

6. **Phase 6: Frontend Modal (`ContactAdminModal`) Updates (Division Targeting)**

   - [x] Implement fetching of division list (names and IDs).
   - [x] Add state for `targetDivisionIds`.
   - [x] Add conditional multi-select UI for divisions (displaying names, storing IDs), including "All Divisions" option.
   - [x] Update `handleSend` to pass `targetDivisionIds` to `sendAdminMessage`.

7. **Phase 7: Frontend Admin View Updates (`AdminMessages.tsx` - Division Selector & Read Status)**

   - [x] Integrate `DivisionSelector` conditionally based on user role (`application_admin`, `union_admin`).
   - [x] Initialize and manage `selectedDivision` state (handle default logic), calling `setViewDivision` on change.
   - [x] Ensure message list uses data filtered by the store based on role/selected division.
   - [x] Implement calling `markMessageAsRead` on message view.
   - [x] Ensure badges use `unreadCount` from store (reflecting current view).
   - [x] (Optional) Add visual read/unread indicators.

8. **Phase 8: End-to-End Testing**
   - [ ] **Test Division Targeting (Sending):** Verify sending to "All", single, and multiple divisions works. Verify only relevant division admins receive targeted messages. Verify non-targeted division admins _do not_ see the message.
   - [ ] **Test Role Views:** Verify `division_admin` sees only their division. Verify higher admins see the selector, can switch divisions, and the message list updates correctly. Test default division view.
   - [ ] **Test Read Status:** Verify badges show correct unread count per user _for the current view_. Verify count decreases when messages are read. Test marking read.
   - [ ] **Test Early Init:** Verify badges update correctly on startup _for the default view_.
   - [ ] Test interaction with acknowledgment flags.

---
