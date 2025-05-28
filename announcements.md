# Announcements Feature Implementation Plan

## Overview

This document outlines the implementation strategy for adding Announcements functionality to the application. The entire system will be developed progressively. Announcements will be managed by division, union, and application admins and displayed to members based on their respective divisions or union-wide.

**Note on UI Development**: Utilize existing UI components and styling consistent with the current application theme and usage. **Always search the codebase for suitable existing components before creating new ones.**

### Key Features

1. **Multiple levels of announcements**:

   - Division level (managed by `division_admin` for their specific division(s))
   - GCA/Union level (managed by `union_admin` or `application_admin`)

2. **Admin management interfaces**:

   - Division Admin Dashboard → Division Management → Announcements (CRUD for own division, view read/unread status for division members)
   - Union Admin Dashboard → Union Announcements (Tabbed interface for managing GCA and all division announcements)
   - Application Admin: Full control via appropriate interfaces.

3. **Announcement content**:

   - Title
   - Description/message
   - Optional links
   - Optional document attachments (integrated into the creation flow)

4. **Read tracking and notification**:
   - Track which users have read announcements (implicitly upon viewing/scrolling).
   - Badge notifications for unread announcements.
   - Badge notifications on navigation elements:
     - "My Division" navigation card (Blue badge)
     - "GCA" navigation card (Green badge)
     - "Announcements" sub-navigation card under "My Division" (Blue badge)
     - "GCA Announcements" sub-navigation card under "GCA" (Green badge)

## Implementation Phases

- [ ] ### Phase 1: Database Schema Design

**Step 1: Create Announcements Table**

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
  document_ids UUID[] DEFAULT '{}'::uuid[], -- References to documents in storage bucket
  read_by TEXT[] DEFAULT '{}'::text[], -- Array of pin numbers who have read this announcement
  acknowledged_by TEXT[] DEFAULT '{}'::text[] -- Array of pin numbers who have acknowledged this announcement
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

**Note:** This table is optional as we're already tracking read status in the announcements table using the read_by array. This table provides additional detail about when each announcement was read, which can be useful for analytics.

**Step 3: Create View for Announcements with Author Names**

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

**Step 4: Create a Helpful View for Announcement Analytics**

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

**Step 5: Create Helper View for Union Admin Announcements**

This view will help optimize the RLS policies by pre-filtering announcements that are relevant to union admins:

```sql
CREATE VIEW public.union_admin_announcement_roots AS
SELECT DISTINCT a.id AS announcement_id
FROM public.announcements a
WHERE a.creator_role = 'union_admin'
   OR a.target_type = 'GCA';
```

**Step 6: Add RLS Policies**

Row Level Security policies will enforce access control based on user roles. The defined hierarchy is:
`application_admin` (fullest access) > `union_admin` (GCA and all division functions) > `division_admin` (own division functions only).

**RLS for `public.announcements` table:**

```sql
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Policy for Application Admins (Full Access)
CREATE POLICY "APP_ADMIN_full_access_announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'application_admin'
  ));

-- Policy for Union Admins (Manage GCA and All Division Announcements)
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

-- Policy for Division Admins (Manage Own Division's Announcements)
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

-- Policy for Viewing Announcements (All authenticated users)
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

-- Users can manage their own read status
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

**Step 7: Create Helper Functions for Read Status Management**

We'll leverage the existing pattern from messages system for our announcement read status tracking:

```sql
CREATE OR REPLACE FUNCTION public.mark_announcement_as_read(announcement_id UUID)
RETURNS void AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_pin_number TEXT;
BEGIN
  -- Get the user's pin number
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

  -- Add to the read_by array in the announcements table if not already there
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
  -- Get the user's pin number
  SELECT pin_number::text INTO v_pin_number
  FROM public.members
  WHERE id = v_user_id;

  IF v_pin_number IS NULL THEN
    RAISE EXCEPTION 'User pin number not found';
  END IF;

  -- Remove from read_status table
  DELETE FROM public.announcement_read_status
  WHERE announcement_id = $1 AND user_id = auth.uid();

  -- Remove from read_by array
  UPDATE public.announcements
  SET read_by = array_remove(read_by, v_pin_number)
  WHERE id = announcement_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 8: Create Functions for Creating and Managing Announcements**

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

  -- Validate document count
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

**Step 9: Implement Announcement Acknowledgment Functions**

For announcements with `require_acknowledgment = true`, create functions to handle acknowledgment similar to the existing message acknowledgment system:

