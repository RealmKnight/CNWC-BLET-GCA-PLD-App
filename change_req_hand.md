# Change Request Processing Plan

We will be implementing an email-based workflow for request processing, allowing the company admin to receive and respond to requests via email. The app will send emails for request processing to the company admin and have replies sent to our webhook to be processed in the DB and the app. We are maintaining all existing company admin functionality in the app while adding this email-based workflow as an additional option.

## Implementation Components

### 1. Email Notification for Company Admins

- Add a notification for company admins when they log in about the current email workflow option

### 2. Division Email Management

- Add capability for divisions to manage their own email addresses for administrative communications
- Create a UI for division admins to add, edit, and remove division email addresses
- Implement validation to ensure properly formatted email addresses
- Send a welcome email when new division emails are added
- Create an audit log to track changes to division email settings
- Add notification system to inform division admins of email configuration changes

### 3. Edge Functions Implementation

The following edge functions already exist in the codebase and will need to be updated:

#### Supabase Edge Function for sending initial request email

`supabase/functions/send-request-email/index.js`

Updates needed:

- Fix variable naming to match database fields (e.g., `date_requested` → `request_date` and `day_type` → `leave_type`)
- Format email content to be more professional with proper HTML formatting
- Include app logo and styling
- Ensure proper extraction of data from the request
- Add error handling for email sending failures
- Update the email recipient to use the environment variable `COMPANY_ADMIN_EMAIL` for the address to send the initial request/cancellation emails to. the response emails will be sent accordingly
- Implement retry logic for failed email sends
- Add entry to email tracking table for monitoring delivery status
- Integrate with existing `send-email` function for Resend as backup provider

#### Supabase Edge Function for sending cancellation request email

`supabase/functions/send-cancellation-email/index.js`

Updates needed:

- Fix database path from `public.pld_sdv_requests` to just `pld_sdv_requests` (line 29)
- Fix variable naming mismatches (e.g., `requestData.day_type` → `requestData.leave_type`, line 52)
- Format email content to be more professional with proper HTML formatting
- Include app logo and styling
- Improve error handling for failed database queries
- Add logging for successful and failed operations
- Implement retry logic for failed email sends
- Add entry to email tracking table for monitoring delivery status
- Integrate with existing `send-email` function for Resend as backup provider

#### Supabase Edge Function for processing email webhooks from Mailgun

`supabase/functions/process-email-webhook/index.js`

Updates needed:

- Fix verification logic for Mailgun webhook signatures (lines 10-20)
- Update database path from `public.pld_sdv_requests` to just `pld_sdv_requests` (line 85)
- Enhance the content parsing to extract approval/denial status more accurately
- Add more robust error handling and logging
- Consider adding auto-categorization of denial reasons
- Add validation to detect invalid or malformed email responses
- Improve the denied status handling by including proper denial reason extraction
- Add handling for out-of-office replies to prevent request processing delays

#### Supabase Edge Function for processing status changes

`supabase/functions/process-status-changes/index.js`

Updates needed:

- Create the missing `status_change_queue` table as specified in the SQL below
- Update database paths and variable names (e.g., `date_requested` → `request_date`, line 94)
- Fix the member data retrieval path: `public.members!pld_sdv_requests_member_id_fkey` is incorrect (line 35)
- Update the email recipient logic to check division email settings first, using division-specific emails when available. If email delivery to a division email fails and fallback to individual admin notifications (Push/SMS/in-app) is required, a mechanism will be needed to identify the specific admin user ID(s) associated with that `division_id` (e.g., by querying members with an admin role for that `division_id`).
- Modify to support multiple recipients when division has additional emails configured
- Implement HTML email templates for better presentation
- Add robust error handling for email sending failures
- Ensure proper status handling with appropriate notifications for each status change
- Add fallback to admin notifications if email delivery fails permanently, following the admin's preference order (Push > SMS > in-app)

#### New Supabase Edge Function for sending welcome emails to new division email addresses

`supabase/functions/send-division-welcome-email/index.js` (to be created)

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

`supabase/functions/email-status-webhook/index.js` (to be created)

Requirements:

- Process Mailgun delivery status webhooks (delivered, opened, clicked, etc.)
- Update email tracking records in the database
- Handle failed delivery notifications with retry logic
- Log detailed information for troubleshooting
- Update request status indicators in the admin dashboard
- Trigger admin notifications via preferred channel (Push > SMS > in-app) if email delivery permanently fails

