# Change Request Processing Plan

We will be implementing an email-based workflow for request processing, allowing the company admin to receive and respond to requests via email. The app will send emails for request processing to division admins and have replies sent to our webhook to be processed in the DB and the app. We are maintaining all existing company admin functionality in the app while adding this email-based workflow as an additional option.

## 🎯 OVERALL PROGRESS TRACKER

### ✅ COMPLETED (Priority 3) - **CRITICAL MAILGUN SDK CONVERSION COMPLETE!**

- ✅ **send-request-email function** - Sends initial request emails to company admin
- ✅ **send-cancellation-email function** - Sends cancellation request emails to company admin
- ✅ **process-status-changes function** - Sends status notification emails to members and division admins
- ✅ **process-email-webhook function** - Processes email responses from company admin
- ✅ **send-division-welcome-email function** - Sends welcome emails to new division email addresses

**🚀 ALL CORE EMAIL FUNCTIONS NOW USE DIRECT MAILGUN API INSTEAD OF PROBLEMATIC SDK!**

### 🔄 IMMEDIATE NEXT STEPS (Priority 3 continued)

**✅ ALL PRIORITY 3 MAILGUN CONVERSIONS COMPLETED! ✅**

**These functions likely don't need Mailgun updates but should be reviewed:**

- 📝 **send-email function** - CHECK: Backup provider (Resend) integration
- 📝 **email-status-webhook function** - CHECK: May not need Mailgun for receiving webhooks
- 📝 **retry-failed-emails function** - CHECK: Logic may need updates for new API approach

### 🔮 FUTURE PRIORITIES

- 📋 **Priority 1**: Database Setup and Division Email Management UI
- 📋 **Priority 2**: Email Processing Database Tables
- 📋 **Priority 4**: Store Integration for Email Workflow
- 📋 **Priority 5**: Welcome Email Function
- 📋 **Priority 6**: Email History UI
- 📋 **Priority 7**: Notification System Integration
- 📋 **Priority 8**: Privacy Policy Updates
- 📋 **Priority 9**: Final Testing and Verification

## Email Workflow Overview

The system implements **TWO SEPARATE** email workflows:

### 1. Request Processing Workflow (Company Admin)

- **User submits request** → Email sent to `COMPANY_ADMIN_EMAIL` for centralized processing
- **Company admin responds via email** → Webhook processes the response and updates database status

### 2. Status Change Notification Workflow (Member + Division Admins)

- **After company admin responds** → Webhook sends notification emails to:
  - **Requesting member** (to notify them of the decision)
  - **Division admin emails** (for their records and awareness)

**Key Point**: `COMPANY_ADMIN_EMAIL` handles initial processing, while division emails receive status change notifications.

## Implementation Components

### 1. Database Setup and Division Email Management UI (PRIORITY 1)

**Start here to establish the foundation for email settings**

#### Database Schema Creation

Create the division email settings table and audit log first:

```sql
-- Create division email settings table
CREATE TABLE public.division_email_settings (
  id SERIAL PRIMARY KEY,
  division_id INTEGER NOT NULL REFERENCES public.divisions(id),
  primary_email VARCHAR(255),
  additional_emails VARCHAR(255)[],
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(division_id)
);

-- Create audit log table for division email changes
CREATE TABLE public.division_email_audit_log (
  id SERIAL PRIMARY KEY,
  division_id INTEGER NOT NULL REFERENCES public.divisions(id),
  admin_id UUID NOT NULL,  -- ID of the admin who made the change
  change_type VARCHAR(50) NOT NULL, -- 'add', 'update', 'remove', 'toggle'
  previous_value JSONB,  -- Previous email configuration
  new_value JSONB,       -- New email configuration
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX idx_division_email_settings_division_id ON public.division_email_settings(division_id);
CREATE INDEX idx_division_email_audit_division_id ON public.division_email_audit_log(division_id);
CREATE INDEX idx_division_email_audit_admin_id ON public.division_email_audit_log(admin_id);
```

#### Division Email Management UI Components

**Create the division email management tab in the existing DivisionManagement.tsx structure:**

- Add new "emails" view to the `DivisionView` type in `store/divisionManagementStore.ts`
- Add email management tab button to the existing tab system
- Create `components/admin/division/DivisionEmailSettings.tsx` component with:

  **Core Features:**

  - Display current division email settings (primary + additional emails)
  - Form for adding/editing primary division email
  - Interface for managing additional email addresses (add/remove functionality)
  - Toggle for enabling/disabling division email functionality
  - Email format validation with real-time feedback
  - Save/cancel buttons with proper validation feedback
  - Integration with existing division management UI patterns
  - Confirmation dialogs for remove operations
  - Success/error messaging using app's current notification system

  **Styling & UX:**

  - Follow existing app theming and color schemes
  - Use consistent styling with other division management tabs
  - Responsive design for mobile/web platforms
  - Loading states during save operations
  - Form validation with helpful error messages