```sql
-- Function to acknowledge an announcement (using string pin numbers like the current message system)
CREATE OR REPLACE FUNCTION public.acknowledge_announcement(announcement_id UUID)
RETURNS void AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_pin_number TEXT;
BEGIN
  -- Get the user's pin number
  SELECT pin_number::text INTO v_pin_number
  FROM public.members
  WHERE id = v_user_id;

  IF v_pin_number IS NULL THEN
    RAISE EXCEPTION 'User pin number not found';
  END IF;

  -- First mark as read
  PERFORM public.mark_announcement_as_read(announcement_id);

  -- Then add to acknowledged_by array if not already there
  UPDATE public.announcements
  SET acknowledged_by = array_append(acknowledged_by, v_pin_number)
  WHERE id = announcement_id AND NOT (v_pin_number = ANY(acknowledged_by));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

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

  // Helper function to update announcement badge counts
  _updateAnnouncementBadges: (unreadCounts) => {
    if (Platform.OS !== "web") {
      // Update badge counts but keep separate from notification badges
      // Only used internally by the store
    }
  },

  // Other implementation details following the same patterns...
}));
```

- [ ] ### Phase 3: Admin UI for Managing Announcements

- [ ] #### Step 1: Create Division Admin Announcement Management Screen

```typescript
// components/admin/division/DivisionAnnouncements.tsx

import React, { useState, useEffect } from "react";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useUserStore } from "@/store/userStore";
// ... other imports

interface DivisionAnnouncementsProps {
  division: string; // Division name passed as prop (following pattern from DivisionMeetings.tsx)
  isAdmin?: boolean;
}

export function DivisionAnnouncements({ division, isAdmin = false }: DivisionAnnouncementsProps) {
  // Following the exact pattern from DivisionMeetings.tsx for division context management

  // Use the store with individual selectors (following pattern from DivisionMeetings.tsx)
  const announcements = useAnnouncementStore((state) => state.announcements);
  const isLoading = useAnnouncementStore((state) => state.isLoading);
  const loadingOperation = useAnnouncementStore((state) => state.loadingOperation);
  const error = useAnnouncementStore((state) => state.error);
  const currentDivisionContext = useAnnouncementStore((state) => state.currentDivisionContext);

  // Get store actions (following pattern from DivisionMeetings.tsx)
  const fetchDivisionAnnouncements = useAnnouncementStore((state) => state.fetchDivisionAnnouncements);
  const setDivisionContext = useAnnouncementStore((state) => state.setDivisionContext);
  const subscribeToAnnouncements = useAnnouncementStore((state) => state.subscribeToAnnouncements);
  const unsubscribeFromAnnouncements = useAnnouncementStore((state) => state.unsubscribeFromAnnouncements);
  const createAnnouncement = useAnnouncementStore((state) => state.createAnnouncement);
  const updateAnnouncement = useAnnouncementStore((state) => state.updateAnnouncement);
  const deleteAnnouncement = useAnnouncementStore((state) => state.deleteAnnouncement);

  // Set division context and fetch announcements (following pattern from DivisionMeetings.tsx)
  useEffect(() => {
    if (division) {
      setDivisionContext(division);
      fetchDivisionAnnouncements(division);
    }
  }, [division, setDivisionContext, fetchDivisionAnnouncements]);

  // Subscribe to realtime updates (following pattern from DivisionMeetings.tsx)
  useEffect(() => {
    const cleanup = subscribeToAnnouncements(division);
    return cleanup;
  }, [division, subscribeToAnnouncements]);

  // Get division-specific announcements (following pattern from DivisionMeetings.tsx)
  const divisionAnnouncements = announcements[division] || [];

  // Implementation of the division admin announcement management UI
  // - List view of division announcements (filtered by division context)
  // - Create/edit/delete functionality (with division context validation)
  // - Toggle active status
  // - View read analytics (scoped to division members only)

  return (
    <div>
      {/* Division-specific announcement management UI */}
      {/* Following existing UI patterns from DivisionMeetings.tsx */}
    </div>
  );
}
```

- [ ] #### Step 2: Create Union Admin Announcement Management Screen

```typescript
// components/admin/union/UnionAnnouncements.tsx

import React, { useState, useEffect } from "react";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useUserStore } from "@/store/userStore";
// ... other imports

export function UnionAnnouncements() {
  // Following pattern from DivisionMeetings.tsx but for union-level management

  // Use the store with individual selectors
  const announcements = useAnnouncementStore((state) => state.announcements);
  const isLoading = useAnnouncementStore((state) => state.isLoading);
  const error = useAnnouncementStore((state) => state.error);

  // Get store actions
  const fetchGCAnnouncements = useAnnouncementStore((state) => state.fetchGCAnnouncements);
  const fetchDivisionAnnouncements = useAnnouncementStore((state) => state.fetchDivisionAnnouncements);
  const subscribeToAnnouncements = useAnnouncementStore((state) => state.subscribeToAnnouncements);
  const createAnnouncement = useAnnouncementStore((state) => state.createAnnouncement);
  const updateAnnouncement = useAnnouncementStore((state) => state.updateAnnouncement);
  const deleteAnnouncement = useAnnouncementStore((state) => state.deleteAnnouncement);

  // Fetch all announcements for union admin view
  useEffect(() => {
    // Fetch GCA announcements
    fetchGCAnnouncements();

    // Fetch all division announcements (union admins can see all)
    // This would need to be implemented to fetch all divisions
    // Following the pattern but for multiple divisions
  }, [fetchGCAnnouncements, fetchDivisionAnnouncements]);

  // Subscribe to realtime updates for all announcement types
  useEffect(() => {
    const cleanup = subscribeToAnnouncements(); // No division specified = all announcements
    return cleanup;
  }, [subscribeToAnnouncements]);

  // Implementation of the union admin announcement management UI
  // - Tabbed interface for managing GCA and all division announcements
  // - Create/edit/delete functionality for union announcements
  // - View read analytics across all announcements
  // - Scheduling capabilities
  // - Division context awareness for proper data segregation

  return (
    <div>
      {/* Union-level announcement management UI */}
      {/* Tabbed interface with proper division context handling */}
    </div>
  );
}
```

