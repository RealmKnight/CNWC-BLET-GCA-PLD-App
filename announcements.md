# Announcements Feature Implementation Plan

## Overview

This document outlines the implementation strategy for adding Announcements functionality to the application. The entire system will be developed progressively in phases with review pauses after each phase completion. Announcements will be managed by division, union, and application admins and displayed to members based on their respective divisions or union-wide.

**Note on UI Development**: Utilize existing UI components and styling consistent with the current application theme and usage. **Always search the codebase for suitable existing components before creating new ones.**

**Implementation Approach**: We will implement phases sequentially and pause after each phase for review before proceeding to the next phase.

### Key Features

1. **Multiple levels of announcements**:

   - Division level (managed by `division_admin` for their specific division(s), union_admin and application_admin can access via the divisionSelector for divisions they are not a part of)
   - GCA/Union level (managed by `union_admin` or `application_admin`)

2. **Admin management interfaces**:

   - Division Admin Dashboard → Division Management → Announcements (CRUD for own division, view read/unread status for division members)
   - Union Admin Dashboard → Union Announcements (Tabbed interface for managing GCA and all division announcements)
   - Application Admin: Full control via appropriate interfaces.

3. **Announcement content**:

   - Title
   - Description/message
   - Optional links
   - Optional document attachments (integrated into the creation flow using existing document upload/viewer components)

4. **Read tracking and notification**:

   - Track which users have read announcements (implicitly upon viewing/scrolling) using same pin number pattern as existing message system
   - Badge notifications for unread announcements using existing badgeStore with different categories
   - Badge notifications on navigation elements:
     - "My Division" navigation card (Blue badge)
     - "GCA" navigation card (Green badge)
     - "Announcements" sub-navigation card under "My Division" (Blue badge)
     - "GCA Announcements" sub-navigation card under "GCA" (Green badge)

5. **Integration with existing systems**:
   - Similar to member messages, NOT admin messages
   - Use existing document storage through Supabase Storage with existing upload/viewer components
   - Follow existing division context validation patterns from divisionMeetingStore
   - Initialize after notification store but before admin stores in useAuth sequence
   - Use existing deep linking patterns for navigation
   - Use existing badge system with different categories for announcement badges

## Implementation Phases

- [ ] ### Phase 1: Database Schema Design

**Database Migration Strategy**: Implement schema changes as **2-3 separate migrations** for easier rollback:

- **Migration 1**: Core tables (`announcements`, `announcement_read_status`) and basic functions
- **Migration 2**: RLS policies and security functions
- **Migration 3**: Helper views and analytics functions (can be combined with Migration 1 if preferred)

**Step 1: Create Announcements Table (Migration 1)**

```sql
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  links JSONB DEFAULT '[]'::jsonb, -- Array of link objects: [{"url": "...", "label": "..."}]
  created_by UUID NOT NULL REFERENCES auth.users(id), -- Set automatically
  creator_role TEXT NOT NULL, -- 'division_admin', 'union_admin', 'application_admin'. Set automatically based on the user's actual role.
  start_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NULL, -- NULL means no end date
  is_active BOOLEAN DEFAULT true NOT NULL,
  require_acknowledgment BOOLEAN DEFAULT false NOT NULL,
  target_type TEXT NOT NULL, -- 'division' (for specific divisions), 'GCA' (for all GCA/union members)
  target_division_ids INTEGER[] DEFAULT '{}'::integer[], -- Required if target_type is 'division'. Stores division_id(s).
  document_ids UUID[] DEFAULT '{}'::uuid[], -- References to documents in storage bucket (max 3, 25MB limit)
  read_by TEXT[] DEFAULT '{}'::text[], -- Array of pin numbers (as strings) who have read this announcement - CONSISTENT WITH EXISTING MESSAGE SYSTEM
  acknowledged_by TEXT[] DEFAULT '{}'::text[] -- Array of pin numbers (as strings) who have acknowledged this announcement - CONSISTENT WITH EXISTING MESSAGE SYSTEM
);

-- Add trigger for updated_at
CREATE TRIGGER set_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

**Step 2: Create Announcement Read Status Table**

```sql
CREATE TABLE public.announcement_read_status (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (announcement_id, user_id)
);
```

**Note:** This table provides additional detail about when each announcement was read, which can be useful for analytics while maintaining consistency with the existing message system's pin number tracking in the main table.

**Step 3: Create View for Announcements with Author Names (Migration 1)**

```sql
CREATE VIEW public.announcements_with_author AS
SELECT
  a.*,
  CONCAT(m.first_name, ' ', m.last_name) as author_name
FROM
  public.announcements a
LEFT JOIN
  public.members m ON a.created_by = m.id; -- Confirmed: public.members.id is the same as auth.users.id
```

**Step 4: Create Helper Functions for Read Status Management (Migration 1)**

We'll leverage the existing pattern from messages system for our announcement read status tracking:

```sql
CREATE OR REPLACE FUNCTION public.mark_announcement_as_read(announcement_id UUID)
RETURNS void AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_pin_number TEXT;
BEGIN
  -- Get the user's pin number (following existing message system pattern)
  SELECT pin_number::text INTO v_pin_number
  FROM public.members
  WHERE id = v_user_id;

  IF v_pin_number IS NULL THEN
    RAISE EXCEPTION 'User pin number not found';
  END IF;

  -- Track detailed read timestamp in the read_status table if it exists
  INSERT INTO public.announcement_read_status (announcement_id, user_id)
  VALUES (announcement_id, auth.uid())
  ON CONFLICT (announcement_id, user_id) DO
    UPDATE SET read_at = timezone('utc'::text, now());

  -- Add to the read_by array in the announcements table if not already there (consistent with existing message system)
  UPDATE public.announcements
  SET read_by = array_append(read_by, v_pin_number)
  WHERE id = announcement_id AND NOT (v_pin_number = ANY(read_by));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also add function to mark as unread if needed
CREATE OR REPLACE FUNCTION public.mark_announcement_as_unread(announcement_id UUID)
RETURNS void AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_pin_number TEXT;
BEGIN
  -- Get the user's pin number (following existing message system pattern)
  SELECT pin_number::text INTO v_pin_number
  FROM public.members
  WHERE id = v_user_id;

  IF v_pin_number IS NULL THEN
    RAISE EXCEPTION 'User pin number not found';
  END IF;

  -- Remove from read_status table
  DELETE FROM public.announcement_read_status
  WHERE announcement_id = $1 AND user_id = auth.uid();

  -- Remove from read_by array (consistent with existing message system)
  UPDATE public.announcements
  SET read_by = array_remove(read_by, v_pin_number)
  WHERE id = announcement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 5: Create Functions for Creating and Managing Announcements (Migration 1)**

```sql
CREATE OR REPLACE FUNCTION public.create_announcement(
  p_title TEXT,
  p_message TEXT,
  p_links JSONB,
  p_target_type TEXT,
  p_target_division_ids INTEGER[],
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_require_acknowledgment BOOLEAN DEFAULT false,
  p_document_ids UUID[] DEFAULT '{}'::uuid[]
)
RETURNS SETOF announcements
LANGUAGE plpgsql
AS $$
DECLARE
  v_creator_id UUID := auth.uid();
  v_creator_roles TEXT[] := public.get_my_effective_roles();
  v_creator_role TEXT;
  inserted_announcement public.announcements;
BEGIN
  -- Basic validation
  IF p_title IS NULL OR p_title = '' THEN
    RAISE EXCEPTION 'Announcement title cannot be empty.';
  END IF;

  IF p_message IS NULL OR p_message = '' THEN
    RAISE EXCEPTION 'Announcement content cannot be empty.';
  END IF;

  IF v_creator_roles IS NULL OR array_length(v_creator_roles, 1) IS NULL THEN
    RAISE EXCEPTION 'Could not determine creator role.';
  END IF;

  -- Set the creator role based on effective roles hierarchy
  IF 'application_admin' = ANY(v_creator_roles) THEN
    v_creator_role := 'application_admin';
  ELSIF 'union_admin' = ANY(v_creator_roles) THEN
    v_creator_role := 'union_admin';
  ELSIF 'division_admin' = ANY(v_creator_roles) THEN
    v_creator_role := 'division_admin';
  ELSE
    RAISE EXCEPTION 'User does not have sufficient privileges to create announcements.';
  END IF;

  -- Additional validation based on role and target type
  IF v_creator_role = 'division_admin' AND p_target_type != 'division' THEN
    RAISE EXCEPTION 'Division admins can only create division-level announcements.';
  END IF;

  -- Ensure division IDs are provided for division announcements
  IF p_target_type = 'division' AND (p_target_division_ids IS NULL OR array_length(p_target_division_ids, 1) = 0) THEN
    RAISE EXCEPTION 'Division IDs must be specified for division-level announcements.';
  END IF;

  -- Division admins can only target their own division
  IF v_creator_role = 'division_admin' AND p_target_type = 'division' THEN
    -- Get admin's division ID
    DECLARE
      admin_division_id INTEGER;
    BEGIN
      SELECT division_id INTO admin_division_id
      FROM public.members
      WHERE id = v_creator_id;

      IF NOT admin_division_id = ANY(p_target_division_ids) OR array_length(p_target_division_ids, 1) != 1 THEN
        RAISE EXCEPTION 'Division admins can only create announcements for their own division.';
      END IF;
    END;
  END IF;

  -- Validate document count (following existing document system limits)
  IF p_document_ids IS NOT NULL AND array_length(p_document_ids, 1) > 3 THEN
    RAISE EXCEPTION 'Maximum of 3 document attachments allowed.';
  END IF;

  -- Insert the announcement
  INSERT INTO public.announcements (
    title,
    message,
    links,
    created_by,
    creator_role,
    start_date,
    end_date,
    is_active,
    require_acknowledgment,
    target_type,
    target_division_ids,
    document_ids
  )
  VALUES (
    p_title,
    p_message,
    p_links,
    v_creator_id,
    v_creator_role,
    p_start_date,
    p_end_date,
    TRUE, -- Default to active
    p_require_acknowledgment,
    p_target_type,
    p_target_division_ids,
    p_document_ids
  )
  RETURNING * INTO inserted_announcement;

  RETURN NEXT inserted_announcement;
END;
$$;
```