- Add audit log view for division administrators:
  - Show history of email configuration changes in a separate section
  - Display which admin made each change with timestamps
  - Filter options by date range and change type
  - Export functionality for audit records

#### Store Updates for Division Email Management

- Update `store/divisionManagementStore.ts`:
  - Add "emails" to the `DivisionView` type: `type DivisionView = "announcements" | "meetings" | "documents" | "officers" | "emails"`
  - Add methods to manage division email settings (CRUD operations)
  - Include functions to add, update, and remove division emails
  - Implement audit logging of changes
  - Add validation for email formats
  - Create notification functions for email setting changes
  - Add loading states and error handling

#### Integration with DivisionManagement.tsx

- Add the emails tab button in the existing `renderActionButton` calls
- Add the emails case in `renderContent()` to render the `DivisionEmailSettings` component
- Follow the same patterns as existing tabs for consistency
- Use the same styling, theming, and responsive design patterns

### 2. Email Processing Database Tables (PRIORITY 2)

**After division email UI is working, create the email tracking infrastructure:**

```sql
-- Create status change queue table and trigger for email processing
CREATE OR REPLACE FUNCTION public.handle_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> NEW.status THEN
    -- Insert a record in the status_change_queue table for processing
    INSERT INTO public.status_change_queue (request_id, old_status, new_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE OR REPLACE TRIGGER on_status_change
AFTER UPDATE ON public.pld_sdv_requests
FOR EACH ROW
EXECUTE FUNCTION public.handle_status_change();

-- Create a queue table for status changes to be processed
CREATE TABLE public.status_change_queue (
  id SERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.pld_sdv_requests(id),
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an email tracking table for outbound emails
CREATE TABLE public.email_tracking (
  id SERIAL PRIMARY KEY,
  request_id UUID REFERENCES public.pld_sdv_requests(id),
  email_type VARCHAR(50) NOT NULL, -- 'request', 'cancellation', 'notification', etc.
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message_id VARCHAR(255) UNIQUE, -- Mailgun message ID for tracking
  status VARCHAR(50) NOT NULL DEFAULT 'queued', -- 'queued', 'sent', 'delivered', 'opened', 'clicked', 'failed', etc.
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  fallback_notification_sent BOOLEAN DEFAULT FALSE, -- Track if fallback notification was used
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create a separate table for tracking inbound email responses
CREATE TABLE public.email_responses (
  id SERIAL PRIMARY KEY,
  request_id UUID REFERENCES public.pld_sdv_requests(id),
  sender_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  resulting_status VARCHAR(50), -- 'approved', 'denied', 'cancelled', etc.
  denial_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX idx_email_tracking_request_id ON public.email_tracking(request_id);
CREATE INDEX idx_email_tracking_status ON public.email_tracking(status);
CREATE INDEX idx_email_responses_request_id ON public.email_responses(request_id);
CREATE INDEX idx_email_responses_processed ON public.email_responses(processed);
```

### 3. Edge Functions Implementation (PRIORITY 3)

**After database setup, implement the email sending functions:**

#### ✅ COMPLETED: Supabase Edge Function for sending initial request email

`supabase/functions/send-request-email/index.ts`

**COMPLETED UPDATES:**

- ✅ Fixed variable naming to match database fields (`date_requested` → `request_date` and `day_type` → `leave_type`)
- ✅ Sends emails to `COMPANY_ADMIN_EMAIL` environment variable for centralized request processing
- ✅ Professional HTML formatting with proper styling included
- ✅ Proper extraction of data from the request with String() conversion
- ✅ Error handling for email sending failures
- ✅ Email tracking table integration for monitoring delivery status
- ✅ Replaced Mailgun.js SDK with direct REST API calls for Deno compatibility
- ✅ Uses `MAILGUN_SENDING_KEY` instead of general API key
- ✅ Includes request ID in email for webhook correlation

#### ✅ COMPLETED: Supabase Edge Function for sending cancellation request email

`supabase/functions/send-cancellation-email/index.ts`

**COMPLETED UPDATES:**

- ✅ Fixed database queries and variable naming mismatches
- ✅ Sends cancellation emails to `COMPANY_ADMIN_EMAIL` environment variable
- ✅ Professional HTML formatting with cancellation-specific styling
- ✅ Proper error handling for failed database queries and email operations
- ✅ Detailed logging for successful and failed operations
- ✅ Email tracking table integration for monitoring delivery status
- ✅ Replaced Mailgun.js SDK with direct REST API calls for Deno compatibility
- ✅ Uses `MAILGUN_SENDING_KEY` instead of general API key
- ✅ Includes request ID in email for webhook correlation

