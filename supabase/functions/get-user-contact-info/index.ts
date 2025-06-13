import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

interface ContactInfoRequest {
    userId: string;
    contactType: "email" | "phone";
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { userId, contactType }: ContactInfoRequest = await req.json();

        // Validate input
        if (!userId || !contactType) {
            throw new Error("Missing required fields: userId, contactType");
        }

        if (!["email", "phone"].includes(contactType)) {
            throw new Error("contactType must be 'email' or 'phone'");
        }

        // Initialize Supabase admin client
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
            { auth: { autoRefreshToken: false, persistSession: false } },
        );

        // Get user data from auth.users with admin access
        const { data: user, error } = await supabaseAdmin.auth.admin
            .getUserById(userId);

        if (error) {
            console.error("Error getting user:", error);
            throw new Error("Failed to get user information");
        }

        if (!user?.user) {
            throw new Error("User not found");
        }

        // Return requested contact information
        const response: any = {};

        if (contactType === "email") {
            response.email = user.user.email || null;
        } else if (contactType === "phone") {
            response.phone = user.user.phone || null;
        }

        return new Response(
            JSON.stringify(response),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (error) {
        console.error("Contact info error:", error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error
                    ? error.message
                    : "Failed to get contact info",
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            },
        );
    }
});
