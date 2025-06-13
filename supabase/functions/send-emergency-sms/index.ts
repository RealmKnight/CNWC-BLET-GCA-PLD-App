import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

interface EmergencySMSRequest {
    message: string;
    targetUsers: "all" | "division" | "specific";
    divisionName?: string;
    adminId: string;
    specificUserIds?: string[];
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { message, targetUsers, divisionName, adminId, specificUserIds }:
            EmergencySMSRequest = await req.json();

        // Validate input
        if (!message || !targetUsers || !adminId) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error:
                        "Missing required fields: message, targetUsers, adminId",
                }),
                {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                    status: 400,
                },
            );
        }

        // Initialize Supabase client
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            { auth: { autoRefreshToken: false, persistSession: false } },
        );

        // Verify admin permissions
        const { data: adminMember, error: adminError } = await supabaseAdmin
            .from("members")
            .select("role, division_name")
            .eq("id", adminId)
            .single();

        if (adminError || !adminMember) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Admin verification failed",
                }),
                {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                    status: 403,
                },
            );
        }

        // Check admin permissions
        const isSystemAdmin = adminMember.role === "admin" ||
            adminMember.role === "union_admin" ||
            adminMember.role === "application_admin";
        const isDivisionAdmin = adminMember.role === "division_admin";

        if (!isSystemAdmin && !isDivisionAdmin) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Insufficient permissions for emergency SMS",
                }),
                {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                    status: 403,
                },
            );
        }

        // Build user query based on target and permissions
        let userQuery = supabaseAdmin
            .from("members")
            .select("id, first_name, last_name, phone_number, division_name")
            .eq("status", "active")
            .not("phone_number", "is", null);

        if (targetUsers === "all" && isSystemAdmin) {
            // System admin can send to all users
        } else if (targetUsers === "division" || !isSystemAdmin) {
            // Division admin or system admin targeting division
            const targetDivision = divisionName === "current_division"
                ? adminMember.division_name
                : divisionName;
            userQuery = userQuery.eq("division_name", targetDivision);
        } else if (targetUsers === "specific" && specificUserIds) {
            userQuery = userQuery.in("id", specificUserIds);
        }

        const { data: targetMembers, error: membersError } = await userQuery;

        if (membersError) {
            console.error("Error fetching target members:", membersError);
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Failed to fetch target users",
                }),
                {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                    status: 500,
                },
            );
        }

        if (!targetMembers || targetMembers.length === 0) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "No eligible users found for emergency SMS",
                }),
                {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                    },
                    status: 400,
                },
            );
        }

        // Filter users with verified phone numbers
        const { data: verifiedUsers, error: verificationError } =
            await supabaseAdmin
                .from("phone_verifications")
                .select("user_id, phone")
                .eq("verified", true)
                .in("user_id", targetMembers.map((m) => m.id));

        if (verificationError) {
            console.error(
                "Error checking phone verifications:",
                verificationError,
            );
        }

        const verifiedUserIds = new Set(
            verifiedUsers?.map((v) => v.user_id) || [],
        );
        const eligibleMembers = targetMembers.filter((member) =>
            member.phone_number && verifiedUserIds.has(member.id)
        );

        console.log(
            `Emergency SMS: ${eligibleMembers.length} eligible users out of ${targetMembers.length} total`,
        );

        // Send emergency SMS to all eligible users
        let sentCount = 0;
        let failCount = 0;
        const results = [];

        for (const member of eligibleMembers) {
            try {
                // Create emergency SMS delivery record
                const { data: delivery, error: deliveryError } =
                    await supabaseAdmin
                        .from("sms_deliveries")
                        .insert({
                            message_id: `emergency_${Date.now()}_${member.id}`,
                            recipient_id: member.id,
                            phone_number: member.phone_number,
                            sms_content: message.length > 160
                                ? message.substring(0, 135) +
                                    "... (See full in app)"
                                : message,
                            full_content: message,
                            priority: "emergency",
                            was_truncated: message.length > 160,
                            status: "pending",
                        })
                        .select("id")
                        .single();

                if (deliveryError) {
                    console.error(
                        `Failed to create delivery record for ${member.id}:`,
                        deliveryError,
                    );
                    failCount++;
                    continue;
                }

                // Send SMS via send-sms function
                const { data: smsResult, error: smsError } = await supabaseAdmin
                    .functions.invoke("send-sms", {
                        body: {
                            to: member.phone_number,
                            content: message.length > 160
                                ? message.substring(0, 135) +
                                    "... (See full in app)"
                                : message,
                            messageId: `emergency_${Date.now()}_${member.id}`,
                            deliveryId: delivery.id,
                            priority: "high",
                            isOTP: false,
                        },
                    });

                if (smsError || !smsResult?.success) {
                    console.error(
                        `SMS failed for ${member.id}:`,
                        smsError || smsResult,
                    );
                    failCount++;
                } else {
                    sentCount++;
                }

                // Always create in-app notification as fallback
                await supabaseAdmin.from("notifications").upsert({
                    id: `emergency_${Date.now()}_${member.id}`,
                    user_id: member.id,
                    title: "🚨 Emergency Notification",
                    message: message,
                    notification_type: "must_read",
                    category_code: "must_read",
                    is_read: false,
                    requires_acknowledgment: true,
                    importance: "high",
                    metadata: {
                        isEmergency: true,
                        sentBy: adminId,
                        sentVia: "emergency_sms",
                        targetType: targetUsers,
                    },
                    created_at: new Date().toISOString(),
                }, { onConflict: "id" });

                results.push({
                    userId: member.id,
                    name: `${member.first_name} ${member.last_name}`,
                    phone: member.phone_number,
                    success: smsResult?.success || false,
                });
            } catch (error) {
                console.error(
                    `Error processing emergency SMS for ${member.id}:`,
                    error,
                );
                failCount++;
            }
        }

        // Log emergency SMS activity
        await supabaseAdmin.from("sms_webhook_audit_log").insert({
            phone_number: "EMERGENCY_BROADCAST",
            message_sid: `emergency_${Date.now()}`,
            status: "emergency_sent",
            webhook_data: {
                adminId,
                targetUsers,
                sentCount,
                failCount,
                totalEligible: eligibleMembers.length,
                message: message.substring(0, 100) +
                    (message.length > 100 ? "..." : ""),
            },
            created_at: new Date().toISOString(),
        });

        return new Response(
            JSON.stringify({
                success: true,
                sentCount,
                failCount,
                totalEligible: eligibleMembers.length,
                totalTargeted: targetMembers.length,
                results,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            },
        );
    } catch (error) {
        console.error("Emergency SMS error:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 500,
            },
        );
    }
});