### 4. Database Changes

#### Email Processing Tables

Create the required status change queue table and trigger:

```sql
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

-- Create an email tracking table
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

-- Create an index for faster lookups
CREATE INDEX idx_email_tracking_request_id ON public.email_tracking(request_id);
CREATE INDEX idx_email_tracking_status ON public.email_tracking(status);
```

#### Division Email Management

Add columns to the `divisions` table for email management:

```sql
-- Add email capabilities to divisions table
ALTER TABLE public.divisions ADD COLUMN primary_email VARCHAR(255);
ALTER TABLE public.divisions ADD COLUMN additional_emails VARCHAR(255)[];
ALTER TABLE public.divisions ADD COLUMN use_central_email BOOLEAN DEFAULT TRUE;

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

-- Create an index for faster lookups
CREATE INDEX idx_division_email_audit_division_id ON public.division_email_audit_log(division_id);
CREATE INDEX idx_division_email_audit_admin_id ON public.division_email_audit_log(admin_id);
```

### 5. Store Updates

The following store files will need to be updated to work with the email-based workflow:

- `store/timeStore.ts`:

  - Update `submitRequest` function (lines 1098-1137) to call the `send-request-email` edge function after creating the database record:

    ```typescript
    // After successful insert
    if (data) {
      try {
        // Call the edge function to send email
        const { error: emailError } = await supabase.functions.invoke("send-request-email", {
          body: {
            name: member.name,
            pin: member.pin_number,
            dateRequested: date,
            dayType: leaveType,
            requestId: data.id,
            divisionId: member.division_id, // Add division ID to look up division-specific emails
          },
        });
        if (emailError) {
          console.error("[TimeStore] Error sending request email:", emailError);
          // Log the failure in the email_tracking table
          await supabase.from("email_tracking").insert({
            request_id: data.id,
            email_type: "request",
            recipient: Deno.env.get("COMPANY_ADMIN_EMAIL"), // Intended recipient; actual resolution in Edge Function
            subject: `${leaveType} Request - ${member.name}`,
            status: "failed",
            error_message: emailError.message,
            retry_count: 0,
            next_retry_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // Retry in 15 minutes
          });

          // Continue anyway since the database record was created
        }
      } catch (emailSendError) {
        console.error("[TimeStore] Exception when sending request email:", emailSendError);
        // Log the failure in the email_tracking table
        await supabase.from("email_tracking").insert({
          request_id: data.id,
          email_type: "request",
          recipient: Deno.env.get("COMPANY_ADMIN_EMAIL"), // Intended recipient; actual resolution in Edge Function
          subject: `${leaveType} Request - ${member.name}`,
          status: "failed",
          error_message: emailSendError.message,
          retry_count: 0,
          next_retry_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // Retry in 15 minutes
        });

        // Continue anyway since the database record was created
      }
    }
    ```

  - Update `cancelRequest` function (lines 916-982) to call the `send-cancellation-email` edge function after updating the status:

    ```typescript
    // After successful status change
    if (data === true) {
      try {
        // Get member details
        const member = useUserStore.getState().member;
        if (member) {
          // Call the edge function to send cancellation email
          const { error: emailError } = await supabase.functions.invoke("send-cancellation-email", {
            body: {
              requestId,
              name: member.name,
              pin: member.pin_number,
              divisionId: member.division_id, // Add division ID to look up division-specific emails
            },
          });
          if (emailError) {
            console.error("[TimeStore] Error sending cancellation email:", emailError);
            // Log the failure in the email_tracking table
            await supabase.from("email_tracking").insert({
              request_id: requestId,
              email_type: "cancellation",
              recipient: Deno.env.get("COMPANY_ADMIN_EMAIL"), // Intended recipient; actual resolution in Edge Function
              subject: `CANCELLATION - Request - ${member.name}`,
              status: "failed",
              error_message: emailError.message,
              retry_count: 0,
              next_retry_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // Retry in 15 minutes
            });

            // Continue anyway since the database was updated
          }
        }
      } catch (emailSendError) {
        console.error("[TimeStore] Exception when sending cancellation email:", emailSendError);
        // Log the failure in the email_tracking table with member info if available
        const member = useUserStore.getState().member;
        if (member) {
          await supabase.from("email_tracking").insert({
            request_id: requestId,
            email_type: "cancellation",
            recipient: Deno.env.get("COMPANY_ADMIN_EMAIL"), // Intended recipient; actual resolution in Edge Function
            subject: `CANCELLATION - Request - ${member.name}`,
            status: "failed",
            error_message: emailSendError.message,
            retry_count: 0,
            next_retry_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // Retry in 15 minutes
          });
        }

        // Continue anyway since the database was updated
      }
    }
    ```

