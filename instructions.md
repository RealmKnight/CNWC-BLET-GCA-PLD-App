# **Project Requirements Document (PRD)**

## **Project Overview**

You are building an Expo React Native application for **Android, iOS, and web** that enables **BLET Union members** to request scheduling for **Personal Leave Days (PLDs)** and **Single Vacation Days (SVDs)**. Future iterations will include managing **week-long vacation bids** and expanding to support website functionality.

## **Technology Stack**

- **Framework**: Expo SDK 52, React Native
- **Styling**: NativeWind esp for mobile and where necessary in web usage Tailwind
- **UI Components**: Shadcn/ui-inspired react-native-reusables, react-native-calendars, expo-calendar to allow user to sync to device calendar
- **Backend**: hosted Supabase (Authentication, RBAC, File Storage, possible realtime)
- **Deployment**: Expo and Supabase including Expo EAS to utilize versioning, automatic deployments, and OTA app updates

---

## **Core Functionalities**

### **1. Calendar(s)**

## **PLD/SDV Calendar**

### **1. Objectives**

- Provide a real-time, color-coded calendar for PLD/SDV availability.
- Enable union members to request PLD/SDV with a first-come, first-served system.
- Allow Division Admins to manage daily/weekly allotments dynamically.
- Support waitlists for full dates based on seniority.
- Ensure RBAC enforcement (Admins, Local Chairmen, and Members).

### **2. Functional Requirements**

#### **2.1 PLD/SDV Request Flow**

1. User selects a **date** on the calendar.
2. System displays **available PLD/SDV slots** for that date with slots that are taken showing the First and Last name and type (PLD/SDV) of the member who has already taken that spot.
3. If slots are available:
   - User submits a request.
   - Application auto-approves unless there are conflicts/multiple requests at the same time, then the Local Chairman reviews and approves/denies it.
   - If approved, the request is confirmed, and the user is notified, request sent to "back end" company side for processing.
4. If slots are full:
   - User may **join a waitlist** (ranked by request date/time and seniority if more than one request submitted exactly at the same time).
   - If a spot opens, the top-ranked user on the waitlist is automatically assigned the slot and a notification sent to the member in case they no longer need the day.
5. Requests must be made **at least 48 hours in advance**.
6. Requests are **locked once approved**, unless changed by the Local Chairman/Admin.

#### **2.2 PLD/SDV Calendar**

- **Color-coded availability**:
  - 🟢 **Green** = Available slots
  - 🟡 **Yellow** = Limited slots
  - 🔴 **Red** = Full (waitlist available)
  - ⚪ **Grey** = Day not available to be requested
- Users can request either **PLD or SDV** (allotment is shared between the two day types, but all days must be tracked by type).
- Admins can **adjust allotments dynamically** (daily, weekly, monthly, and yearly). this can be done on the calendar itself or on the admin dashboard

#### **2.3 Seniority-Based PLD Allocation**

- PLD entitlement is based on **Company Hire Date** (stored in `members` table).
- System calculates maximum PLDs per year using the following rules:

| **Years of Service** | **Max PLDs** |
| -------------------- | ------------ |
| 1 to <3 years        | 5            |
| 3 to <6 years        | 8            |
| 6 to <10 years       | 11           |
| 10+ years            | 13           |

- Members do not get their Max PLDs adjusted until their anniversay date at which time their Max PLDs will increase to the amount in the chart. For example, When a member enters their 3rd year of service, they do not get their upped allotment of PLDs (from 5 -> 8) on Jan 1st of that year, but the allotment will increase on the anniversary of that members hire date.
- Admins can **manually override PLD entitlements** in special cases.

#### **2.4 Calendar State management**

Given the requirements for a highly responsive calendar with real-time updates, here’s how we will handle state management effectively:
Best Approach: Combination of Zustand & Supabase Realtime

