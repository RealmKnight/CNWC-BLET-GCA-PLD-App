# Text Message Notification Integration Plan

## Overview

This plan outlines the comprehensive integration of text message (SMS) notifications into the existing hybrid notification system. The system already has foundational SMS capabilities but needs full integration with the user preference system and notification service.

## Current State Analysis

### Existing Infrastructure

- ✅ **SMS Edge Function**: `send-sms` function with Twilio integration
- ✅ **Phone Verification System**: `phone_verifications` table and OTP verification
- ✅ **User Preferences**: Support for `text` contact preference
- ✅ **SMS Opt-out/Lockout**: `sms_opt_out` and `sms_lockout_until` fields
- ✅ **Basic SMS Logic**: Some SMS handling in `sendMessageWithNotification`

### Gaps to Address

- ❌ **Incomplete Integration**: Text message delivery not fully integrated with hybrid notification system
- ❌ **Missing Tracking**: No SMS delivery tracking in `push_notification_deliveries` table
- ❌ **Limited Category Support**: Category-specific SMS preferences not fully implemented
- ❌ **No SMS Queue**: No reliable retry mechanism for SMS (only push notifications have queue)
- ❌ **Inconsistent Validation**: SMS verification checks scattered across functions

## Requirements Clarification

Based on user feedback, the following requirements have been established:

1. **SMS Delivery Method**: ✅ **Direct sending** - Send SMS immediately and log the delivery (no queue system needed)

2. **SMS Length Limits**: ✅ **Truncate with "..." suffix** - Full message will remain available in the app's notification section (same as push notifications)

3. **SMS Rate Limiting**: ✅ **Time-based rate limiting** - If SMS was sent within the last 5-10 minutes, don't send another. Wait at least 20 minutes since last SMS before sending new one.

4. **SMS Delivery Tracking**: ✅ **Send/fail tracking sufficient** - No delivery receipt webhooks needed (users often have phones off during work due to federal regulations)

5. **Emergency Override**: ✅ **Admin-only feature** - Implement in division admin area as new tab for emergency notifications that bypass user preferences

6. **Cost Management**: ✅ **Full cost tracking/budgeting** - Implement comprehensive cost monitoring and budget controls

## Finalized Requirements

Based on user feedback, the following detailed requirements are confirmed:

1. **Rate Limiting by Priority**: ✅ **Priority-based rate limits**

   - Regular notifications: 20-minute minimum between SMS
   - High-priority notifications: 10-minute minimum between SMS
   - Emergency override: No rate limiting

2. **Cost Management Scope**: ✅ **Organization-wide spending limits and cost alerts**

   - Organization-wide SMS spending limits
   - Cost alerts for admins when thresholds are reached
   - Individual user limits for abuse prevention

3. **Emergency Override Criteria**: ✅ **MUST_READ messages as admin overrides**

   - MUST_READ messages will function as admin overrides
   - Custom admin selection available per message
   - Emergency SMS interface for admins

4. **Rate Limiting Implementation**: ✅ **Per category rate limiting**
   - Different categories can have different rate limits
   - Prevents spam from specific notification types
   - More granular control over message frequency

## Final Implementation Requirements

All clarification questions have been answered. Final implementation requirements confirmed:

1. **Organization Budget Setup**: ✅ **Defaults with admin override**

   - Set up automatically with default values during migration
   - Only Union Admin or Application Admin can modify budget settings
   - Admin interface for budget configuration and monitoring

2. **Cost Tracking Granularity**: ✅ **Comprehensive multi-level tracking**

   - Per SMS sent (individual message costs)
   - Per division/department (departmental spending)
   - Per user role (admin, member, etc. spending patterns)
   - Organization-wide totals and trends

3. **MUST_READ Emergency Override**: ✅ **Verified phone + respect preferences**

   - ONLY send to members who have VERIFIED their phone number
   - Respect user's contact preferences unless they have "in-app" preference AND verified phone
   - No automatic SMS to unverified users regardless of emergency status

4. **Failed SMS Fallback**: ✅ **Always create in-app notification**
   - ALWAYS create in-app notification as fallback regardless of contact preference
   - Enables users to access full message content at their leisure
   - No email fallback needed - in-app notification is sufficient universal fallback

## Enhanced Database Schema for Final Requirements

```sql
-- Additional cost tracking tables for comprehensive reporting
CREATE TABLE sms_cost_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_name TEXT,
  user_role TEXT,
  cost_amount DECIMAL(10,4),
  message_count INTEGER DEFAULT 1,
  date_sent DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for analytics performance
CREATE INDEX idx_sms_cost_analytics_division ON sms_cost_analytics(division_name);
CREATE INDEX idx_sms_cost_analytics_role ON sms_cost_analytics(user_role);
CREATE INDEX idx_sms_cost_analytics_date ON sms_cost_analytics(date_sent);

-- Enhanced organization budget with admin permissions
ALTER TABLE organization_sms_budget
ADD COLUMN created_by UUID REFERENCES auth.users(id),
ADD COLUMN last_modified_by UUID REFERENCES auth.users(id),
ADD COLUMN admin_notes TEXT;

-- Admin permission check function
CREATE OR REPLACE FUNCTION check_sms_budget_admin_permission(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM members
  WHERE id = user_id;

  RETURN user_role IN ('admin', 'union_admin', 'application_admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Enhanced Emergency Override Logic

```typescript
/**
 * Enhanced emergency override with verified phone and preference checks
 */
async function shouldSendEmergencySMS(
  userId: string,
  categoryCode: string,
  priority: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Check if this is an emergency/MUST_READ category
    const { data: category } = await supabase
      .from("notification_categories")
      .select("allow_emergency_override")
      .eq("code", categoryCode)
      .single();

    if (!category?.allow_emergency_override || priority !== "emergency") {
      return { allowed: false, reason: "Not an emergency override category" };
    }

    // MUST have verified phone number
    const { data: userPrefs } = await supabase
      .from("user_preferences")
      .select("phone_verified, contact_preference")
      .eq("user_id", userId)
      .single();

    if (!userPrefs?.phone_verified) {
      return { allowed: false, reason: "Phone number not verified - will use in-app only" };
    }

    // Check user's delivery preference for this category
    const { data: categoryPref } = await supabase
      .from("user_notification_preferences")
      .select("delivery_method")
      .eq("user_id", userId)
      .eq("category_code", categoryCode)
      .single();

    const deliveryMethod = categoryPref?.delivery_method || "default";

    // Respect user preferences unless they have in-app preference with verified phone
    if (deliveryMethod === "in_app" && userPrefs.phone_verified) {
      return { allowed: true, reason: "In-app preference overridden due to verified phone and emergency" };
    }

    if (deliveryMethod === "sms" || (deliveryMethod === "default" && userPrefs.contact_preference === "text")) {
      return { allowed: true, reason: "User prefers SMS delivery" };
    }

    if (deliveryMethod === "none") {
      return { allowed: false, reason: "User has disabled notifications - will use in-app only" };
    }

    return { allowed: false, reason: "User preference does not include SMS - will use in-app only" };
  } catch (error) {
    console.error("[SMS] Error checking emergency override:", error);
    return { allowed: false, reason: "Error checking preferences - will use in-app only" };
  }
}

/**
 * Universal in-app notification fallback
 */
