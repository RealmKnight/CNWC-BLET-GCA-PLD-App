# Email System Refactoring Plan

## Current State

The application currently sends emails using multiple methods:

1. **Supabase Edge Function (`send-email`)**: Custom implementation using SMTP credentials hardcoded in the function. Currently using a hostrocket.com SMTP server.

2. **Supabase Auth Email Service**: Used for password reset functionality with a fallback system that uses the custom Edge Function when Supabase's built-in email fails.

3. **Custom Fallback System**: Complex fallback mechanism in `sendPasswordResetEmail()` in `notificationService.ts` that tries multiple methods to ensure email delivery.

4. **Testing Function**: The current `testEmailFunction()` is limited by using a Resend onboarding API key that can only send to the developer's email address.

5. **Profile Page Implementation**: The [ProfileID] page contains email-related buttons that need to be updated, and alert/error handling that currently works on Android but needs web compatibility.

## Target State

Transition to using Supabase's built-in SMTP integration with Resend as the email provider:

1. **Supabase Auth Emails**: All auth-related emails (password reset, verification, etc.) will be sent through Supabase Auth using the configured SMTP settings.

2. **Custom Emails**: Custom emails (notifications, etc.) will be sent through the Edge Function, but with updated configuration to use Supabase environment variables.

3. **Simplified Fallback System**: Implement a single fallback mechanism for critical emails.

4. **Enhanced Test Function**: Update `testEmailFunction()` to use the new SMTP settings and support sending test emails to any valid email address.

5. **Cross-Platform UI**: Ensure alert/error handling works consistently across all platforms (web, Android, iOS).

## Resend SMTP Configuration Details

- **SMTP Host**: smtp.resend.com
- **SMTP Port**: 465 (or 587)
- **Username**: resend (as per Resend documentation)
- **Password**: Your Resend API key
- **Sender Email**: Email from your verified domain

## Implementation Plan

### Phase 1: Preparation & Validation

1. **Verify Supabase SMTP Configuration**:

   - Confirm that Resend API credentials are correctly configured in Supabase Auth SMTP settings.
   - Verify the domain is properly set up and verified in Resend.
   - Ensure the Supabase project is using the verified email templates from the dashboard.

2. **Verify Email Templates**:

   - Use the existing templates available in the Supabase dashboard.
   - Ensure branding and styling match the application's design.
   - Test template rendering with different email content.

3. **Create Test Plan**:
   - Develop a test script for all email flows (auth, custom notifications, etc.).
   - Set up monitoring to track email delivery success rates.
   - Prepare for future email flows that will be implemented after this refactor.

### Phase 2: Edge Function Update

1. **Update Send-Email Edge Function**:

   - Modify `supabase/functions/send-email/index.ts` to use environment variables for SMTP configuration.
   - Remove hardcoded credentials and replace with Supabase environment variables.
   - Sample code:

   ```typescript
   const client = new SmtpClient({
     host: Deno.env.get("SMTP_HOST") || "smtp.resend.com",
     port: Number(Deno.env.get("SMTP_PORT")) || 465,
     secure: true, // For port 465
     auth: {
       username: "resend", // Using "resend" as the username per Resend docs
       password: Deno.env.get("SMTP_PASSWORD") || "", // Resend API key as password
     },
   });
   ```

2. **Set Environment Variables**:

   - Add Resend SMTP configuration to Supabase Edge Function environment.
   - Update `config.ts` to ensure it's properly exporting the SMTP configuration.

3. **Test Edge Function**:
   - Deploy updated Edge Function.
   - Test with direct invocation to verify it's using the new configuration.

### Phase 3: Simplify Auth Email Flow

1. **Update Password Reset Flow**:

   - Simplify `sendPasswordResetEmail()` in `notificationService.ts` to primarily use Supabase Auth.
   - Implement a single, reliable fallback mechanism using the Edge Function.
   - Updated approach:

   ```typescript
   export async function sendPasswordResetEmail(email: string): Promise<boolean> {
     try {
       // Primary method: Use Supabase Auth
       const { error } = await supabase.auth.resetPasswordForEmail(email, {
         redirectTo: `${process.env.EXPO_PUBLIC_WEBSITE_URL}/(auth)/change-password`,
       });

       if (!error) {
         return true;
       }

       // Fallback method: Use Edge Function
       return await sendPasswordResetEmailViaEdgeFunction(email);
     } catch (error) {
       console.error("[Auth] Error in sendPasswordResetEmail:", error);
       return false;
     }
   }
   ```

2. **Create a Unified Email Service**:
   - Develop a cleaner email service API for future email flows.
   - Prepare the foundation for additional email types that will be implemented post-refactor.

### Phase 4: Application Updates

1. **Update Authentication Files**:

   - Modify `app/(auth)/forgot-password.tsx` to use the simplified email service.
   - Update error handling for better user feedback on email issues.

2. **Update Notification System**:

   - Refactor `notificationService.ts` to use the new email service.
   - Update any components that use email functionality.

