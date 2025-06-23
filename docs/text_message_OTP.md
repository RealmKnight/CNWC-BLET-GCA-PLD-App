# SMS Text Message OTP Verification Plan

## Implementation Phases & Checklist

This section breaks down the plan into logical, detailed implementation phases. Each phase contains checkboxes for tracking progress, code sample stubs, and resolved requirements. Use this as a project checklist.

---

## **Phase 1: Database & Schema Preparation** ✅ **COMPLETED**

- [x] **Design and create `phone_verifications` table**
  - [x] Fields: `id`, `user_id`, `phone` (E.164 format), `otp_hash`, `expires_at`, `attempts`, `verified`, `session_id`, `created_at`, `updated_at`
  - [x] Add indexes for efficient lookup by `user_id`, `phone`, `session_id`, `expires_at`, and `verified`
  - [x] Migration tested and deployed
  - [x] Added RLS policies for security
  - [x] Added trigger for automatic `updated_at` timestamp updates
- [x] **Update `user_preferences` schema**
  - [x] Add `phone_verified` (boolean, defaults to `false`)
  - [x] Add `sms_opt_out` (boolean, defaults to `false`) for compliance/audit
  - [x] Add `sms_lockout_until` (timestamp, nullable) for abuse prevention
  - [x] Add `phone_verification_status` (enum: 'not_started', 'pending', 'verified', 'locked_out')

**Requirements:**

- Phone numbers must be sanitized and stored in E.164 format (e.g., `+15551234567`).
- Only US phone numbers are supported for the initial release.
- The `phone_verifications` table will retain a log of verification events for auditing; records should be marked as `verified: true` upon success, not deleted immediately.

---

## **Phase 2: Backend Edge Functions** ✅ **COMPLETED**

- [x] **Create `send-otp` Supabase Edge Function**
  - [x] Accepts `{ phone, user_id }`
  - [x] Generates secure OTP (6-digit), hashes it with SHA-256, and stores it with a 120-second (2 min) expiry
  - [x] Resets `attempts` to 0 for a new verification session
  - [x] Calls `@/send-sms` to send OTP SMS
  - [x] Logs all events for compliance
  - [x] Rate limiting: Max 3 OTP requests per phone number per 5-minute window (phone-based only, no IP limiting)
  - [x] Checks for existing lockouts and verified phone conflicts
  - [x] Updates user preferences to 'pending' status
  - [ ] Unit/integration tests (to be done by user)
- [x] **Create `verify-otp` Supabase Edge Function**
  - [x] Accepts `{ phone, user_id, code }`
  - [x] Verifies OTP, expiry (120s), and attempts (max 3 per session)
  - [x] On success: marks phone as `verified: true` in `phone_verifications` and sets `user_preferences.phone_verified = true`
  - [x] On failure: increments `attempts`. After 6 total failed attempts across sessions, sets `sms_lockout_until` to block user from the feature
  - [x] Logs all events for compliance
  - [x] Provides detailed error messages with attempt counts
  - [x] Implements 24-hour lockout duration
  - [ ] Unit/integration tests (to be done by user)
- [x] **Create `process-sms-webhook` Edge Function for Twilio STOP/START**
  - [x] Accepts Twilio webhook POSTs (form data format)
  - [x] Handles "STOP": sets `user_preferences.contact_preference` to `in_app` and `sms_opt_out = true`
  - [x] Handles "START": sets `sms_opt_out = false`, allowing the user to trigger a new verification flow within the app
  - [x] Handles "HELP" and other common SMS commands
  - [x] Logs all webhook events
  - [x] Returns 200 OK to prevent Twilio retries on errors
  - [ ] Unit/integration tests (to be done by user)
- [x] **Update `@/send-sms` Edge Function**
  - [x] Before sending any **non-OTP** message, check if the recipient's phone number is verified
  - [x] Reject requests to send non-OTP messages to unverified numbers
  - [x] Add special handling for OTP messages (bypass verification check with `isOTP` flag)
  - [x] Check for user opt-out status
  - [x] Standardized phone number formatting to E.164

**Requirements:**

