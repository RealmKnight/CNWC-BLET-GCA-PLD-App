# Admin Messaging System Plan

## Phase 1: Design (Completed)

_(Includes Goal, Core Requirements, Schema, Service Layer Signatures)_

---

## Phase 2: Implementation Steps

**Sub-Phase 2.1: Database Setup** (Completed)

1. Create `get_my_effective_roles` Function (Completed)
2. Execute Migration (Completed)
3. Verify Schema (Completed)
4. Verify Function & RLS Policies (Completed)
5. (Optional) Seed Data (Skipped)

**Sub-Phase 2.2: Backend Logic & State Management** (Partially Completed)

1. **Define `AdminMessage` Type:** (Completed)
   - Location: `types/adminMessages.ts`.
2. **Implement Client-Side Role Logic:** (Completed)
   - Location: `hooks/useEffectiveRoles.ts`.
3. **Create `adminNotificationStore.ts`:** (Completed)
   - Location: `store/adminNotificationStore.ts`.
   - Implement thread grouping strategy: (Completed - Using `getGroupedThreads` selector)
   - Implement subscription retry logic: (Completed - Basic exponential backoff implemented)
   - Implement missing actions (`replyAsAdmin`, `archiveThread`, `markThreadAsUnread`): (Completed)
4. **Update `notificationService.ts`:** (Completed)
   - Location: `utils/notificationService.ts`.
   - Determine `sender_role` accurately in `sendAdminMessage` and `replyToAdminMessage`: (Completed)
   - Implement push notification logic: (**DEFERRED** - Tracked in `push_notifications.md`).

**Sub-Phase 2.3: Frontend UI Implementation**

1. **Create "Contact Admin" Modal:** (Completed)
   - Location: `components/modals/ContactAdminModal.tsx`.
   - **Integration:** Add triggers in Profile, Notifications, etc. (**TODO LATER**)
2. **Refactor `AdminMessages.tsx` (For Member Admins ONLY):** (Completed)
   - Task: Modify component for Member Admins (App/Union/Div).
   - Location: `components/admin/division/AdminMessages.tsx`.
   - Implementation: Connected to store, basic filtering/grouping, reply UI, responsive layout.
   - **TODOs:** Integrate final store actions (reply, archive, mark read/unread) when available.
3. **Expand `AdminMessageSection.tsx` (For Company Admins ONLY):** (Completed)
   - Task: Enhance this component for the `company_admin` role.
   - Location: `components/admin/message/AdminMessageSection.tsx`.
   - Implementation: Connected to store, placeholder filtering/grouping, reply UI, responsive layout, basic loading/error states.
   - **TODOs:** Integrate final store actions (`replyAsAdmin`, `archiveThread`, `markThreadAsUnread`) when available. Refine company-admin specific filtering logic if needed.
4. **Implement Admin Badge Count (Optional):** (Completed)
   - Task: Implement logic to display an unread count badge for admins.
   - Location: `components/ui/AdminMessageBadge.tsx`. Uses `adminNotificationStore.unreadCount`. Integration into layouts/tabs needed separately.

**Sub-Phase 2.4: Testing & Refinement** (**NEXT**)

1. **Manual End-to-End Testing:**
   - **Task:** Manually test all user flows, including push notifications and role-specific access. Test RLS/function thoroughly.
2. **Review & Refine:**
   - **Task:** Address bugs identified during manual testing, review UI/UX, performance. Verify RLS effectiveness.

---

## Implementation Principles (Phase 2)

- **Styling:** Strictly adhere to the application's color scheme and styling guidelines defined in `constants/Colors.ts` and existing UI patterns.
- **Code Reuse:** Before creating new components or utility functions, thoroughly search the existing codebase (`components/`, `hooks/`, `utils/`, etc.) for potentially reusable elements. Prioritize adapting existing components over creating duplicates, **except where security dictates separation (e.g., Company Admin view)**.
- **Accessibility:** Ensure all new UI elements meet high accessibility standards (a11y).

---

## `admin_messages` Table Schema (Proposed Revisions)

- **PK:** `id` (UUID)
- **Columns:**
  - `created_at` (TIMESTAMPTZ, default now())
  - `updated_at` (TIMESTAMPTZ, default now())
  - `sender_user_id` (UUID, FK to `auth.users`) - User who sent it.
  - `sender_role` (TEXT) - Role of the sender (e.g., 'member', 'company_admin', 'division_admin'). Determined at time of sending.
  - `recipient_roles` (TEXT[]) - Target admin roles (e.g., `{'division_admin', 'union_admin', 'company_admin'}`).
  - `parent_message_id` (UUID, FK to `admin_messages.id`, nullable) - For threading. NULL = new thread.
  - `subject` (TEXT, nullable)
  - `message` (TEXT) - Content of the message.
  - `is_read` (BOOLEAN, default false)
  - `read_by` (UUID[], default '{}') - Array of user IDs who have read it.
  - `is_archived` (BOOLEAN, default false)
  - `requires_acknowledgment` (BOOLEAN, default false)
  - `acknowledged_at` (TIMESTAMPTZ, nullable)
  - `acknowledged_by` (UUID[], default '{}') - Array of user IDs who have acknowledged.