async function createInAppNotificationFallback(
  userId: string,
  notification: {
    title: string;
    body: string;
    categoryCode: string;
    messageId?: string;
    requiresAcknowledgment?: boolean;
    extraData?: Record<string, any>;
  },
  fallbackReason: string = "SMS delivery failed"
): Promise<boolean> {
  try {
    await supabase.from("notifications").upsert(
      {
        id: notification.messageId || crypto.randomUUID(),
        user_id: userId,
        title: notification.title,
        message: notification.body,
        notification_type: getNotificationCategoryFromType(notification.categoryCode),
        category_code: notification.categoryCode,
        is_read: false,
        requires_acknowledgment: notification.requiresAcknowledgment || false,
        importance: "medium",
        metadata: {
          fallbackFrom: "sms",
          fallbackReason,
          ...notification.extraData,
        },
        created_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    return true;
  } catch (error) {
    console.error("[SMS] Error creating in-app fallback:", error);
    return false;
  }
}
```

## Implementation Plan

### Phase 1: Database Schema Updates ✅ **COMPLETED**

**COMPLETED ITEMS:**

- ✅ Created `sms_deliveries` table for SMS delivery tracking
- ✅ Created `sms_rate_limits` table for rate limiting by category
- ✅ Created `organization_sms_budget` table for cost management
- ✅ Created `sms_cost_analytics` table for enhanced reporting
- ✅ Added performance indexes for all SMS tables
- ✅ Enhanced `user_preferences` with SMS limits and preferences
- ✅ Enhanced `notification_categories` with SMS rate limits and emergency override
- ✅ Updated `must_read` category to allow emergency override
- ✅ Created `check_sms_budget_admin_permission()` function
- ✅ Updated `on_notification_created()` trigger function to support SMS and email delivery
- ✅ Inserted default organization SMS budget

#### 1.1 Add SMS Tracking Tables ✅ **COMPLETED**

```sql
-- SMS Delivery Tracking (direct sending **and inbound status webhooks**)
CREATE TABLE sms_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL, -- Reference to original message
  recipient_id UUID NOT NULL REFERENCES auth.users(id),
  phone_number TEXT NOT NULL,
  sms_content TEXT NOT NULL,
  full_content TEXT NOT NULL, -- Store full message before truncation
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed (no delivered needed)
  twilio_sid TEXT, -- Twilio message SID for tracking
  error_message TEXT,
  cost_amount DECIMAL(10,4), -- Raw Twilio cost (negative value)
  priority TEXT DEFAULT 'normal', -- normal, high, emergency
  was_truncated BOOLEAN DEFAULT false, -- Track if message was truncated
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SMS Rate Limiting Tracking (per category)
CREATE TABLE sms_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  category_code TEXT NOT NULL,
  last_sms_sent TIMESTAMP WITH TIME ZONE NOT NULL,
  sms_count_last_hour INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, category_code)
);

-- Organization-wide SMS Cost Tracking
CREATE TABLE organization_sms_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_budget DECIMAL(10,2) DEFAULT 100.00,
  monthly_budget DECIMAL(10,2) DEFAULT 2000.00,
  alert_threshold_percent INTEGER DEFAULT 80, -- Alert when 80% of budget used
  current_daily_spend DECIMAL(10,2) DEFAULT 0.00,
  current_monthly_spend DECIMAL(10,2) DEFAULT 0.00,
  last_daily_reset DATE DEFAULT CURRENT_DATE,
  last_monthly_reset DATE DEFAULT date_trunc('month', CURRENT_DATE),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_sms_deliveries_message_id ON sms_deliveries(message_id);
CREATE INDEX idx_sms_deliveries_recipient_id ON sms_deliveries(recipient_id);
CREATE INDEX idx_sms_deliveries_status ON sms_deliveries(status);
CREATE INDEX idx_sms_deliveries_created_at ON sms_deliveries(created_at);
CREATE INDEX idx_sms_deliveries_sent_at ON sms_deliveries(sent_at);
CREATE INDEX idx_sms_rate_limits_user_id ON sms_rate_limits(user_id);
CREATE INDEX idx_sms_rate_limits_last_sent ON sms_rate_limits(last_sms_sent);
```

#### 1.2 Update Notification Preferences Schema ✅ **COMPLETED**

```sql
-- Add SMS as explicit delivery method option
-- Update check constraint if exists
ALTER TABLE user_notification_preferences
DROP CONSTRAINT IF EXISTS valid_delivery_method;

ALTER TABLE user_notification_preferences
ADD CONSTRAINT valid_delivery_method
CHECK (delivery_method IN ('default', 'push', 'email', 'sms', 'in_app', 'none'));

-- Add SMS cost limit and rate limiting preferences
ALTER TABLE user_preferences
ADD COLUMN sms_daily_limit INTEGER DEFAULT 10,
ADD COLUMN sms_monthly_limit INTEGER DEFAULT 100,
ADD COLUMN sms_cost_alerts BOOLEAN DEFAULT true,
ADD COLUMN sms_rate_limit_minutes INTEGER DEFAULT 20; -- Minimum minutes between SMS

-- Add SMS rate limiting per category
ALTER TABLE notification_categories
ADD COLUMN sms_rate_limit_minutes INTEGER DEFAULT 20, -- Per-category rate limit
ADD COLUMN allow_emergency_override BOOLEAN DEFAULT false; -- Can bypass user preferences

-- Update MUST_READ category to allow emergency override
UPDATE notification_categories
SET allow_emergency_override = true, sms_rate_limit_minutes = 0
WHERE code = 'must_read';
```

#### 1.3 Update Notification Trigger Function for SMS and Email Delivery ✅ **COMPLETED**

**Background:**
Currently, the `on_notification_created` trigger function only queues push notifications based on user preferences. To fully support hybrid notification delivery, this function must be updated to also support SMS and email delivery, based on the user's preferences for each notification category.

**Required Change:**

- Update the `on_notification_created()` trigger function to:
  - Check the user's delivery preference for the notification category (from `user_notification_preferences` or fallback to `user_preferences`).
  - If the preference is `sms` (or `default` and the user's global preference is `text`), queue an SMS delivery (insert into `sms_deliveries`).
  - If the preference is `email` (or `default` and the user's global preference is `email`), queue an email delivery (insert into `email_tracking`).
  - Continue to queue push notifications as before if the preference is `push`.
  - Skip delivery if preference is `in_app` or `none`.

**SQL/PLPGSQL for Updated Function:**

```sql
CREATE OR REPLACE FUNCTION on_notification_created()
RETURNS TRIGGER AS $$
DECLARE
  l_token TEXT;
  l_preference TEXT;
  l_category_code TEXT;
  l_global_pref TEXT;
  l_user_email TEXT;
  l_user_phone TEXT;