- OTPs expire in **120 seconds**.
- A user can attempt to enter a code **3 times** per OTP session.
- After **2 consecutive failed sessions (6 total attempts)**, the user is locked out from SMS features until an admin intervenes.
- All webhook events must be logged for compliance and retained for **7 years**.

---

## **Phase 3: Client UI/UX Implementation** ✅ **COMPLETED**

### **Existing Components to Update:**

- [x] **Update `components/ui/SmsOptInModal.tsx`**

  - [x] Modal already exists and is comprehensive
  - [x] Add phone validation against existing verified numbers
  - [x] Add error handling for duplicate phone numbers
  - [x] Add loading states for OTP sending
  - [ ] Unit/snapshot tests

- [x] **Create `components/ui/OtpVerificationModal.tsx`**

  - [x] Input for 6-digit code, resend button (enabled only after expiry), error/loading states
  - [x] Show error messages for expired, failed, or too many attempts
  - [x] Accessible, mobile-friendly
  - [ ] Unit/snapshot tests

- [x] **Update `app/(profile)/[profileID].tsx`**
  - [x] Integrate OTP verification flow after SMS opt-in
  - [x] Update `handlePhoneUpdateSuccess()` to use Toast instead of Alert
  - [x] Add phone verification status display with banner/warning for unverified numbers
  - [x] Handle phone number change while "text" is selected by forcing re-verification
  - [x] Block SMS notifications until verification is complete
  - [x] If user is locked out (`sms_lockout_until` is set), disable the "Text Message" option and show informative message
  - [x] Update existing phone sanitization to match E.164 format used in send-sms
  - [x] Replace all Alert.alert() calls with ThemedToast for web compatibility
  - [ ] Unit/integration tests

### **New Components to Create:**

- [x] **Create `components/ui/PhoneVerificationBanner.tsx`**

  - [x] Display warning under phone number if unverified
  - [x] Show lockout status if user is locked out
  - [x] Provide action to trigger verification flow

- [x] **Create `components/ui/VerificationRevertWarningModal.tsx`**

  - [x] Modal for handling verification failures
  - [x] Options to keep trying or revert to previous contact preference
  - [x] Clear messaging about verification requirements

- [x] **Create `utils/phoneValidation.ts`**
  - [x] Centralized phone number validation and formatting utilities
  - [x] E.164 format conversion
  - [x] US phone number validation
  - [x] Phone sanitization functions

### **Toast Integration:**

- [x] **Update phone number update success feedback**
  - [x] Replace `Alert.alert("Success", "Phone number updated successfully!")` with `showSuccessToast()`
  - [x] Replace all Alert.alert() calls throughout profile page with ThemedToast
  - [x] Match pattern used in `handleDateOfBirthUpdateSuccess()`
  - [x] Import and use `showSuccessToast` and `showErrorToast` from `@/utils/toastHelpers`

**Code Sample Stub:**

```tsx
// OtpVerificationModal.tsx
// PhoneVerificationBanner.tsx
// VerificationRevertWarningModal.tsx
// utils/phoneValidation.ts
// components/admin/ui/UnlockSmsUserModal.tsx
```

**Requirements:**

- User can resend OTP only after the current one expires (120s), up to two times (for a total of 3 attempts per session)
- **Error Messages**: Display clear, specific error messages for:
  - Incorrect code entered
  - Expired OTP code
  - Too many attempts (session lock)
  - Resend requested too soon
  - Phone number already in use/verified by another user
  - User is in a locked-out state
- **Error Message Copy**:
  - **Invalid Code**: "Invalid OTP. Please double-check the code and try again."
  - **Expired Code**: "Your OTP has expired. Please request a new one."
  - **Account Lockout**: "You have entered an incorrect OTP too many times. Your account has been temporarily locked. Please try again later or contact your division admin for assistance."
  - **Send Failure**: "Failed to send OTP. Please check your phone number and try again."
  - **Invalid Phone Number**: "The phone number provided is invalid. Please enter a valid US phone number."
  - **Rate Limit**: "You have requested an OTP too many times. Please try again in a few minutes."