**Step 6: Create Helper Views for Analytics (Migration 3)**

```sql
CREATE VIEW public.announcement_read_counts AS
SELECT
  a.id AS announcement_id,
  a.title,
  a.created_at,
  a.target_type,
  a.target_division_ids,
  a.require_acknowledgment,
  COUNT(DISTINCT ars.user_id) AS read_count,
  -- For division announcements, count eligible members
  CASE
    WHEN a.target_type = 'division' THEN (
      SELECT COUNT(DISTINCT m.id)
      FROM members m
      WHERE m.division_id = ANY(a.target_division_ids)
        AND m.deleted = false
    )
    ELSE (
      SELECT COUNT(DISTINCT m.id)
      FROM members m
      WHERE m.deleted = false
    )
  END AS eligible_member_count
FROM
  public.announcements a
LEFT JOIN
  public.announcement_read_status ars ON a.id = ars.announcement_id
GROUP BY
  a.id, a.title, a.created_at, a.target_type, a.target_division_ids, a.require_acknowledgment;
```

**Step 7: Create Helper View for Union Admin Announcements (Migration 3)**

This view will help optimize the RLS policies by pre-filtering announcements that are relevant to union admins:

```sql
CREATE VIEW public.union_admin_announcement_roots AS
SELECT DISTINCT a.id AS announcement_id
FROM public.announcements a
WHERE a.creator_role = 'union_admin'
   OR a.target_type = 'GCA';
```

**Step 8: Add RLS Policies (Migration 2)**

Row Level Security policies will enforce access control based on user roles following existing RLS patterns in the codebase. The defined hierarchy is:
`application_admin` (fullest access) > `union_admin` (GCA and all division functions) > `division_admin` (own division functions only).

**RLS for `public.announcements` table:**

```sql
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Policy for Application Admins (Full Access) - Following existing RLS patterns
CREATE POLICY "APP_ADMIN_full_access_announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'application_admin'
  ));

-- Policy for Union Admins (Manage GCA and All Division Announcements) - Following existing RLS patterns
CREATE POLICY "UNION_ADMIN_manage_all_announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'union_admin'
    )
  )
  WITH CHECK (
    -- For inserts and updates, restrict what union admins can create
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'union_admin'
    )
    AND created_by = auth.uid()
    AND creator_role = 'union_admin'
  );

-- Policy for Division Admins (Manage Own Division's Announcements) - Following existing division validation patterns
CREATE POLICY "DIV_ADMIN_manage_own_division_announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (
    -- Leverage existing function for optimized division admin access check
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'division_admin'
    )
    AND (
      -- Division admins can see all GCA announcements
      target_type = 'GCA'
      OR
      -- And they can see division announcements for their divisions
      (
        target_type = 'division'
        AND EXISTS (
          SELECT 1 FROM members m
          WHERE m.id = auth.uid()
          AND m.division_id = ANY(target_division_ids)
        )
      )
    )
  )
  WITH CHECK (
    -- For inserts and updates, division admins can only create/modify their own division's announcements
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'division_admin'
    )
    AND created_by = auth.uid()
    AND creator_role = 'division_admin'
    AND target_type = 'division'
    AND EXISTS (
      -- Use existing helper function for optimal performance
      SELECT 1 FROM members m
      WHERE m.id = auth.uid()
      AND target_division_ids @> ARRAY[m.division_id]
    )
  );

-- Policy for Viewing Announcements (All authenticated users) - Following existing member access patterns
CREATE POLICY "Authenticated_view_relevant_announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND start_date <= timezone('utc'::text, now())
    AND (end_date IS NULL OR end_date >= timezone('utc'::text, now()))
    AND (
      -- Everyone can see GCA announcements
      target_type = 'GCA'
      OR
      -- Division-specific announcements are visible to members of those divisions
      (
        target_type = 'division'
        AND EXISTS (
          SELECT 1 FROM members m
          WHERE m.id = auth.uid()
          AND m.division_id = ANY(target_division_ids)
        )
      )
    )
  );
```

**RLS for `public.announcement_read_status` table:**

```sql
ALTER TABLE public.announcement_read_status ENABLE ROW LEVEL SECURITY;

-- Users can manage their own read status - Following existing patterns
CREATE POLICY "Manage_own_read_status" ON public.announcement_read_status
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin policy for viewing read status leveraging existing helper functions
CREATE POLICY "Admin_view_read_status" ON public.announcement_read_status
  FOR SELECT TO authenticated
  USING (
    -- Application Admins can see all
    (EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'application_admin'
    ))
    OR
    -- Union Admins can see all - simplified using the public.get_my_effective_roles() function
    ('union_admin' = ANY(public.get_my_effective_roles()))
    OR
    -- Division Admins can see read status for their division members
    (
      'division_admin' = ANY(public.get_my_effective_roles())
      AND EXISTS (
        -- Join to announcements to check division relationship
        SELECT 1
        FROM public.announcements a
        JOIN public.members m_user ON announcement_read_status.user_id = m_user.id
        JOIN public.members m_admin ON auth.uid() = m_admin.id
        WHERE
          announcement_read_status.announcement_id = a.id
          AND m_user.division_id = m_admin.division_id
          AND (
            a.target_type = 'GCA'
            OR (a.target_type = 'division' AND m_admin.division_id = ANY(a.target_division_ids))
          )
      )
    )
  );
```

**Step 9: Create Helper Functions for Read Status Management**

We'll leverage the existing pattern from messages system for our announcement read status tracking:

```sql
CREATE OR REPLACE FUNCTION public.mark_announcement_as_read(announcement_id UUID)
RETURNS void AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_pin_number TEXT;
BEGIN
  -- Get the user's pin number (following existing message system pattern)
  SELECT pin_number::text INTO v_pin_number
  FROM public.members
  WHERE id = v_user_id;

  IF v_pin_number IS NULL THEN
    RAISE EXCEPTION 'User pin number not found';
  END IF;

  -- Track detailed read timestamp in the read_status table if it exists
  INSERT INTO public.announcement_read_status (announcement_id, user_id)
  VALUES (announcement_id, auth.uid())
  ON CONFLICT (announcement_id, user_id) DO
    UPDATE SET read_at = timezone('utc'::text, now());

  -- Add to the read_by array in the announcements table if not already there (consistent with existing message system)
  UPDATE public.announcements
  SET read_by = array_append(read_by, v_pin_number)
  WHERE id = announcement_id AND NOT (v_pin_number = ANY(read_by));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also add function to mark as unread if needed
CREATE OR REPLACE FUNCTION public.mark_announcement_as_unread(announcement_id UUID)
RETURNS void AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_pin_number TEXT;
BEGIN
  -- Get the user's pin number (following existing message system pattern)
  SELECT pin_number::text INTO v_pin_number
  FROM public.members
  WHERE id = v_user_id;

  IF v_pin_number IS NULL THEN
    RAISE EXCEPTION 'User pin number not found';
  END IF;

  -- Remove from read_status table
  DELETE FROM public.announcement_read_status
  WHERE announcement_id = $1 AND user_id = auth.uid();

  -- Remove from read_by array (consistent with existing message system)
  UPDATE public.announcements
  SET read_by = array_remove(read_by, v_pin_number)
  WHERE id = announcement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 10: Implement Announcement Acknowledgment Functions**

For announcements with `require_acknowledgment = true`, create functions to handle acknowledgment similar to the existing message acknowledgment system:

```sql
-- Function to acknowledge an announcement (using string pin numbers like the current message system)
CREATE OR REPLACE FUNCTION public.acknowledge_announcement(announcement_id UUID)
RETURNS void AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_pin_number TEXT;
BEGIN
  -- Get the user's pin number (following existing message system pattern)
  SELECT pin_number::text INTO v_pin_number
  FROM public.members
  WHERE id = v_user_id;

  IF v_pin_number IS NULL THEN
    RAISE EXCEPTION 'User pin number not found';
  END IF;

  -- First mark as read
  PERFORM public.mark_announcement_as_read(announcement_id);

  -- Then add to acknowledged_by array if not already there (consistent with existing message system)
  UPDATE public.announcements
  SET acknowledged_by = array_append(acknowledged_by, v_pin_number)
  WHERE id = announcement_id AND NOT (v_pin_number = ANY(acknowledged_by));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This division context integration ensures that the announcements system maintains the same level of data isolation and security as the meetings system, preventing any cross-contamination of division information.