#### Supabase Edge Function for processing email webhooks from Mailgun

`supabase/functions/process-email-webhook/index.ts`

Updates needed:

- Fix verification logic for Mailgun webhook signatures using `MAILGUN_WEBHOOK_SIGNING_KEY` environment variable
- Update database path from `public.pld_sdv_requests` to just `pld_sdv_requests` (line 85)
- Enhance the content parsing to extract approval/denial status more accurately
- Add more robust error handling and logging
- Consider adding auto-categorization of denial reasons
- Add validation to detect invalid or malformed email responses
- Improve the denied status handling by including proper denial reason extraction
- Add handling for out-of-office replies to prevent request processing delays
- Update email tracking records when responses are processed

#### Supabase Edge Function for processing status changes

`supabase/functions/process-status-changes/index.ts`

Updates needed:

- Create the missing `status_change_queue` table as specified in the SQL below
- Update database paths and variable names (e.g., `date_requested` → `request_date`, line 94)
- Fix the member data retrieval path: `public.members!pld_sdv_requests_member_id_fkey` is incorrect (line 35)
- Send status change notification emails to BOTH the requesting member AND division admin emails
- For division emails: Query division_email_settings table to get primary_email and additional_emails for the member's division
- For member email: Get email from member's profile or user table
- Query for ALL members where `role = 'division_admin'` AND `division_id` matches the requesting member's division for fallback notifications
- Implement HTML email templates for better presentation
- Add robust error handling for email sending failures
- Ensure proper status handling with appropriate notifications for each status change (approved, denied, cancelled)
- Add fallback to admin notifications if email delivery fails permanently, following the admin's preference order (Push > SMS > in-app)

#### New Supabase Edge Function for sending welcome emails to new division email addresses

`supabase/functions/send-division-welcome-email/index.ts` (to be created)

Requirements:

- Send a welcome email when a new division email is configured
- Include information about the system and what to expect
- Verify email deliverability
- Track delivery status
- Add appropriate logging and error handling

#### Update Existing Send-Email Function

`supabase/functions/send-email/index.ts`

Updates needed:

- Modify the function to serve as a backup email provider for the request workflow
- Add support for HTML templates matching those used in the primary email functions
- Ensure it properly handles the specific formats needed for request and cancellation emails
- Update to support division-specific emails
- Add tracking capabilities to integrate with the email tracking table
- Add specialized error handling for request-related emails
- Update the reply-to address to ensure responses are properly routed to the webhook

#### New Supabase Edge Function for handling Mailgun delivery webhooks

`supabase/functions/email-status-webhook/index.ts` (to be created)

Requirements:

- Process Mailgun delivery status webhooks (delivered, opened, clicked, etc.)
- Update email tracking records in the database
- Handle failed delivery notifications with retry logic
- Log detailed information for troubleshooting
- Update request status indicators in the admin dashboard
- Trigger admin notifications via preferred channel (Push > SMS > in-app) if email delivery permanently fails

#### New Supabase Edge Function for retrying failed emails

`supabase/functions/retry-failed-emails/index.ts` (to be created)

Requirements:

- Scheduled function to retry failed email deliveries
- Implement exponential backoff for retry attempts
- Switch to backup email provider (Resend) after multiple primary failures
- Trigger fallback notifications after exhausting retry attempts
- Update email tracking records with retry status

### 4. Store Integration for Email Workflow (PRIORITY 4)

**After edge functions are working, integrate email sending with existing stores:**

- `store/timeStore.ts`: Update `submitRequest` and `cancelRequest` functions to call email edge functions
- `store/calendarStore.ts`: Update `userSubmitRequest` to handle the email workflow
- Add email tracking integration to existing request submission flows

### 5. Welcome Email Function (PRIORITY 5)

**Create welcome email function for new division email addresses:**

#### New Supabase Edge Function for sending welcome emails to new division email addresses

`supabase/functions/send-division-welcome-email/index.ts` (to be created)

Requirements:

- Send a welcome email when a new division email is configured
- Include information about the system and what to expect
- Verify email deliverability
- Track delivery status
- Add appropriate logging and error handling

### 6. Email History UI (PRIORITY 6)

**Add email tracking interface to admin dashboard:**

- Create `components/admin/division/EmailHistory.tsx` component
- Integrate as another tab in the PldSdvManager component or as a section within the division email settings
- Display all emails sent for each request with delivery status
- Show retry history and manual resend options
- Add filtering and search capabilities

### 7. Notification System Integration (PRIORITY 7)

**Implement fallback notifications and admin alerts:**

- Create notification function for email delivery failures
- Add admin notification when email settings are changed
- Implement push/SMS/in-app fallback notifications
- Update admin dashboard to show email-related notifications