- Show a banner/warning under the user's phone number if unverified
- If verification is abandoned or fails, show a warning dialog with "OK" button and revert the contact preference to its previous state, or `in_app` as a fallback
- Cache verification state locally for a responsive offline UX
- Users do not need to verify unless they wish to use Text messaging for notifications

---

## **Phase 4: Integration & State Management**

### **Update Existing Files:**

- [x] **Update `types/auth.ts`**

  - [x] Add phone verification status types (integrated via UserPreferences interface)
  - [x] Update ContactPreference type if needed
  - [x] Add OTP verification interfaces

- [x] **Update `utils/toastHelpers.ts`**

  - [x] Add specific toast helpers for OTP verification flows (using existing showErrorToast/showSuccessToast)
  - [x] Add error toast helpers for phone verification failures

- [x] **Update `store/userStore.ts`**
  - [x] Add phone verification state management
  - [x] Add PhoneVerificationStatus type and PhoneVerificationState interface
  - [x] Add methods: updatePhoneVerification, setPhoneNumber, setVerificationStatus, setSmsOptOut, setSmsLockout
  - [x] Integrate verification state into reset() method
  - [x] Cache verification status locally for offline UX

### **Connect Client to Backend:**

- [x] **Connect client to backend Edge Functions**
  - [x] Call `/send-otp` and `/verify-otp` from client
  - [x] Handle all error/success states
  - [x] Update Zustand/global state on verification (userStore integrated with profile component)
  - [x] **Profile Component Integration Completed:**
    - [x] Imported userStore and replaced local phone verification state with global state
    - [x] Updated `handleSendOtp` to sync verification status with userStore (`setVerificationStatus("pending")`)
    - [x] Updated `handleVerifyOtp` to sync verified status with userStore (`setVerificationStatus("verified")`, `updatePhoneVerification({ isPhoneVerified: true })`)
    - [x] Updated `fetchProfileData` to initialize userStore from database preferences on profile load
    - [x] Updated `PhoneVerificationBanner` to use userStore data instead of userPreferences for real-time updates
    - [x] Removed local `phoneNumber` and `otpPhoneNumber` state, now using userStore for phone number management
    - [x] Updated all phone number handlers to use `setGlobalPhoneNumber` from userStore
    - [x] Added improved error handling for Edge Function responses
    - [x] Updated phone validation to handle E.164 format inputs from SmsOptInModal
  - [x] **Deploy Edge Functions to Supabase** (to be done by user via CLI)
    - [x] Deploy `send-otp` function
    - [x] Deploy `verify-otp` function
    - [x] Deploy `process-sms-webhook` function
  - [ ] Cache verification state locally for offline UX
- [x] **Update `user_preferences` on verification/opt-out**
  - [x] Ensure state is consistent across app
  - [x] Block SMS notifications to unverified/opted-out numbers (implemented in profile component)
- [x] **Test full user flows**
  - [x] New opt-in and verification
  - [x] Phone number update and re-verification
  - [x] Opt-out via STOP and re-enable via START (triggering a new verification flow in-app)
  - [ ] User lockout after 6 failed attempts

**Requirements:**

- Users do not need to verify unless they wish to use Text messaging for notifications
- Cache verification state locally for offline UX

---

## **Phase 5: Security, Compliance, and Monitoring** ✅ **COMPLETED**

- [x] **Implement Twilio webhook security**
  - [x] Validate Twilio signature in `process-sms-webhook` function
  - [x] Added secure signature validation using HMAC-SHA1
  - [x] Environment variable for Twilio auth token
- [x] **Audit logging**
  - [x] Created `sms_webhook_audit_log` table with 7-year retention design
  - [x] Log all opt-in, opt-out, and verification events with full metadata
  - [x] Added RLS policies for admin-only access
  - [x] Enhanced all webhook handlers with comprehensive logging
- [x] **Admin notification integration**
  - [x] Created admin message notifications for OTP lockouts in `verify-otp` function
  - [x] Send lockout notifications to division admin of the affected user's division
  - [x] Created `SmsLockoutManager` component for admin interface
  - [x] Allow all admin levels to unlock users from SMS lockout
  - [x] Added audit logging for admin unlock actions
  - [x] Integrated with existing admin messaging system
