import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Phase 3: Enhanced structured logging and timing
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();
  let attemptId: number | undefined; // Declare at top level for error handling
  let auditStage = "initialization";

  // Enhanced logging helper
  const logAuditEvent = (
    stage: string,
    details: Record<string, any> = {},
    error: Error | null = null,
  ) => {
    const timestamp = new Date().toISOString();
    const executionTime = Date.now() - startTime;

    const logData: Record<string, any> = {
      timestamp,
      correlationId,
      stage,
      executionTimeMs: executionTime,
      attemptId,
      ...details,
    };

    if (error) {
      logData.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
      console.error(`[AUDIT-ERROR] [${stage}] [${correlationId}]`, logData);
    } else {
      console.log(`[AUDIT] [${stage}] [${correlationId}]`, logData);
    }
  };

  try {
    auditStage = "request_parsing";
    logAuditEvent("function_start", { method: req.method });

    const requestBody = await req.json();
    const { requestId } = requestBody;
    attemptId = requestBody.attemptId; // Assign to top-level variable

    logAuditEvent("request_parsed", {
      requestId: requestId ? "present" : "missing",
      attemptId: attemptId ? "present" : "missing",
      bodyKeys: Object.keys(requestBody),
    });

    // Validate required fields
    auditStage = "validation";
    if (!requestId) {
      logAuditEvent("validation_failed", { reason: "Missing requestId" });
      return new Response(
        JSON.stringify({ error: "Missing requestId" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    logAuditEvent("validation_passed", {
      requestId,
      hasAttemptId: !!attemptId,
    });

    // Initialize Supabase client
    auditStage = "supabase_init";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    logAuditEvent("env_check", {
      supabaseUrl: supabaseUrl ? "present" : "missing",
      supabaseKey: supabaseServiceKey ? "present" : "missing",
    });

    if (!supabaseUrl || !supabaseServiceKey) {
      const error = new Error("Missing Supabase configuration");
      logAuditEvent("supabase_init_failed", {}, error);
      throw error;
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    logAuditEvent("supabase_client_created");

    // Update attempt status to email_queued if attemptId provided
    if (attemptId) {
      const { error: updateError } = await supabaseAdmin
        .from("email_attempt_log")
        .update({
          attempt_status: "email_queued",
        })
        .eq("id", attemptId);

      if (updateError) {
        console.error(
          "Failed to update attempt status to email_queued:",
          updateError,
        );
        // Continue with email sending even if logging fails
      }
    }

    // Get request details from Supabase first - UPDATED: Include pin_number for non-signed-up members
    auditStage = "request_lookup";
    const { data: requestData, error: requestError } = await supabaseAdmin
      .from("pld_sdv_requests")
      .select(
        "id, request_date, leave_type, member_id, pin_number, paid_in_lieu, calendar_id",
      )
      .eq("id", requestId)
      .single();

    if (requestError) {
      logAuditEvent(
        "request_lookup_failed",
        { requestId },
        new Error(requestError.message),
      );
      throw new Error(`Failed to get request details: ${requestError.message}`);
    }

    logAuditEvent("request_lookup_success", {
      requestId,
      hasMemberId: !!requestData.member_id,
      hasPinNumber: !!requestData.pin_number,
      leaveType: requestData.leave_type,
      paidInLieu: requestData.paid_in_lieu,
    });

    // Get member details - handle both signed-up (has member_id) and non-signed-up (pin_number only) members
    auditStage = "member_lookup";
    let memberData = null;
    let memberLookupMethod = "";

    if (requestData.member_id) {
      // Method 1: Member has signed up for the app - lookup by member_id
      memberLookupMethod = "member_id";
      logAuditEvent("member_lookup_attempt", {
        method: "member_id",
        memberId: requestData.member_id,
      });

      const { data: memberByIdData, error: memberByIdError } =
        await supabaseAdmin
          .from("members")
          .select("first_name, last_name, pin_number, division_id")
          .eq("id", requestData.member_id)
          .single();

      if (memberByIdError) {
        logAuditEvent("member_lookup_by_id_failed", {
          memberId: requestData.member_id,
        }, new Error(memberByIdError.message));
        throw new Error(
          `Failed to get member details by ID: ${memberByIdError.message}`,
        );
      }

      memberData = memberByIdData;
    } else if (requestData.pin_number) {
      // Method 2: Member hasn't signed up yet - lookup by pin_number
      memberLookupMethod = "pin_number";
      logAuditEvent("member_lookup_attempt", {
        method: "pin_number",
        pinNumber: requestData.pin_number,
      });

      const { data: memberByPinData, error: memberByPinError } =
        await supabaseAdmin
          .from("members")
          .select("first_name, last_name, pin_number, division_id")
          .eq("pin_number", requestData.pin_number)
          .single();

      if (memberByPinError) {
        logAuditEvent("member_lookup_by_pin_failed", {
          pinNumber: requestData.pin_number,
        }, new Error(memberByPinError.message));
        throw new Error(
          `Failed to get member details by PIN: ${memberByPinError.message}`,
        );
      }

      memberData = memberByPinData;
    } else {
      // Neither member_id nor pin_number available
      const error = new Error(
        "Request has neither member_id nor pin_number - cannot identify member",
      );
      logAuditEvent("member_identification_failed", { requestId }, error);
      throw error;
    }

    if (!memberData) {
      const error = new Error(
        `Member information not found using ${memberLookupMethod}`,
      );
      logAuditEvent(
        "member_data_not_found",
        { method: memberLookupMethod },
        error,
      );
      throw error;
    }

    logAuditEvent("member_lookup_success", {
      method: memberLookupMethod,
      memberName: `${memberData.first_name} ${memberData.last_name}`,
      pinNumber: memberData.pin_number,
    });

    // Get calendar details if calendar_id exists
    let calendarData = null;
    if (requestData?.calendar_id) {
      const { data: calendar, error: calendarError } = await supabaseAdmin
        .from("calendars")
        .select("name")
        .eq("id", requestData.calendar_id)
        .single();

      if (calendarError) {
        console.warn(
          `[send-request-email] Failed to get calendar details for calendar_id ${requestData.calendar_id}: ${calendarError.message}`,
        );
      } else {
        calendarData = calendar;
      }
    }

    const memberInfo = memberData;
    const memberName = `${memberInfo.first_name} ${memberInfo.last_name}`;

    // Extract calendar name for sender prefix
    let senderPrefix = "";
    if (calendarData?.name) {
      senderPrefix = `${calendarData.name} `;
    } else if (requestData?.calendar_id) {
      console.warn(
        `[send-request-email] Calendar data not found for calendar_id: ${requestData.calendar_id}`,
      );
    }

    // ADDED: PIL detection and email routing logic
    const isPaidInLieu = requestData.paid_in_lieu === true;
    console.log(
      `[send-request-email] Processing ${
        isPaidInLieu ? "PIL" : "regular"
      } request for ${memberName}`,
    );

    // Check Mailgun environment variables
    const mailgunSendingKey = Deno.env.get("MAILGUN_SENDING_KEY");
    const mailgunDomainRaw = Deno.env.get("MAILGUN_DOMAIN");

    if (!mailgunSendingKey || !mailgunDomainRaw) {
      throw new Error("Missing Mailgun configuration");
    }

    const mailgunDomain = String(mailgunDomainRaw);

    // UPDATED: Email recipient logic for PIL vs regular requests
    const recipientEmail = isPaidInLieu
      ? String(Deno.env.get("COMPANY_PAYMENT_EMAIL") || "us_cmc_payroll@cn.ca")
      : String(
        Deno.env.get("COMPANY_ADMIN_EMAIL") || "sroc_cmc_vacationdesk@cn.ca",
      );

    console.log(
      `[send-request-email] Routing ${
        isPaidInLieu ? "PIL" : "regular"
      } request to: ${recipientEmail}`,
    );

    // Format the date for display
    const formattedDate = new Date(requestData.request_date).toLocaleDateString(
      "en-US",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    );

    // Ensure all variables are strings to prevent form-data conversion errors
    const safeRequestId = String(requestId);
    const safeLeaveType = String(requestData.leave_type);
    const safePinNumber = String(memberInfo.pin_number);
    const safeMemberName = String(memberName);
    const safeFormattedDate = String(formattedDate);

    // UPDATED: Subject line logic for PIL vs regular requests (division info now in sender)
    const subject = isPaidInLieu
      ? safeLeaveType + " Payment Request - " + safeMemberName +
        " [Payment Request ID: " + safeRequestId + "]"
      : safeLeaveType + " Request - " + safeMemberName + " [Request ID: " +
        safeRequestId + "]";

    // UPDATED: Email content variables for PIL vs regular requests
    const requestTypeText = isPaidInLieu ? "Payment Request" : "Request";
    const headerTitle = isPaidInLieu
      ? "WC GCA BLET PLD Payment Request"
      : "WC GCA BLET PLD Request";
    const instructionText = isPaidInLieu
      ? "This is a request for payment in lieu of time off."
      : "This is a request for time off.";

    // UPDATED: HTML content with PIL-aware messaging
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2c5aa0; color: white; padding: 20px; text-align: center; margin-bottom: 20px; }
            .content { padding: 20px; border: 1px solid #ddd; }
            .details { background-color: #f9f9f9; padding: 15px; margin: 15px 0; border-left: 4px solid #2c5aa0; }
            .instructions { background-color: #fff3cd; padding: 15px; margin: 15px 0; border: 1px solid #ffeaa7; }
            .footer { text-align: center; margin-top: 20px; font-size: 0.9em; color: #666; }
            .payment-notice { background-color: #d4edda; padding: 15px; margin: 15px 0; border: 1px solid #c3e6cb; border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${headerTitle}</h1>
        </div>
        
        <div class="content">
            <h2>New ${safeLeaveType} ${requestTypeText}</h2>
            
            ${
      isPaidInLieu
        ? '<div class="payment-notice"><strong>⚠️ PAYMENT REQUEST:</strong> ' +
          instructionText + "</div>"
        : ""
    }
            
            <div class="details">
                <p><strong>Employee Name:</strong> ${safeMemberName}</p>
                <p><strong>PIN Number:</strong> ${safePinNumber}</p>
                <p><strong>Date Requested:</strong> ${safeFormattedDate}</p>
                <p><strong>Leave Type:</strong> ${safeLeaveType}</p>
                <p><strong>${
      isPaidInLieu ? "Payment Request ID" : "Request ID"
    }:</strong> ${safeRequestId}</p>
                ${
      isPaidInLieu
        ? "<p><strong>Request Type:</strong> Payment in Lieu</p>"
        : ""
    }
            </div>
            
            <div class="instructions">
                <h3>Response Instructions</h3>
                <p>To process this ${requestTypeText.toLowerCase()}, please reply to this email with one of the following:</p>
                <ul>
                    <li><strong>To APPROVE:</strong> Reply with "approved" or "done"</li>
                    <li><strong>To DENY:</strong> Reply with "denied - [reason]"</li>
                </ul>
                <p><strong>Common denial reasons:</strong></p>
                <ul>
                    <li>"denied - out of ${safeLeaveType} days"</li>
                    ${
      isPaidInLieu
        ? '<li>"denied - payment processing unavailable"</li>'
        : '<li>"denied - allotment is full"</li>'
    }
                    <li>"denied - other - [specific reason]"</li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated message from the WC GCA BLET PLD Application.</p>
            <p>${
      isPaidInLieu ? "Payment Request ID" : "Request ID"
    }: ${safeRequestId}</p>
        </div>
    </body>
    </html>`;

    // UPDATED: Text content with PIL-aware messaging
    const textContent = `
WC GCA BLET PLD ${requestTypeText}

${isPaidInLieu ? "⚠️ PAYMENT REQUEST: " + instructionText + "\n" : ""}
Employee Name: ${safeMemberName}
PIN Number: ${safePinNumber}
Date Requested: ${safeFormattedDate}
Leave Type: ${safeLeaveType}
${isPaidInLieu ? "Payment Request ID" : "Request ID"}: ${safeRequestId}
${isPaidInLieu ? "Request Type: Payment in Lieu\n" : ""}

RESPONSE INSTRUCTIONS:
To process this ${requestTypeText.toLowerCase()}, please reply to this email with one of the following:
- To APPROVE: Reply with "approved" or "done"
- To DENY: Reply with "denied - [reason]"

Common denial reasons:
- "denied - out of ${safeLeaveType} days"
${
      isPaidInLieu
        ? '- "denied - payment processing unavailable"'
        : '- "denied - allotment is full"'
    }
- "denied - other - [specific reason]"

This is an automated message from the WC GCA BLET PLD Application.
${isPaidInLieu ? "Payment Request ID" : "Request ID"}: ${safeRequestId}
    `;

    // Prepare email data with both HTML and text content
    const emailData = {
      from:
        `${senderPrefix}WC GCA BLET PLD App <requests@pldapp.bletcnwcgca.org>`,
      to: String(recipientEmail),
      subject: String(subject),
      html: String(htmlContent),
      text: String(textContent),
      "h:Reply-To": "replies@pldapp.bletcnwcgca.org",
    };

    // Send email using direct Mailgun API
    auditStage = "email_sending";
    logAuditEvent("email_send_starting", {
      recipient: recipientEmail,
      subject: emailData.subject,
      isPaidInLieu,
      payloadSize: JSON.stringify(emailData).length,
    });

    // Create form data for Mailgun API
    const formData = new FormData();
    formData.append("from", emailData.from);
    formData.append("to", emailData.to);
    formData.append("subject", emailData.subject);
    formData.append("html", emailData.html);
    formData.append("text", emailData.text);
    formData.append("h:Reply-To", emailData["h:Reply-To"]);

    // Send via Mailgun REST API
    const mailgunUrl = `https://api.mailgun.net/v3/${mailgunDomain}/messages`;
    const sendStartTime = Date.now();

    const response = await fetch(mailgunUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`api:${mailgunSendingKey}`)}`,
      },
      body: formData,
    });

    const mailgunResponseTime = Date.now() - sendStartTime;

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(
        `Mailgun API error: ${response.status} - ${errorText}`,
      );
      logAuditEvent("mailgun_api_error", {
        status: response.status,
        responseTime: mailgunResponseTime,
        errorText: errorText.substring(0, 500), // Truncate for logging
      }, error);
      throw error;
    }

    const result = await response.json();

    logAuditEvent("email_sent_successfully", {
      messageId: result.id,
      responseTime: mailgunResponseTime,
      recipient: recipientEmail,
    });

    // UPDATED: Email tracking with PIL-aware email_type
    const { data: trackingData, error: trackingError } = await supabaseAdmin
      .from("email_tracking")
      .insert({
        request_id: requestId,
        email_type: isPaidInLieu ? "payment_request" : "request",
        recipient: recipientEmail,
        subject: subject,
        message_id: result.id,
        status: "sent",
        retry_count: 0,
        created_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (trackingError) {
      console.error("Failed to record email tracking:", trackingError);
      // Don't fail the request if tracking fails
    }

    // Update attempt status to email_sent and link to email tracking
    if (attemptId) {
      const updateData: any = {
        attempt_status: "email_sent",
        completed_at: new Date().toISOString(),
      };

      // Link to email tracking record if it was created successfully
      if (trackingData?.id) {
        updateData.email_tracking_id = trackingData.id;
      }

      const { error: updateError } = await supabaseAdmin
        .from("email_attempt_log")
        .update(updateData)
        .eq("id", attemptId);

      if (updateError) {
        console.error(
          "Failed to update attempt status to email_sent:",
          updateError,
        );
        // Don't fail the request if logging fails
      }
    }

    auditStage = "completion";
    logAuditEvent("function_completed_successfully", {
      messageId: result.id,
      totalExecutionTime: Date.now() - startTime,
      recipient: recipientEmail,
      isPaidInLieu,
    });

    return new Response(
      JSON.stringify({
        success: true,
        result: result,
        messageId: result.id,
        recipient: recipientEmail,
        isPaidInLieu: isPaidInLieu,
        correlationId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const mainErrorMessage = error instanceof Error
      ? error.message
      : "Failed to send request email";

    logAuditEvent("function_failed", {
      stage: auditStage,
      totalExecutionTime: Date.now() - startTime,
    }, error instanceof Error ? error : new Error(mainErrorMessage));

    // Update attempt status to email_failed if attemptId exists
    if (attemptId) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (supabaseUrl && supabaseServiceKey) {
          const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

          const { error: updateError } = await supabaseAdmin
            .from("email_attempt_log")
            .update({
              attempt_status: "email_failed",
              error_message: error instanceof Error
                ? error.message
                : "Unknown error",
              completed_at: new Date().toISOString(),
            })
            .eq("id", attemptId);

          if (updateError) {
            console.error(
              "Failed to update attempt status to email_failed:",
              updateError,
            );
          }
        }
      } catch (updateError) {
        console.error(
          "Error updating attempt log in catch block:",
          updateError,
        );
      }
    }

    const finalErrorMessage = error instanceof Error
      ? error.message
      : "Failed to send request email";

    return new Response(
      JSON.stringify({
        error: finalErrorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
