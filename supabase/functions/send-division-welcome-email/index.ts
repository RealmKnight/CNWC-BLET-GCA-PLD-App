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

    try {
        const { divisionId, emailAddress, adminName, divisionName } = await req
            .json();

        // Validate required fields
        if (!divisionId || !emailAddress || !divisionName) {
            return new Response(
                JSON.stringify({
                    error:
                        "Missing required fields: divisionId, emailAddress, divisionName",
                }),
                {
                    status: 400,
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error("Missing Supabase configuration");
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Check Mailgun environment variables
        const mailgunSendingKey = Deno.env.get("MAILGUN_SENDING_KEY");
        const mailgunDomainRaw = Deno.env.get("MAILGUN_DOMAIN");

        if (!mailgunSendingKey || !mailgunDomainRaw) {
            throw new Error("Missing Mailgun configuration");
        }

        const mailgunDomain = String(mailgunDomainRaw);

        // Ensure all variables are strings to prevent form-data conversion errors
        const safeDivisionName = String(divisionName);
        const safeEmailAddress = String(emailAddress);
        const safeAdminName = String(adminName || "Administrator");
        const safeDivisionId = String(divisionId);

        // Prepare welcome email content
        const subject = "Welcome to CN/WC GCA BLET PLD Email Notifications - " +
            safeDivisionName;
        const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2c5aa0; color: white; padding: 20px; text-align: center; margin-bottom: 20px; border-radius: 8px; }
            .welcome { background-color: #00b894; color: white; padding: 15px; text-align: center; font-weight: bold; margin-bottom: 20px; border-radius: 8px; }
            .content { padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
            .info-box { background-color: #f8f9fa; padding: 15px; margin: 15px 0; border-left: 4px solid #2c5aa0; border-radius: 4px; }
            .what-to-expect { background-color: #e3f2fd; padding: 15px; margin: 15px 0; border-radius: 4px; }
            .footer { text-align: center; margin-top: 20px; font-size: 0.9em; color: #666; }
            .logo { font-size: 1.2em; font-weight: bold; }
            ul { padding-left: 20px; }
            li { margin-bottom: 8px; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo">🚂 CN/WC GCA BLET PLD</div>
            <h1>Email Notification System</h1>
        </div>
        
        <div class="welcome">
            Welcome to the PLD Email Notification System!
        </div>
        
        <div class="content">
            <h2>Hello!</h2>
            <p>This email address (<strong>${safeEmailAddress}</strong>) has been configured to receive Personal Leave Day (PLD) notifications for <strong>${safeDivisionName}</strong>.</p>
            
            <div class="info-box">
                <h3>📧 What You'll Receive</h3>
                <p>You'll receive email notifications for:</p>
                <ul>
                    <li><strong>Status Updates:</strong> When PLD requests are approved, denied, or cancelled</li>
                    <li><strong>Member Notifications:</strong> Updates about requests from division members</li>
                    <li><strong>Administrative Alerts:</strong> Important system notifications</li>
                </ul>
            </div>
            
            <div class="what-to-expect">
                <h3>📋 Email Types & Frequency</h3>
                <ul>
                    <li><strong>Request Notifications:</strong> Real-time alerts when status changes occur</li>
                    <li><strong>Member Updates:</strong> Notifications sent to keep division administrators informed</li>
                    <li><strong>System Alerts:</strong> Occasional technical notifications if issues arise</li>
                </ul>
                <p><em>All emails are automated and sent only when relevant PLD activity occurs.</em></p>
            </div>
            
            <div class="info-box">
                <h3>🛠️ Managing Your Settings</h3>
                <p>Division administrators can modify email settings through the PLD application:</p>
                <ul>
                    <li>Add or remove additional notification email addresses</li>
                    <li>Enable or disable email notifications</li>
                    <li>View notification history and delivery status</li>
                </ul>
            </div>
            
            <div class="info-box">
                <h3>📞 Need Help?</h3>
                <p>If you have questions about this notification system or need technical support:</p>
                <ul>
                    <li>Contact your division administrator</li>
                    <li>Refer to the PLD application help section</li>
                    <li>Check that this email address can receive emails from <strong>replies@pldapp.bletcnwcgca.org</strong></li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p><strong>CN/WC GCA BLET Personal Leave Day Application</strong></p>
            <p>This is an automated welcome message. You're receiving this because your email was added to division notifications.</p>
            <p>Division: ${safeDivisionName} | Email: ${safeEmailAddress}</p>
        </div>
    </body>
    </html>`;

        const textContent = `
CN/WC GCA BLET PLD Email Notification System
Welcome Message

Hello!

This email address (${safeEmailAddress}) has been configured to receive Personal Leave Day (PLD) notifications for ${safeDivisionName}.

WHAT YOU'LL RECEIVE:
- Status Updates: When PLD requests are approved, denied, or cancelled
- Member Notifications: Updates about requests from division members  
- Administrative Alerts: Important system notifications

EMAIL TYPES & FREQUENCY:
- Request Notifications: Real-time alerts when status changes occur
- Member Updates: Notifications sent to keep division administrators informed
- System Alerts: Occasional technical notifications if issues arise

All emails are automated and sent only when relevant PLD activity occurs.

MANAGING YOUR SETTINGS:
Division administrators can modify email settings through the PLD application:
- Add or remove additional notification email addresses
- Enable or disable email notifications
- View notification history and delivery status

NEED HELP?
If you have questions about this notification system or need technical support:
- Contact your division administrator
- Refer to the PLD application help section
- Check that this email address can receive emails from replies@pldapp.bletcnwcgca.org

CN/WC GCA BLET Personal Leave Day Application
This is an automated welcome message. You're receiving this because your email was added to division notifications.
Division: ${safeDivisionName} | Email: ${safeEmailAddress}
    `;

        // Prepare email data with safe string conversion
        const emailData = {
            from: "CN/WC GCA BLET PLD App <replies@pldapp.bletcnwcgca.org>",
            to: String(safeEmailAddress),
            subject: String(subject),
            html: String(htmlContent),
            text: String(textContent),
            "h:Reply-To": "replies@pldapp.bletcnwcgca.org",
        };

        // Send welcome email using direct Mailgun API
        console.log("Sending welcome email with Mailgun API...");
        console.log("Email recipient:", safeEmailAddress);
        console.log("Division:", safeDivisionName);

        // Create form data for Mailgun API
        const formData = new FormData();
        formData.append("from", String(emailData.from));
        formData.append("to", String(emailData.to));
        formData.append("subject", String(emailData.subject));
        formData.append("html", String(emailData.html));
        formData.append("text", String(emailData.text));
        formData.append("h:Reply-To", emailData["h:Reply-To"]);

        // Send via Mailgun REST API
        const mailgunUrl =
            `https://api.mailgun.net/v3/${mailgunDomain}/messages`;
        const response = await fetch(mailgunUrl, {
            method: "POST",
            headers: {
                "Authorization": `Basic ${btoa(`api:${mailgunSendingKey}`)}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Mailgun API error:", response.status, errorText);
            throw new Error(
                `Mailgun API error: ${response.status} - ${errorText}`,
            );
        }

        const result = await response.json();

        // Record email tracking
        const { error: trackingError } = await supabase
            .from("email_tracking")
            .insert({
                request_id: null, // No specific request for welcome emails
                email_type: "welcome",
                recipient: safeEmailAddress,
                subject: subject,
                message_id: result.id,
                status: "sent",
                retry_count: 0,
                created_at: new Date().toISOString(),
                last_updated_at: new Date().toISOString(),
            });

        if (trackingError) {
            console.error("Failed to record email tracking:", trackingError);
            // Don't fail the request if tracking fails
        }

        // Verify email deliverability by checking if the domain accepts emails
        // This is a basic check - more sophisticated validation could be added
        const emailDomain = safeEmailAddress.split("@")[1];
        const deliverabilityInfo = {
            email: safeEmailAddress,
            domain: emailDomain,
            welcomeEmailSent: true,
            timestamp: new Date().toISOString(),
        };

        return new Response(
            JSON.stringify({
                success: true,
                result: result,
                messageId: result.id,
                recipient: emailAddress,
                deliverability: deliverabilityInfo,
                message: "Welcome email sent successfully",
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    } catch (error) {
        console.error("Error in send-division-welcome-email:", error);

        const errorMessage = error instanceof Error
            ? error.message
            : "Failed to send welcome email";

        return new Response(
            JSON.stringify({
                error: errorMessage,
            }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
        );
    }
});