Instead of choosing between Zustand and Supabase Realtime, a hybrid approach would be ideal:

    Zustand for Local State Management:

        Store user interactions (e.g., selected date, current view, request drafts) locally in Zustand.

        Cache calendar data to improve performance and reduce unnecessary network calls.

        Provide optimistic UI updates (e.g., update state immediately upon user action, then reconcile with the backend).

    Supabase Realtime for Instant Updates:

        Use PostgreSQL Row Level Security (RLS) to allow users to subscribe to changes in the requests and allotments tables.

        When an Admin modifies allotments, or a member requests a day off, Supabase Realtime should push updates to all connected clients.

        On receiving an update, Zustand state should be updated accordingly.

Exxample code
Zustand State Store

Define a Zustand store for handling local state:

```typescript
import { create } from "zustand";

interface CalendarState {
  selectedDate: string | null;
  allotments: Record<string, number>; // { "2025-04-01": 2, "2025-04-02": 3 }
  requests: Record<string, { user: string; type: string }[]>; // {"2025-04-01": [{user: "John Doe", type: "PLD"}]}
  setSelectedDate: (date: string) => void;
  setAllotments: (date: string, value: number) => void;
  setRequests: (date: string, requests: { user: string; type: string }[]) => void;
}

export const useCalendarStore = create<CalendarState>((set) => ({
  selectedDate: null,
  allotments: {},
  requests: {},
  setSelectedDate: (date) => set({ selectedDate: date }),
  setAllotments: (date, value) =>
    set((state) => ({
      allotments: { ...state.allotments, [date]: value },
    })),
  setRequests: (date, requests) =>
    set((state) => ({
      requests: { ...state.requests, [date]: requests },
    })),
}));
```

Supabase Realtime Subscription example code (listening for changes in requests and allotments tables):

```typescript
import { supabase } from "@/lib/supabase";
import { useCalendarStore } from "@/store/calendar";

const subscribeToRealtimeUpdates = () => {
  const { setAllotments, setRequests } = useCalendarStore.getState();

  // Listen for allotment updates
  supabase
    .channel("allotments")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "allotments" }, (payload) => {
      const { date, max_allotment } = payload.new;
      setAllotments(date, max_allotment);
    })
    .subscribe();

  // Listen for request updates
  supabase
    .channel("requests")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "requests" }, (payload) => {
      const { date, user_id, type } = payload.new;
      setRequests(date, [...(useCalendarStore.getState().requests[date] || []), { user: user_id, type }]);
    })
    .subscribe();
};

export default subscribeToRealtimeUpdates;
```

Call subscribeToRealtimeUpdates() in a top-level component like App.tsx to initialize subscriptions.

## **Vacation Calendar**

### **1. Vac Cal Objectives**

- Provide a real-time, color-coded calendar for vacation bidding.
- Enable union members to request vacation scheduling based on contractual language.
- Allow Division Admins to manage allotments both dynamically and yearly in collaboration with the carrier.
- Allow open weeks to be put up for bid, this will happen on a weekly basis and will need a whole system.
- Ensure RBAC enforcement (Admins, Local Chairmen, and Members).

### **2. Vac Cal Functional Requirements**

#### **2.1 Vac Cal Flow**

1. Division Admin starts the yearly vacation bidding process.
2. Division wide message is sent out notifying all members that vacation bidding is starting.
3. Vacation bidding commences according to contractual language:
   - Vacation is bid in seniority order, some Divisions do have a seperate Vacation Seniority Roster/Order
   - The allotment for Spots available each week is set by the Division Admin after consultation with the Company
   - The member makes their vacation picks and the weeks are assigned to the calendar
     - A member may choose to bid all weeks in succession with their first pick (up to 5 weeks)
     - otherwise a member can pick up to 3 weeks not in succession in the first round of picking.
   - Once all members have completed their picks for the first round, the second round begins
   - Members with weeks left to schedule are then given picks again in seniority/vacation seniority order
   - Once all members have completed all picks, any open spots become open/available to bid on the calendar
     - This bidding is open for one week
     - Members who would like to bid open spots on the vacation calendar must note the current week selection that they would give up if they are the successful bidder
     - At the end of the week the app will determine who has seniority and will be awarded the open week, then bidding will begin again for the week vacated by the successful bidding member
     - If no one bids the week that is open it remains open and can be bid on a first-come first-served basis. However, the week given up in exchange for the open week in this manner will be subject to bid the following week.
     - notifications for open week should be sent out on Mondays to all Division Members