- [x] **Monitoring and alerting**
  - [x] Implemented notification mechanism for suspected abuse (6 failed attempts)
  - [x] Admin notifications sent via existing admin message system
  - [x] Comprehensive error logging in all Edge Functions

**Abuse Definition**: Suspected abuse is defined as 6 consecutively entered incorrect OTP codes, resulting in a user lockout. An admin notification should be triggered and sent to the division admin of the affected user's division.

---

## **Phase 6: Update Existing Profile Components**

### **Phone Number Sanitization:**

- [x] **Update phone sanitization in `PhoneUpdateModal`**
  - [x] Replace current phone formatting with E.164 format sanitization
  - [x] Use same sanitization pattern as send-sms edge function
  - [x] Ensure compatibility with existing SMS delivery system

### **User Feedback Improvements:**

- [x] **Update `handlePhoneUpdateSuccess` in profile page**
  - [x] Replace `Alert.alert("Success", "Phone number updated successfully!")`
  - [x] Use `showSuccessToast()` pattern from `handleDateOfBirthUpdateSuccess()`
  - [x] Follow same success feedback pattern as Date of Birth updates

### **Verification Status Display:**

- [x] **Add verification status indicators**
  - [x] Show verification badge/status next to phone number
  - [x] Display lockout warnings if user is locked out
  - [x] Provide clear actions for verification
  - [x] **Implementation Details:**
    - [x] Added clean verification icon next to phone number - simple green checkmark for verified phones
    - [x] Removed bulky banner UI for cleaner user experience
    - [x] Verification status visible immediately in Personal Information section with minimal visual impact
    - [x] **Improved Logic**: Verified checkmark shows for ANY verified phone regardless of contact preference
    - [x] **Clean Design**: Simple green checkmark icon (20px) positioned next to phone number
    - [x] **Universal Verification**: Users can see their verification status without UI clutter

### **Contact Preference Integration:**

- [x] **Update contact preference selection logic**
  - [x] Only require verification for newly selected "Text Message" preferences
  - [x] Show verification prompt when "Text Message" is selected with unverified phone
  - [x] Handle verification status changes in real-time
  - [x] Show revert warning dialog with "OK" button on verification failure
  - [ ] Notify existing "Text Message" users to re-setup their preferences (no forced migration)

### **Remaining Alert.alert() Cleanup:**

- [ ] **Update remaining Alert.alert() calls in notification-settings.tsx**
  - [ ] Replace Alert.alert() calls with ThemedToast for web compatibility
  - [ ] Follow same pattern as other profile components

---

## **Phase 7: Migration & User Communication**

- [ ] **User notification for existing "Text Message" users**

  - [ ] Create in-app notification about new verification requirement
  - [ ] Add banner on profile page for users with unverified "Text Message" preference
  - [ ] Provide clear steps to re-setup Text Message notifications
  - [ ] Set transition period (suggest 30 days) before blocking SMS to unverified numbers

- [ ] **Admin tools for SMS lockout management**
  - [ ] Create admin interface to view SMS-locked users
  - [ ] Allow all admin levels to unlock SMS-locked users
  - [ ] Provide audit trail for unlock actions

---

## **Phase 8: Documentation & Final Testing**

- [ ] **Update technical documentation**
  - [ ] Document all new endpoints, flows, and UI
  - [ ] Update API documentation for edge functions
  - [ ] Document admin unlock procedures
- [ ] **Write user-facing help/guides**
  - [ ] How to opt-in/out, verify, and update phone
  - [ ] Troubleshooting guide for verification issues
  - [ ] Migration guide for existing Text Message users
- [ ] **Final end-to-end testing**
  - [ ] Test on all supported platforms/devices
  - [ ] Test edge cases (rate limits, failures, etc.)
  - [ ] Test integration with existing notification system
  - [ ] Test admin unlock functionality
- [ ] **Update existing components integration**
  - [ ] Test with `components/ui/SmsOptInModal.tsx`
  - [ ] Test with `components/ui/NotificationConfirmationModal` pattern
  - [ ] Verify `components/ThemedToast.tsx` integration
  - [ ] Test verification revert warning dialog

---

## **Files Requiring Updates:**