BEGIN
  -- Get the notification category and user preference
  l_category_code := NEW.notification_type;

  -- Check if the user has this notification type enabled
  SELECT delivery_method INTO l_preference
  FROM user_notification_preferences
  WHERE user_id = NEW.user_id AND category_code = l_category_code;

  -- If no specific preference, check for default preference in user_preferences
  IF l_preference IS NULL THEN
    SELECT contact_preference INTO l_preference
    FROM user_preferences
    WHERE user_id = NEW.user_id;
    IF l_preference IS NULL THEN
      l_preference := 'default';
    END IF;
  END IF;

  -- Get global preference for fallback logic
  SELECT contact_preference INTO l_global_pref
  FROM user_preferences
  WHERE user_id = NEW.user_id;

  -- Get user email and phone for delivery
  SELECT email INTO l_user_email FROM auth.users WHERE id = NEW.user_id;
  SELECT phone INTO l_user_phone FROM public.members WHERE id = NEW.user_id;

  -- SMS Delivery
  IF l_preference = 'sms' OR (l_preference = 'default' AND l_global_pref = 'text') THEN
    IF l_user_phone IS NOT NULL THEN
      INSERT INTO sms_deliveries (
        message_id, recipient_id, phone_number, sms_content, full_content, status, created_at
      ) VALUES (
        NEW.id, NEW.user_id, l_user_phone, NEW.message, NEW.message, 'pending', NOW()
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Email Delivery
  IF l_preference = 'email' OR (l_preference = 'default' AND l_global_pref = 'email') THEN
    IF l_user_email IS NOT NULL THEN
      INSERT INTO email_tracking (
        message_id, recipient, subject, status, created_at
      ) VALUES (
        NEW.id, l_user_email, COALESCE(NEW.title, 'Notification'), 'queued', NOW()
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Push Notification Delivery
  IF l_preference = 'push' OR (l_preference = 'default' AND l_global_pref = 'push') THEN
    FOR l_token IN
      SELECT push_token
      FROM user_push_tokens
      WHERE user_id = NEW.user_id AND is_active = true
    LOOP
      INSERT INTO push_notification_queue (
        notification_id, user_id, push_token, title, body, data, status, next_attempt_at
      ) VALUES (
        NEW.id, NEW.user_id, l_token, COALESCE(NEW.title, 'New Notification'), NEW.message,
        jsonb_build_object(
          'notificationType', NEW.notification_type,
          'messageId', NEW.id,
          'importance', NEW.importance_level,
          'timestamp', extract(epoch from NOW())
        ),
        'pending', NOW()
      );
    END LOOP;
    RETURN NEW;
  END IF;

  -- In-app only or none: do nothing (notification already exists in-app)
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Note:**

- This function assumes the existence of `sms_deliveries` and `email_tracking` tables as described in the schema updates.
- The function can be further extended to support fallback logic or additional delivery methods as needed.
- This update ensures that all notification delivery methods (push, SMS, email, in-app) are handled centrally and consistently based on user preferences.

### Phase 2: Enhanced Notification Service Functions ✅ **COMPLETED**

**COMPLETED ITEMS:**

- ✅ Added `sendSMSWithTracking()` function with comprehensive rate limiting and verification
- ✅ Added SMS helper functions: `canUserReceiveSMS()`, `checkSMSRateLimit()`, `updateSMSRateLimit()`
- ✅ Added budget checking functions: `checkOrganizationSMSBudget()`, `checkSMSLimits()`
- ✅ Added SMS formatting and utility functions
- ✅ Integrated SMS delivery into `sendNotificationWithHybridPriority()`
- ✅ Added comprehensive fallback delivery methods
- ✅ Updated `process-notification-queue` Edge Function to handle SMS deliveries
- ✅ Enhanced `send-sms` Edge Function with tracking and budget management
- ✅ Added SMS delivery metrics and analytics recording

#### 2.1 SMS Delivery Function ✅ **COMPLETED**

```typescript
// File: utils/notificationService.ts - New SMS functions

/**
 * Enhanced SMS sending with rate limiting, verification and tracking
 */
export async function sendSMSWithTracking(
  userId: string,
  phoneNumber: string,
  fullContent: string,
  messageId?: string,
  categoryCode: string = "general_message",
  priority: "normal" | "high" | "emergency" = "normal",
  bypassRateLimit: boolean = false
): Promise<{ success: boolean; deliveryId?: string; error?: string; wasTruncated?: boolean }> {
  try {
    // 1. Validate phone verification status
    const isVerified = await validatePhoneVerification(userId, phoneNumber);
    if (!isVerified) {
      return { success: false, error: "Phone number not verified" };
    }

    // 2. Check opt-out status and lockout (unless emergency override)
    if (priority !== "emergency") {
      const canReceiveSMS = await canUserReceiveSMS(userId);
      if (!canReceiveSMS.allowed) {
        return { success: false, error: canReceiveSMS.reason };
      }
    }

    // 3. Check rate limiting (unless bypassed)
    if (!bypassRateLimit && priority !== "emergency") {
      const rateLimitCheck = await checkSMSRateLimit(userId, categoryCode, priority);
      if (!rateLimitCheck.allowed) {
        return { success: false, error: rateLimitCheck.reason };
      }
    }

    // 4. Check organization-wide budget limits
    const budgetCheck = await checkOrganizationSMSBudget();
    if (!budgetCheck.allowed) {
      return { success: false, error: budgetCheck.reason };
    }

    // 5. Check individual daily/monthly limits
    const withinLimits = await checkSMSLimits(userId);
    if (!withinLimits.allowed) {
      return { success: false, error: withinLimits.reason };
    }

    // 6. Format content for SMS (truncate if necessary)
    const { smsContent, wasTruncated } = formatContentForSMS(fullContent);

    // 7. Create delivery tracking record
    const { data: delivery, error: deliveryError } = await supabase
      .from("sms_deliveries")
      .insert({
        message_id: messageId,
        recipient_id: userId,
        phone_number: phoneNumber,
        sms_content: smsContent,
        full_content: fullContent,
        priority: priority,
        was_truncated: wasTruncated,
        status: "pending",
      })
      .select("id")
      .single();

    if (deliveryError) {
      console.error("[SMS] Error creating delivery record:", deliveryError);
      return { success: false, error: "Failed to create delivery record" };
    }

    // 8. Send SMS via Edge Function
    const { data, error } = await supabase.functions.invoke("send-sms", {
      body: {
        to: phoneNumber,
        content: smsContent,
        messageId: messageId,
        deliveryId: delivery.id,
        priority,
      },
    });

    if (error || !data?.success) {
      // Update delivery record with failure
      await supabase
        .from("sms_deliveries")
        .update({
          status: "failed",
          error_message: error?.message || "Unknown error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);

      return { success: false, error: error?.message || "SMS delivery failed" };
    }

    // 9. Update delivery record with success
    await supabase
      .from("sms_deliveries")
      .update({
        status: "sent",
        twilio_sid: data.sid,
        cost_amount: data.cost,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);

    // 10. Update rate limiting tracking
    if (priority !== "emergency") {
      await updateSMSRateLimit(userId, categoryCode);
    }

    return { success: true, deliveryId: delivery.id, wasTruncated };
  } catch (error) {
    console.error("[SMS] Error sending SMS:", error);
    return { success: false, error: "Unexpected error sending SMS" };
  }
}

/**
 * Check if user can receive SMS based on verification, opt-out, and lockout status
 */
async function canUserReceiveSMS(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { data: prefs, error } = await supabase
      .from("user_preferences")
      .select("sms_opt_out, sms_lockout_until, phone_verified")
      .eq("user_id", userId)
      .single();

    if (error) {
      return { allowed: false, reason: "Unable to check user preferences" };
    }

    if (prefs.sms_opt_out) {
      return { allowed: false, reason: "User has opted out of SMS notifications" };
    }

    if (prefs.sms_lockout_until && new Date(prefs.sms_lockout_until) > new Date()) {
      return { allowed: false, reason: "User is temporarily locked out from SMS" };
    }

    if (!prefs.phone_verified) {
      return { allowed: false, reason: "Phone number not verified" };
    }

    return { allowed: true };
  } catch (error) {
    console.error("[SMS] Error checking SMS permissions:", error);
    return { allowed: false, reason: "Error checking permissions" };
  }
}

/**
 * Check SMS rate limiting based on category and priority
 */
async function checkSMSRateLimit(
  userId: string,
  categoryCode: string,
  priority: string
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get category-specific rate limit
    const { data: category, error: categoryError } = await supabase
      .from("notification_categories")
      .select("sms_rate_limit_minutes, allow_emergency_override")
      .eq("code", categoryCode)
      .single();

    if (categoryError) {
      console.error("[SMS] Error checking category rate limit:", categoryError);
      return { allowed: true }; // Fail open
    }

    // Check if this category allows emergency override
    if (category?.allow_emergency_override && priority === "emergency") {
      return { allowed: true };
    }

    // Get rate limit in minutes based on priority and category
    let rateLimitMinutes = category?.sms_rate_limit_minutes || 20;

    // High priority messages have shorter rate limits
    if (priority === "high") {
      rateLimitMinutes = Math.min(rateLimitMinutes, 10);
    }

    // Emergency messages bypass rate limits
    if (priority === "emergency") {
      return { allowed: true };
    }

    // Check last SMS time for this category
    const { data: rateLimit, error: rateLimitError } = await supabase
      .from("sms_rate_limits")
      .select("last_sms_sent")
      .eq("user_id", userId)
      .eq("category_code", categoryCode)
      .single();

    if (rateLimitError && rateLimitError.code !== "PGRST116") {
      console.error("[SMS] Error checking rate limit:", rateLimitError);
      return { allowed: true }; // Allow if we can't check (fail open)
    }

    if (rateLimit?.last_sms_sent) {
      const lastSentTime = new Date(rateLimit.last_sms_sent);
      const now = new Date();
      const minutesSinceLastSMS = (now.getTime() - lastSentTime.getTime()) / (1000 * 60);

      if (minutesSinceLastSMS < rateLimitMinutes) {
        const waitTime = Math.ceil(rateLimitMinutes - minutesSinceLastSMS);
        return {
          allowed: false,
          reason: `Please wait ${waitTime} more minute(s) before sending another ${categoryCode} SMS`,
        };
      }
    }

    return { allowed: true };
  } catch (error) {
    console.error("[SMS] Error checking rate limit:", error);
    return { allowed: true }; // Fail open for rate limiting
  }
}

/**
 * Update SMS rate limiting tracking
 */
async function updateSMSRateLimit(userId: string, categoryCode: string): Promise<void> {
  try {
    const now = new Date().toISOString();

    // Upsert rate limit record per category
    await supabase.from("sms_rate_limits").upsert(
      {
        user_id: userId,
        category_code: categoryCode,
        last_sms_sent: now,
        sms_count_last_hour: 1,
        updated_at: now,
      },
      {
        onConflict: "user_id,category_code",
      }
    );
  } catch (error) {
    console.error("[SMS] Error updating rate limit:", error);
    // Don't throw - this is tracking only
  }
}

/**
 * Check organization-wide SMS budget limits
 */
async function checkOrganizationSMSBudget(): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { data: budget, error } = await supabase.from("organization_sms_budget").select("*").single();

    if (error) {
      console.error("[SMS] Error checking organization budget:", error);
      return { allowed: true }; // Fail open if can't check budget
    }

    if (!budget) {
      return { allowed: true }; // No budget set, allow
    }

    // Reset counters if needed
    const today = new Date().toISOString().split("T")[0];
    const currentMonth = new Date().toISOString().substr(0, 7);

    let needsUpdate = false;
    let updates: any = {};

    if (budget.last_daily_reset !== today) {
      updates.current_daily_spend = 0;
      updates.last_daily_reset = today;
      needsUpdate = true;
    }

    if (!budget.last_monthly_reset.startsWith(currentMonth)) {
      updates.current_monthly_spend = 0;
      updates.last_monthly_reset = new Date().toISOString().split("T")[0];
      needsUpdate = true;
    }

    if (needsUpdate) {
      await supabase.from("organization_sms_budget").update(updates).eq("id", budget.id);

      // Update local values
      budget.current_daily_spend = updates.current_daily_spend || budget.current_daily_spend;
      budget.current_monthly_spend = updates.current_monthly_spend || budget.current_monthly_spend;
    }

    // Check daily budget (assuming average cost of $0.01 per SMS)
    const estimatedCost = 0.01;
    if (budget.current_daily_spend + estimatedCost > budget.daily_budget) {
      return { allowed: false, reason: "Daily SMS budget exceeded" };
    }

    if (budget.current_monthly_spend + estimatedCost > budget.monthly_budget) {
      return { allowed: false, reason: "Monthly SMS budget exceeded" };
    }

    return { allowed: true };
  } catch (error) {
    console.error("[SMS] Error checking organization budget:", error);
    return { allowed: true }; // Fail open for budget checks
  }
}

/**
 * Check SMS daily/monthly limits
 */
async function checkSMSLimits(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Get user limits
    const { data: prefs, error: prefsError } = await supabase
      .from("user_preferences")
      .select("sms_daily_limit, sms_monthly_limit")
      .eq("user_id", userId)
      .single();

    if (prefsError) {
      return { allowed: false, reason: "Unable to check SMS limits" };
    }

    const dailyLimit = prefs.sms_daily_limit || 10;
    const monthlyLimit = prefs.sms_monthly_limit || 100;

    // Check daily limit
    const today = new Date().toISOString().split("T")[0];
    const { count: dailyCount, error: dailyError } = await supabase
      .from("sms_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .gte("created_at", `${today}T00:00:00.000Z`)
      .lt("created_at", `${today}T23:59:59.999Z`)
      .eq("status", "sent");

    if (dailyError) {
      console.error("[SMS] Error checking daily limit:", dailyError);
    } else if ((dailyCount || 0) >= dailyLimit) {
      return { allowed: false, reason: "Daily SMS limit exceeded" };
    }

    // Check monthly limit
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count: monthlyCount, error: monthlyError } = await supabase
      .from("sms_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .gte("created_at", monthStart.toISOString())
      .eq("status", "sent");

    if (monthlyError) {
      console.error("[SMS] Error checking monthly limit:", monthlyError);
    } else if ((monthlyCount || 0) >= monthlyLimit) {
      return { allowed: false, reason: "Monthly SMS limit exceeded" };
    }

    return { allowed: true };
  } catch (error) {
    console.error("[SMS] Error checking SMS limits:", error);
    return { allowed: false, reason: "Error checking limits" };
  }
}
```

#### 2.2 Integration with Hybrid Notification System (App Layer) ✅ **COMPLETED**

**Background:**
The app's hybrid notification system (e.g., `sendNotificationWithHybridPriority` and related logic) is responsible for determining the best delivery method for each notification, handling user preferences, and providing fallbacks (push, SMS, email, in-app). This logic must be updated to fully support SMS as a first-class delivery method, in line with the new database and Edge Function changes.

**Required Change:**

- Update the app's notification service functions to:
  - Check user delivery preferences for each notification category.
  - If the preference is SMS (or default/text), queue an SMS delivery (insert into `sms_deliveries` or invoke the Edge Function as appropriate).
  - If the preference is email (or default/email), queue an email delivery.
  - Continue to support push and in-app notifications as before.
  - Implement fallback logic: if SMS fails, fallback to push/email/in-app as appropriate.
  - Ensure all delivery attempts are tracked and errors are logged for monitoring and debugging.

**Example (TypeScript, App Layer):**

```typescript
export async function sendNotificationWithHybridPriority(
  userId: string,
  notification: {
    title: string;
    body: string;
    categoryCode: string;
    messageId?: string;
    requiresAcknowledgment?: boolean;
    divisionName?: string;
    extraData?: Record<string, any>;
  }
): Promise<boolean> {
  try {
    // ... existing logic for importance and mandatory checks ...

    // Check user's preference for this category
    const deliveryMethod = await getUserDeliveryMethodForCategory(userId, notification.categoryCode);

    // Determine if SMS should be sent
    const shouldSendSMS = await shouldSendSMSNotification(
      userId,
      notification.categoryCode,
      deliveryMethod,
      importance
    );

    if (shouldSendSMS) {
      // Get user's phone number
      const phoneNumber = await getUserPhoneNumber(userId);

      if (phoneNumber) {
        // Format content for SMS (truncate if necessary)
        const smsContent = formatContentForSMS(notification.title, notification.body);

        // Send SMS with tracking
        const smsResult = await sendSMSWithTracking(
          userId,
          phoneNumber,
          smsContent,
          notification.messageId,
          notification.categoryCode,
          importance === "high" ? "high" : "normal"
        );

        if (smsResult.success) {
          console.log(`[SMS] Successfully sent to ${userId}`);
          return true;
        } else {
          console.error(`[SMS] Failed to send to ${userId}:`, smsResult.error);
          // Fallback to another method
          return await fallbackDeliveryMethod(userId, notification, deliveryMethod);
        }
      } else {
        console.warn(`[SMS] No phone number for user ${userId}`);
        return await fallbackDeliveryMethod(userId, notification, deliveryMethod);
      }
    }

    // ... rest of existing logic for push, email, in-app ...
  } catch (error) {
    console.error("[NotificationService] Error in sendNotificationWithHybridPriority:", error);
    return false;
  }
}

/**
 * Determine if SMS should be sent based on preferences
 */
async function shouldSendSMSNotification(
  userId: string,
  categoryCode: string,
  userDeliveryMethod: string,
  importance: string
): Promise<boolean> {
  try {
    // Check if user has SMS as their delivery method for this category
    if (userDeliveryMethod === "sms") {
      return true;
    }

    // Check if user's global preference is SMS and category uses default
    if (userDeliveryMethod === "default") {
      const { data: globalPrefs } = await supabase
        .from("user_preferences")
        .select("contact_preference")
        .eq("user_id", userId)
        .single();

      return globalPrefs?.contact_preference === "text";
    }

    // For mandatory high-importance notifications, check if we should override
    const { data: category } = await supabase
      .from("notification_categories")
      .select("is_mandatory, default_importance")
      .eq("code", categoryCode)
      .single();

    if (category?.is_mandatory && importance === "high") {
      // Check if user has SMS capability (verified phone)
      const canReceive = await canUserReceiveSMS(userId);
      return canReceive.allowed;
    }

    return false;
  } catch (error) {
    console.error("[SMS] Error determining SMS delivery:", error);
    return false;
  }
}

/**
 * Format content for SMS with length limits
 */
function formatContentForSMS(fullContent: string): { smsContent: string; wasTruncated: boolean } {
  const maxLength = 160; // Standard SMS length

  if (fullContent.length <= maxLength) {
    return { smsContent: fullContent, wasTruncated: false };
  }

  // Truncate with "..." and add note about full message in app
  const truncatedContent = fullContent.substring(0, maxLength - 25) + "... (See full in app)";

  return { smsContent: truncatedContent, wasTruncated: true };
}

/**
 * Handle fallback delivery when SMS fails
 */
async function fallbackDeliveryMethod(userId: string, notification: any, originalMethod: string): Promise<boolean> {
  try {
    // Try push notification as fallback
    const pushResult = await sendNotificationWithHybridPriority(userId, {
      ...notification,
      extraData: {
        ...notification.extraData,
        fallbackFrom: "sms",
        originalMethod,
      },
    });

    if (pushResult) {
      return true;
    }

    // Try email as second fallback
    const userEmail = await getUserEmail(userId);
    if (userEmail) {
      const emailContent = formatEmailContent(notification.title, notification.body);
      return await sendEmail(userEmail, notification.title, emailContent);
    }

    // Final fallback - ensure in-app notification exists
    if (notification.messageId) {
      await supabase.from("notifications").upsert(
        {
          id: notification.messageId,
          user_id: userId,
          title: notification.title,
          message: notification.body,
          notification_type: getNotificationCategoryFromType(notification.categoryCode),
          category_code: notification.categoryCode,
          is_read: false,
          requires_acknowledgment: notification.requiresAcknowledgment || false,
          importance: "medium",
          metadata: { fallbackFrom: "sms", originalMethod },
          created_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      return true;
    }

    return false;
  } catch (error) {
    console.error("[SMS] Error in fallback delivery:", error);
    return false;
  }
}
```

#### 2.3 Update process-notification-queue Edge Function to Process SMS ✅ **COMPLETED**

**Background:**
Currently, the `process-notification-queue` Edge Function processes the `push_notification_queue` table to send push notifications. With the introduction of SMS notifications and the `sms_deliveries` table, this function must be updated to also process and deliver SMS notifications.

**Required Change:**

- Update the `process-notification-queue` Edge Function to:
  - Periodically (every minute, as currently scheduled) scan the `sms_deliveries` table for rows with `status = 'pending'` (and optionally, failed with retries left).
  - For each pending SMS delivery:
    - Send the SMS using the Twilio API (or configured provider).
    - Update the `sms_deliveries` row with the result: set `status` to `sent` or `failed`, log the Twilio SID, cost, and any error message.
    - Implement retry logic for failed SMS deliveries if desired (e.g., increment a retry count, schedule next attempt).
  - Ensure that SMS delivery respects rate limits, opt-out, and lockout status as tracked in the database.
- This approach keeps all notification delivery processing centralized in a single scheduled Edge Function, simplifying monitoring and scaling.

**Example Pseudocode:**

```typescript
// In process-notification-queue Edge Function
async function processPendingSMSDeliveries() {
  const { data: pendingSMS } = await supabase.from("sms_deliveries").select("*").eq("status", "pending");

  for (const sms of pendingSMS) {
    // Send SMS via Twilio/provider
    const result = await sendSMS(sms.phone_number, sms.sms_content);
    if (result.success) {
      await supabase
        .from("sms_deliveries")
        .update({
          status: "sent",
          twilio_sid: result.sid,
          cost_amount: result.cost,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", sms.id);
    } else {
      await supabase
        .from("sms_deliveries")
        .update({
          status: "failed",
          error_message: result.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sms.id);
    }
  }
}
```

**Note:**

- This update ensures SMS notifications are delivered reliably and consistently, with retry and error handling, using the same scheduling and monitoring as push notifications.
- No new Edge Function or cron job is required; all notification delivery is handled in one place.

### Phase 3: Edge Function Updates ✅ **COMPLETED**

**COMPLETED ITEMS:**

- ✅ Enhanced `send-sms` Edge Function with proper TypeScript interfaces and validation
- ✅ Added `validateSMSDelivery()` function for comprehensive verification and opt-out checking
- ✅ Added `isOTP` parameter support for bypassing verification on OTP messages
- ✅ Enhanced analytics logging to `notification_analytics` table
- ✅ Added priority-based Twilio features (ValidityPeriod for high priority messages)
- ✅ Improved error handling structure and response formatting
- ✅ Created `send-emergency-sms` Edge Function for admin emergency SMS functionality
- ✅ Created `get-sms-cost-stats` Edge Function for SMS cost analytics and dashboard

#### 3.1 Enhanced send-sms Edge Function ✅ **COMPLETED**

```typescript
// File: supabase/functions/send-sms/index.ts - Enhanced version

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SMSRequest {
  to: string;
  content: string;
  messageId?: string;
  deliveryId?: string;
  priority?: "low" | "normal" | "high";
  isOTP?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, content, messageId, deliveryId, priority = "normal", isOTP = false }: SMSRequest = await req.json();

    // Validate input
    if (!to || !content) {
      throw new Error("Missing required fields: to, content");
    }

    const formattedPhone = formatPhoneToE164(to);

    // Initialize Supabase client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Enhanced verification and opt-out checking for non-OTP messages
    if (!isOTP) {
      const canSend = await validateSMSDelivery(supabaseAdmin, formattedPhone);
      if (!canSend.allowed) {
        throw new Error(canSend.reason);
      }
    }

    // Send SMS via Twilio with enhanced configuration
    const twilioResult = await sendViaTwilio(formattedPhone, content, priority);

    // Update delivery tracking if deliveryId provided
    if (deliveryId && twilioResult.success) {
      await supabaseAdmin
        .from("sms_deliveries")
        .update({
          status: "sent",
          twilio_sid: twilioResult.sid,
          cost_amount: twilioResult.cost,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);
    } else if (deliveryId && !twilioResult.success) {
      await supabaseAdmin
        .from("sms_deliveries")
        .update({
          status: "failed",
          error_message: twilioResult.error,
          updated_at: new Date().toISOString(),
        })
        .eq("id", deliveryId);
    }

    // Log analytics
    if (messageId) {
      await supabaseAdmin.from("notification_analytics").insert({
        notification_id: messageId,
        delivery_method: "sms",
        success: twilioResult.success,
        timestamp: new Date().toISOString(),
        metadata: {
          phone: formattedPhone,
          priority,
          cost: twilioResult.cost,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: twilioResult.success,
        sid: twilioResult.sid,
        cost: twilioResult.cost,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("SMS Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to send SMS",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

async function validateSMSDelivery(supabase: any, phone: string): Promise<{ allowed: boolean; reason?: string }> {
  // Check phone verification
  const { data: verification, error: verificationError } = await supabase
    .from("phone_verifications")
    .select("verified, user_id")
    .eq("phone", phone)
    .eq("verified", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (verificationError || !verification) {
    return { allowed: false, reason: "Phone number not verified" };
  }

  // Check user preferences
  const { data: userPrefs, error: prefsError } = await supabase
    .from("user_preferences")
    .select("sms_opt_out, sms_lockout_until")
    .eq("user_id", verification.user_id)
    .single();

  if (prefsError && prefsError.code !== "PGRST116") {
    return { allowed: false, reason: "Unable to check user preferences" };
  }

  if (userPrefs?.sms_opt_out) {
    return { allowed: false, reason: "User has opted out of SMS" };
  }

  if (userPrefs?.sms_lockout_until && new Date(userPrefs.sms_lockout_until) > new Date()) {
    return { allowed: false, reason: "User is temporarily locked out" };
  }

  return { allowed: true };
}

async function sendViaTwilio(
  phone: string,
  content: string,
  priority: string
): Promise<{
  success: boolean;
  sid?: string;
  cost?: number;
  error?: string;
}> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const messagingServiceSid = Deno.env.get("TWILIO_MESSAGE_SERVICE_SID");

  if (!accountSid || !authToken || !messagingServiceSid) {
    return { success: false, error: "Missing Twilio configuration" };
  }

  try {
    const body = new URLSearchParams({
      To: phone,
      MessagingServiceSid: messagingServiceSid,
      Body: content,
    });

    // Add priority-based features
    if (priority === "high") {
      body.append("ValidityPeriod", "14400"); // 4 hours for high priority
    }

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Twilio API error:", errorData);
      return { success: false, error: "Twilio API error" };
    }

    const result = await response.json();

    return {
      success: true,
      sid: result.sid,
      cost: parseFloat(result.price || "0") * -1, // Twilio returns negative prices
    };
  } catch (error) {
    console.error("Twilio request error:", error);
    return { success: false, error: "Network error" };
  }
}

// ... existing formatPhoneToE164 function ...
```

### Phase 4: UI Updates ✅ **COMPLETED**

**COMPLETED ITEMS:**

- ✅ Created `app/(admin)/emergency-sms.tsx` - Admin Emergency Override Interface
- ✅ Created `app/(admin)/sms-cost-dashboard.tsx` - Cost Management Dashboard
- ✅ Enhanced `app/(profile)/notification-settings.tsx` - Added SMS delivery method and verification status
- ✅ Added SMS status indicator component with phone verification check
- ✅ Added SMS validation for notification preferences
- ✅ Implemented proper admin permission checks for emergency SMS and cost dashboard
- ✅ Used consistent theming and components throughout all UI updates

#### 4.1 Admin Emergency Override Interface ✅ **COMPLETED**

```typescript
// File: app/(admin)/emergency-sms.tsx - New admin interface for emergency SMS

import React, { useState, useEffect } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedButton } from "@/components/ui/ThemedButton";
import { ThemedTextInput } from "@/components/ui/ThemedTextInput";
import { ThemedToast } from "@/components/ui/ThemedToast";
import { useSupabase } from "@/hooks/useSupabase";
import { router } from "expo-router";

export default function EmergencySMSScreen() {
  const { supabase, session } = useSupabase();
  const [message, setMessage] = useState("");
  const [targetUsers, setTargetUsers] = useState<"all" | "division" | "specific">("division");
  const [divisionUsers, setDivisionUsers] = useState([]);
  const [sending, setSending] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    checkAdminPermission();
    fetchDivisionUsers();
  }, []);

  const checkAdminPermission = async () => {
    if (!session?.user?.id) return;

    const { data: member } = await supabase
      .from("members")
      .select("role, division_name")
      .eq("id", session.user.id)
      .single();

    if (!member || !["admin", "union_admin", "application_admin", "division_admin"].includes(member.role)) {
      router.replace("/(tabs)/home");
      return;
    }

    setUserRole(member.role);
  };

  const fetchDivisionUsers = async () => {
    if (!session?.user?.id) return;

    // Get admin's division
    const { data: adminMember } = await supabase
      .from("members")
      .select("division_name")
      .eq("id", session.user.id)
      .single();

    if (adminMember?.division_name) {
      const { data: users } = await supabase
        .from("members")
        .select("id, first_name, last_name, phone")
        .eq("division_name", adminMember.division_name)
        .eq("status", "active")
        .not("phone", "is", null);

      setDivisionUsers(users || []);
    }
  };

  const sendEmergencySMS = async () => {
    if (!message.trim()) {
      ThemedToast.show("Please enter a message", "error");
      return;
    }

    Alert.alert(
      "Confirm Emergency SMS",
      `This will send an emergency SMS that bypasses user preferences and rate limits. 
      
Message: "${message}"
Target: ${targetUsers === "all" ? "All users" : targetUsers === "division" ? "Division users" : "Selected users"}

Are you sure you want to proceed?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send Emergency SMS", style: "destructive", onPress: confirmSendEmergencySMS },
      ]
    );
  };

  const confirmSendEmergencySMS = async () => {
    setSending(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-emergency-sms", {
        body: {
          message,
          targetUsers,
          divisionName: userRole === "division_admin" ? "current_division" : undefined,
          adminId: session?.user?.id,
        },
      });

      if (error) throw error;

      ThemedToast.show(
        `Emergency SMS sent to ${data.sentCount} users. ${data.failCount} failed.`,
        data.failCount > 0 ? "warning" : "success"
      );

      setMessage("");
    } catch (error) {
      console.error("Emergency SMS error:", error);
      ThemedToast.show("Failed to send emergency SMS", "error");
    } finally {
      setSending(false);
    }
  };

  if (userRole === null) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Checking permissions...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Emergency SMS Notification</ThemedText>
      <ThemedText style={styles.warning}>
        ⚠️ This feature bypasses user SMS preferences and rate limits. Use only for genuine emergencies.
      </ThemedText>

      <ThemedTextInput
        style={styles.messageInput}
        placeholder="Enter emergency message..."
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={300}
      />

      <ThemedText style={styles.charCount}>
        {message.length}/300 characters
        {message.length > 160 && (
          <ThemedText style={styles.truncateNote}>(Will be truncated in SMS, full message available in app)</ThemedText>
        )}
      </ThemedText>

      <View style={styles.targetSection}>
        <ThemedText style={styles.sectionTitle}>Target Users:</ThemedText>

        {(userRole === "admin" || userRole === "union_admin" || userRole === "application_admin") && (
          <ThemedTouchableOpacity
            title={`All Users (System-wide)`}
            onPress={() => setTargetUsers("all")}
            variant={targetUsers === "all" ? "primary" : "secondary"}
            style={styles.targetButton}
          />
        )}

        <ThemedTouchableOpacity
          title={`Division Users (${divisionUsers.length} users)`}
          onPress={() => setTargetUsers("division")}
          variant={targetUsers === "division" ? "primary" : "secondary"}
          style={styles.targetButton}
        />
      </View>

      <ThemedTouchableOpacity
        title={sending ? "Sending Emergency SMS..." : "Send Emergency SMS"}
        onPress={sendEmergencySMS}
        disabled={sending || !message.trim()}
        variant="destructive"
        style={styles.sendButton}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 10 },
  warning: { color: "#ff6b6b", marginBottom: 20, fontStyle: "italic" },
  messageInput: { minHeight: 100, textAlignVertical: "top", marginBottom: 10 },
  charCount: { fontSize: 12, color: "#666", marginBottom: 20 },
  truncateNote: { color: "#ff6b6b", fontStyle: "italic" },
  targetSection: { marginBottom: 30 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  targetButton: { marginBottom: 10 },
  sendButton: { marginTop: 20 },
});
```

#### 4.2 Cost Management Dashboard

```typescript
// File: app/(admin)/sms-cost-dashboard.tsx - SMS cost monitoring