- `store/calendarStore.ts`:

  - Update `userSubmitRequest` (lines 779-803) to handle the email workflow by calling the updated timeStore methods that now handle emails

- `store/divisionMangementStore.ts` (already exists):
  - Add methods to manage division email settings
  - Include functions to add, update, and remove division emails
  - Implement audit logging of changes
  - Add validation for email formats
  - Create notification functions for email setting changes (Update to `store/adminNotificationStore.ts`)

### 6. UI Components for Division Email Management

- Create a new component for managing division emails (`components/admin/division/DivisionEmailSettings.tsx`):

  - Form for adding/editing primary division email
  - Interface for managing additional email addresses (add/remove functionality)
  - Toggle for using central vs. division-specific emails
  - Email format validation
  - Save/cancel buttons with proper validation feedback
  - Integration with existing division management UI

- Add an audit log view for division administrators:
  - Show history of email configuration changes
  - Display which admin made each change
  - Include timestamps for all changes
  - Filter options by date range and change type

### 7. Notification Fallback Implementation

Since we'll be using the admin's preferred notification method as a fallback, we need to properly implement this functionality:

- Create a function to handle fallback notifications. This function (`sendAdminFallbackNotification`) will be updated to:

  1. Accept `adminId` (the user ID of the admin) and `message`.
  2. Fetch the member's details, including `phone_number` from the `members` table.
  3. Query `user_notification_preferences` for the given `adminId` and a relevant category (e.g., `admin_alert` or a new one like `email_fallback_alert`). A new category `email_delivery_failure` should be added to `notification_categories` for this purpose.
  4. Query `user_preferences` for the `adminId` to get the global `contact_preference`.
  5. Determine the notification method based on these preferences, prioritizing Push > SMS > In-app:
     - **Push Notification:** If category preference enables push for this alert type (and user has a push token), or if global preference is 'push' and category preference is 'default' (and user has a push token).
     - **SMS:** If category preference enables SMS, or global preference is 'SMS' (and category is 'default'), and `phone_number` is available.
     - **In-app Notification:** As the final fallback if Push/SMS are not preferred or not possible.
  6. The function will invoke the appropriate Supabase function (`process-notification-queue` for push, `send-sms` for SMS) or insert into the `notifications` table for in-app.
  7. It should return an object indicating success and the method used.

  ```typescript
  // Edge function to send notification based on admin preferences
  async function sendAdminFallbackNotification(supabase, adminId, message) {
    try {
      // Get admin's user details (including phone_number for SMS)
      const { data: admin, error: adminError } = await supabase
        .from("members")
        .select("id, name, phone_number")
        .eq("id", adminId)
        .single();

      if (adminError) throw adminError;

      let deliveryMethod = "in-app"; // Default fallback
      let sendNotification = true;

      // 1. Check user_notification_preferences for a specific category (e.g., 'email_delivery_failure')
      //    A new category 'email_delivery_failure' should be created in 'notification_categories'.
      const { data: categoryPref, error: catPrefError } = await supabase
        .from("user_notification_preferences")
        .select("delivery_method, enabled")
        .eq("user_id", adminId)
        .eq("category_code", "email_delivery_failure") // New category
        .single();

      if (catPrefError && catPrefError.code !== "PGRST116") {
        /* PGRST116: no rows returned */
        console.error("Error fetching category preference:", catPrefError);
      }

      if (categoryPref) {
        if (!categoryPref.enabled) {
          sendNotification = false;
        } else if (["push", "sms", "in_app"].includes(categoryPref.delivery_method)) {
          deliveryMethod = categoryPref.delivery_method;
        }
        // If categoryPref.delivery_method is 'default', proceed to global preferences.
      }

      // 2. If 'default' or no category-specific preference, check global user_preferences.contact_preference
      if (sendNotification && (!categoryPref || categoryPref.delivery_method === "default")) {
        const { data: globalPref, error: globalPrefError } = await supabase
          .from("user_preferences")
          .select("contact_preference")
          .eq("user_id", adminId)
          .single();

        if (globalPrefError && globalPrefError.code !== "PGRST116") {
          console.error("Error fetching global user preference:", globalPrefError);
        }

        if (globalPref && globalPref.contact_preference) {
          // Map global contact_preference to a more direct delivery method if applicable
          // For example, if global is 'email', for an email *failure* alert, 'in-app' is the true fallback.
          // If global is 'push', it implies push. If 'sms', it implies sms.
          if (globalPref.contact_preference === "push") deliveryMethod = "push";
          else if (globalPref.contact_preference === "sms") deliveryMethod = "sms";
          // If globalPref.contact_preference is 'email', deliveryMethod remains 'in-app' for this email failure context.
        }
      }

      if (!sendNotification) {
        console.log(`Notification for admin ${adminId} (email_delivery_failure) is disabled by preference.`);
        return { success: true, method: "disabled" };
      }

      // Attempt delivery based on resolved deliveryMethod (Push > SMS > In-app)
      if (deliveryMethod === "push") {
        const { data: tokens } = await supabase
          .from("user_push_tokens")
          .select("token")
          .eq("user_id", adminId)
          .eq("is_active", true);
        if (tokens && tokens.length > 0) {
          await supabase.functions.invoke("process-notification-queue", {
            body: {
              tokens: tokens.map((t) => t.token),
              message: {
                title: "Action Required: Request Processing",
                body: message,
                data: { type: "email_delivery_failure" },
              },
            },
          });
          return { success: true, method: "push" };
        }
        // If push preferred but no tokens, fall through to next preferred (e.g., SMS or in-app based on further logic not shown here for brevity, or simply default to in-app)
        deliveryMethod = "sms"; // Example: try SMS next if push failed due to no tokens
      }

      if (deliveryMethod === "sms" && admin.phone_number) {
        await supabase.functions.invoke("send-sms", {
          body: { to: admin.phone_number, message: message },
        });
        return { success: true, method: "sms" };
      }

      // Last resort: In-app notification
      await supabase.from("notifications").insert({
        user_id: adminId,
        type: "email_delivery_failure", // Use the new category
        title: "Action Required: Request Processing",
        message: message,
        data: { type: "email_delivery_failure" },
        read: false,
      });
      return { success: true, method: "in-app" };
    } catch (error) {
      console.error("Failed to send admin notification:", error);
      return { success: false, error: error.message };
    }
  }
  ```

