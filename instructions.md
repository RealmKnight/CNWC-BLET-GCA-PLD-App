# **Project Requirements Document (PRD)**

## **Project Overview**

You are building an Expo React Native application for **Android, iOS, and web** that enables **BLET Union members** to request scheduling for **Personal Leave Days (PLDs)** and **Single Vacation Days (SVDs)**. Future iterations will include managing **week-long vacation bids** and expanding to support website functionality.

## **Technology Stack**

- **Framework**: Expo SDK 52, React Native
- **Styling**: NativeWind esp for mobile and where necessary in web usage Tailwind
- **UI Components**: Shadcn/ui-inspired react-native-reusables, react-native-calendars, expo-calendar to allow user to sync to device calendar
- **Backend**: hosted Supabase (Authentication, RBAC, File Storage)
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

- Members to not get their Max PLDs adjusted until their anniversay date at which time their Max PLDs will increase to the amount in the chart. For example, When a member enters their 3rd year of service, they do not get their upped allotment of PLDs (from 5 -> 8) on Jan 1st of that year, but the allotment will increase on the anniversary of that members hire date.
- Admins can **manually override PLD entitlements** in special cases.

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
> - Roles are stored in the **Supabase members table**, except for the Company Admin role that will be stored in supabase auth.user.metadata as this user will never be a member.
> - A supabase auth.user record will be associated with the users record in the member table by a foreign key relationship with the UUID of the auth.user being inserted into the members.id column using the members.pin_number to find the corrrect record to update in the members table
> - A Supabase auth hook will automatically assign **new members** as users.
> - Roles do not override **Supabase’s built-in auth roles**.

#### **3 Notifications System**

- **Email & in-app alerts** for:
  - Request approval/denial
  - Waitlist promotion
  - Admin changes to allotments
  - "Must Read" News or message sent out by Admin
  - Admins will receive notifications of messages sent to them directly so that they can reply to them

#### **4 Messaging System**

- members will be able to directly message admins and Officers of their division
- messages will be stored in the supabase db, even those marked as deleted will be stored until Admin decides to purge older records
- ability for Admins to quickly disperse pertinent information to the members in a format that the member will actually utilize

#### **5 Admin Dashboard**

- Application, Union, and Division admins will all share a back-end dashboard that allows them to complete admin functions as relates to their access
  - Application Admin will have the access to:
  - Union Admin will have the access to:
  - Division Admin will have the access to:
- Company Admin will be an entirely seperate route and interface only to be used by the company to enter the PLD/SDV and Vacation into the company system and mark when complete