### **Existing Files to Modify:**

1. `app/(profile)/[profileID].tsx` - Main profile page with phone update and contact preferences
2. `components/ui/SmsOptInModal.tsx` - Existing SMS opt-in modal (enhance)
3. `supabase/functions/send-sms/index.ts` - Existing SMS sending function
4. `utils/toastHelpers.ts` - Add OTP-specific toast helpers
5. `types/auth.ts` - Add phone verification types
6. `components/ThemedToast.tsx` - Ensure compatibility with new flows

### **New Files to Create:**

1. `components/ui/OtpVerificationModal.tsx` - New OTP input modal ✅
2. `components/ui/PhoneVerificationBanner.tsx` - Verification status banner ✅
3. `components/ui/VerificationRevertWarningModal.tsx` - Warning dialog for verification failures ✅
4. `utils/phoneValidation.ts` - Centralized phone utilities ✅
5. `supabase/functions/send-otp/index.ts` - New OTP sending function ✅
6. `supabase/functions/verify-otp/index.ts` - New OTP verification function ✅
7. `supabase/functions/process-sms-webhook/index.ts` - New webhook handler ✅
8. `components/admin/SmsLockoutManager.tsx` - Admin interface to unlock SMS-locked users ✅

### **Database Migrations:**

1. Create `phone_verifications` table ✅
2. Update `user_preferences` table with new fields ✅
3. Create `sms_webhook_audit_log` table for compliance ✅

---

## **Implementation Decisions & Clarifications**

**✅ RESOLVED:**

- **Verification Scope**: Only verify newly selected/opted "Text Message" notification preferences. Existing users with "Text Message" already selected will be notified to re-setup their notification preferences.
- **Admin Lockout Management**: All admin levels can "unblock" a user from SMS lockout. Lockout notifications should be sent to the division admin of the affected user's division.
- **Rate Limiting**: Phone number-based rate limiting only (not IP-based) for initial implementation.
- **Migration Strategy**: No automatic migration of existing phone numbers. Users will be prompted to re-setup Text Message notifications.
- **Error Handling**: Show a warning dialog with an "OK" button to inform users that their settings will be reverted on verification failure.

**📋 REMAINING OPEN QUESTIONS:**

- [ ] What is the exact logic for determining "suspected abuse" for admin notifications? Currently defined as 6 consecutive incorrect OTP attempts.

---

## Overview

This document outlines the technical plan for implementing a secure SMS OTP (One-Time Password) verification flow for the "Text Message" contact preference on the `@[profileID].tsx` page. The flow includes an initial opt-in modal for user consent, followed by an OTP modal for phone verification. The plan also addresses integration with the existing `@/send-sms` Supabase Edge Function for sending SMS notifications.

---

## 1. User Flow

1. **User selects "Text Message" as contact preference.**
2. **Opt-In Modal**: User is shown a modal explaining SMS notifications and must consent to receive messages.
3. **Phone Number Validation**: Ensure the phone number is present, valid, and not already verified for another user.
4. **OTP Modal**: If the phone is not verified, show a modal to enter a 6-digit OTP code.
5. **OTP Generation & Sending**: On backend, generate a secure OTP, store it (hashed) with expiry, and send it via the `@/send-sms` Edge Function.
6. **OTP Verification**: User enters the code; backend verifies it. On success, mark phone as verified and update contact preference to "text".
7. **Post-Verification**: User can now receive notification SMS via the same `@/send-sms` function.

**Phone Number Change While on Text Message Preference:**

- If the user updates their phone number while their contact preference is already set to "Text Message":
  - Treat this as a new verification flow for the new number.
  - Show the Opt-In Modal for the new number.
  - Trigger the OTP Modal and require verification before sending any further SMS notifications.
  - Do not send SMS notifications to the new number until it is verified.
  - If verification fails or is incomplete, do not update the contact preference to "text" for the new number, and do not send notifications to the unverified number. Optionally, revert to a safe state (e.g., set contact preference to "in_app" or prompt the user to verify).

---

## 2. Key Considerations

### Security & Validation

