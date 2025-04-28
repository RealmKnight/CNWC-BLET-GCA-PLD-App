# Admin Messages: Division-Specific Targeting Plan

## 1. Goal

Modify the admin messaging system so that messages intended for the `division_admin` role are targeted to specific divisions, rather than being broadcast to all division admins. Members and other admins should be able to select one or more specific divisions when sending a message to the "Division Admin" role.

## 2. Affected Areas & Required Changes

Implementing this feature requires modifications across the database schema, RLS policies, backend services, and frontend UI components.

- **Database (`admin_messages` Table):**
  - **Schema Change:** Add a new column, likely `recipient_division_ids` (Type: `UUID[]`, Nullable: Yes, Default: `{}`). This will store the `id`s of the specific divisions targeted _when_ `recipient_roles` contains `'division_admin'`.
  - **Indexes:** Consider if an index on `recipient_division_ids` (GIN index) is necessary for performance, depending on query patterns.
- **Database (RLS Policies):**
  - **`SELECT` Policy:** The primary SELECT policy (`Allow access based on effective role or sender`) needs modification. For rows where `recipient_roles` contains `'division_admin'`, the policy must _also_ check if the _currently logged-in user's_ `division_id` (fetched from `public.members`) is present in the `recipient_division_ids` array. Users should only see division-specific messages if they are an admin _of that specific division_.
  - **`UPDATE` Policy:** Similarly, the UPDATE policy might need adjustment to ensure only admins of the relevant division (or the sender) can update fields like `read_by` for division-specific messages.
- **Database (Functions):**
  - `get_my_effective_roles()`: This function likely **does not** need changes. RLS policies can fetch the user's division ID directly when needed.
- **Backend Service (`utils/notificationService.ts`):**
  - `sendAdminMessage`:
    - Update function signature to accept an optional `targetDivisionIds: string[]` parameter.
    - Modify insertion logic: If `recipient_roles` includes `'division_admin'`, store the provided `targetDivisionIds` in the `recipient_division_ids` column.
  - `replyToAdminMessage`:
    - Logic needs refinement. When replying to a thread originally sent to specific divisions, the reply should likely only target those same divisions (and the original sender/other roles). It needs to fetch the `recipient_division_ids` from the parent or root message.
- **Frontend UI (`components/modals/ContactAdminModal.tsx`):**
  - **State:** Add state to manage selected target division IDs.
  - **Data Fetching:** Need a mechanism to fetch the list of available divisions (ID and name) to populate the selector. This might involve a new helper function or store action.
  - **UI Element:** Implement a division selector (e.g., multi-select dropdown, checklist). This selector should only be visible/enabled when the "Division Admin" role is selected in the "To:" section.
  - **Handler (`handleSend`):** Pass the selected division IDs to the `sendAdminMessage` function when applicable.
- **Frontend UI (Admin Views - `AdminMessages.tsx`, `AdminMessageSection.tsx`):**
  - **(Optional) Filtering:** Consider adding filters to allow admins (especially Company Admins) to filter messages by the target division.
  - **(Optional) Display:** Consider displaying the target division(s) in the message list or detail view for clarity.
- **State Management (`store/adminNotificationStore.ts`):**
  - Likely no major changes required, as RLS should handle filtering the messages correctly before they reach the store. Actions might need minor adjustments if new filtering UI is added.

## 3. Implementation Phases

1. **Phase 1: Database Modifications**
   - [ ] Define the exact schema change (add `recipient_division_ids UUID[]`).
   - [ ] Update necessary indexes (if any).
   - [ ] Write and test the SQL migration script.
   - [ ] Apply migration to the database.
2. **Phase 2: RLS Policy Updates**

   - [ ] Rewrite the `SELECT` policy for `admin_messages` to include the division check:

     ```sql
     -- Pseudo-logic outline for SELECT policy USING clause:
     (
         -- User is the sender
         auth.uid() = sender_user_id
     ) OR (
         -- Message is NOT division-specific OR user has a matching non-division role
         (NOT ('division_admin' = ANY(recipient_roles))) AND (public.get_my_effective_roles() && recipient_roles)
     ) OR (
         -- Message IS division-specific AND user is an admin of that division
         ('division_admin' = ANY(recipient_roles)) AND
         ARRAY(SELECT division_id FROM public.members WHERE id = auth.uid()) && recipient_division_ids AND -- Check if user's division_id (as array element) overlaps
         'division_admin' = ANY(public.get_my_effective_roles()) -- Ensure user IS a division admin
     ) OR (
          -- Add case for Company Admin seeing all messages? TBD based on requirements.
          'company_admin' = ANY(public.get_my_effective_roles())
     )
     ```

   - [ ] Rewrite the `UPDATE` policy similarly, ensuring appropriate division checks for modifying division-specific messages.
   - [ ] Thoroughly test RLS changes with users in different roles and divisions.

3. **Phase 3: Backend Service Updates**
   - [ ] Modify `sendAdminMessage` signature in `notificationService.ts`.
   - [ ] Implement logic in `sendAdminMessage` to save `targetDivisionIds` to `recipient_division_ids`.
   - [ ] Modify `replyToAdminMessage` in `notificationService.ts` to handle `recipient_division_ids` propagation within a thread.
4. **Phase 4: Frontend Modal (`ContactAdminModal`) Updates**
   - [ ] Implement fetching of division list (names and IDs).
   - [ ] Add state for selected divisions.
   - [ ] Add UI element (e.g., multi-select dropdown) for choosing divisions, conditional on "Division Admin" being selected as a recipient.
   - [ ] Update `handleSend` to pass selected division IDs to `sendAdminMessage`.
5. **Phase 5: Frontend Admin View Updates (Optional)**
   - [ ] (If needed) Add division filtering options to `AdminMessages.tsx` and/or `AdminMessageSection.tsx`.
   - [ ] (If needed) Display target division(s) in message views.
6. **Phase 6: End-to-End Testing**
   - [ ] Test sending messages _to_ specific divisions from different user roles.
   - [ ] Test that division admins _only_ see messages for their division (or messages they sent).
   - [ ] Test that company admins can see messages across divisions (confirm RLS logic).
   - [ ] Test replying within division-specific threads.
   - [ ] Test interaction with acknowledgment flags.

---