import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useSupabase } from "@/hooks/useSupabase";

interface SMSCostStats {
  dailyCost: number;
  weeklyCost: number;
  monthlyCost: number;
  dailyCount: number;
  weeklyCount: number;
  monthlyCount: number;
  topUsers: Array<{ name: string; count: number; cost: number }>;
}

export default function SMSCostDashboard() {
  const { supabase } = useSupabase();
  const [stats, setStats] = useState<SMSCostStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCostStats();
  }, []);

  const fetchCostStats = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-sms-cost-stats");

      if (error) throw error;

      setStats(data);
    } catch (error) {
      console.error("Error fetching SMS cost stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading SMS cost statistics...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <ThemedText style={styles.title}>SMS Cost Dashboard</ThemedText>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <ThemedText style={styles.statValue}>${stats?.dailyCost.toFixed(2) || "0.00"}</ThemedText>
          <ThemedText style={styles.statLabel}>Today</ThemedText>
          <ThemedText style={styles.statCount}>{stats?.dailyCount || 0} messages</ThemedText>
        </View>

        <View style={styles.statCard}>
          <ThemedText style={styles.statValue}>${stats?.weeklyCost.toFixed(2) || "0.00"}</ThemedText>
          <ThemedText style={styles.statLabel}>This Week</ThemedText>
          <ThemedText style={styles.statCount}>{stats?.weeklyCount || 0} messages</ThemedText>
        </View>

        <View style={styles.statCard}>
          <ThemedText style={styles.statValue}>${stats?.monthlyCost.toFixed(2) || "0.00"}</ThemedText>
          <ThemedText style={styles.statLabel}>This Month</ThemedText>
          <ThemedText style={styles.statCount}>{stats?.monthlyCount || 0} messages</ThemedText>
        </View>
      </View>

      <View style={styles.topUsersSection}>
        <ThemedText style={styles.sectionTitle}>Top SMS Users (This Month)</ThemedText>
        {stats?.topUsers.map((user, index) => (
          <View key={index} style={styles.userRow}>
            <ThemedText style={styles.userName}>{user.name}</ThemedText>
            <View style={styles.userStats}>
              <ThemedText style={styles.userCount}>{user.count} SMS</ThemedText>
              <ThemedText style={styles.userCost}>${user.cost.toFixed(2)}</ThemedText>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20 },
  statsGrid: { flexDirection: "row", justifyContent: "space-between", marginBottom: 30 },
  statCard: { flex: 1, backgroundColor: Colors.dark.card, padding: 15, borderRadius: 8, marginHorizontal: 5 },
  statValue: { fontSize: 24, fontWeight: "bold", color: Colors.dark.text },
  statLabel: { fontSize: 14, color: "#666", marginTop: 5 },
  statCount: { fontSize: 12, color: "#999", marginTop: 2 },
  topUsersSection: { marginTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 15 },
  userRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  userName: { flex: 1 },
  userStats: { flexDirection: "row", gap: 15 },
  userCount: { color: "#666" },
  userCost: { color: "#2196F3", fontWeight: "bold" },
});
```

#### 4.3 Notification Settings Enhancement

```typescript
// File: app/(profile)/notification-settings.tsx - Add SMS options

// Add to deliveryMethods array
const deliveryMethods = [
  { id: "default", label: "Default (Based on Contact Preference)" },
  { id: "push", label: "Push Notification" },
  { id: "email", label: "Email" },
  { id: "sms", label: "Text Message (SMS)" }, // New option
  { id: "in_app", label: "In-App Only" },
];

// Add SMS-specific validation in updatePreference function
const updatePreference = async (
  categoryCode: string,
  field: "deliveryMethod" | "enabled",
  value: string | boolean,
  isMandatory: boolean
) => {
  // ... existing validation ...

  // Add SMS-specific validation
  if (field === "deliveryMethod" && value === "sms") {
    // Check if phone is verified
    const { data: userPrefs } = await supabase
      .from("user_preferences")
      .select("phone_verified, phone_verification_status")
      .eq("user_id", session.user.id)
      .single();

    if (!userPrefs?.phone_verified || userPrefs.phone_verification_status !== "verified") {
      Toast.show({
        type: "info",
        text1: "Phone Verification Required",
        text2:
          "You must verify your phone number before you can receive SMS notifications. Would you like to verify it now?",
        position: "bottom",
        visibilityTime: 4000,
        autoHide: false,
        props: {
          onAction: (action: string) => {
            if (action === "confirm") {
              router.push("/(profile)/phone-verification");
            }
            Toast.hide();
          },
          actionType: "confirm",
          confirmText: "Verify",
        },
      });
      return;
    }
  }

  // ... rest of existing logic ...
};

// Add SMS status indicator to the UI
const renderSMSStatus = () => {
  const [smsStatus, setSmsStatus] = useState<{
    verified: boolean;
    optedOut: boolean;
    lockedOut: boolean;
    dailyCount: number;
    monthlyCount: number;
  } | null>(null);

  useEffect(() => {
    fetchSMSStatus();
  }, []);

  const fetchSMSStatus = async () => {
    if (!session?.user?.id) return;

    try {
      // Fetch SMS status
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("phone_verified, sms_opt_out, sms_lockout_until, sms_daily_limit, sms_monthly_limit")
        .eq("user_id", session.user.id)
        .single();

      // Fetch daily/monthly counts
      const today = new Date().toISOString().split("T")[0];
      const { count: dailyCount } = await supabase
        .from("sms_deliveries")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", session.user.id)
        .gte("created_at", `${today}T00:00:00.000Z`)
        .eq("status", "sent");

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { count: monthlyCount } = await supabase
        .from("sms_deliveries")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", session.user.id)
        .gte("created_at", monthStart.toISOString())
        .eq("status", "sent");

      setSmsStatus({
        verified: prefs?.phone_verified || false,
        optedOut: prefs?.sms_opt_out || false,
        lockedOut: prefs?.sms_lockout_until ? new Date(prefs.sms_lockout_until) > new Date() : false,
        dailyCount: dailyCount || 0,
        monthlyCount: monthlyCount || 0,
      });
    } catch (error) {
      console.error("Error fetching SMS status:", error);
    }
  };

  if (!smsStatus) return null;

  return (
    <ThemedView style={styles.smsStatusContainer}>
      <ThemedText style={styles.sectionTitle}>SMS Status</ThemedText>

      <View style={styles.statusRow}>
        <ThemedText>Phone Verified: </ThemedText>
        <ThemedText style={smsStatus.verified ? styles.statusGood : styles.statusBad}>
          {smsStatus.verified ? "✓ Verified" : "✗ Not Verified"}
        </ThemedText>
      </View>

      {smsStatus.verified && (
        <>
          <View style={styles.statusRow}>
            <ThemedText>SMS Today: </ThemedText>
            <ThemedText>{smsStatus.dailyCount}/10</ThemedText>
          </View>

          <View style={styles.statusRow}>
            <ThemedText>SMS This Month: </ThemedText>
            <ThemedText>{smsStatus.monthlyCount}/100</ThemedText>
          </View>

          {smsStatus.optedOut && (
            <View style={styles.statusRow}>
              <ThemedText style={styles.statusBad}>⚠️ You have opted out of SMS</ThemedText>
            </View>
          )}

          {smsStatus.lockedOut && (
            <View style={styles.statusRow}>
              <ThemedText style={styles.statusBad}>🔒 SMS temporarily disabled</ThemedText>
            </View>
          )}
        </>
      )}
    </ThemedView>
  );
};
```

### Phase 5: Testing & Monitoring

#### 5.1 SMS Testing Functions

```typescript
// File: utils/notificationService.ts - Testing functions

/**
 * Test SMS functionality for development/admin use
 */
export async function testSMSDelivery(
  testPhone: string,
  testMessage: string = "Test SMS from BLET App"
): Promise<{ success: boolean; error?: string; cost?: number }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-sms", {
      body: {
        to: testPhone,
        content: testMessage,
        isOTP: true, // Skip verification checks for testing
        priority: "normal",
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: data?.success || false,
      cost: data?.cost,
      error: data?.success ? undefined : "SMS delivery failed",
    };
  } catch (error) {
    console.error("SMS test error:", error);
    return { success: false, error: "Unexpected error during SMS test" };
  }
}

