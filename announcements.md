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

- [ ] #### Step 2: Create Announcements Store

```typescript
// store/announcementStore.ts

import { create } from "zustand";
import { supabase } from "@/utils/supabase";
import type { Announcement, AnnouncementReadStatus, AnnouncementAnalytics } from "@/types/announcements";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

interface AnnouncementStore {
  announcements: Announcement[];
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
  viewingDivisionId: number | null;
  subscriptionStatus: "none" | "subscribing" | "subscribed" | "error";

  // Fetch helpers
  _fetchAndSetAnnouncements: (userId: string, divisionId: number | null) => Promise<void>;
  _calculateUnreadCounts: () => void;

  // Public API
  initializeAnnouncementStore: (userId: string, assignedDivisionId: number | null, roles: string[]) => () => void;
  setViewDivision: (divisionId: number | null) => Promise<void>;
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
  refreshAnnouncements: (userId: string, divisionId: number | null, force?: boolean) => Promise<void>;
  subscribeToAnnouncements: (userId: string) => () => void;
}

export const useAnnouncementStore = create<AnnouncementStore>((set, get) => ({
  // Implementation following pattern in notificationStore.ts
  announcements: [],
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
  viewingDivisionId: null,
  subscriptionStatus: "none",

  setIsInitialized: (initialized: boolean) => {
    console.log(`[AnnouncementStore] Setting isInitialized to ${initialized}`);
    set({ isInitialized: initialized });
  },

  // Implementation details will follow patterns from notificationStore.ts
  // with realtime subscriptions and proper badge update handling
  // ...

  // Helper function to update announcement badge counts
  _updateAnnouncementBadges: (unreadCounts) => {
    if (Platform.OS !== "web") {
      // Update badge counts but keep separate from notification badges
      // Only used internally by the store
    }
  },

  // Subscription handling similar to notificationStore.ts
  subscribeToAnnouncements: (userId: string) => {
    // Will implement following pattern from notificationStore.ts
    // Creates and manages multiple realtime channels for different announcement types
    return () => {
      // Cleanup function
    };
  },
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

export function DivisionAnnouncements() {
  // Implementation of the division admin announcement management UI
  // - List view of division announcements
  // - Create/edit/delete functionality
  // - Toggle active status
  // - View read analytics
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
  // Implementation of the union admin announcement management UI
  // - List view of all announcements (union and division)
  // - Create/edit/delete functionality for union announcements
  // - View read analytics across all announcements
  // - Scheduling capabilities
}
```

- [ ] #### Step 3: Create Announcement Card Component

```typescript
// components/ui/AnnouncementCard.tsx

import React from "react";
import { useAnnouncementStore } from "@/store/announcementStore";
// ... other imports

interface AnnouncementCardProps {
  announcement: Announcement;
  isAdmin?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function AnnouncementCard({ announcement, isAdmin, onEdit, onDelete }: AnnouncementCardProps) {
  // Implement the card component that displays:
  // - Title
  // - Message with formatting
  // - Links
  // - Document links (with validation for up to 3 attachments, 25 MB file size limit)
  // - Read/unread indicator
  // - Acknowledgment status and UI if required
  // - Admin controls if isAdmin is true
}
```

- [ ] #### Step 4: Create Announcement Badge Component

```typescript
// components/ui/AnnouncementBadge.tsx

import React from "react";
import { useAnnouncementStore } from "@/store/announcementStore";
// ... other imports

interface AnnouncementBadgeProps {
  style?: any;
  targetType?: "division" | "union" | "all";
}

export function AnnouncementBadge({ style, targetType }: AnnouncementBadgeProps) {
  // Implementation of the badge component that shows unread count
  // - Filter by targetType if provided
}
```

- [ ] ### Phase 4: Member UI for Viewing Announcements

**Important User Experience Requirements:**

- Announcements requiring acknowledgment must use a modal approach (similar to existing notification acknowledgement system), blocking access to other content until acknowledged
- Unread announcements should retain unread status across user sessions (logout/login) using the same database persistence as existing notifications
- Important announcements should have special visual styling to highlight their significance
- Expired announcements should remain visible but be clearly marked as expired

- [ ] #### Step 1: Create Division Announcements Screen

```typescript
// app/(division)/[divisionName]/announcements/page.tsx

import React from "react";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useUserStore } from "@/store/userStore";
// ... other imports

export default function DivisionAnnouncementsPage() {
  // Implementation of the division announcements viewing page
  // - Display division-specific announcements
  // - Mark as read functionality
  // - Document viewing using existing document viewer components
  // - Implement acknowledgment modal for required announcements
}
```

- [ ] #### Step 2: Create Union/GCA Announcements Screen

```typescript
// app/(gca)/announcements/page.tsx

import React from "react";
import { useAnnouncementStore } from "@/store/announcementStore";
import { useUserStore } from "@/store/userStore";
// ... other imports

export default function UnionAnnouncementsPage() {
  // Implementation of the union announcements viewing page
  // - Display union/GCA-level announcements
  // - Mark as read functionality
  // - Document viewing using existing document viewer components
  // - Implement acknowledgment modal for required announcements
}
```

- [ ] #### Step 3: Integrate Badges into Navigation

```typescript
// Modify app/(tabs)/index.tsx to add badges to navigation cards
// Add badge components to GCA and Division cards based on unread announcement counts
// Follow existing pattern in navigation components for badge placement
```

- [ ] ### Phase 5: Notification and Analytics Enhancements

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