- OTPs must be securely generated (cryptographically random), stored (hashed), and expire (e.g., 5 minutes).
- Limit OTP requests per user/phone to prevent abuse.
- Phone number must be unique per user and sanitized before use.
- All OTP logic (generation, storage, verification, SMS sending) must be on a secure backend (Supabase Edge Function).
- **Phone Number Change:** Changing the phone number while "Text Message" is selected must always require re-verification of the new number. The app should not send SMS notifications to the new number until it is verified. The verification status must be reset on phone number change.

### UX/UI

- **Opt-In Modal**: Clearly explain SMS terms, rates, and privacy. User must explicitly consent.
- **OTP Modal**: Input for 6-digit code, resend button (with cooldown), error/loading states, accessible design.
- **Feedback**: Show clear messages for success, error, and cooldown.

### Backend Integration

- **Supabase Edge Functions**:
  - `send-otp`: Generates OTP, stores it, sends SMS via `@/send-sms`.
  - `verify-otp`: Verifies OTP, marks phone as verified.
- **@/send-sms**: Used for both OTP and notification messages. After verification, it continues to work for notifications as before.

### Edge Cases

- If phone is already verified, skip OTP modal.
- Handle multiple failed attempts and lockout if needed.
- If supporting non-US numbers, adapt validation and formatting.
- If the user cancels or fails verification after a phone number change, revert to a safe state (e.g., set contact preference to "in_app" or prompt the user to verify).

---

## 3. Implementation Steps

### A. UI/UX

- Add/Update `SmsOptInModal` to require explicit user consent before OTP flow.
- Add `OtpVerificationModal` for entering and verifying the OTP code.
- Trigger OTP modal only after opt-in and phone validation.
- When the phone number is updated and the current contact preference is "text":
  - Trigger the opt-in and OTP modals for the new number.
  - Only mark the phone as verified and continue sending SMS after successful OTP verification.
  - If verification fails, do not send SMS notifications to the new number.

### B. Client Logic

- On "Text Message" selection:
  1. Show opt-in modal.
  2. On consent, validate phone and call `/send-otp` Edge Function.
  3. Show OTP modal if phone not verified.
  4. On OTP entry, call `/verify-otp` Edge Function.
  5. On success, update `user_preferences` to "text".
- On phone number update (if contact preference is "text"):
  1. Reset phone verification status.
  2. Show opt-in modal for the new number.
  3. On consent, trigger OTP modal and require verification before sending SMS notifications.

### C. Supabase Edge Functions

- **send-otp**:
  - Input: `{ phone: string, user_id: string }`
  - Action: Generate OTP, store in `phone_verifications` table, call `@/send-sms` to send SMS.
- **verify-otp**:
  - Input: `{ phone: string, user_id: string, code: string }`
  - Action: Check code and expiry, mark phone as verified, clean up OTP.
- On phone number update, ensure that the verification status is reset for that user and phone.

### D. Database Table Example

- **phone_verifications**
  - `id` (PK)
  - `user_id`
  - `phone`
  - `otp_hash`
  - `expires_at`
  - `attempts`
  - `verified` (boolean)

---

## 4. Integration with @/send-sms

- The `@/send-sms` Edge Function is used for both OTP and notification messages.
- After phone verification, the same function continues to work for sending notification SMS to verified users.
- No changes are needed to `@/send-sms` for post-verification notification delivery.

---

## 5. Security Checklist

- Never expose Twilio credentials to the client.
- Use HTTPS for all API calls.
- Store only hashed OTPs if possible.
- Log errors, not OTPs or sensitive data.
- Implement rate limiting and lockout after repeated failures.
- Reset verification status on phone number change.

---

## 6. Testing

- Unit test modals and OTP logic.
- Integration test full flow (opt-in, request, input, verify, update, phone number change).
- Test on both mobile and web (web: show error if SMS not supported).

---