- [ ] ### Phase 2: State Management

- [ ] #### Step 1: Create Announcement Types

```typescript
// types/announcements.ts

export interface Link {
  url: string;
  label: string;
}

export interface Announcement {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  message: string;
  links: Link[];
  created_by: string;
  creator_role: string;
  author_name?: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  require_acknowledgment: boolean;
  target_type: "division" | "GCA";
  target_division_ids: number[];
  document_ids: string[];
  acknowledged_by: string[];
  has_been_read?: boolean; // Client-side computed property
  has_been_acknowledged?: boolean; // Client-side computed property
}

export interface AnnouncementReadStatus {
  announcement_id: string;
  user_id: string;
  read_at: string;
}

export interface AnnouncementAnalytics {
  announcement_id: string;
  title: string;
  created_at: string;
  target_type: string;
  target_division_ids: number[];
  require_acknowledgment: boolean;
  read_count: number;
  eligible_member_count: number;
  read_percentage?: number; // Calculated client-side
}
```

- [ ] #### Step 2: Create Announcements Store with Division Context

```typescript
// store/announcementStore.ts

import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import type { Announcement, AnnouncementReadStatus, AnnouncementAnalytics } from "@/types/announcements";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

// Division context validation helper (following pattern from divisionMeetingStore)
const validateAnnouncementDivisionContext = async (
  announcementId: string,
  expectedDivisionName?: string
): Promise<boolean> => {
  if (!expectedDivisionName) return true;

  try {
    const { data } = await supabase
      .from("announcements")
      .select("target_division_ids, target_type")
      .eq("id", announcementId)
      .single();

    if (data?.target_type === "GCA") return true; // GCA announcements are visible to all divisions

    if (data?.target_type === "division" && data?.target_division_ids) {
      // Get division ID for the expected division name
      const { data: divisionData } = await supabase
        .from("divisions")
        .select("id")
        .eq("name", expectedDivisionName)
        .single();

      return divisionData?.id ? data.target_division_ids.includes(divisionData.id) : false;
    }

    return false;
  } catch (error) {
    console.error("Error validating announcement division context:", error);
    return false;
  }
};

// Enhanced error handling with division context (following pattern from divisionMeetingStore)
const handleAnnouncementDivisionError = (error: Error, divisionName?: string, operation?: string): string => {
  const contextualMessage = divisionName
    ? `Error in ${divisionName} ${operation}: ${error.message}`
    : `Error in ${operation}: ${error.message}`;

  console.error(contextualMessage, error);
  return contextualMessage;
};

interface AnnouncementStore {
  // Data organized by division context (following pattern from divisionMeetingStore)
  announcements: Record<string, Announcement[]>; // Announcements by division name ("GCA" for union announcements)
  readStatusMap: Record<string, boolean>;
  acknowledgedMap: Record<string, boolean>; // Track acknowledgment status
  unreadCount: {
    division: number;
    gca: number;
    total: number;
  };
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  currentDivisionContext: string | null; // Track current division context (following pattern from divisionMeetingStore)
  subscriptionStatus: "none" | "subscribing" | "subscribed" | "error";
  loadingOperation: string | null; // Track what operation is currently loading

  // Realtime subscriptions (following pattern from divisionMeetingStore)
  realtimeSubscriptions: {
    announcements: RealtimeChannel | null;
    readStatus: RealtimeChannel | null;
  };

  // Fetch helpers with division context
  _fetchAndSetAnnouncements: (divisionName: string) => Promise<void>;
  _calculateUnreadCounts: () => void;
  _updateBadgeStore: (unreadCounts: { division: number; gca: number; total: number }) => void; // Integration with existing badgeStore

  // Public API with division context support
  initializeAnnouncementStore: (userId: string, assignedDivisionId: number | null, roles: string[]) => () => void;
  setDivisionContext: (divisionName: string | null) => void; // Following pattern from divisionMeetingStore
  fetchDivisionAnnouncements: (divisionName: string) => Promise<void>; // Following pattern from divisionMeetingStore
  fetchGCAnnouncements: () => Promise<void>;
  markAnnouncementAsRead: (announcementId: string) => Promise<void>;
  markAnnouncementAsUnread: (announcementId: string) => Promise<void>;
  acknowledgeAnnouncement: (announcementId: string) => Promise<void>;
  createAnnouncement: (
    announcement: Omit<
      Announcement,
      | "id"
      | "created_at"
      | "updated_at"
      | "created_by"
      | "creator_role"
      | "has_been_read"
      | "has_been_acknowledged"
      | "acknowledged_by"
    >
  ) => Promise<string | null>;
  updateAnnouncement: (id: string, updates: Partial<Announcement>) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
  getAnnouncementAnalytics: (announcementId: string) => Promise<AnnouncementAnalytics | null>;
  cleanupAnnouncementStore: () => void;
  setIsInitialized: (initialized: boolean) => void;
  refreshAnnouncements: (divisionName: string, force?: boolean) => Promise<void>;
  subscribeToAnnouncements: (divisionName?: string) => () => void; // Following pattern from divisionMeetingStore
  unsubscribeFromAnnouncements: () => void; // Following pattern from divisionMeetingStore
  // Data integrity validation (following pattern from divisionMeetingStore)
  validateAnnouncementDataIntegrity: (divisionName: string) => Promise<{
    isValid: boolean;
    issues: string[];
  }>;
  // Loading state management (following pattern from divisionMeetingStore)
  setLoadingState: (isLoading: boolean, operation?: string) => void;
}

export const useAnnouncementStore = create<AnnouncementStore>((set, get) => ({
  // Implementation following pattern from divisionMeetingStore.ts
  announcements: {},
  readStatusMap: {},
  acknowledgedMap: {},
  unreadCount: {
    division: 0,
    gca: 0,
    total: 0,
  },
  isLoading: false,
  error: null,
  isInitialized: false,
  currentDivisionContext: null,
  subscriptionStatus: "none",
  loadingOperation: null,
  realtimeSubscriptions: {
    announcements: null,
    readStatus: null,
  },

  setIsInitialized: (initialized: boolean) => {
    console.log(`[AnnouncementStore] Setting isInitialized to ${initialized}`);
    set({ isInitialized: initialized });
  },

  // Division context actions (following pattern from divisionMeetingStore)
  setDivisionContext: (divisionName: string | null) => {
    set({ currentDivisionContext: divisionName });
  },

  // Loading state management (following pattern from divisionMeetingStore)
  setLoadingState: (isLoading: boolean, operation?: string) => {
    set({
      isLoading,
      loadingOperation: isLoading ? operation || null : null,
    });
  },

  // Integration with existing badgeStore using different categories
  _updateBadgeStore: (unreadCounts) => {
    // Import badgeStore dynamically to avoid circular dependencies
    import("@/store/badgeStore")
      .then(({ useBadgeStore }) => {
        // Update badge store with announcement-specific categories
        // This will be separate from message badges but use the same system
        useBadgeStore.getState().updateAnnouncementBadges?.(unreadCounts);
      })
      .catch((error) => {
        console.error("[AnnouncementStore] Failed to update badge store:", error);
      });
  },

  // Calculate unread counts and update badge store
  _calculateUnreadCounts: () => {
    const state = get();
    let divisionCount = 0;
    let gcaCount = 0;

    // Calculate division announcements unread count
    Object.entries(state.announcements).forEach(([divisionName, announcements]) => {
      if (divisionName === "GCA") {
        gcaCount += announcements.filter((a) => !state.readStatusMap[a.id]).length;
      } else {
        divisionCount += announcements.filter((a) => !state.readStatusMap[a.id]).length;
      }
    });

    const newUnreadCount = {
      division: divisionCount,
      gca: gcaCount,
      total: divisionCount + gcaCount,
    };

    set({ unreadCount: newUnreadCount });

    // Update badge store with new counts
    get()._updateBadgeStore(newUnreadCount);
  },

  // Fetch division announcements with context validation (following pattern from divisionMeetingStore)
  fetchDivisionAnnouncements: async (divisionName: string) => {
    get().setLoadingState(true, `Loading ${divisionName} announcements`);

    try {
      console.log(`[AnnouncementStore] Fetching announcements for division: ${divisionName}`);

      // Get division ID first
      const { data: divisionData } = await supabase.from("divisions").select("id").eq("name", divisionName).single();

      if (!divisionData?.id) {
        throw new Error(`Division ${divisionName} not found`);
      }

      // Fetch announcements for this specific division
      const { data, error } = await supabase
        .from("announcements_with_author")
        .select("*")
        .or(`target_type.eq.GCA,and(target_type.eq.division,target_division_ids.cs.{${divisionData.id}})`)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Store announcements by division context (following pattern from divisionMeetingStore)
      set((state) => ({
        announcements: {
          ...state.announcements,
          [divisionName]: data || [],
        },
      }));

      // Recalculate unread counts
      get()._calculateUnreadCounts();

      get().setLoadingState(false);
    } catch (error) {
      const errorMessage = handleAnnouncementDivisionError(
        error instanceof Error ? error : new Error(String(error)),
        divisionName,
        "fetching announcements"
      );
      set({
        error: errorMessage,
      });
      get().setLoadingState(false);
    }
  },

  // Subscription handling with division context (following pattern from divisionMeetingStore)
  subscribeToAnnouncements: (divisionName?: string) => {
    const { unsubscribeFromAnnouncements } = get();

    // Clean up existing subscriptions
    unsubscribeFromAnnouncements();

    console.log(`[AnnouncementStore] Setting up realtime subscriptions for ${divisionName || "ALL"}`);

    // Get division ID for filtering if division is specified
    let divisionId: number | null = null;
    if (divisionName) {
      supabase
        .from("divisions")
        .select("id")
        .eq("name", divisionName)
        .single()
        .then(({ data }) => {
          divisionId = data?.id || null;
        });
    }

    const channelSuffix = divisionName ? `-${divisionName}` : "";

    // Subscribe to announcements changes with division filtering (following pattern from divisionMeetingStore)
    const announcementsChannel = supabase
      .channel(`announcements-changes${channelSuffix}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcements",
        },
        (payload) => {
          console.log(`[Realtime] Announcements change received for ${divisionName || "ALL"}:`, {
            event: payload.eventType,
            table: payload.table,
            recordId: (payload.new as any)?.id || (payload.old as any)?.id,
            targetType: (payload.new as any)?.target_type || (payload.old as any)?.target_type,
            targetDivisionIds: (payload.new as any)?.target_division_ids || (payload.old as any)?.target_division_ids,
          });

          // Validate that this change is relevant to our division context
          const changeTargetType = (payload.new as any)?.target_type || (payload.old as any)?.target_type;
          const changeTargetDivisionIds =
            (payload.new as any)?.target_division_ids || (payload.old as any)?.target_division_ids;

          if (
            divisionId &&
            changeTargetType === "division" &&
            changeTargetDivisionIds &&
            !changeTargetDivisionIds.includes(divisionId)
          ) {
            console.log(
              `[Realtime] Ignoring change for different division (expected: ${divisionId}, got: ${changeTargetDivisionIds})`
            );
            return;
          }

          // Refresh the appropriate division's data
          if (divisionName) {
            console.log(`[Realtime] Refreshing announcements for division: ${divisionName}`);
            get().fetchDivisionAnnouncements(divisionName);
          } else if (changeTargetType === "GCA") {
            console.log(`[Realtime] Refreshing GCA announcements`);
            get().fetchGCAnnouncements();
          }
        }
      )
      .subscribe();

    // Subscribe to read status changes (following pattern from divisionMeetingStore)
    const readStatusChannel = supabase
      .channel(`announcement-read-status-changes${channelSuffix}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcement_read_status",
        },
        (payload) => {
          console.log(`[Realtime] Read status change received:`, payload);

          // Update read status in local state
          const announcementId = (payload.new as any)?.announcement_id || (payload.old as any)?.announcement_id;
          const userId = (payload.new as any)?.user_id || (payload.old as any)?.user_id;

          if (announcementId && userId) {
            // Update local read status map
            set((state) => ({
              readStatusMap: {
                ...state.readStatusMap,
                [announcementId]: payload.eventType !== "DELETE",
              },
            }));

            // Recalculate unread counts
            get()._calculateUnreadCounts();
          }
        }
      )
      .subscribe();

    // Store the subscription channels (following pattern from divisionMeetingStore)
    set({
      realtimeSubscriptions: {
        announcements: announcementsChannel,
        readStatus: readStatusChannel,
      },
      subscriptionStatus: "subscribed",
    });

    // Return cleanup function
    return () => {
      unsubscribeFromAnnouncements();
    };
  },

  // Unsubscribe from realtime (following pattern from divisionMeetingStore)
  unsubscribeFromAnnouncements: () => {
    const { realtimeSubscriptions } = get();

    if (realtimeSubscriptions.announcements) {
      supabase.removeChannel(realtimeSubscriptions.announcements);
    }

    if (realtimeSubscriptions.readStatus) {
      supabase.removeChannel(realtimeSubscriptions.readStatus);
    }

    set({
      realtimeSubscriptions: {
        announcements: null,
        readStatus: null,
      },
      subscriptionStatus: "none",
    });
  },

  // Implementation details will follow patterns from divisionMeetingStore.ts
  // with realtime subscriptions and proper division context handling
  // ...

  // Data integrity validation (following pattern from divisionMeetingStore)
  validateAnnouncementDataIntegrity: async (divisionName: string) => {
    const issues: string[] = [];
    let isValid = true;

    try {
      // Validate that all announcements in the division context are properly filtered
      const divisionAnnouncements = get().announcements[divisionName] || [];

      for (const announcement of divisionAnnouncements) {
        if (announcement.target_type === "division") {
          const isValidContext = await validateAnnouncementDivisionContext(announcement.id, divisionName);

          if (!isValidContext) {
            issues.push(`Announcement ${announcement.id} does not belong to division ${divisionName}`);
            isValid = false;
          }
        }
      }
    } catch (error) {
      issues.push(`Error validating division data integrity: ${error}`);
      isValid = false;
    }

    return { isValid, issues };
  },

  // Other implementation details following the same patterns...
  // Mark as read, acknowledge, create, update, delete functions will be implemented
  // following the existing patterns from divisionMeetingStore and message system
}));
```

**Note on Store Initialization**: This store will be initialized after the notification store but before admin stores in the useAuth.tsx initialization sequence, as specified in the clarifications.

- [ ] #### Step 3: Extend Badge Store for Announcements

```typescript
// store/badgeStore.ts - Add announcement-specific methods

// Add to the BadgeState interface:
interface BadgeState {
  // ... existing properties ...
  announcementUnreadCount: {
    division: number;
    gca: number;
    total: number;
  };

  // ... existing methods ...
  updateAnnouncementBadges: (counts: { division: number; gca: number; total: number }) => void;
  fetchUnreadAnnouncementCount: (userId: string, type: "division" | "gca" | "total") => Promise<number>;
  resetAnnouncementBadges: () => void;
}

// Add to the store implementation:
export const useBadgeStore = create<BadgeState>((set, get) => ({
  // ... existing state ...
  announcementUnreadCount: {
    division: 0,
    gca: 0,
    total: 0,
  },

  // ... existing methods ...

  updateAnnouncementBadges: (counts) => {
    set({ announcementUnreadCount: counts });

    // Update platform-specific badge if needed
    if (Platform.OS !== "web") {
      // Update app icon badge with total unread (messages + announcements)
      const currentMessageCount = get().unreadCount;
      const totalBadgeCount = currentMessageCount + counts.total;
      Notifications.setBadgeCountAsync(totalBadgeCount);
    }
  },

  fetchUnreadAnnouncementCount: async (userId: string, type: "division" | "gca" | "total") => {
    try {
      // Implementation will query announcements table for unread count
      // This will be similar to existing fetchUnreadCount but for announcements
      const { data, error } = await supabase
        .from("announcements")
        .select("id, read_by, target_type, target_division_ids")
        .eq("is_active", true);

      if (error) throw error;

      // Get user's pin number and division for filtering
      const { data: memberData } = await supabase
        .from("members")
        .select("pin_number, division_id")
        .eq("id", userId)
        .single();

      if (!memberData) return 0;

      const userPin = memberData.pin_number.toString();
      let count = 0;

      data?.forEach((announcement) => {
        const isRead = announcement.read_by?.includes(userPin);
        if (isRead) return;

        if (type === "gca" && announcement.target_type === "GCA") {
          count++;
        } else if (type === "division" && announcement.target_type === "division") {
          if (announcement.target_division_ids?.includes(memberData.division_id)) {
            count++;
          }
        } else if (type === "total") {
          if (
            announcement.target_type === "GCA" ||
            (announcement.target_type === "division" &&
              announcement.target_division_ids?.includes(memberData.division_id))
          ) {
            count++;
          }
        }
      });

      return count;
    } catch (error) {
      console.error("[BadgeStore] Error fetching announcement unread count:", error);
      return 0;
    }
  },

  resetAnnouncementBadges: () => {
    set({
      announcementUnreadCount: { division: 0, gca: 0, total: 0 },
    });
  },
}));
```

- [ ] ### Phase 3: UI Component Extensions

- [ ] #### Step 1: Extend NavigationCard Component for Badge Support

```typescript
// components/NavigationCard.tsx - Extend to support badges

interface NavigationCardProps {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: LinkProps["href"];
  params?: Record<string, string | number>;
  withAnchor?: boolean;
  badge?: React.ReactNode; // Add optional badge prop for future extensibility
  badgeCount?: number; // Add optional badge count for simple numeric badges
  badgeColor?: string; // Add optional badge color customization
}

export function NavigationCard({
  title,
  description,
  icon,
  href,
  params,
  withAnchor = true,
  badge,
  badgeCount,
  badgeColor = "#FF3B30", // Default red badge color
}: NavigationCardProps) {
  const colorScheme = (useColorScheme() ?? "light") as ColorSchemeName;
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === "web";

  // Calculate card width based on platform
  const cardWidth = isWeb ? 400 : width - 32;
  const cardStyle = [styles.cardWrapper, { width: cardWidth }];

  // Render badge if provided
  const renderBadge = () => {
    if (badge) {
      return badge; // Custom badge component
    }

    if (badgeCount && badgeCount > 0) {
      const displayCount = badgeCount > 99 ? "99+" : badgeCount.toString();
      return (
        <ThemedView style={[styles.badge, { backgroundColor: badgeColor }]}>
          <ThemedText style={styles.badgeText}>{displayCount}</ThemedText>
        </ThemedView>
      );
    }

    return null;
  };

  const CardContent = () => (
    <ThemedView style={styles.card}>
      <ThemedView style={styles.innerContainer}>
        <ThemedView style={styles.iconContainer}>
          <Ionicons
            name={icon}
            size={32}
            color="#B4975A" // Using BLET gold for icons
          />
          {/* Badge positioned over icon */}
          {renderBadge()}
        </ThemedView>
        <ThemedView style={styles.content}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText style={styles.description} numberOfLines={2}>
            {description}
          </ThemedText>
        </ThemedView>
        <ThemedView style={styles.chevronContainer}>
          <Ionicons name="chevron-forward" size={24} color="#B4975A" />
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );

  // ... rest of component implementation remains the same ...
}

// Add badge styles to existing styles
const styles = StyleSheet.create({
  // ... existing styles ...
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    zIndex: 1,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});
```

- [ ] #### Step 2: Create Announcement Badge Component

```typescript
// components/ui/AnnouncementBadge.tsx

import React from "react";
import { StyleSheet, ViewStyle } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useBadgeStore } from "@/store/badgeStore";
import { useAuth } from "@/hooks/useAuth";

interface AnnouncementBadgeProps {
  style?: ViewStyle;
  targetType?: "division" | "gca" | "total";
  divisionContext?: string; // Add division context for proper filtering
  color?: string; // Allow custom badge colors
}

export function AnnouncementBadge({
  style,
  targetType = "total",
  divisionContext,
  color = "#007AFF", // Default blue for division, can be overridden
}: AnnouncementBadgeProps) {
  const { member } = useAuth();
  const announcementUnreadCount = useBadgeStore((state) => state.announcementUnreadCount);

  // Get unread count based on target type and division context
  const getUnreadCount = () => {
    if (!member) return 0;

    switch (targetType) {
      case "division":
        // Only show division count if user's division matches context or no context specified
        if (divisionContext && member.division?.name !== divisionContext) {
          return 0;
        }
        return announcementUnreadCount.division;
      case "gca":
        return announcementUnreadCount.gca;
      case "total":
        return announcementUnreadCount.total;
      default:
        return 0;
    }
  };

  const unreadCount = getUnreadCount();

  // Don't render anything if there are no unread announcements
  if (unreadCount <= 0) {
    return null;
  }

  // Limit displayed count for visual neatness (e.g., 99+)
  const displayCount = unreadCount > 99 ? "99+" : unreadCount.toString();

  return (
    <ThemedView style={[styles.badgeContainer, { backgroundColor: color }, style]}>
      <ThemedText style={styles.badgeText}>{displayCount}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  badgeContainer: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    zIndex: 1,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
});
```

- [ ] #### Step 3: Create Announcement Modal Component (Reusing Existing Patterns)

```typescript
// components/modals/AnnouncementModal.tsx

import React, { useState, useRef, useEffect } from "react";
import { Modal, StyleSheet, TouchableOpacity, ScrollView, Pressable, Platform, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { DocumentViewer } from "@/components/DocumentViewer"; // Reuse existing document viewer
import type { Announcement } from "@/types/announcements";

interface AnnouncementModalProps {
  announcement: Announcement | null;
  visible: boolean;
  onClose: () => void;
  onAcknowledge: (announcement: Announcement) => Promise<void>;
  onMarkAsRead: (announcementId: string) => Promise<void>;
}

export function AnnouncementModal({
  announcement,
  visible,
  onClose,
  onAcknowledge,
  onMarkAsRead,
}: AnnouncementModalProps) {
  const theme = (useColorScheme() ?? "light") as ColorScheme;
  const [hasReadFully, setHasReadFully] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  // Reset read state when announcement changes
  useEffect(() => {
    if (announcement) {
      setHasReadFully(false);
      setContentHeight(0);
      setContainerHeight(0);
    }
  }, [announcement?.id]);

  if (!announcement) return null;

  // Handle scroll to track reading progress (following MessageModal pattern)
  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;
    const isScrolledToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (isScrolledToBottom && !hasReadFully) {
      setHasReadFully(true);
      // Mark as read when user scrolls to bottom
      onMarkAsRead(announcement.id);
    }
  };

  const handleContainerLayout = (event: any) => {
    setContainerHeight(event.nativeEvent.layout.height);
  };

  const handleContentLayout = (event: any) => {
    const height = event.nativeEvent.layout.height;
    setContentHeight(height);

    // If content fits in container, mark as read immediately
    if (height <= containerHeight && !hasReadFully) {
      setHasReadFully(true);
      onMarkAsRead(announcement.id);
    }
  };

  const handleAcknowledge = async () => {
    if (hasReadFully && announcement.require_acknowledgment) {
      await onAcknowledge(announcement);
      onClose();
    }
  };

  const isAcknowledged = announcement.has_been_acknowledged;
  const showAcknowledgeButton = announcement.require_acknowledgment && !isAcknowledged;

  // Render links if any
  const renderLinks = () => {
    if (!announcement.links || announcement.links.length === 0) return null;

    return (
      <ThemedView style={styles.linksSection}>
        <ThemedText style={styles.sectionTitle}>Links</ThemedText>
        {announcement.links.map((link, index) => (
          <TouchableOpacity key={index} style={styles.linkItem} onPress={() => Linking.openURL(link.url)}>
            <Ionicons name="link" size={16} color={Colors[theme].tint} />
            <ThemedText style={[styles.linkText, { color: Colors[theme].tint }]}>{link.label || link.url}</ThemedText>
          </TouchableOpacity>
        ))}
      </ThemedView>
    );
  };

  // Render document attachments if any (using existing document system)
  const renderDocuments = () => {
    if (!announcement.document_ids || announcement.document_ids.length === 0) return null;

    return (
      <ThemedView style={styles.documentsSection}>
        <ThemedText style={styles.sectionTitle}>Attachments</ThemedText>
        {announcement.document_ids.map((docId, index) => (
          <TouchableOpacity
            key={index}
            style={styles.documentItem}
            onPress={() => {
              // Open document using existing DocumentViewer
              // This would need to fetch document details and open in modal
            }}
          >
            <Ionicons name="document-text" size={16} color={Colors[theme].text} />
            <ThemedText style={styles.documentText}>Document {index + 1}</ThemedText>
          </TouchableOpacity>
        ))}
      </ThemedView>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: Colors[theme].card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <ThemedView style={styles.header}>
            <ThemedView style={styles.headerLeft}>
              <ThemedView
                style={[styles.iconWrapper, announcement.require_acknowledgment && styles.mustAcknowledgeIconWrapper]}
              >
                <Ionicons
                  name="megaphone"
                  size={24}
                  color={announcement.require_acknowledgment ? Colors[theme].primary : Colors[theme].text}
                />
              </ThemedView>
              <ThemedView>
                <ThemedView style={styles.typeContainer}>
                  <ThemedText style={styles.announcementType}>
                    {announcement.target_type === "GCA" ? "GCA Announcement" : "Division Announcement"}
                  </ThemedText>
                  {announcement.require_acknowledgment && !isAcknowledged && (
                    <ThemedView style={[styles.acknowledgmentBadge, { backgroundColor: Colors[theme].primary }]}>
                      <ThemedText style={styles.acknowledgmentBadgeText}>Requires Acknowledgment</ThemedText>
                    </ThemedView>
                  )}
                </ThemedView>
                <ThemedText style={styles.timestamp}>
                  {format(parseISO(announcement.created_at), "MMM d, yyyy h:mm a")}
                </ThemedText>
                {announcement.author_name && (
                  <ThemedText style={styles.author}>By {announcement.author_name}</ThemedText>
                )}
              </ThemedView>
            </ThemedView>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors[theme].text} />
            </TouchableOpacity>
          </ThemedView>

          {/* Title */}
          <ThemedText style={styles.title}>{announcement.title}</ThemedText>

          {/* Content */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.contentScroll}
            contentContainerStyle={styles.contentContainer}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onLayout={handleContainerLayout}
          >
            <ThemedView onLayout={handleContentLayout}>
              <ThemedText style={styles.content}>{announcement.message}</ThemedText>
              {renderLinks()}
              {renderDocuments()}
            </ThemedView>
          </ScrollView>

          {/* Footer */}
          <ThemedView style={styles.footer}>
            {showAcknowledgeButton && (
              <TouchableOpacity
                style={[
                  styles.acknowledgeButton,
                  { backgroundColor: hasReadFully ? Colors[theme].primary : Colors[theme].disabled },
                ]}
                onPress={handleAcknowledge}
                disabled={!hasReadFully}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
                <ThemedText style={styles.acknowledgeButtonText}>
                  {hasReadFully
                    ? "Acknowledge Announcement"
                    : contentHeight <= containerHeight
                    ? "Loading..."
                    : "Scroll to End to Acknowledge"}
                </ThemedText>
              </TouchableOpacity>
            )}
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Styles following MessageModal patterns
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxWidth: 500,
    maxHeight: "80%",
    borderRadius: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128, 128, 128, 0.1)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(128, 128, 128, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  mustAcknowledgeIconWrapper: {
    backgroundColor: Colors.light.primary + "20",
  },
  typeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  announcementType: {
    fontSize: 14,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  acknowledgmentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  acknowledgmentBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  timestamp: {
    fontSize: 12,
    opacity: 0.6,
  },
  author: {
    fontSize: 12,
    opacity: 0.8,
    fontStyle: "italic",
  },
  closeButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    padding: 16,
    paddingTop: 8,
  },
  contentScroll: {
    maxHeight: "60%",
  },
  contentContainer: {
    padding: 16,
    paddingTop: 0,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
  },
  linksSection: {
    marginTop: 16,
  },
  documentsSection: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  linkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 14,
    textDecorationLine: "underline",
  },
  documentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  documentText: {
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(128, 128, 128, 0.1)",
  },
  acknowledgeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  acknowledgeButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
```

- [ ] ### Phase 4: Member UI for Viewing Announcements

**Important User Experience Requirements:**

- Announcements requiring acknowledgment must use a modal approach (similar to existing notification acknowledgement system), blocking access to other content until acknowledged
- Unread announcements should retain unread status across user sessions (logout/login) using the same database persistence as existing notifications
- Important announcements should have special visual styling to highlight their importance
- Expired announcements should remain visible but be clearly marked as expired
- **Division context must be strictly enforced to prevent cross-contamination of division information**

**Document Integration Approach:**

- **Use existing document upload/viewer components as-is** - No announcement-specific document flow needed
- **Integrate document IDs into announcement creation** - Store document references in `document_ids` array
- **Leverage existing DocumentViewer component** - Use the same component that handles other document viewing in the app
- **Follow existing document validation** - Use the same 25MB limit and file type restrictions as current document system
- **Reuse existing document storage patterns** - Store in Supabase Storage using the same bucket structure

- [ ] #### Step 1: Create Division Announcements Screen with Division Context

```typescript
// app/(division)/[divisionName]/announcements/page.tsx

import React, { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useUserStore } from "@/store/userStore";
// ... other imports

export default function DivisionAnnouncementsPage() {
  // Get division name from route params (following pattern from meetings.tsx)
  const params = useLocalSearchParams();
  const divisionName = params.divisionName as string;

  // Following the exact pattern from meetings.tsx for division context management
  const { session, member } = useAuth();

  // Use the store with individual selectors (following pattern from meetings.tsx)
  const announcements = useAnnouncementStore((state) => state.announcements);
  const isLoading = useAnnouncementStore((state) => state.isLoading);
  const loadingOperation = useAnnouncementStore((state) => state.loadingOperation);
  const error = useAnnouncementStore((state) => state.error);
  const currentDivisionContext = useAnnouncementStore((state) => state.currentDivisionContext);

  // Get store actions (following pattern from meetings.tsx)
  const fetchDivisionAnnouncements = useAnnouncementStore((state) => state.fetchDivisionAnnouncements);
  const setDivisionContext = useAnnouncementStore((state) => state.setDivisionContext);
  const subscribeToAnnouncements = useAnnouncementStore((state) => state.subscribeToAnnouncements);
  const unsubscribeFromAnnouncements = useAnnouncementStore((state) => state.unsubscribeFromAnnouncements);
  const markAnnouncementAsRead = useAnnouncementStore((state) => state.markAnnouncementAsRead);
  const acknowledgeAnnouncement = useAnnouncementStore((state) => state.acknowledgeAnnouncement);

  // Set division context and fetch announcements (following pattern from meetings.tsx)
  useEffect(() => {
    if (divisionName) {
      setDivisionContext(divisionName);
      fetchDivisionAnnouncements(divisionName);
    }
  }, [divisionName, setDivisionContext, fetchDivisionAnnouncements]);

  // Subscribe to realtime updates (following pattern from meetings.tsx)
  useEffect(() => {
    const cleanup = subscribeToAnnouncements(divisionName);
    return cleanup;
  }, [divisionName, subscribeToAnnouncements]);

  // Get division-specific announcements (following pattern from meetings.tsx)
  const divisionAnnouncements = announcements[divisionName] || [];

  // Validate division context matches user's division (prevent unauthorized access)
  useEffect(() => {
    if (member && divisionName) {
      // Validate that user belongs to this division
      // This should match the division context validation from meetings.tsx
      const userDivisionName = member.division?.name;
      if (userDivisionName !== divisionName) {
        console.warn(`User division ${userDivisionName} does not match route division ${divisionName}`);
        // Handle unauthorized access - redirect or show error
      }
    }
  }, [member, divisionName]);

  // Loading state (following pattern from meetings.tsx)
  if (isLoading && !divisionAnnouncements.length) {
    return (
      <DivisionLoadingIndicator
        divisionName={divisionName}
        operation={loadingOperation || "Loading announcements"}
        isVisible={true}
      />
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.errorContainer}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </ThemedView>
    );
  }

  // Implementation of the division announcements viewing page
  // - Display division-specific announcements (filtered by division context)
  // - Mark as read functionality (with division context validation)
  // - Document viewing using existing document viewer components
  // - Implement acknowledgment modal for required announcements
  // - Strict division boundary enforcement

  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        {/* Division Announcements Header */}
        <ThemedView style={styles.header}>
          <ThemedText style={styles.title}>Division {divisionName} Announcements</ThemedText>
        </ThemedView>

        {/* Announcements List with Division Context Validation */}
        {divisionAnnouncements.map((announcement) => (
          <AnnouncementCard
            key={announcement.id}
            announcement={announcement}
            divisionContext={divisionName} // Pass division context for validation
            onRead={() => markAnnouncementAsRead(announcement.id)}
            onAcknowledge={() => acknowledgeAnnouncement(announcement.id)}
          />
        ))}

        {divisionAnnouncements.length === 0 && (
          <ThemedText style={styles.noAnnouncementsText}>No announcements for Division {divisionName}</ThemedText>
        )}
      </ThemedView>
    </ThemedScrollView>
  );
}
```

- [ ] #### Step 2: Create Union/GCA Announcements Screen with Context Validation

```typescript
// app/(gca)/announcements/page.tsx

import React, { useEffect } from "react";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useUserStore } from "@/store/userStore";
// ... other imports

export default function UnionAnnouncementsPage() {
  // Following pattern from meetings.tsx but for GCA context
  const { session, member } = useAuth();

  // Use the store with individual selectors
  const announcements = useAnnouncementStore((state) => state.announcements);
  const isLoading = useAnnouncementStore((state) => state.isLoading);
  const error = useAnnouncementStore((state) => state.error);

  // Get store actions
  const fetchGCAnnouncements = useAnnouncementStore((state) => state.fetchGCAnnouncements);
  const setDivisionContext = useAnnouncementStore((state) => state.setDivisionContext);
  const subscribeToAnnouncements = useAnnouncementStore((state) => state.subscribeToAnnouncements);
  const markAnnouncementAsRead = useAnnouncementStore((state) => state.markAnnouncementAsRead);
  const acknowledgeAnnouncement = useAnnouncementStore((state) => state.acknowledgeAnnouncement);

  // Set GCA context and fetch announcements
  useEffect(() => {
    setDivisionContext("GCA"); // Set context to GCA for union announcements
    fetchGCAnnouncements();
  }, [setDivisionContext, fetchGCAnnouncements]);

  // Subscribe to realtime updates for GCA announcements
  useEffect(() => {
    const cleanup = subscribeToAnnouncements("GCA");
    return cleanup;
  }, [subscribeToAnnouncements]);

  // Get GCA announcements (following pattern from meetings.tsx)
  const gcaAnnouncements = announcements["GCA"] || [];

  // Implementation of the union announcements viewing page
  // - Display union/GCA-level announcements (filtered by GCA context)
  // - Mark as read functionality (with context validation)
  // - Document viewing using existing document viewer components
  // - Implement acknowledgment modal for required announcements
  // - Proper context separation from division announcements

  return (
    <ThemedScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        {/* GCA Announcements Header */}
        <ThemedView style={styles.header}>
          <ThemedText style={styles.title}>GCA Union Announcements</ThemedText>
        </ThemedView>

        {/* GCA Announcements List */}
        {gcaAnnouncements.map((announcement) => (
          <AnnouncementCard
            key={announcement.id}
            announcement={announcement}
            divisionContext="GCA" // Pass GCA context for validation
            onRead={() => markAnnouncementAsRead(announcement.id)}
            onAcknowledge={() => acknowledgeAnnouncement(announcement.id)}
          />
        ))}

        {gcaAnnouncements.length === 0 && (
          <ThemedText style={styles.noAnnouncementsText}>No GCA announcements available</ThemedText>
        )}
      </ThemedView>
    </ThemedScrollView>
  );
}
```

- [ ] #### Step 3: Integrate Badges into Navigation with Division Context

```typescript
// Modify app/(tabs)/index.tsx to add badges to navigation cards with proper division context
// Following the pattern from meetings.tsx for division context awareness

// In the navigation card components:

// Division Card Badge (Blue badge for division announcements)
<NavigationCard
  title="My Division"
  description="Division-specific content and announcements"
  icon="people"
  href="/(division)/[divisionName]"
  params={{ divisionName: member?.division?.name }}
  badge={
    <AnnouncementBadge
      targetType="division"
      divisionContext={member?.division?.name}
      color="#007AFF" // Blue for division
    />
  }
/>

// GCA Card Badge (Green badge for GCA announcements)
<NavigationCard
  title="GCA"
  description="Union-wide content and announcements"
  icon="business"
  href="/(gca)"
  badge={
    <AnnouncementBadge
      targetType="gca"
      divisionContext="GCA"
      color="#34C759" // Green for GCA
    />
  }
/>

// Alternative approach using badgeCount prop for simpler implementation:
<NavigationCard
  title="My Division"
  description="Division-specific content and announcements"
  icon="people"
  href="/(division)/[divisionName]"
  params={{ divisionName: member?.division?.name }}
  badgeCount={announcementUnreadCount.division}
  badgeColor="#007AFF"
/>

<NavigationCard
  title="GCA"
  description="Union-wide content and announcements"
  icon="business"
  href="/(gca)"
  badgeCount={announcementUnreadCount.gca}
  badgeColor="#34C759"
/>

// Sub-navigation badges with proper context filtering:
// "Announcements" sub-navigation card under "My Division" (Blue badge)
<NavigationCard
  title="Division Announcements"
  description="Important announcements for your division"
  icon="megaphone"
  href="/(division)/[divisionName]/announcements"
  params={{ divisionName: member?.division?.name }}
  badge={
    <AnnouncementBadge
      targetType="division"
      divisionContext={member?.division?.name}
      color="#007AFF"
    />
  }
/>

// "GCA Announcements" sub-navigation card under "GCA" (Green badge)
<NavigationCard
  title="GCA Announcements"
  description="Union-wide announcements and updates"
  icon="megaphone"
  href="/(gca)/announcements"
  badge={
    <AnnouncementBadge
      targetType="gca"
      divisionContext="GCA"
      color="#34C759"
    />
  }
/>
```

**Key Division Context Enforcement Points:**

1. **Route-level validation**: Verify user belongs to the division they're trying to access
2. **Store-level filtering**: All announcement fetches are filtered by division context
3. **Component-level validation**: AnnouncementCard validates announcements belong to current context
4. **Badge-level filtering**: Badges only show counts for announcements relevant to current context
5. **Realtime subscription filtering**: Only subscribe to changes relevant to current division context
6. **Database query filtering**: All queries include division context filters to prevent data leakage

**Following Patterns from meetings.tsx:**

- Division name passed as route parameter and used for context setting
- Store actions called with division context parameter
- Realtime subscriptions scoped to division context
- Loading states and error handling following same patterns
- Data validation and integrity checks with division context
- UI components receive division context as props for validation

### Phase 5: Notification and Analytics Enhancements

**Announcement Lifecycle Management:**

- Implement admin notifications for announcements approaching expiration date
- Create an admin view to show announcements by state: active, pending (future scheduled date), and expired
- Scheduled announcements should be visible to admins in a "pending" state
- Integrate with existing navigation elements ("My Division" and "GCA" cards) for badge notifications
- Keep announcement notifications separate from other notification types

- [ ] #### Step 1: Implement Announcement Analytics for Admins

```typescript
// components/admin/analytics/AnnouncementAnalytics.tsx

import React, { useState, useEffect } from "react";
import { supabase } from "@/utils/supabase";
// ... other imports

export function AnnouncementAnalytics({ announcementId }: { announcementId: string }) {
  // Implementation of the analytics component
  // - Show read percentage
  // - List users who have/haven't read
  // - Display read timestamps
}
```

- [ ] #### Step 2: Implement Scheduled Announcements (Union Admin only)

```typescript
// components/admin/union/ScheduledAnnouncements.tsx

import React, { useState } from "react";
import { useAnnouncementStore } from "@/store/announcementStore";
// ... other imports

export function ScheduledAnnouncements() {
  // Implementation of the scheduling interface
  // - Set future start date/time
  // - Set expiration date/time
  // - View calendar of scheduled announcements
}
```

- [ ] #### Step 3: Add Push Notification Support

```typescript
// utils/announcementNotificationService.ts

import { supabase } from "@/utils/supabase";
// ... other imports

export async function sendAnnouncementNotification(announcementId: string) {
  // Implementation of push notification for new announcements
}
```

### Phase 6: Testing and Deployment

**Step 1: Create test cases**

- Write unit tests for store functionality
- Write integration tests for UI components
- Test RLS policies with different user roles

**Step 2: Perform cross-platform testing (Responsibility of User)**

- Test on web (desktop and mobile)
- Test on Android devices
- Test on iOS devices

**Step 3: Deploy schema changes and backend**

- Apply database migrations
- Verify RLS policies in production

**Step 4: Deploy frontend changes**

- Update app with new components
- Monitor for any issues

## Integration with Existing Systems

### Admin Message System Integration

- Leverage existing admin message read status tracking from the messages system
- Use similar UI patterns for consistency with existing admin interfaces
- Reuse badge notification system from notificationStore.ts but keep announcement badges separate

### Document System Integration

- Use existing document storage system through Supabase Storage
- Integrate with existing document upload and viewer components
- Enforce 25 MB file size limit and maximum of 3 attachments per announcement
- Apply appropriate validation on the client and server sides following existing patterns

### User Role System Integration

- Utilize the existing role-based access control in the members table (members.role)
- Initialize announcement store after auth completion following the pattern in useAuth.tsx
- Follow current role validation patterns for division/union admins in existing admin components

## Technical Considerations

### Performance Optimization

- Implement pagination for announcement lists following existing patterns
- Use appropriate indices for database queries
- Optimize read analytics for large user bases
- Implement appropriate caching strategy similar to existing Zustand stores

### Security Considerations

- Ensure proper RLS policies for all tables following current database security patterns
- Validate input on both client and server using consistent validation approaches
- Implement appropriate permission checks in UI based on user roles

### Realtime Updates

- Use Supabase realtime subscriptions following the pattern in notificationStore.ts
- Set up multiple subscription channels for different announcement types
- Implement proper subscription cleanup in the store's initialization function
- Maintain error handling and reconnection strategies consistent with existing code
- Update badge counts using the same mechanism as notification badges but keep them separate

## Integration with Existing Messages/Notifications System

- Follow the same modal approach for acknowledgment as used in the existing notification system
- Ensure consistency between announcement acknowledgment UX and message acknowledgment UX
- Keep announcements as a separate system from regular messages but maintain consistent UI patterns
- Update the auth hook initialization function to initialize the announcement store following the pattern for other stores
- Initialize the announcement store after the notification store in the initialization sequence in useAuth.tsx

## Future Enhancements (Post-MVP)

1. **Rich Text Editing** - Allow formatting in announcement content
2. **Comment System** - Enable members to comment on announcements
3. **Scheduled Deletion** - Automatically remove expired announcements
4. **Categories/Tags** - Organize announcements by topic
5. **Priority Levels** - Mark certain announcements as high priority
6. **Email Integration** - Send important announcements via email

[ ] **Update admin message screens to handle deep linking**:

```typescript
// In app/(admin)/messages/[messageId].tsx or equivalent SEARCH CODEBASE TO MAKE SURE CORRECT PATH IS USED
import { useLocalSearchParams } from "expo-router";

export default function AdminMessageDetailScreen() {
  const { messageId } = useLocalSearchParams();
  const { markAdminMessageAsRead } = useAdminMessagesStore();

  useEffect(() => {
    if (messageId) {
      // Mark admin message as read
      markAdminMessageAsRead(messageId as string);

      // Update delivery status if from notification
      markNotificationDelivered(messageId as string, "read");
    }
  }, [messageId]);

  // Rest of component...
}
```

- [ ] **Update announcement screens to handle deep linking**:

  ```typescript
  // In app/(gca)/gca-announcements/[announcementId].tsx or equivalent SEARCH CODEBASE TO MAKE SURE CORRECT PATH IS USED
  // Need to update division and gca announcements
  import { useLocalSearchParams } from "expo-router";

  export default function GCAAnnouncementDetailScreen() {
    const { announcementId } = useLocalSearchParams();
    const { markAnnouncementAsRead } = useAnnouncementsStore();

    useEffect(() => {
      if (announcementId) {
        // Mark announcement as read
        markAnnouncementAsRead(announcementId as string);

        // Update delivery status if from notification
        markNotificationDelivered(announcementId as string, "read");
      }
    }, [announcementId]);

    // Rest of component...
  }
  ```

## Summary of Division Context Integration

### Key Changes Made to Prevent Cross-Contamination

Based on the division context implementation in the meetings system (`meetings.tsx` and `divisionMeetingStore.ts`), the following critical patterns have been incorporated into the announcements plan:

#### 1. **Store Architecture Changes**

- **Data Organization**: Announcements stored by division context (`Record<string, Announcement[]>`) instead of flat array
- **Division Context Tracking**: Added `currentDivisionContext` state variable to track active division
- **Context Validation**: Added `validateAnnouncementDivisionContext()` helper function
- **Error Handling**: Added `handleAnnouncementDivisionError()` for contextual error messages

#### 2. **Database Query Filtering**

- **Division-Scoped Queries**: All announcement fetches include division context filters
- **Pattern from meetings**: `fetchDivisionAnnouncements(divisionName)` follows `fetchDivisionMeetings(divisionName)` pattern
- **RLS Policy Enhancement**: Database policies must validate division context for all operations
- **Query Optimization**: Use division IDs in WHERE clauses to prevent data leakage

#### 3. **Realtime Subscription Filtering**

- **Context-Aware Subscriptions**: Realtime channels scoped to specific divisions
- **Change Validation**: Incoming realtime changes validated against current division context
- **Pattern from meetings**: Channel naming with division suffix (`announcements-changes-${divisionName}`)
- **Subscription Cleanup**: Proper cleanup when division context changes

#### 4. **Component-Level Validation**

- **Props-Based Context**: All components receive `divisionContext` prop for validation
- **Render Guards**: Components validate announcements belong to current context before rendering
- **Route Parameter Validation**: Division screens validate user belongs to accessed division
- **Pattern from meetings**: Division name from route params used for all context operations

#### 5. **UI State Management**

- **Context-Scoped Loading**: Loading states include division context information
- **Badge Filtering**: Unread counts filtered by division context
- **Navigation Guards**: Prevent access to unauthorized division content
- **Error Boundaries**: Division-specific error handling and display

#### 6. **Critical Implementation Points**

**Following Exact Patterns from `meetings.tsx`:**

```typescript
// 1. Route parameter extraction and validation
const params = useLocalSearchParams();
const divisionName = params.divisionName as string;

// 2. Division context setting in useEffect
useEffect(() => {
  if (divisionName) {
    setDivisionContext(divisionName);
    fetchDivisionAnnouncements(divisionName);
  }
}, [divisionName, setDivisionContext, fetchDivisionAnnouncements]);

// 3. Realtime subscription with division context
useEffect(() => {
  const cleanup = subscribeToAnnouncements(divisionName);
  return cleanup;
}, [divisionName, subscribeToAnnouncements]);

// 4. Data access with division key
const divisionAnnouncements = announcements[divisionName] || [];
```

**Following Exact Patterns from `divisionMeetingStore.ts`:**

```typescript
// 1. Store state organization
announcements: Record<string, Announcement[]>; // By division name
currentDivisionContext: string | null;

// 2. Division context validation
const validateAnnouncementDivisionContext = async (
  announcementId: string,
  expectedDivisionName?: string
): Promise<boolean> => {
  // Validation logic following meetings pattern
};

// 3. Realtime filtering
if (divisionId && changeTargetDivisionIds && !changeTargetDivisionIds.includes(divisionId)) {
  console.log(`[Realtime] Ignoring change for different division`);
  return;
}
```

#### 7. **Database Schema Considerations**

- **Target Division IDs**: Use `target_division_ids` array for precise division targeting
- **Context Validation Functions**: Database functions must validate division context
- **RLS Policy Updates**: Policies must prevent cross-division data access
- **Query Optimization**: Indices on division-related columns for performance

#### 8. **Testing Requirements**

- **Division Isolation Tests**: Verify announcements don't leak between divisions
- **Context Switching Tests**: Ensure proper cleanup when changing division context
- **Unauthorized Access Tests**: Verify users can't access other divisions' announcements
- **Realtime Filtering Tests**: Confirm realtime updates respect division boundaries

### Migration from Existing Systems

If implementing this on an existing system without division context:

1. **Audit Existing Data**: Identify any cross-contamination in current data
2. **Gradual Migration**: Implement division context validation incrementally
3. **Backward Compatibility**: Ensure existing functionality continues during migration
4. **Data Cleanup**: Remove any announcements that don't belong to their target divisions
5. **User Communication**: Inform users about improved data isolation

### Performance Considerations

- **Query Optimization**: Division-scoped queries are more efficient than global queries
- **Subscription Management**: Fewer realtime subscriptions per user (only their division)
- **Cache Efficiency**: Division-scoped caching reduces memory usage
- **Network Traffic**: Reduced data transfer due to precise filtering

This division context integration ensures that the announcements system maintains the same level of data isolation and security as the meetings system, preventing any cross-contamination of division information.

## Summary

The announcements feature implementation plan is now complete and ready for implementation. The plan incorporates:

✅ **Database Migration Strategy**: 2-3 separate migrations for easier rollback  
✅ **Badge Store Extension**: Extended existing badgeStore for all announcement badges  
✅ **NavigationCard Enhancement**: Extended for future badge extensibility  
✅ **Document Integration**: Using existing document components as-is  
✅ **Acknowledgment Patterns**: Reusing existing modal and acknowledgment UX  
✅ **Division Context Security**: Following exact patterns from meetings system  
✅ **Phase-by-Phase Implementation**: With review pauses after each phase

The implementation will proceed through 6 phases:

1. **Database Schema Design** (3 migrations)
2. **State Management** (Zustand store with division context)
3. **UI Component Extensions** (NavigationCard, badges, modals)
4. **Member UI** (Division and GCA announcement viewing)
5. **Admin UI** (Management interfaces for all admin types)
6. **Testing and Deployment** (Manual testing after each phase)

All clarifications have been incorporated and the plan is ready for implementation.