- [ ] #### Step 3: Create Announcement Card Component with Division Context Awareness

```typescript
// components/ui/AnnouncementCard.tsx

import React from "react";
import { useAnnouncementStore } from "@/store/announcementStore";
// ... other imports

interface AnnouncementCardProps {
  announcement: Announcement;
  isAdmin?: boolean;
  divisionContext?: string; // Add division context for validation
  onEdit?: () => void;
  onDelete?: () => void;
}

export function AnnouncementCard({ announcement, isAdmin, divisionContext, onEdit, onDelete }: AnnouncementCardProps) {
  // Validate that announcement belongs to current division context
  const isValidForContext = React.useMemo(() => {
    if (!divisionContext) return true; // No context restriction

    if (announcement.target_type === "GCA") return true; // GCA announcements visible to all

    if (announcement.target_type === "division") {
      // Check if current division is in target divisions
      // This would need division ID lookup logic
      return true; // Simplified for now
    }

    return false;
  }, [announcement, divisionContext]);

  if (!isValidForContext) {
    console.warn(`Announcement ${announcement.id} not valid for division context ${divisionContext}`);
    return null; // Don't render announcements that don't belong to current context
  }

  // Implement the card component that displays:
  // - Title
  // - Message with formatting
  // - Links
  // - Document links (with validation for up to 3 attachments, 25 MB file size limit)
  // - Read/unread indicator
  // - Acknowledgment status and UI if required
  // - Admin controls if isAdmin is true
  // - Division context validation

  return <div>{/* Announcement card UI with division context awareness */}</div>;
}
```

- [ ] #### Step 4: Create Announcement Badge Component with Division Context

```typescript
// components/ui/AnnouncementBadge.tsx

import React from "react";
import { useAnnouncementStore } from "@/store/announcementStore";
// ... other imports

interface AnnouncementBadgeProps {
  style?: any;
  targetType?: "division" | "union" | "all";
  divisionContext?: string; // Add division context for proper filtering
}

export function AnnouncementBadge({ style, targetType, divisionContext }: AnnouncementBadgeProps) {
  // Get unread counts with division context awareness
  const unreadCount = useAnnouncementStore((state) => {
    if (!divisionContext) return state.unreadCount.total;

    switch (targetType) {
      case "division":
        return state.unreadCount.division;
      case "union":
        return state.unreadCount.gca;
      default:
        return state.unreadCount.total;
    }
  });

  // Implementation of the badge component that shows unread count
  // - Filter by targetType and divisionContext if provided
  // - Prevent cross-contamination by respecting division boundaries

  return unreadCount > 0 ? <div style={style}>{unreadCount}</div> : null;
}
```

- [ ] ### Phase 4: Member UI for Viewing Announcements

**Important User Experience Requirements:**

- Announcements requiring acknowledgment must use a modal approach (similar to existing notification acknowledgement system), blocking access to other content until acknowledged
- Unread announcements should retain unread status across user sessions (logout/login) using the same database persistence as existing notifications
- Important announcements should have special visual styling to highlight their importance
- Expired announcements should remain visible but be clearly marked as expired
- **Division context must be strictly enforced to prevent cross-contamination of division information**

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
<AnnouncementBadge
  targetType="division"
  divisionContext={member?.division?.name} // Pass user's division context
  style={styles.divisionBadge}
/>

// GCA Card Badge (Green badge for GCA announcements)
<AnnouncementBadge
  targetType="union"
  divisionContext="GCA" // GCA context for union announcements
  style={styles.gcaBadge}
/>

// Sub-navigation badges with proper context filtering:
// "Announcements" sub-navigation card under "My Division" (Blue badge)
<AnnouncementBadge
  targetType="division"
  divisionContext={member?.division?.name}
  style={styles.subNavBadge}
/>

// "GCA Announcements" sub-navigation card under "GCA" (Green badge)
<AnnouncementBadge
  targetType="union"
  divisionContext="GCA"
  style={styles.subNavBadge}
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
