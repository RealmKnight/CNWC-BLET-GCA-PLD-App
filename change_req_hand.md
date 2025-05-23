# Change Request Processing Plan

We will be implementing an email-based workflow for request processing, allowing the company admin to receive and respond to requests via email. The app will send emails for request processing to division admins and have replies sent to our webhook to be processed in the DB and the app. We are maintaining all existing company admin functionality in the app while adding this email-based workflow as an additional option.

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

#### Supabase Edge Function for sending initial request email

`supabase/functions/send-request-email/index.ts`

Updates needed:

- Fix variable naming to match database fields (e.g., `date_requested` → `request_date` and `day_type` → `leave_type`)
- Send emails to `COMPANY_ADMIN_EMAIL` environment variable for centralized request processing
- Format email content to be more professional with proper HTML formatting
- Include app logo and styling
- Ensure proper extraction of data from the request
- Add error handling for email sending failures
- Implement retry logic for failed email sends
- Add entry to email tracking table for monitoring delivery status
- Integrate with existing `send-email` function for Resend as backup provider
- Include request ID in email for webhook correlation

#### Supabase Edge Function for sending cancellation request email

`supabase/functions/send-cancellation-email/index.ts`

Updates needed:

- Fix database path from `public.pld_sdv_requests` to just `pld_sdv_requests` (line 29)
- Fix variable naming mismatches (e.g., `requestData.day_type` → `requestData.leave_type`, line 52)
- Send cancellation emails to `COMPANY_ADMIN_EMAIL` environment variable for centralized processing
- Format email content to be more professional with proper HTML formatting
- Include app logo and styling
- Improve error handling for failed database queries
- Add logging for successful and failed operations
- Implement retry logic for failed email sends
- Add entry to email tracking table for monitoring delivery status
- Integrate with existing `send-email` function for Resend as backup provider
- Include request ID in email for webhook correlation

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