- Create a scheduled edge function to retry failed emails:

  ```typescript
  // supabase/functions/retry-failed-emails/index.ts
  import { createClient } from "@supabase/supabase-js";

  export async function handler() {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_KEY");
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Get failed emails that are due for retry
      const { data: failedEmails, error } = await supabase
        .from("email_tracking")
        .select("*")
        .in("status", ["failed", "queued"])
        .lte("next_retry_at", new Date().toISOString())
        .limit(20); // Process in batches

      if (error) throw error;

      // Process each failed email
      for (const email of failedEmails) {
        try {
          // Determine which function to call based on email_type
          const functionName =
            email.email_type === "request"
              ? "send-request-email"
              : email.email_type === "cancellation"
              ? "send-cancellation-email"
              : "process-status-changes";

          // Get request details if needed for the retry
          const { data: requestData } = await supabase
            .from("pld_sdv_requests")
            .select("*, members(name, pin_number, division_admin_id, division_id)")
            .eq("id", email.request_id)
            .single();

          if (!requestData) continue;

          // Prepare payload based on email type
          let payload = {};
          if (email.email_type === "request") {
            payload = {
              name: requestData.members.name,
              pin: requestData.members.pin_number,
              dateRequested: requestData.request_date,
              dayType: requestData.leave_type,
              requestId: requestData.id,
              divisionId: requestData.members.division_id,
            };
          } else if (email.email_type === "cancellation") {
            payload = {
              requestId: requestData.id,
              name: requestData.members.name,
              pin: requestData.members.pin_number,
              divisionId: requestData.members.division_id,
            };
          }

          // Try to deliver with primary email service first (Mailgun)
          let emailSent = false;
          try {
            await supabase.functions.invoke(functionName, { body: payload });
            emailSent = true;
          } catch (primaryError) {
            console.error(`Primary email service failed: ${primaryError.message}`);

            // If primary fails, try Resend as backup
            if (email.retry_count >= 2) {
              // Try backup after 2 primary failures
              try {
                // Get division emails if available
                let recipients = [Deno.env.get("COMPANY_ADMIN_EMAIL") || "sroc_cmc_vacationdesk@cn.ca"];

                if (requestData.members.division_id) {
                  const { data: divisionData } = await supabase
                    .from("divisions")
                    .select("primary_email, additional_emails, use_central_email")
                    .eq("id", requestData.members.division_id)
                    .single();

                  if (divisionData && !divisionData.use_central_email && divisionData.primary_email) {
                    recipients = [divisionData.primary_email];
                    if (divisionData.additional_emails && divisionData.additional_emails.length > 0) {
                      recipients = [...recipients, ...divisionData.additional_emails];
                    }
                  }
                }

                await supabase.functions.invoke("send-email", {
                  body: {
                    to: recipients,
                    subject:
                      email.email_type === "request"
                        ? `${requestData.leave_type} Request - ${requestData.members.name}`
                        : `CANCELLATION - Request - ${requestData.members.name}`,
                    html: `<p>This is a backup delivery of a previously failed email.</p>
                      <p>Name: ${requestData.members.name}</p>
                      <p>PIN: ${requestData.members.pin_number}</p>
                      <p>Date: ${requestData.request_date}</p>
                      <p>Type: ${requestData.leave_type}</p>
                      <p>Request ID: ${requestData.id}</p>
                      <p>This is an automated message. Please reply "approved" or "denied - [reason]" to this email to approve or deny this request. Denial reasons include "out of ${requestData.leave_type} days", "allotment is full", "other - [reason]".</p>`,
                  },
                });
                emailSent = true;
              } catch (backupError) {
                console.error(`Backup email service failed: ${backupError.message}`);
                throw new Error(`Both primary and backup email services failed`);
              }
            } else {
              throw primaryError; // Re-throw if not yet trying backup
            }
          }

          // If we got here, one of the services succeeded
          if (emailSent) {
            // Update tracking record
            await supabase
              .from("email_tracking")
              .update({
                status: "sent",
                retry_count: email.retry_count + 1,
                last_updated_at: new Date().toISOString(),
              })
              .eq("id", email.id);
          }
        } catch (retryError) {
          console.error(`Failed to retry email ${email.id}:`, retryError);

          // Update retry count and set next retry with exponential backoff
          const nextRetryMinutes = Math.min(120, 15 * Math.pow(2, email.retry_count));

          // After 5 retries (about 8 hours with exponential backoff), trigger fallback notification
          const shouldSendFallback = email.retry_count >= 4 && !email.fallback_notification_sent;

          await supabase
            .from("email_tracking")
            .update({
              retry_count: email.retry_count + 1,
              next_retry_at: new Date(Date.now() + nextRetryMinutes * 60 * 1000).toISOString(),
              error_message: retryError.message,
              fallback_notification_sent: shouldSendFallback ? true : email.fallback_notification_sent,
              last_updated_at: new Date().toISOString(),
            })
            .eq("id", email.id);

          // If we've exhausted retries, send fallback notification
          if (shouldSendFallback && requestData?.members?.division_id) {
            // Check for division_id
            try {
              // Determine the specific division admin user ID(s) for requestData.members.division_id.
              const { data: divisionAdmins, error: adminError } = await supabase
                .from("members")
                .select("id") // Select only the user ID
                .eq("role", "division_admin")
                .eq("division_id", requestData.members.division_id);

              if (adminError) {
                console.error(
                  `Error fetching division admins for division ${requestData.members.division_id}:`,
                  adminError
                );
                throw adminError; // Rethrow to log the main retry error with this context
              }

              if (divisionAdmins && divisionAdmins.length > 0) {
                const message = `Action required: ${requestData.members.name}'s ${requestData.leave_type} request for ${requestData.request_date} needs processing. Email delivery failed.`;
                for (const admin of divisionAdmins) {
                  await sendAdminFallbackNotification(supabase, admin.id, message);
                }
              } else {
                console.warn(
                  `Could not determine division admin user ID for division ${requestData.members.division_id} to send fallback notification.`
                );
                // Log this specific issue or escalate if necessary.
              }
            } catch (notificationError) {
              console.error(`Fallback notification failed:`, notificationError);

              // Log the notification failure for manual intervention
              await supabase.from("notifications").insert({
                user_id: requestData.members.division_admin_id,
                type: "critical_failure",
                title: "CRITICAL: Email and Notification Delivery Failed",
                message: `Unable to notify about ${email.email_type} for ${requestData.members.name}`,
                data: {
                  emailTrackingId: email.id,
                  requestId: email.request_id,
                  emailError: retryError.message,
                },
                read: false,
              });
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true, processed: failedEmails.length }));
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  }
  ```

### 8. UI Updates for Email Tracking

- Add an "Email History" tab in the admin dashboard showing (`components\admin\divison\EmailHistory` and plug into the PldSdvManager component as another tab in the same style as the app current uses or the same tab as the email entering/updating component and switch between):

  - All emails sent for each request
  - Current delivery status (queued, sent, delivered, opened, failed)
  - Retry history for failed emails
  - Option to manually resend emails
  - Integration with existing admin dashboard patterns

- Add status indicators in the request list:

  - Icon showing email delivery status
  - "Email sent" timestamp
  - "Email opened" timestamp if available
  - "Response received" timestamp

- Create a filter in the admin dashboard to view:
  - Requests with failed emails
  - Requests awaiting email response
  - Requests processed via email

### 9. Privacy Policy Updates

Update the privacy policy (both in `app/privacy.tsx` and `docs/privacy_policy.md`) to include details about:

- How emails are used in the request processing workflow
- What information is included in emails
- Who receives these emails (company admins and division admins)
- How email tracking works (delivery confirmation, opens, etc.)
- How long email data is retained
- User rights regarding email communications
- The role of service providers (Mailgun and Resend)

Specific sections to add:

```markdown
### Email Communications for Request Processing