/**
 * Get SMS delivery statistics for monitoring
 */
export async function getSMSDeliveryStats(timeframe: "day" | "week" | "month" = "day"): Promise<{
  totalSent: number;
  totalFailed: number;
  totalCost: number;
  avgDeliveryTime: number;
}> {
  try {
    let startDate = new Date();

    switch (timeframe) {
      case "day":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "week":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    const { data, error } = await supabase
      .from("sms_deliveries")
      .select("status, cost_amount, sent_at, created_at")
      .gte("created_at", startDate.toISOString());

    if (error) throw error;

    const stats = {
      totalSent: 0,
      totalFailed: 0,
      totalCost: 0,
      avgDeliveryTime: 0,
    };

    let totalDeliveryTime = 0;
    let successfulDeliveries = 0;

    data?.forEach((delivery) => {
      if (delivery.status === "sent") {
        stats.totalSent++;
        stats.totalCost += delivery.cost_amount || 0;

        if (delivery.sent_at && delivery.created_at) {
          const deliveryTime = new Date(delivery.sent_at).getTime() - new Date(delivery.created_at).getTime();
          totalDeliveryTime += deliveryTime;
          successfulDeliveries++;
        }
      } else if (delivery.status === "failed") {
        stats.totalFailed++;
      }
    });

    stats.avgDeliveryTime = successfulDeliveries > 0 ? totalDeliveryTime / successfulDeliveries : 0;

    return stats;
  } catch (error) {
    console.error("Error getting SMS stats:", error);
    return { totalSent: 0, totalFailed: 0, totalCost: 0, avgDeliveryTime: 0 };
  }
}
```

## Next Steps & Dependencies

### Prerequisites for Implementation

1. **Twilio Configuration**: Ensure Twilio credentials are properly configured
2. **Database Migrations**: Run all schema updates in order
3. **Edge Function Deployment**: Deploy updated send-sms function
4. **Testing Environment**: Set up test phone numbers for development

### Implementation Order

1. **Phase 1**: Database schema updates (no app downtime)
2. **Phase 2**: Notification service function updates (backward compatible)
3. **Phase 3**: Edge function deployment (versioned deployment)
4. **Phase 4**: UI updates (feature-flagged rollout)
5. **Phase 5**: Testing and monitoring setup

### Monitoring & Alerts

- Set up alerts for high SMS costs
- Monitor SMS delivery failure rates
- Track user opt-out rates
- Alert on rate limit violations
- Prune records older than 6 months (sms_deliveries & analytics)

### Cost Management

- Implement daily/monthly SMS budgets
- Add cost tracking and reporting
- Set up billing alerts in Twilio
- Consider different pricing tiers for user limits

## File Dependencies

### Files Requiring Updates

1. **`utils/notificationService.ts`** - Core SMS integration (PRIMARY)
2. **`supabase/functions/send-sms/index.ts`** - Enhanced Edge Function
3. **`app/(profile)/notification-settings.tsx`** - UI for SMS preferences
4. **Database Schema** - New tables and constraints
5. **`types/notifications.ts`** - Type definitions (if separate file)

### New Files to Create

1. **`utils/smsHelpers.ts`** - SMS-specific utility functions
2. **`components/ui/SMSStatusIndicator.tsx`** - SMS status component
3. **Database migration files** - Schema updates

## Testing Strategy

### Unit Tests

- SMS delivery validation logic
- Phone number formatting and verification
- Cost calculation and limit checking
- Fallback delivery mechanisms

### Integration Tests

- End-to-end SMS delivery workflow
- Notification preference integration
- Error handling and retry logic
- Database transaction integrity

### User Acceptance Testing

- SMS notification delivery across different message types
- User preference respect and override scenarios
- Cost limit enforcement
- Opt-out and verification workflows

## Deployment Strategy

### Phase 1: Infrastructure (No User Impact)

- Deploy database schema updates
- Deploy enhanced Edge Function
- Set up monitoring and alerting

### Phase 2: Backend Integration (Backward Compatible)

- Deploy notification service updates
- Enable SMS delivery for test users
- Monitor delivery metrics

### Phase 3: UI Rollout (Feature-Flagged)

- Deploy UI updates with feature flags
- Gradual rollout to user segments
- Monitor user adoption and feedback

### Phase 4: Full Deployment

- Remove feature flags
- Full monitoring and support
- Documentation and user guides

## Success Metrics

### Technical Metrics

- SMS delivery success rate (target: >95%)
- Average delivery time (target: <30 seconds)
- Cost per SMS within budget
- Error rate below 2%

### User Metrics

- SMS adoption rate among verified users
- User satisfaction with SMS notifications
- Opt-out rate below 5%
- Reduction in missed notifications

## Risk Mitigation

### Technical Risks

- **SMS Cost Overruns**: Implement strict limits and monitoring
- **Delivery Failures**: Robust fallback mechanisms
- **Rate Limiting**: Implement queue-based delivery
- **Security**: Validate all phone numbers and content

### User Experience Risks

- **Spam Concerns**: Clear opt-in/opt-out mechanisms
- **Privacy**: Transparent data usage policies
- **Accessibility**: Ensure SMS works for all user types
- **International**: Consider international SMS rates and regulations

This plan provides a comprehensive approach to integrating SMS notifications while maintaining system reliability and user control over their notification preferences.