4. If slots are full no user may bid them and no waitlist exists for the vacation calendar
5. Requests are **locked once approved**, unless changed by the Local Chairman/Admin.

#### **2.2 Vac Calendar**

- **Color-coded availability**:
  - 🟢 **Green** = Available slots
  - 🟡 **Yellow** = Limited slots
  - 🔴 **Red** = Full (waitlist available)

#### **2.3 Seniority-Based Vacation Allotments**

- Vacation allotment is based on **Company Hire Date** (stored in `members` table).
- System calculates allotment for the next year year using the following rules:

| **Years of Service** | **Vacation Weekss** |
| -------------------- | ------------------- |
| 0 to <2 years        | 1                   |
| 2 to <5 years        | 2                   |
| 5 to <14 years       | 3                   |
| 14 to <23 years      | 4                   |
| 23+ years            | 5                   |

- During a calendar year in which an Engineer’s vacation entitlement shall increase on the anniversary date, such Engineer shall be permitted to schedule the additional vacation time to which entitled on the anniversary date at any time during that calendar year.
- Full week vacations will commence on Mondays and continue as consecutive week(s).
- An Engineer may take up to twelve (12) days of his annual vacation in single day increments, one week split = 6 single vacation days (SVD) to be scheduled as PLD/SDV above. THis election must come at the time vacation is bid the year prior to the year the vacation will be utilized.

#### **2 Role Based Access Control System (RBAC)**

User roles and permissions are strictly defined and stored in the **Supabase members table** (not overriding built-in auth roles). A Supabase hook will automatically assign **new members as users**.

| Role                  | Permissions                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| **Application Admin** | Full access to all functions, including administrative dashboard controls.                         |
| **Union Admin**       | Manages union-level functions, including adding/removing divisions and overseeing division admins. |
| **Division Admin**    | Administers a specific division, including managing schedules, user roles, and approvals.          |
| **Company Admin**     | Processes and marks leave requests as completed. Only accesses company dashboard, not user areas.  |
| **User**              | Can edit their profile, submit requests for PLDs, SVDs, and week-long vacation scheduling.         |

> **Implementation Notes:**
>
> - Roles are stored in the **Supabase members table** members.role, except for the Company Admin role that will be stored in supabase auth.user.metadata as this user will never be a member.
> - A supabase auth.user record will be associated with the users record in the member table by a foreign key relationship with the UUID of the auth.user being inserted into the members.id column using the members.pin_number to find the corrrect record to update in the members table
> - A Supabase auth hook will automatically assign **new members** as users.
> - Investigate whether a supabase auth hook is more appropriate to handle the Company Admin over supabase auth.user metadata as metadata can be manipulated on the user side.
> - Roles **do not** override **Supabase’s built-in auth roles**.
> - Auth Flow ->
>   1. If No session, redirect to Login page (use all supabase functions here, forgot/password reset, potential MFA in the future, email verification, redirect to signup page if not registered yet, etc). We want to preserve session state in the app though if the user clicks out of the app to handle something on their mobile device or opens another tab in their web browser, they should not have a state interuption nor have to log in again.
>   2. Determine if user is Company Admin or regular user, route appropriately (user to flow below, Company admin only has access to Company Admin Dashboard)
>   3. If the supabase auth.user does not have an associated entry in the members table (search members.id where == auth.user.id) -> memberassociation page where user can enter their company pin_number which will associate their user with the members table entry associated with that pin_number. Error messages on this page will allow the user to contact their Division Admin with issues
>   4. Otherwise user is logged in and redirected to (tabs)\index.tsx
> - There will be an application header accross all screens in the app with a Logout Icon on the right hand side (this will be the only icon present on the Company Admin dashboard). A User will Also have a profile icon next to the Logout Icon so that they can access their profile dashboard. And an Admin will see a gear icon on the left hand side of this header that will direct an admin user to the (admin)\ route with the page to be determined by their admin level (Application Admin, Union Admin, or Division Admin).
> - User Profile dashboard -> user can update their profile (phone number, set preference on contact, allow in app push notifications, etc), change their password, etc as allowed by supabse auth. A user cannot update any information in the members table however and will be shown a message stating "Contact Division admin if any information needs to be updated", may put the member info on a seperate tab on their profile to better seperate these concerns.