- We send emails on your behalf when you submit time-off requests or cancellations
- These emails contain your name, PIN, requested date, and type of time off
- Company administrators and/or division administrators receive these emails to approve or deny your requests
- Divisions may configure their own email addresses to receive these communications
- We track email delivery status to ensure your requests are processed in a timely manner
- We may use your preferred notification method (push, SMS, or in-app) as a fallback if email delivery fails

### Email Service Providers

- We use Mailgun as our primary email service provider
- We use Resend as a backup email service provider if Mailgun is unavailable
- These services may collect and process delivery data (sent, delivered, opened status)
- All email communications are encrypted in transit
```

### 10. Testing and Verification

- Test submitRequest flow through the app and verify emails are sent correctly
- Test cancelRequest flow through the app and verify emails are sent correctly
- Test email webhook processing by sending test emails with various approval/denial messages
- Verify status changes are correctly processed by the status change queue trigger
- Confirm notification emails are sent when status changes occur
- Test the full end-to-end workflow from request submission to email processing and final status update
- Test the email retry system with simulated failures
- Verify Mailgun webhook processing for delivery status updates
- Test manual resend functionality in the admin dashboard
- Test fallback notifications when email delivery fails permanently
- Verify Resend backup email provider works when Mailgun fails
- Test division email management UI and functionality
- Verify division-specific emails receive request notifications correctly
- Test welcome emails for new division email addresses
- Validate audit logging for division email changes
- Test division admin notifications for email setting changes

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

   - Implement proper signature verification for webhooks
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

## Completed Questions

1. ~~What would be the preferred environment variable name for the central admin email address?~~ No central email address is being tracked or kept. THERE IS NO CENTRAL EMAIL ADDRESS STOP REFERENCING IT the variable COMPANY_ADMIN_EMAIL is a supabase edge function ENV variable for SENDING ADDRESS from the initial request/cancellation emails to be sent to NOT A CENTRAL ADDRESS

2. ~~Should there be a transition period where both email and in-app workflows are available, or should it be a hard cutover?~~ No transition period needed as both systems will work together.

3. ~~What specific data format should we use for the SMS fallback messages to ensure clarity while keeping the message brief?~~ Use MM/DD/YYYY date format.

4. ~~How should we handle email tracking from a privacy perspective? Should we inform the company admin that we're tracking email opens/clicks?~~ No need to inform company admins as the company will handle this via their own privacy policy.

5. ~~Are there any specific email retention policies we should implement for compliance purposes?~~ No specific retention policies needed at this time as emails are sent to division admins for retention/record keeping.

6. ~~Should we add an emergency override mechanism to allow certain requests to be processed in-app even when the email system is active?~~ No changes needed as the company admin section will still work with the email system; there will be an app audit trail instead of an email audit trail.