- **Removed:** `to_division_id`, `recipient_division_admins`, `recipient_union_admins`, `recipient_app_admins`, `status`.
- **Indexes:** Need GIN index on `recipient_roles`, B-tree on `parent_message_id`, `is_read`, `sender_role`.

---

## Service Layer (`notificationService.ts` Additions Signatures)

- `sendAdminMessage(senderUserId: string, senderRole: string, recipientRoles: string[], subject: string, message: string, requiresAcknowledgment?: boolean): Promise<AdminMessage | null>`
- `replyToAdminMessage(parentMessageId: string, senderUserId: string, senderRole: string, /* Target roles derived from parent */ message: string): Promise<AdminMessage | null>`
- `replyToUserInAdminMessage(originalAdminMessage: AdminMessage, replyMessage: string): Promise<void>`

---

## Database Migrations (SQL Outline)

```sql
-- Migration: create_get_my_effective_roles_function
-- Task: Sub-Phase 2.1, Step 1

-- RLS Helper Function (Corrected Definition based on user clarification)
-- Retrieves roles from auth.users metadata and public.members table,
-- linking members via members.id = auth.users.id.
CREATE OR REPLACE FUNCTION public.get_my_effective_roles()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER -- Necessary to query auth.users and potentially members table across users
SET search_path = public -- Ensure function can find public tables
AS $$
DECLARE
    v_user_id uuid := auth.uid(); -- Get the ID of the currently authenticated user
    auth_role text;
    member_role_val text;
    combined_roles text[] := '{}'; -- Initialize empty array
BEGIN
    -- 1. Get role from auth metadata
    -- Verify path 'raw_user_meta_data ->> 'role'' is correct for company_admin role
    SELECT raw_user_meta_data ->> 'role'
    INTO auth_role
    FROM auth.users
    WHERE id = v_user_id;

    IF auth_role = 'company_admin' THEN
        combined_roles := array_append(combined_roles, auth_role);
    END IF;

    -- 2. Get role from members table using the direct ID link
    -- This assumes a registered/logged-in user will have a members record
    -- where members.id matches their auth.users.id
    SELECT role
    INTO member_role_val
    FROM public.members
    WHERE id = v_user_id; -- Linking members.id directly to auth.users.id

    IF member_role_val IS NOT NULL THEN
        -- Avoid adding duplicate roles
        IF NOT (member_role_val = ANY(combined_roles)) THEN
             combined_roles := array_append(combined_roles, member_role_val);
        END IF;
    END IF;

    -- Return null if no roles found, or the array of roles
    IF array_length(combined_roles, 1) IS NULL THEN
        RETURN NULL; -- Or return '{}'::text[]
    ELSE
        RETURN combined_roles;
    END IF;
END;
$$;

-- Grant execute permission to the authenticated role
GRANT EXECUTE ON FUNCTION public.get_my_effective_roles() TO authenticated;

-- End Migration: create_get_my_effective_roles_function
---

-- Migration: setup_admin_messages_table
-- Task: Sub-Phase 2.1, Step 2 (Revised)

-- Drop dependent RLS policies FIRST
DROP POLICY IF EXISTS "admin_messages_view_division_admin" ON public.admin_messages;
DROP POLICY IF EXISTS "admin_messages_create_member_policy" ON public.admin_messages;

-- Rename existing column if it exists
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='admin_messages' AND column_name='from_user_id') THEN
    ALTER TABLE public.admin_messages RENAME COLUMN from_user_id TO sender_user_id;
  END IF;
END $$;

-- Remove old columns if they exist (now safe after dropping dependent policies)
ALTER TABLE public.admin_messages
  DROP COLUMN IF EXISTS to_division_id,
  DROP COLUMN IF EXISTS recipient_division_admins,
  DROP COLUMN IF EXISTS recipient_union_admins,
  DROP COLUMN IF EXISTS recipient_app_admins,
  DROP COLUMN IF EXISTS status;

-- Add new columns (idempotent)
ALTER TABLE public.admin_messages
  ADD COLUMN IF NOT EXISTS sender_role TEXT NULL, -- Role at time of sending
  ADD COLUMN IF NOT EXISTS recipient_roles TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS parent_message_id UUID NULL,
  ADD COLUMN IF NOT EXISTS subject TEXT NULL,
  ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_by UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_acknowledgment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID[] NOT NULL DEFAULT '{}';

-- Add foreign key constraint for parent_message_id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_messages_parent_message_id_fkey') THEN
    ALTER TABLE public.admin_messages
      ADD CONSTRAINT admin_messages_parent_message_id_fkey
      FOREIGN KEY (parent_message_id) REFERENCES public.admin_messages(id) ON DELETE SET NULL;
  END IF;
END $$;


-- Ensure necessary FK for sender_user_id exists (if renamed from a column that already had it)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_messages_sender_user_id_fkey') THEN
     -- Assuming the original FK was named based on 'from_user_id' or needs adding
     ALTER TABLE public.admin_messages
      ADD CONSTRAINT admin_messages_sender_user_id_fkey
      FOREIGN KEY (sender_user_id) REFERENCES auth.users(id) ON DELETE CASCADE; -- Or SET NULL depending on desired behavior
  END IF;
END $$;


-- Add indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_admin_messages_recipient_roles ON public.admin_messages USING GIN (recipient_roles);
CREATE INDEX IF NOT EXISTS idx_admin_messages_parent_message_id ON public.admin_messages (parent_message_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_is_read ON public.admin_messages (is_read);
CREATE INDEX IF NOT EXISTS idx_admin_messages_sender_role ON public.admin_messages (sender_role);

-- Enable RLS if not already enabled
-- Check if RLS is already enabled before trying to enable it.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'admin_messages' AND rowsecurity = true
    ) THEN
        ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- RLS Policies (Refined - using actual function name)

-- Policy: Users can see messages they sent OR messages where their effective role overlaps recipient_roles
DROP POLICY IF EXISTS "Allow access based on effective role or sender" ON public.admin_messages;
CREATE POLICY "Allow access based on effective role or sender"
ON public.admin_messages FOR SELECT
USING (
  -- Check if user's effective roles overlap with the recipient list
  public.get_my_effective_roles() && recipient_roles
  OR
  -- Allow sender to see their own messages
  auth.uid() = sender_user_id
);

-- Policy: Allow authenticated users to insert messages (sender_user_id must match auth.uid)
-- sender_role needs to be set correctly by the calling function (notificationService)
DROP POLICY IF EXISTS "Allow authenticated users to insert messages" ON public.admin_messages;
CREATE POLICY "Allow authenticated users to insert messages"
ON public.admin_messages FOR INSERT
WITH CHECK (auth.uid() = sender_user_id);

-- Policy: Allow sender or recipient admin to update specific fields (read, archive, ack)
DROP POLICY IF EXISTS "Allow sender or recipient admin update" ON public.admin_messages;
CREATE POLICY "Allow sender or recipient admin update"
ON public.admin_messages FOR UPDATE
USING (
  auth.uid() = sender_user_id
  OR
  public.get_my_effective_roles() && recipient_roles
)
WITH CHECK (
  -- Allow updating only specific fields like is_read, read_by, is_archived, acknowledged_at, acknowledged_by
  -- This check prevents changing sender, recipient, parent, subject, message content via UPDATE RLS
  true -- Consider if more specific checks are needed, e.g., cannot change acknowledged_at once set.
);

-- Delete Policy: Disallow direct deletes, force archival first
DROP POLICY IF EXISTS "Restrict Delete" ON public.admin_messages;
CREATE POLICY "Restrict Delete" ON public.admin_messages FOR DELETE USING (false);


-- End Migration: setup_admin_messages_table
```

---

_Note: The SQL for `public.get_my_effective_roles()` is now based on the clarified link (`members.id = auth.users.id`). Please double-check the path `raw_user_meta_data ->> 'role'` within `auth.users` is correct for storing the `company_admin` role._

---

## Deferred Tasks & Future Planning

- **Push Notification Implementation (Requires Separate Plan):**
  - Implement logic in `notificationService.ts` for sending push notifications related to admin messages (`sendAdminMessage`, `replyToAdminMessage`, `replyToUserInAdminMessage`).
  - This plan needs to cover:
    - Looking up users based on roles (combining `members` table and `auth.users` metadata).
    - Fetching push tokens from `user_preferences`.
    - Sending notifications via Expo Push API (potentially using an Edge Function).
    - Reviewing push notification logic for regular `messages` as well.
    - Handling edge cases (multiple roles, multiple tokens, etc.).
- **Store: Thread Grouping Strategy:** (Decision: Current `getGroupedThreads` selector is sufficient for now).
- **Store: Subscription Retry Logic:** (Decision: Current basic exponential backoff is sufficient for now. Can be refined later if needed).

---