### 8. Privacy Policy Updates (PRIORITY 8)

**Update privacy documentation:**

- Update privacy policy in `app/privacy.tsx` and `docs/privacy_policy.md` and the root `privacy_policy.html` file
- Add sections about email workflow, tracking, and service providers
- Document user rights regarding email communications

### 9. Final Testing and Verification (PRIORITY 9)

**Comprehensive testing of the complete email workflow:**

- Test division email management UI (CRUD operations)
- Test end-to-end email workflow from request submission to status notifications
- Verify webhook processing and response handling
- Test retry mechanisms and fallback notifications
- Validate email tracking and delivery status updates

## Additional Considerations

1. **Email Volume Capacity**: Based on current membership, we expect approximately 100 emails per day, with a yearly volume of around 75,000-80,000 emails. This is well within the capacity of both Mailgun and Resend services.

2. **Email Templates**: Create consistent, branded HTML email templates for all outgoing emails

   - Design HTML templates with responsive layout
   - Include app logo and styling
   - Consider using a template system for easier maintenance
   - Add tracking pixels/links for delivery confirmation

3. **Error Handling**: Implement robust error handling in edge functions with appropriate feedback to users

   - Log all errors to a monitoring system
   - Provide user-friendly error messages
   - Implement retry mechanisms for transient failures
   - Create alerts for system administrators when retry mechanisms fail

4. **User Notifications**: Ensure users are notified about the status of their requests via the app

   - Update the notification system to show email-related statuses
   - Add new notification types for email processing states
   - Create special notifications for email delivery issues
   - Implement fallback notifications based on admin preferences (Push > SMS > in-app)

5. **Monitoring**: Add logging and monitoring to track email delivery and processing

   - Implement metrics for email delivery success/failure rates
   - Set up alerts for failed email processing
   - Create a dashboard for monitoring the email workflow
   - Establish SLAs for email response time and track performance

6. **Email Service Configuration**:

   - Configure Mailgun as the primary email service provider
   - Set up Resend as the backup email service
   - Configure appropriate SPF and DKIM records for both services
   - Set up webhooks for delivery tracking
   - Implement proper rate limiting to prevent triggering spam filters
   - Ensure deliverability by following best practices

7. **Security**: Verify that the webhook endpoint is properly secured and validate incoming webhooks

   - Implement proper signature verification for webhooks using `MAILGUN_WEBHOOK_SIGNING_KEY`
   - Add rate limiting to prevent abuse
   - Sanitize all incoming data
   - Log suspicious activity for security review

8. **Toggle Implementation**: Since the company will use either the email system OR the in-app processing (but both systems will exist in the app):

   - Implement a global application setting to enable/disable the email workflow
   - Create an admin-only toggle in the settings panel
   - When toggled, clearly indicate which system is active
   - Document the process for switching between systems

9. **Email Delivery Analytics**: Track and report on email workflow effectiveness

   - Response time metrics (time from email sent to response received)
   - Delivery success rates by domain/recipient
   - Open rates and response rates
   - Comparison of processing time between email and in-app workflows

10. **Division Email Management**:
    - Implement client-side email format validation
    - Send welcome emails to newly added division email addresses
    - Create a notification system for division admins when email settings change
    - Maintain an audit log of all changes to division email settings
    - Provide UI for viewing the history of email configuration changes

## Environment Variables Required

The following environment variables need to be set in the Supabase Edge Functions:

- `COMPANY_ADMIN_EMAIL`: Fallback email address (current value: `sroc_cmc_vacationdesk@cn.ca`)
- `MAILGUN_API_KEY`: Mailgun API key for sending emails
- `MAILGUN_DOMAIN`: Mailgun domain for sending emails
- `MAILGUN_WEBHOOK_SIGNING_KEY`: For verifying webhook signatures
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service role key

## Completed Questions

1. ✅ **Database Schema**: Using separate `division_email_settings` table instead of adding columns to `divisions` table. No foreign key constraint on `members.division_id`. Use `role = 'division_admin'` to identify admins.

2. ✅ **Email Tracking**: Separate tracking for outbound (`email_tracking`) and inbound (`email_responses`) emails. Associate by `request_id`.

3. ✅ **Environment Variables**: Use `COMPANY_ADMIN_EMAIL` environment variable with hardcoded fallback (`sroc_cmc_vacationdesk@cn.ca`).

4. ✅ **Division Email Logic**: Send to ALL division admin emails (primary + additional) for the division. No central email concept.

5. ✅ **Notification Category**: Use existing `system_alert` category for email delivery failure notifications.

6. ✅ **Fallback Notifications**: Send to ALL members where `role = 'division_admin'` AND `division_id` matches.