## 7. Example Sequence

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Supabase Edge Function
    participant @/send-sms

    User->>App: Selects "Text Message"
    App->>User: Show Opt-In Modal
    User->>App: Consents
    App->>App: Validate phone number
    App->>Supabase Edge Function: POST /send-otp (phone, user_id)
    Supabase Edge Function->>@/send-sms: Send SMS with OTP
    @/send-sms-->>Supabase Edge Function: Success/Error
    Supabase Edge Function-->>App: Success/Error
    App->>User: Show OTP Modal
    User->>App: Enter OTP
    App->>Supabase Edge Function: POST /verify-otp (phone, user_id, code)
    Supabase Edge Function-->>App: Verified/Failed
    App->>Supabase: Update user_preferences (if verified)
    App->>User: Show success/error

    %% Phone number update while on text preference
    User->>App: Updates phone number (while on Text Message)
    App->>User: Show Opt-In Modal for new number
    User->>App: Consents
    App->>Supabase Edge Function: POST /send-otp (new phone, user_id)
    Supabase Edge Function->>@/send-sms: Send SMS with OTP
    @/send-sms-->>Supabase Edge Function: Success/Error
    Supabase Edge Function-->>App: Success/Error
    App->>User: Show OTP Modal for new number
    User->>App: Enter OTP
    App->>Supabase Edge Function: POST /verify-otp (new phone, user_id, code)
    Supabase Edge Function-->>App: Verified/Failed
    App->>Supabase: Update user_preferences (if verified)
    App->>User: Show success/error
```

---

## 8. Summary Table

| Step                              | Client (React Native) | Supabase Edge Function | @/send-sms | Supabase DB             |
| --------------------------------- | --------------------- | ---------------------- | ---------- | ----------------------- |
| Opt-in modal                      | ✅                    |                        |            |                         |
| Validate phone                    | ✅                    |                        |            |                         |
| Send OTP                          | POST /send-otp        | ✅                     | ✅         | ✅ (store OTP)          |
| Show OTP modal                    | ✅                    |                        |            |                         |
| Verify OTP                        | POST /verify-otp      | ✅                     |            | ✅ (check OTP)          |
| Update preference                 | ✅                    |                        |            | ✅                      |
| Send notification                 |                       |                        | ✅         |                         |
| Update phone (if "text")          | ✅                    |                        |            | ✅ (reset verification) |
| Trigger opt-in/OTP for new number | ✅                    | ✅                     | ✅         | ✅                      |

## 9. SMS Opt-Out Webhook Handling

### Overview

When a user replies "STOP" to a text message, Twilio automatically opts them out of further SMS from your Twilio number. However, your app must also update its own records to reflect this opt-out in the user's preferences.

### Flow

1. **Twilio receives "STOP" from user.**
2. **Twilio sends a webhook** (HTTP POST) to your Supabase Edge Function endpoint with the sender's phone number and message body.
3. **Edge Function checks** if the message is "STOP" (case-insensitive, trims whitespace).
4. **Edge Function looks up the user** in your database by phone number.
5. **Edge Function updates `user_preferences`** for that user:
   - Set `contact_preference` to `"in_app"` (or another safe default).
   - Optionally, mark the phone as unverified or add an "opted_out" flag.
6. **(Optional)**: Log the event for audit/compliance purposes.

### Security Considerations

- Only accept requests from Twilio (validate Twilio signature or restrict by IP).
- Do not expose sensitive data in responses.
- Log all opt-out events for compliance.

### Handling "START"/"UNSTOP"

- If a user sends "START" or "UNSTOP", Twilio will re-enable SMS delivery.
- Optionally, handle these to allow the user to re-enable text notifications in your app (with a new verification flow).

### Example: Webhook Edge Function Pseudocode

```ts
// POST /process-sms-webhook
// Receives: { From: "+15555551234", Body: "STOP" }
if (req.method !== "POST") return 405;
const { From, Body } = await req.json();

if (typeof From !== "string" || typeof Body !== "string") return 400;

// Normalize and check for STOP
if (Body.trim().toUpperCase() === "STOP") {
  // Find user by phone number (strip +1 if needed)
  const user = await db.users.findOne({ phone: From });
  if (user) {
    // Update user_preferences
    await db.user_preferences.update({ user_id: user.id }, { contact_preference: "in_app" });
    // Optionally: mark phone as unverified or add opt-out flag
  }
  // Respond with 200 OK
  return 200;
}

// Optionally handle START/UNSTOP, etc.
```

---

```

```