3. **Enhance Test Email Function**:

   - Revise `testEmailFunction()` to use the new SMTP configuration:

   ```typescript
   export async function testEmailFunction(to: string): Promise<boolean> {
     try {
       console.log("Testing email function with recipient:", to);

       // Use the Edge Function with the updated SMTP configuration
       const { data, error } = await supabase.functions.invoke("send-email", {
         body: {
           to,
           subject: "Test Email with Logo",
           content: `
             <div style="text-align: center; padding: 20px;">
               <h1 style="color: #003366;">Email System Test</h1>
               <p style="font-size: 16px; line-height: 1.5;">
                 This is a test email to verify that our email system is working correctly.
               </p>
               <p style="font-style: italic; color: #666; margin-top: 20px;">
                 This is an automated test message. No action is required.
               </p>
             </div>
           `,
         },
       });

       if (error) {
         console.error("Error sending test email:", error);
         return false;
       }

       return data?.success || false;
     } catch (error) {
       console.error("Unexpected error in testEmailFunction:", error);
       return false;
     }
   }
   ```

4. **Update Profile Page**:

   - Modify the email-related buttons in `app/(profile)/[profileID].tsx` to use the updated email service.
   - Update the alert/error handling to work consistently across all platforms (web, Android, iOS).
   - Use `ThemedToast` for error notifications in a cross-platform friendly way:

   ```typescript
   // Example of updating button handlers in ProfileScreen
   const handleSendTestEmail = async () => {
     try {
       const success = await testEmailFunction(user.email);

       if (success) {
         Toast.show({
           type: "success",
           text1: "Email Sent",
           text2: "Test email was sent successfully.",
         });
       } else {
         Toast.show({
           type: "error",
           text1: "Email Error",
           text2: "Failed to send test email. Please try again later.",
         });
       }
     } catch (error) {
       console.error("Error sending test email:", error);
       Toast.show({
         type: "error",
         text1: "Email Error",
         text2: "An unexpected error occurred. Please try again.",
       });
     }
   };
   ```

### Phase 5: Testing & Rollout

1. **Comprehensive Testing**:

   - Test all email flows on multiple devices and platforms (web, Android, iOS).
   - Verify email delivery and appearance across different email clients.
   - Test the fallback mechanism by temporarily disabling the primary method.
   - Verify that the test email function can send to any valid email address.
   - Ensure alert/error handling works consistently across all platforms.

2. **Monitoring Setup**:

   - Implement logging to track email delivery success rates.
   - Set up alerts for email delivery failures.

3. **Phased Rollout**:
   - Roll out changes to a test environment first.
   - Monitor for issues before full production deployment.

## Implementation Details

### Files to Modify

1. **Edge Functions**:

   - `supabase/functions/send-email/index.ts`: Update to use env variables.
   - `supabase/functions/config.ts`: Ensure proper export of SMTP config.

2. **Notification Service**:

   - `utils/notificationService.ts`: Simplify email functions, focus on using Supabase Auth with a single fallback.
   - Update `testEmailFunction()` to work with any valid email address.

3. **Auth Components**:

   - `app/(auth)/forgot-password.tsx`: Update to use simplified email service.
   - `app/(auth)/change-password.tsx`: Review for any email-related code.

4. **Profile Components**:
   - `app/(profile)/[profileID].tsx`: Update email-related buttons and error handling.
   - Implement cross-platform compatible alerts using ThemedToast.

### Supabase Configuration

1. **Auth Email Settings**:

   - Enable Email auth provider in Supabase dashboard.
   - Configure SMTP settings with Resend credentials:
     - SMTP Host: smtp.resend.com
     - SMTP Port: 465
     - SMTP Username: resend
     - SMTP Password: Your Resend API key
     - From Email: Email from your verified domain
   - Use the templates available in the Supabase dashboard.

2. **Edge Function Environment**:
   - Set Resend SMTP environment variables:
     - SMTP_HOST: smtp.resend.com
     - SMTP_PORT: 465
     - SMTP_USERNAME: resend
     - SMTP_PASSWORD: Your Resend API key
     - SMTP_FROM_EMAIL: Email from your verified domain

## Migration Risks & Mitigations

1. **Email Delivery Interruption**:

   - Risk: Users may not receive critical emails during transition.
   - Mitigation: Implement and test the fallback mechanism before deployment.

2. **Template Issues**:

   - Risk: Email templates may not render correctly.
   - Mitigation: Test all templates across multiple email clients before rollout.

3. **API Key Security**:

   - Risk: Exposing Resend API keys.
   - Mitigation: Use environment variables and ensure keys are never committed to code.

4. **Cross-Platform Compatibility**:
   - Risk: Alert/error handling may not work consistently across platforms.
   - Mitigation: Use ThemedToast for notifications and test on all target platforms.

## Success Criteria

1. All authentication emails (password reset, etc.) are delivered reliably.
2. Custom notification emails are delivered with consistent branding.
3. Email delivery success rate is above 99%.
4. No hardcoded credentials remain in the codebase.
5. Simplified, maintainable email service architecture with one primary method and one fallback.
6. Test email function works with any valid email address.
7. Alert/error handling works consistently across all platforms (web, Android, iOS).
8. Foundation set for future email flows to be implemented post-refactor.

## Future Email Flows (Post-Refactor)

After successfully implementing this refactor, the application will be well-positioned to add new email flows such as:

1. Welcome emails for new users
2. Notification emails for important events
3. Digest emails for activity summaries
4. Administrative alerts and reports
5. Direct message notifications

These flows will leverage the unified email service created during this refactor, using the same reliable delivery mechanism and consistent branding.