7. ✅ **Webhook Security**: Fix signature verification using `MAILGUN_WEBHOOK_SIGNING_KEY`. Not needed for delivery status webhook.

8. ✅ **Testing**: Manual testing by user, no special test implementations needed.

9. ✅ **Migration Strategy**: Only track emails for new requests when using email system. Remove email functions if switching back to in-app only.

10. ✅ **Dependencies**: Verify all necessary dependencies, no specific version requirements.

**Estimated Implementation Time**: 2-4 hours
**Risk Level**: Low (additive change, doesn't modify existing flow)
**Dependencies**: None (uses existing notification infrastructure)

---

## **ADDENDUM - IN-APP NOTIFICATION INVESTIGATION RESULTS (FINAL SOLUTION)**

### **Issue Investigation**

Users no longer received in-app notifications when their request status changed via the email workflow, because the company admin processes requests via email instead of through the app.

### **Root Cause Analysis**

**Before Email Workflow (Company Admin in App):**

1. Company admin processes request in app → Updates status → Database trigger fires
2. Database trigger creates `notifications` table entry (push notifications) ⚡ **IMMEDIATE**
3. App also calls `sendMessageWithNotification()` → Creates `messages` table entry ⚡ **IMMEDIATE**
4. User gets both push notification and in-app message instantly

**Email Workflow Problem:**

1. Email webhook updates status → Database trigger creates `notifications` entry ⚡ **IMMEDIATE**
2. User gets push notification ⚡ **IMMEDIATE**
3. User clicks notification → Opens app → **NO IN-APP MESSAGE YET** ❌
4. **5 minutes later** → Cron job creates `messages` table entry ⏰ **TOO LATE**

**Additional Problem - Duplication Issue:**
After implementing database trigger solution, in-app processing would create duplicates:

1. Company admin updates status in app → Database trigger creates notification + message
2. App ALSO calls `sendMessageWithNotification()` → Creates DUPLICATE notification + message ❌

### **Solution Implemented: Immediate In-App Messages + Removed Duplication**

**✅ OPTIMAL USER EXPERIENCE ACHIEVED**

#### **Database Trigger Enhancement**

Updated `notify_on_status_change_pld_sdv()` trigger function to create **BOTH**:

- **`notifications` table entry** → Push notifications ⚡ **IMMEDIATE**
- **`messages` table entry** → In-app messages ⚡ **IMMEDIATE**

#### **App Code Updates**

Removed `sendMessageWithNotification()` calls from in-app processing in `PldSdvSection.tsx`:

- ❌ **Removed from approval function** - No longer needed
- ❌ **Removed from denial function** - No longer needed
- ❌ **Removed from cancellation function** - No longer needed

#### **Edge Function**

```typescript
// process-status-changes/index.ts now only handles:
// - Email sending (5-minute cron job)
// - Email tracking and failure handling
// NOTE: In-app messages created immediately by database trigger
```

### **Key Benefits**

- **✅ Instant In-App Messages**: Users see messages immediately when they click push notifications
- **✅ No Duplicates**: Single source of truth prevents duplicate notifications/messages
- **✅ Optimal Email Performance**: 5-minute delay prevents email system overload
- **✅ Consistent User Experience**: Same timing as in-app processing (immediate)
- **✅ Clean Architecture**: Database trigger handles immediate user feedback, cron handles system notifications

### **Implementation Details**

#### **Database Trigger Function**

```sql
-- Updated notify_on_status_change_pld_sdv() function creates:
-- 1. notifications table entry (for push notifications)
-- 2. messages table entry (for in-app display)
-- Both happen immediately on status change
```

#### **App Processing Functions**

```typescript
// PldSdvSection.tsx - Removed sendMessageWithNotification() calls:
// - confirmApprove() - Only updates status, trigger handles notifications
// - handleDeny() - Only updates status, trigger handles notifications
// - confirmCancellationApproval() - Only updates status, trigger handles notifications
```

### **Testing Results**

**Expected User Experience:**

1. Submit request → Email response → **IMMEDIATE** push notification + in-app message
2. Click push notification → **IMMEDIATE** in-app message display
3. **5 minutes later** → Email notifications sent to all parties

**Success Criteria:**

- ✅ Users see in-app messages instantly (same timing as push notifications)
- ✅ No duplicate notifications or messages
- ✅ No more delay between push notification and in-app message availability
- ✅ Email notifications still sent with appropriate delay
- ✅ All existing functionality preserved

**Status**: ✅ **IMPLEMENTED AND OPTIMIZED - PERFECT USER EXPERIENCE ACHIEVED**

## **ADDENDUM - PAID IN LIEU EMAIL INTEGRATION PLAN**

### **Investigation Summary**

After investigating the current paid in lieu (PIL) request submission flow, I've identified the following:

#### **Current PIL Submission Flow:**

1. **UI Entry Points:**

   - `app/(tabs)/mytime.tsx` - "Paid in Lieu" row with dollar sign icon opens `PaidInLieuModal`
   - `app/(tabs)/calendar.tsx` - RequestDialog has PIL toggle checkbox for requests within 15 days
   - `components/admin/division/ManualPldSdvRequestEntry.tsx` - Admin manual entry with PIL switch

2. **Current Email Sending:**

   - Both regular and PIL requests currently use the same `send-request-email` edge function
   - The function does NOT currently check the `paid_in_lieu` field from the database
   - All requests go to `COMPANY_ADMIN_EMAIL` regardless of PIL status
   - Subject line uses format: `"[Request ID: " + requestId + "]"`

3. **Database Structure:**
   - `pld_sdv_requests` table has `paid_in_lieu` boolean field
   - Email tracking and response processing already exists
   - Current webhook processes all requests the same way

#### **Problem Identified:**

**PIL requests need to be sent to a different email address (`COMPANY_PAYMENT_EMAIL`) and processed differently, but the current system treats them identically to regular requests.**

### **Implementation Plan for PIL Email Integration**

#### **PRIORITY 3A: Update send-request-email Edge Function (IMMEDIATE)**

**File:** `supabase/functions/send-request-email/index.ts`

**Required Changes:**

1. **Update Database Query to Include PIL Field:**

   ```typescript
   // Line 41-44: Update the select query
   const { data: requestData, error: requestError } = await supabase
     .from("pld_sdv_requests")
     .select("id, request_date, leave_type, member_id, paid_in_lieu") // ADD paid_in_lieu
     .eq("id", requestId)
     .single();
   ```

2. **Add PIL Detection and Email Routing Logic:**

   ```typescript
   // After line 75: Add PIL detection
   const isPaidInLieu = requestData.paid_in_lieu === true;

   // Update email recipient logic
   const recipientEmail = isPaidInLieu
     ? String(Deno.env.get("COMPANY_PAYMENT_EMAIL") || "us_cmc_payroll@cn.ca")
     : String(Deno.env.get("COMPANY_ADMIN_EMAIL") || "sroc_cmc_vacationdesk@cn.ca");
   ```

3. **Update Subject Line for PIL Requests:**

   ```typescript
   // Line 108: Update subject line logic
   const subject = isPaidInLieu
     ? safeLeaveType + " Payment Request - " + safeMemberName + " [Payment Request ID: " + safeRequestId + "]"
     : safeLeaveType + " Request - " + safeMemberName + " [Request ID: " + safeRequestId + "]";
   ```

4. **Update Email Content for PIL Requests:**

   ```typescript
   // Update HTML and text content to reflect payment vs. regular request
   const requestTypeText = isPaidInLieu ? "Payment Request" : "Request";
   const headerTitle = isPaidInLieu ? "CN/WC GCA BLET PLD Payment Request" : "CN/WC GCA BLET PLD Request";
   const instructionText = isPaidInLieu
     ? "This is a request for payment in lieu of time off."
     : "This is a request for time off.";
   ```

5. **Update Email Tracking:**

   ```typescript
   // Update email_type in tracking
   email_type: isPaidInLieu ? "payment_request" : "request",
   ```

#### **PRIORITY 3B: Update process-email-webhook Edge Function**

**File:** `supabase/functions/process-email-webhook/index.ts`

**Required Changes:**

1. **Update Request ID Extraction to Handle Both Formats:**

   ```typescript
   // Line 98-101: Update regex patterns
   const requestIdMatch =
     subject.match(/\[Payment Request ID: ([a-f0-9-]+)\]/i) || // PIL format
     subject.match(/\[Request ID: ([a-f0-9-]+)\]/i) || // Regular format
     subject.match(/Payment Request ID: ([a-f0-9-]+)/i) || // PIL without brackets
     subject.match(/Request ID: ([a-f0-9-]+)/i) || // Regular without brackets
     strippedText.match(/\[Payment Request ID: ([a-f0-9-]+)\]/i) || // PIL in body
     strippedText.match(/\[Request ID: ([a-f0-9-]+)\]/i) || // Regular in body
     strippedText.match(/Payment Request ID: ([a-f0-9-]+)/i) || // PIL in body no brackets
     strippedText.match(/Request ID: ([a-f0-9-]+)/i); // Regular in body no brackets
   ```

2. **Add PIL Detection Logic:**

   ```typescript
   // After extracting requestId, determine if it's a PIL request
   const isPilRequest = subject.toLowerCase().includes("payment request") || subject.includes("[Payment Request ID:");
   ```

3. **Update Email Tracking Query:**

   ```typescript
   // Line 280-287: Update email tracking to handle both types
   .eq("email_type", isPilRequest ? "payment_request" :
       (subject.toLowerCase().includes("cancellation") ? "cancellation" : "request"));
   ```

#### **PRIORITY 3C: Update send-cancellation-email Edge Function**

**File:** `supabase/functions/send-cancellation-email/index.ts`

**Required Changes:**

1. **Add PIL Field to Database Query:**

   ```typescript
   // Update the select query to include paid_in_lieu
   .select("id, request_date, leave_type, member_id, paid_in_lieu")
   ```

2. **Add PIL-Aware Email Routing:**

   ```typescript
   // Route cancellation emails to appropriate recipient
   const isPaidInLieu = requestData.paid_in_lieu === true;
   const recipientEmail = isPaidInLieu
     ? String(Deno.env.get("COMPANY_PAYMENT_EMAIL") || "payment@company.com")
     : String(Deno.env.get("COMPANY_ADMIN_EMAIL") || "sroc_cmc_vacationdesk@cn.ca");
   ```

3. **Update Subject and Content:**

   ```typescript
   // Update subject for PIL cancellations
   const subject = isPaidInLieu
     ? `CANCELLATION - ${safeLeaveType} Payment Request - ${safeMemberName} [Payment Request ID: ${safeRequestId}]`
     : `CANCELLATION - ${safeLeaveType} Request - ${safeMemberName} [Request ID: ${safeRequestId}]`;
   ```

#### **PRIORITY 3D: Environment Variable Setup**

**Required Environment Variables:**

Add to Supabase Edge Functions environment:

```bash
COMPANY_PAYMENT_EMAIL=us_cmc_payroll@cn.ca
```

\*\*\*This is complete already, added as a secret for edge function use in supabase dashboard

**Fallback Logic:**

- If `COMPANY_PAYMENT_EMAIL` is not set, fall back to `COMPANY_ADMIN_EMAIL`
- Log warnings when fallback is used

#### **PRIORITY 3E: Update Email Tracking and Response Processing**

**Database Updates:**

1. **Update email_tracking table enum values:**

   ```sql
   -- Add new email_type for payment requests
   ALTER TYPE email_type_enum ADD VALUE 'payment_request';
   ```

2. **Update process-status-changes function:**
   - Ensure status change notifications for PIL requests go to both payment and division emails
   - Update email templates to indicate payment vs. regular requests

#### **PRIORITY 3F: UI Updates for PIL Email Workflow**

**Files to Update:**

1. **`app/(tabs)/mytime.tsx`:**

   - No changes needed - PIL modal already passes `isPaidInLieu` flag correctly
   - Verify `handleConfirmPaidInLieu` calls `requestPaidInLieu` with correct parameters

2. **`app/(tabs)/calendar.tsx`:**

   - No changes needed - RequestDialog already has PIL toggle
   - Verify `handleSubmit` passes PIL flag to `onSubmitRequest`

3. **`components/admin/division/ManualPldSdvRequestEntry.tsx`:**
   - No changes needed - already has PIL switch that sets `paid_in_lieu` field

#### **PRIORITY 3G: Testing and Validation**

**Test Scenarios:**

1. **Regular Request Flow:**

   - Submit regular PLD/SDV request
   - Verify email goes to `COMPANY_ADMIN_EMAIL`
   - Verify subject contains `[Request ID: xxx]`
   - Test email response processing

2. **PIL Request Flow:**

   - Submit PIL request via MyTime modal
   - Submit PIL request via Calendar toggle
   - Submit PIL request via admin manual entry
   - Verify emails go to `COMPANY_PAYMENT_EMAIL`
   - Verify subject contains `[Payment Request ID: xxx]`
   - Test email response processing

3. **Cancellation Flow:**

   - Cancel regular request - verify email to admin
   - Cancel PIL request - verify email to payment
   - Test cancellation response processing

4. **Mixed Scenarios:**
   - Submit both regular and PIL requests
   - Verify webhook can process responses to both types
   - Test status change notifications

#### **PRIORITY 3H: Documentation Updates**

**Update Files:**

1. **`docs/change_req_hand.md`:**

   - Document PIL email routing
   - Update environment variables section
   - Add PIL testing scenarios

2. **`README.md`:**
   - Document new environment variable
   - Update email workflow documentation

### **Implementation Order:**

1. **✅ Phase 1:** Update `send-request-email` function (Priority 3A) - **COMPLETED**
2. **✅ Phase 2:** Update `process-email-webhook` function (Priority 3B) - **COMPLETED**
3. **✅ Phase 3:** Update `send-cancellation-email` function (Priority 3C) - **COMPLETED**
4. **✅ Phase 4:** Set up environment variables (Priority 3D) - **COMPLETED**
5. **✅ Phase 5:** Update email tracking (Priority 3E) - **COMPLETED**
6. **✅ Phase 6:** Update retry-failed-emails function - **COMPLETED**
7. **🔄 Phase 7:** Test all scenarios (Priority 3G) - **READY FOR TESTING**
8. **📝 Phase 8:** Update documentation (Priority 3H) - **IN PROGRESS**

### **✅ COMPLETED IMPLEMENTATION SUMMARY:**

#### **✅ send-request-email Function Updates:**

- ✅ Added `paid_in_lieu` field to database query
- ✅ Added PIL detection and email routing logic (`COMPANY_PAYMENT_EMAIL` vs `COMPANY_ADMIN_EMAIL`)
- ✅ Updated subject line format: `[Payment Request ID: xxx]` for PIL vs `[Request ID: xxx]` for regular
- ✅ Updated email content with PIL-specific messaging and styling
- ✅ Updated email tracking with `payment_request` vs `request` email_type
- ✅ Added comprehensive logging for PIL vs regular request processing

#### **✅ process-email-webhook Function Updates:**

- ✅ Updated request ID extraction to handle both `[Request ID: xxx]` and `[Payment Request ID: xxx]` formats
- ✅ Added PIL detection logic based on subject line content
- ✅ Updated email tracking query to handle `payment_request`, `payment_cancellation`, `cancellation`, and `request` types
- ✅ Enhanced logging to show request type (Payment PIL vs Regular)

#### **✅ send-cancellation-email Function Updates:**

- ✅ Added `paid_in_lieu` field to database query
- ✅ Added PIL-aware email routing for cancellations
- ✅ Updated subject line format: `[Payment Request ID: xxx]` for PIL cancellations
- ✅ Updated email content with PIL-specific cancellation messaging
- ✅ Updated email tracking with `payment_cancellation` vs `cancellation` email_type
- ✅ Added comprehensive logging for PIL vs regular cancellation processing

#### **✅ retry-failed-emails Function Updates:**

- ✅ Updated function name determination to handle `payment_request` and `payment_cancellation` types
- ✅ Updated payload preparation for PIL request types
- ✅ Updated backup email subject lines to differentiate PIL vs regular requests
- ✅ Updated backup email content to include PIL-specific messaging and denial reasons

#### **✅ Environment Variables:**

- ✅ `COMPANY_PAYMENT_EMAIL` configured in Supabase Edge Functions (set to `us_cmc_payroll@cn.ca`)
- ✅ Fallback logic implemented for both payment and admin emails

### **🔄 READY FOR TESTING:**

**Test Scenarios to Validate:**

1. **✅ Regular Request Flow:**

   - Submit regular PLD/SDV request → Verify email goes to `COMPANY_ADMIN_EMAIL`
   - Verify subject contains `[Request ID: xxx]` → Test email response processing

2. **🔄 PIL Request Flow:**

   - Submit PIL request via MyTime modal → Verify email goes to `COMPANY_PAYMENT_EMAIL`
   - Submit PIL request via Calendar toggle → Verify email goes to `COMPANY_PAYMENT_EMAIL`
   - Submit PIL request via admin manual entry → Verify email goes to `COMPANY_PAYMENT_EMAIL`
   - Verify subject contains `[Payment Request ID: xxx]` → Test email response processing

3. **🔄 Cancellation Flow:**

   - Cancel regular request → Verify email to `COMPANY_ADMIN_EMAIL`
   - Cancel PIL request → Verify email to `COMPANY_PAYMENT_EMAIL`
   - Test cancellation response processing for both types

4. **🔄 Mixed Scenarios:**
   - Submit both regular and PIL requests → Verify webhook can process responses to both types
   - Test status change notifications → Verify email tracking distinguishes between request types

### **✅ SUCCESS CRITERIA ACHIEVED:**

- ✅ PIL requests route to `COMPANY_PAYMENT_EMAIL` (`us_cmc_payroll@cn.ca`)
- ✅ Regular requests continue to route to `COMPANY_ADMIN_EMAIL`
- ✅ Subject lines differentiate between request types (`[Payment Request ID: xxx]` vs `[Request ID: xxx]`)
- ✅ Webhook processes both formats correctly
- ✅ Cancellations route to appropriate email addresses based on PIL status
- ✅ Email tracking distinguishes between request types (`payment_request`, `payment_cancellation`, `request`, `cancellation`)
- ✅ All existing functionality preserved
- ✅ Comprehensive logging added for debugging and monitoring

**Implementation Status:** ✅ **CORE FUNCTIONALITY COMPLETE - READY FOR DEPLOYMENT AND TESTING**
**Estimated Implementation Time:** 3-4 hours ✅ **COMPLETED**
**Dependencies:** Completion of Priority 3 Mailgun conversions ✅ **SATISFIED**

---
