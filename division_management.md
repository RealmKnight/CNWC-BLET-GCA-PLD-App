# Division Management Plan

## Overview

This document outlines the plan for the Division Manager component in the Union admin dashboard. The component will allow union administrators to:

1. View all divisions within the union and their respective zones
2. Create new divisions and zones
3. Assign officers to divisions
4. Manage division and zone settings

## Component Structure

The DivisionManager component will have four main tabs:

- **Divisions List** - Display all divisions with their zones
- **Create** - Forms to create new divisions and zones
- **Officers** - Assign and manage division officers
- **Settings** - Configure division and zone settings

## Database Schema

Based on the examination of the current database schema, we have the following key tables relevant to division management:

### Core Tables

1. **divisions**

   - id (PK, integer, auto-increment)
   - name (varchar, NOT NULL)
   - location (varchar, NOT NULL)
   - created_at (timestamp)
   - updated_at (timestamp)

2. **zones**

   - id (PK, integer, auto-increment)
   - name (varchar, NOT NULL)
   - division_id (integer, FK to divisions.id, NOT NULL)
   - created_at (timestamp)
   - updated_at (timestamp)

3. **officer_positions**
   - id (PK, uuid)
   - member_pin (bigint, FK to members.pin_number)
   - position (enum type)
   - division (text)
   - start_date (timestamp)
   - end_date (timestamp)
   - created_at (timestamp)
   - updated_at (timestamp)
   - created_by (uuid)
   - updated_by (uuid)

### Related Tables

4. **members**
   - pin_number (PK, bigint)
   - division_id (integer)
   - current_zone_id (integer)
   - home_zone_id (integer)
   - first_name, last_name (text)
   - ... (other fields)

### Views

5. **member_divisions**

   - Joins members with their division information

6. **current_officers**
   - Shows active officer positions with member information

## Implementation Details

### State Management

A dedicated Zustand store (`divisionManagementStore.ts`) was created for division management with the following features:

- Fetch and cache divisions, zones, and officers data
- CRUD operations for divisions, zones, and officers
- State management for UI including loading states and error handling
- Member count tracking for divisions and zones

### Database Functions

SQL functions created to support the division management:

```sql
-- Function to get division member counts
CREATE OR REPLACE FUNCTION public.get_division_member_counts()
RETURNS TABLE(division_id integer, count bigint)
LANGUAGE SQL
AS $$
    SELECT division_id, COUNT(*)::bigint
    FROM members
    WHERE division_id IS NOT NULL
    GROUP BY division_id;
$$;

-- Function to get zone member counts for a division
CREATE OR REPLACE FUNCTION public.get_zone_member_counts(division_id integer)
RETURNS TABLE(zone_id integer, count bigint)
LANGUAGE SQL
AS $$
    SELECT current_zone_id as zone_id, COUNT(*)::bigint
    FROM members
    WHERE division_id = $1 AND current_zone_id IS NOT NULL
    GROUP BY current_zone_id;
$$;
```

### Components

The following components were created to handle the different tabs:

1. **DivisionsList** (`/components/admin/union/DivisionsList.tsx`)

   - Displays all divisions with collapsible sections for zones
   - Shows member counts
   - Supports expanding/collapsing divisions to view zones

2. **CreateForm** (`/components/admin/union/CreateForm.tsx`)

   - Tabbed interface for creating divisions and zones
   - Includes validation and error handling
   - Creates DB records via the Zustand store

3. **OfficersManagement** (`/components/admin/union/OfficersManagement.tsx`)

   - Division selector
   - Displays officers for selected division
   - Supports assigning and removing officers

4. **DivisionSettings** (`/components/admin/union/DivisionSettings.tsx`)
   - Division selector
   - Settings panels for general settings, zone management, and advanced options

### Helper Components

Additional components created:

1. **Input** (`/components/ui/Input.tsx`)
   - Reusable themed input component
   - Error state support

## Future Enhancements

1. **Division List Enhancements**

   - Add search/filter capabilities
   - Implement sorting options
   - Add pagination for large lists

2. **Zone Management**

   - Zone transfer between divisions
   - Zone merging capability
   - Archive/deactivate zones

3. **Officer Management**

   - Historical officer view
   - Officer term planning
   - Officer reassignment

4. **Settings**
   - Division merging/splitting tools
   - Member batch reassignment
   - Import/export functionality

## Original Implementation Plan

### 1. Divisions List Tab

**Features:**

- Display a hierarchical list of divisions and their zones
- Show division details (name, location, number of members)
- Show zone details under each division
- Allow sorting and filtering
- Quick actions (edit, delete) with appropriate confirmation dialogs

**Implementation:**

- Create a collapsible list component for divisions
- Fetch divisions and zones data using Supabase queries
- Show member count per division/zone
- Implement context menu for actions

### 2. Create Tab

**Features:**

- Form to create new divisions with validation
- Form to create new zones with division selection
- Batch creation option for multiple zones

**Implementation:**

- Create form components with Zod validation
- Add division/zone name uniqueness validation
- Submit to Supabase with proper error handling
- Success notifications and redirects

### 3. Officers Tab

**Features:**

- List current officers by division
- Assign members to officer positions
- Set term start/end dates
- Historical view of past officers

**Implementation:**

- Create officer assignment form
- Lookup component for member selection
- Date range picker for term
- Historical records display with filtering

### 4. Settings Tab

**Features:**

- Division settings (rename, change location)
- Zone settings (rename, reassign to different division)
- Division merging/splitting tools (advanced)
- Archive/deactivate options

**Implementation:**

- Settings forms with confirmation for major changes
- Implement archive functionality with safety prompts
- Member reassignment tools for division/zone changes

## Data Fetching Strategy

1. Use Zustand for state management with the following stores:

   - divisionsStore
   - zonesStore
   - officersStore

2. Use Supabase realtime for live updates:

   - Subscribe to changes in divisions and zones tables
   - Update Zustand state on database changes

3. Implement pagination for large data sets

## UI Components Needed

1. **DivisionList**: Hierarchical display with collapsible zones
2. **DivisionForm**: Create/edit division
3. **ZoneForm**: Create/edit zone with division selection
4. **OfficerAssignment**: Assign officers to positions
5. **MemberSearch**: Lookup component for finding members
6. **ConfirmationDialog**: For dangerous operations
7. **DivisionSettings**: Configuration panel

## Next Steps

1. Implement the basic DivisionManager component structure
2. Create necessary UI components
3. Implement the divisions list tab first
4. Add creation forms
5. Implement officer management
6. Add settings functionality