#### **3 Notifications System**

- **Email & in-app alerts** for:
  - Request approval/denial
  - Waitlist promotion for calendar requests
  - Admin changes to allotments
  - "Must Read" messages sent out by Admin
  - News will be a message but will not be "must read"
  - Admins will receive notifications of messages sent to them directly so that they can reply to them

Example code using the notifications system for push notifications

```typescript
import { sendMessageWithNotification } from "@/utils/notificationService";

// Example usage:
await sendMessageWithNotification({
  recipientId: "user-uuid",
  subject: "New Message",
  content: "You have a new message",
  topic: "messages",
  event: "new_message",
  payload: {
    /* additional data */
  },
});
```

#### **4 Messaging System**

- members will be able to directly message admins and Officers of their division
- messages will be stored in the supabase db, even those marked as deleted will be stored until Admin decides to purge older records
- ability for Admins to quickly disperse pertinent information to the members in a format that the member will actually utilize

#### **5 Admin Dashboard**

- Application, Union, and Division admins will all share a back-end dashboard that allows them to complete admin functions as relates to their access
  - Application Admin will have the access to: GLobal Settings, System Statistics, User Management, and everything in Union and Division sections
  - Union Admin will have the access to: Union Announcements, Advertisements, GCA Officers, Division Management and everything in Division section
  - Division Admin will have the access to: Member Management, Division Officers, Leave Requests, Division Calendar Allotments
- Company Admin will be an entirely seperate route and interface only to be used by the company to enter the PLD/SDV and Vacation into the company system and mark when complete

### **6. Divisions**

The **CN/WC GCA of the BLET** includes the following divisions:

- **163** - Proctor, MN - Zone 10
- **173** - Fond Du Lac, WI - Zone 3 and Zone 4
- **174** - Stevens Point, WI - Zone 5 and Zone 7
- **175** - Neenah, WI - Zone 12
- **184** - Schiller Park, IL - Zone 1
- **185** - Gladstone, MI - Zone 13
- **188** - Superior, WI - Zone 6, Zone 8 and Zone 9
- **209** - Green Bay, WI - Zone 11
- **520** - Joliet, IL - Zone 2

> **Implementation Notes:**
>
> - Each user is assigned to a **single division and zone**.
> - Each division has **its own set of officers and calendars**.
> - Some Divisions will have a calendar for each Zone within the division

### **7. Division Officers**

Each division may assign the following **officer positions**, managed by the **Division Admin**:

- **Required Positions:** President, Vice-President, Secretary/Treasurer, Alternate Secretary/Treasurer, Legislative Representative, Alternate Legislative Representative, Local Chairman, First Vice-Local Chairman, Second Vice-Local Chairman, Guide, Chaplain, Delegate to the National Division, First Alternate Delegate to the National Division, Second Alternate Delegate to the National Division, First Trustee, Second Trustee, Third Trustee, First Alternate Trustee, Second Alternate Trustee, Third Alternate Trustee.
- **Optional Positions:** Third Vice-Local Chairman, Fourth Vice-Local Chairman, Fifth Vice-Local Chairman.

> **Implementation Notes:**
>
> - Officer roles will be stored in the **members table**.
> - Assignments are managed in the **Division Admin dashboard**.
